EC2・RDSスケジューラー
===============

# 概要
EC2インスタンス・RDSインスタンスに付加されたタグにしたがってEC2のAMIを作成したり自動起動・停止したりする仕組み。

## 使用するタグ

|タグ名       |内容                                     |記入例         |
|-------------|----------------------------------------|--------------|
|`AmiSchedule` | cronの書式でAMI作成タイミングを指定する。 | `0 23 * * 1` |
|`AmiSchedule_ForceToReboot` | 同上。こちらは作成前にインスタンスを強制リブートする。起動中にAMIを作成すると壊れたものができる可能性があるため、こちらの方が安心。 | `0 23 * * 1` |
|`AutoStartSchedule` | cronの書式で自動起動タイミングを指定する。「停止」以外のステータスだったら何もしない。 | `0 19 * * *` |
|`AutoStopSchedule` | cronの書式で自動停止タイミングを指定する。「起動」以外のステータスだったら何もしない。 | `30 8 * * 1-5` |
|`NameAscii` | AMIの名前に使われる値。英数字のみでインスタンスの名前を記入する。このタグがなければ `Name` タグから英数字のみを抜き出した値を採用する。 | `hogesystem-ap` |
|`AmiLifetimeInDays` | AMIを保持する日数。未設定の場合、デフォルトで30日となる。有効期限が切れたAMIはスケジューラーが自動的に削除する（後述） | `15` |
|`AlwaysRunning` | `true` と記入されている場合のみ意味を持つ（大文字小文字区別なし）。停止していたらアラートを出す。 | `true`, `True` |

* cron書式で指定する時刻は日本時間固定（後述）
* タグの大文字・小文字は区別する。 `AutoStartSchedule` を `autoStartSchedule` と書いてしまうと無視される。
* RDSのタグには `*` が使えない（2020年1月現在）。仕方がないので `*` のかわりに `@` と書く。例: `0 8 @ @ @` （=毎朝8時）

## 前提条件
動作ログやアラートはSlackに流すことを前提としている。事前に次の作業を済ませておくこと。

* SlackでIncoming Webhookを作成
* `SlackApiProxy` をインストール
* ログ通知用、アラート通知用チャンネルを作成

# 処理概要
## タスク登録
スケジューラー登録Lambdaが `src/taskGenerator/` 以下にあるジェネレーターを呼び出し、直近48時間以内に実行すべきタスクを生成してDynamoDBに登録する。タスクはこのような形で記述されている。

```js
{
  "key": "(このタスクの内容に応じたユニークな値)",
  "task": "StopEC2", // タスクの種別
  "resourceType": "EC2", // タスクのグループ
  "resourceId": "i-0a7d2f2a9ab43b955", // 処理対象のリソースID
  "scheduledTime": "2020-02-04T23:00:00+09:00", // 実行予定日時
  "remainingRetryCount": 2, // 残りリトライ回数
  "lastModified": "2020-02-04T18:13:03+09:00", // レコードのタイムスタンプ
  "TTL": 1580893983
}
```

タスクの種別によって必要な情報が異なるため、JSONの形式はそれぞれ違う。型情報は `src/types/task.ts` にある。

## タスク実行
タスク実行Lambdaがタイムスタンプを手がかりに上述のタスクを読み込み、 `src/taskProcessor/` 以下にあるタスク実行処理を呼び出してタスクを消化していく。

* 正常に完了したレコードは削除する。
* エラーが起きてもリトライしたら成功するかもしれない場合は `remainingRetryCount` を1減らしてレコードを更新する。（TTLはそのまま）
* `remainingRetryCount` が0のときに失敗したら無条件でレコードを削除する。

# インストール
## スタック作成
```sh
aws cloudformation create-stack \
  --stack-name InstanceScheduler \
  --template-url "https://public-sanwasystem.s3-ap-northeast-1.amazonaws.com/instanceScheduler/cloudformation.yaml" \
  --capabilities CAPABILITY_NAMED_IAM \
  --parameters \
      ParameterKey=SlackChannel,ParameterValue=__SLACK_CHANNEL_NAME__ \
      ParameterKey=SlackErrorChannel,ParameterValue=__SLACK_ERROR_CHANNEL__ \
      ParameterKey=SlackLambdaName,ParameterValue=__SLACK_PROXY_LAMBDA_NAME__ \
      ParameterKey=SlackIcon,ParameterValue=dog \
      ParameterKey=AccountNickName,ParameterValue=InstanceScheduler \
      ParameterKey=LambdaCodeBucket,ParameterValue=public-sanwasystem \
      ParameterKey=LambdaCodeKey,ParameterValue=instanceScheduler/lambda.zip \
  --profile $profile
```

