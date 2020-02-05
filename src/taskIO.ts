/**
 * スケジュールを示すレコードを取得・登録・削除する
 */

import * as AWS from "aws-sdk";
import * as env from "./env/index";
import moment from "moment";
import * as Types from "./types/task";
import * as toolbox from "aws-toolbox";

const dynamo = new AWS.DynamoDB.DocumentClient({ region: env.region });

/**
 * 与えられたタスクの実行日時が到来しているならtrueを返す
 * @param task
 * @param dateTime
 */
export const hasExectimeArrived = (task: Types.TaskRecord, dateTime: moment.Moment): boolean => {
  // 日時をパースして既に実行日時が到来しているものを返す。タイムゾーンが突然変わっていても問題なし
  try {
    const scheduledTime = moment(task.scheduledTime);
    return dateTime.diff(scheduledTime) >= 0;
  } catch (e) {
    console.error("日付のパースに失敗する変なレコードが渡されました。無視します");
    console.error(task);
    return false;
  }
};

/**
 * 指定した日時以前のタスクを取得する
 * @param dateTime momentのインスタンス。省略した場合は現在日時
 */
export const getTasks = async (dateTime?: moment.Moment | undefined): Promise<Types.TaskRecord[]> => {
  // とりあえずDynamoDBから全レコードを取得する。レコードの数は限られているので問題にはならない
  const allTasks = await toolbox.dynamo.getAllRecords<Types.TaskRecord>(
    dynamo,
    env.ScheduleTableName,
    Types.isTaskRecordOnDb
  );

  // 基準となる日時が省略されたら現在時刻
  const _dateTime = dateTime ?? moment();

  return allTasks.filter(x => hasExectimeArrived(x, _dateTime));
};

/**
 * タスクIDを指定してタスクを1件取得する。見つからなかった場合は例外をスローする
 * @param taskId
 */
export const getTaskById = async (taskId: string): Promise<Types.TaskRecord> => {
  return toolbox.dynamo.getSingleRecord(dynamo, env.ScheduleTableName, "key", taskId, Types.isTaskRecordOnDb);
};

/**
 * 与えたスケジュールをDBに登録する。key, TTL, lastModifiedは上書きする
 */
export const putTask = async (task: Types.TaskRecord): Promise<void> => {
  task.key = [task.task, task.resourceId, task.scheduledTime].join("_");
  task.TTL = moment().unix() + env.RecordTTLInDays * 24 * 3600;
  task.lastModified = moment()
    .utcOffset(env.utfOffset)
    .format();
  if (env.dryRun) {
    console.log("dryRunが指定されていたのでスケジュール登録はスキップします。key, TTL, lastModified上書きは実行します");
    return;
  }
  await dynamo.put({ TableName: env.ScheduleTableName, Item: task }).promise();
};

/**
 * 与えたタスクを削除する
 * @param task
 */
export const removeTask = async (task: Types.TaskRecord): Promise<void> => {
  if (env.dryRun) {
    console.log("スケジュール削除はスキップします");
    return;
  }
  await dynamo
    .delete({
      TableName: env.ScheduleTableName,
      Key: {
        key: task.key
      }
    })
    .promise();
};

/**
 * 与えたタスクのリトライカウンタを1減らしてタスクを更新する。
 * 0だったらレコードを削除する。
 * @param task
 */
export const decrementRetryCount = async (task: Types.TaskRecord): Promise<void> => {
  if (env.dryRun) {
    console.log("スケジュール更新処理はスキップします");
    return;
  }

  if (task.remainingRetryCount === 0) {
    console.log("リトライカウンタは0でした。レコードを削除します");
    await removeTask(task);
    return;
  }

  task.remainingRetryCount--;
  console.log(`リトライカウンタを${task.remainingRetryCount}にしてレコードを更新します`);
  await dynamo
    .put({
      TableName: env.ScheduleTableName,
      Item: task
    })
    .promise();
};
