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

/**
 * Slackにメッセージを送るLambdaの名前
 */
export const ClientLambdaName = getEnv("SlackLambdaName");

/**
 * 通常のメッセージを送るSlackチャンネル名
 */
export const Channel = getEnv("SlackChannel");

/**
 * エラーメッセージを送るSlackチャンネル名
 */
export const ErrorChannel = getEnv("SlackErrorChannel");

/**
 * アカウントの名前。「本番」「検証」など。Slack通知の名前に使う
 */
export const AccountNickName = getEnv("AccountNickName");

/**
 * アイコン
 */
export const Icon = getEnv("SlackIcon");
