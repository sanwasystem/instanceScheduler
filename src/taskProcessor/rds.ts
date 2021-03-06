/**
 * RDS起動・停止を示すレコードを処理する
 */

import * as AWS from "aws-sdk";
import * as env from "../env/index";
import * as TaskTypes from "../types/task";
import * as Types from "../types/index";
import * as util from "../util";

const STATE_RUNNING = "available";
const STATE_STOPPED = "stopped";

export const TEST_RDS_NOTFOUND = "rds_notFound";
export const TEST_RDS_RUNNING = "rds_running";
export const TEST_RDS_STOPPED = "rds_stopped";
const rds = new AWS.RDS({ region: env.region });

const isTestId = (name: string): boolean => {
  return [TEST_RDS_NOTFOUND, TEST_RDS_RUNNING, TEST_RDS_STOPPED].includes(name);
};

/**
 * RDSインスタンスを探して、起動状態を文字列で返す。見つからないかエラーが起きたらnullを返す
 */
const getDbInstanceStateById = async (name: string): Promise<string | null> => {
  switch (name) {
    case TEST_RDS_NOTFOUND:
      console.log("テスト用IDが見つかりました。見つからなかったことにします");
      return null;

    case TEST_RDS_RUNNING:
      console.log("テスト用IDが見つかりました。起動中だったことにします");
      return STATE_RUNNING;

    case TEST_RDS_STOPPED:
      console.log("テスト用IDが見つかりました。停止中だったことにします");
      return STATE_STOPPED;
  }

  if (isTestId(name)) {
    throw new Error("ここに来るのはおかしい（内部エラー）");
  }

  try {
    const data = await rds.describeDBInstances({ DBInstanceIdentifier: name }).promise();
    if (!Array.isArray(data.DBInstances) || data.DBInstances.length == 0) {
      return null;
    } else {
      return data.DBInstances[0].DBInstanceStatus || "";
    }
  } catch (e) {
    console.error(e);
    return null;
  }
};

const startRds = async (instanceState: string, instanceId: string): Promise<Types.TaskResultType> => {
  try {
    if (instanceState !== STATE_STOPPED) {
      return {
        result: "OK",
        reason: `RDSインスタンス ${instanceId} は停止状態(${STATE_STOPPED})ではなかったので何もしません(${instanceState})`
      };
    }

    console.log(`RDSインスタンス ${instanceId} を起動します`);
    await rds.startDBInstance({ DBInstanceIdentifier: instanceId }).promise();
    return {
      result: "OK",
      reason: "起動しました"
    };
  } catch (e) {
    console.error(e);
    return {
      result: "ERROR",
      reason: e.toString()
    };
  }
};

const stoptRds = async (instanceState: string, instanceId: string): Promise<Types.TaskResultType> => {
  try {
    if (instanceState !== STATE_RUNNING) {
      return {
        result: "OK",
        reason: `RDSインスタンス ${instanceId} は起動中(${STATE_RUNNING})ではなかったので何もしません(${instanceState})`
      };
    }

    console.log(`RDSインスタンス ${instanceId} を停止します`);
    await rds.stopDBInstance({ DBInstanceIdentifier: instanceId }).promise();
    return {
      result: "OK",
      reason: "停止しました"
    };
  } catch (e) {
    console.error(e);
    return {
      result: "ERROR",
      reason: e.toString()
    };
  }
};

/**
 * RDSインスタンスを起動・停止する
 */
export const startStop = async (task: TaskTypes.StartStopRDS): Promise<Types.TaskResultType> => {
  if (env.dryRun) {
    return {
      result: "OK",
      reason: "dryRun"
    };
  }

  const instanceState = await getDbInstanceStateById(task.resourceId);
  if (instanceState === null) {
    return {
      result: "ERROR",
      reason: "インスタンスが見つからないか取得に失敗した"
    };
  }

  if (isTestId(task.resourceId)) {
    return {
      result: "OK",
      reason: "テスト用IDなので何もしません"
    };
  }

  switch (task.task) {
    case "StartRDS":
      return await startRds(instanceState, task.resourceId);

    case "StopRDS":
      return await stoptRds(instanceState, task.resourceId);

    default:
      return util.neverComesHere(task.task);
  }
};