## パラメーターの意味
パラメーターはLambdaの環境変数にセットされるもの、Stackを生成する際にのみ使われるものがある。前者は後から個別に変更可能。それぞれ次の通り。

|名前                | 意味                                                                        |
|--------------------|----------------------------------------------------------------------------|
|LambdaCodeBucket    | デプロイパッケージをアップロードしたS3のバケット名                             |
|LambdaCodeKey       | デプロイパッケージの名前                                                     |

|名前                | 意味                                                                       |
|--------------------|---------------------------------------------------------------------------|
|ScheduleTableName   | スケジュールを管理するDynamoDBのテーブル名。デフォルト値は `InstanceScheduler` |
|utfOffset           | 日時を文字列に変換する際のタイムゾーン。JSTなら9（デフォルト値）。環境変数として保存されるが、後から変えても影響はない  | 
|RecordTTLInDays     | DynamoDBに登録したレコードのTTL。デフォルトは2（2日で未処理のタスクは削除される） |
|SlackLambdaName     | Slackに通知を送る際に利用するLambdaの名前                                     |
|SlackChannel        | Slackに通常のログを通知する際のチャンネル名。空文字または `none` の場合は通知を送信しない |
|SlackErrorChannel   | Slackにエラー通知をする際のチャンネル名。空文字または `none` の場合は通知を送信しない |
|SlackIcon           | Slackに通知する際のアイコン。 `cat`, `ghost` など。コロンは不要                |
|AccountNickName     | Slackに通知する際のユーザー名。 `商用`, `検証アカウント` などと書いておくとよい  |


## 作成されるもの
* IAM Role
* DynamoDB Table
* CloudWatch Rule × 2
* Lambda Function × 3

## タスク登録Lambda起動
必要に応じて `InstanceScheduler_TaskGenerator` を手動起動する。引数はなんでも良い。（この操作によりDynamoDBにタスクが登録される。手動起動しないと翌日朝8時までは何も実行されない）

# 具体的な動作内容
## スケジュール登録
毎朝8時にLambda `InstanceScheduler_TaskGenerator` が起動し、EC2・RDSのタグ、AMI情報をチェックして、その日（直近25時間以内）に行うべきジョブをDynamoDBに登録する。

なお、同じスケジュールを1日4回以上実行することはできない（記入ミスだと判断してエラーになる）。たとえば `0,5,10 9 * * *` は通るが、 `*/15 9 * * *` はエラーになって何も実行されない。

起動処理などが失敗したときのために `50,59 5 * * *` のように書くことができる。

## バッチ定期実行
Lambda `InstanceScheduler_Ticker` が5分おきに起動し、DynamoDBをチェックする。実行予定日時が到来しているレコードを見つけたら、 `task` の内容にしたがって必要な処理を実行してレコードを削除する。

実際の処理を行うのは `InstanceScheduler_TaskProcessor` で、 `InstanceScheduler_Ticker` 自体はその処理完了を待たずに終了する。

### インスタンス起動・停止について
起動はインスタンスの状態が「停止中(stopped)」の場合だけ、停止はインスタンスの状態が「起動中(running)」の場合だけ行い、それ以外は何もせず処理をスキップする。
これは手動起動・停止とタイミングがかぶってしまう危険を避けるため。

### AMI登録処理とタグ追加について
AMI登録直後はタグ追加が失敗することがあるため、タグ追加は少し待つ必要がある。そこでAMI登録処理タスクを実行するとAMIタグ追加タスクが自動的に追加される。

### 期限切れのAMI削除
InstanceScheduler によって登録されたAMIを見分けるため、次の条件でAMIを検索する。

* 名前が `AutoGeneratedAMI_` から始まる
* `ExpiresAt` タグに日付が入っている

このうち `ExpiresAt` が既に到来しているAMI、それに紐付くスナップショットを自動的に削除する。ただし、「そのAMIを削除すると特定のEC2インスタンスのAMIが全てなくなってしまう」という場合は削除をスキップする。
