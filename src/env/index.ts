import * as dotenv from "dotenv";
dotenv.config();

/**
 * 指定した名前の環境変数を取得する。未定義なら例外をスローする
 * @param name 名前
 */
export const getEnv = (name: string): string => {
  const result = process.env[name];
  if (result === undefined) {
    throw new Error(`環境変数 '${name}' が定義されていません`);
  }
  return result;
};

export const getEnvAsNumber = (name: string): number => {
  const val = getEnv(name);
  const number = +val;
  if (val != val) {
    throw new Error(`環境変数 '${name}' が数値ではありません`);
  }
  return number;
}

/**
 * スケジュールを格納するDynamoDBのテーブル名
 */
export const ScheduleTableName = getEnv("ScheduleTableName");

/**
 * dryRunモード。dryRun環境変数に明示的に「1」がセットされていたときにのみ有効
 */
export const dryRun = process.env.dryRun == "1";

/**
 * UTF offset
 */
export const utfOffset = +getEnvAsNumber("utfOffset");

/**
 * DynamoDBにレコードを登録するときのTTL。3なら登録後72時間すると未処理でも自動的に削除される
 */
export const RecordTTLInDays = getEnvAsNumber("RecordTTLInDays");

/**
 * スケジューラーが動作しているリージョン
 */
export const region = getEnv("region");

/**
 * AWSアカウント番号
 */
export const AccountNo = getEnv("AccountNo");
