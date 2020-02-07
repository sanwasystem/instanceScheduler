/**
 * EC2起動・停止
 */

import * as AWS from "aws-sdk";
import * as env from "../env/index";
import * as TaskTypes from "../types/task";
import * as Types from "../types/index";
import * as toolbox from "aws-toolbox";
import * as util from "../util";
import { Instance, StatusCode } from "aws-toolbox/dist/src/ec2";
const ec2 = new AWS.EC2({ region: env.region });

type TestIdType = {
  /**
   * 存在しないインスタンス
   */
  readonly EC2_ID_NOTFOUND: string;
  /**
   * 検索をすると見つかり、起動中となっているインスタンス
   */
  readonly EC2_ID_RUNNING: string;
  /**
   * 検索をすると見つかり、停止となっているインスタンス
   */
  readonly EC2_ID_STOPPED: string;
  /**
   * 検索をすると見つかり、停止中となっているインスタンス
   */
  readonly EC2_ID_SHUTTINGDOWN: string;
};

export const TEST_IDS: TestIdType = {
  EC2_ID_NOTFOUND: "i-NotFound",
  EC2_ID_RUNNING: "i-Running",
  EC2_ID_STOPPED: "i-Stopped",
  EC2_ID_SHUTTINGDOWN: "i-shuttingDown"
};

const isTestId = (id: string): boolean => {
  return [
    TEST_IDS.EC2_ID_NOTFOUND,
    TEST_IDS.EC2_ID_RUNNING,
    TEST_IDS.EC2_ID_STOPPED,
    TEST_IDS.EC2_ID_SHUTTINGDOWN
  ].includes(id);
};

/**
 * テスト用のインスタンス情報を返す
 * @param instanceId テスト用インスタンスIDのいずれか
 */
const getTestInstance = (instanceId: string): Instance | null => {
  const result: Instance = {
    InstanceId: instanceId,
    InstanceType: "xxx",
    State: { Code: 0, Name: "" }, // 仮の値
    VpcId: "vpc-12345678",
    BlockDeviceMappings: [],
    SecurityGroups: [],
    SubnetId: "subnet-12345678",
    Tags: [
      { Key: "Name", Value: "Test" },
      { Key: "Description", Value: "Test test test" }
    ],
    Tag: { Name: "Test", Description: "Test test test" },
    NameTag: "Test",
    DescriptionTag: "Test test test",
    isDetailedMonitoringEnabled: false,
    IsRunning: true,
    IpAddress: "0.0.0.0"
  };

  switch (instanceId) {
    case TEST_IDS.EC2_ID_NOTFOUND:
      return null;
    case TEST_IDS.EC2_ID_RUNNING:
      result.State = { Code: StatusCode.RUNNING, Name: "running" };
      return result;
    case TEST_IDS.EC2_ID_STOPPED:
      result.State = { Code: StatusCode.STOPPED, Name: "stopped" };
      return result;
    case TEST_IDS.EC2_ID_SHUTTINGDOWN:
      result.State = { Code: StatusCode.SHUTTINGDOWN, Name: "shutting_down" };
      return result;
    default:
      throw new Error("不正な値が渡されました（内部エラー）");
  }
};

/**
 * EC2IDでEC2インスタンスを探して返す。見つからなかった場合、エラーが起きた場合はnullを返す。
 * テスト用インスタンスIDを渡すとAWS APIを呼ばず内部で作成したオブジェクトを返す
 */
const getInstanceById = async (instanceId: string): Promise<Instance | null> => {
  if (
    [TEST_IDS.EC2_ID_NOTFOUND, TEST_IDS.EC2_ID_RUNNING, TEST_IDS.EC2_ID_SHUTTINGDOWN, TEST_IDS.EC2_ID_STOPPED].includes(
      instanceId
    )
  ) {
    console.log("テスト用IDが渡されました");
    return getTestInstance(instanceId);
  }

  try {
    console.log(`EC2 ${instanceId} を取得します`);
    return toolbox.ec2.getInstanceById(ec2, instanceId);
  } catch (e) {
    // 原因の如何に関わらずnullを返す
    console.error(e);
    return null;
  }
};

/**
 * 与えられたタスクの種別（起動・停止）と、インスタンスの現在の状態とを比較し、何をすべきかを返す。
 * テスト用インスタンスIDでもここでは"skip"ではなく正しい値が返る。
 */
const checkStatus = async (task: TaskTypes.StartStopEC2): Promise<["skip" | "error" | "start" | "stop", string]> => {
  const instance = await getInstanceById(task.resourceId);
  if (instance === null) {
    return ["error", `インスタンス取得時にエラー`];
  }

  if (env.dryRun) {
    return ["skip", "dryRun"];
  }

  if (task.task === "StartEC2") {
    switch (instance.State.Code) {
      case StatusCode.STOPPED:
        return ["start", ""];
      case StatusCode.RUNNING:
        return ["skip", "インスタンスが既に起動していた"];
      case StatusCode.PENDING:
        return ["skip", "インスタンスが既に起動中の状態"];
      default:
        return ["skip", `インスタンスの状態が${instance.State.Code}`];
    }
  }

  if (task.task == "StopEC2") {
    switch (instance.State.Code) {
      case StatusCode.RUNNING:
        return ["stop", ""];
      case StatusCode.STOPPED:
        return ["skip", "インスタンスが既に停止していた"];
      case StatusCode.STOPPING:
        return ["skip", "インスタンスが既に停止中の状態"];
      default:
        return ["skip", `インスタンスの状態が${instance.State.Code}`];
    }
  }

  throw new Error("ここには来ない");
};

/**
 * EC2を起動・停止する
 */
export const startStop = async (task: TaskTypes.StartStopEC2): Promise<Types.TaskResultType> => {
  const statusCheckResult = await checkStatus(task);

  switch (statusCheckResult[0]) {
    case "error":
      return {
        result: "ERROR",
        reason: `何もせずに終了します。理由: ${statusCheckResult[1]}`
      };

    case "skip":
      return {
        result: "OK",
        reason: `何もせずに終了します。理由: ${statusCheckResult[1]}`
      };

    case "stop":
    case "start":
      try {
        const startIfTrue = statusCheckResult[0] === "start";
        console.log(`EC2ID ${task.resourceId} を${startIfTrue ? "起動" : "停止"}します...`);
        if (isTestId(task.resourceId)) {
          console.log("テスト用IDなので何もせずに終了します");
          return {
            result: "OK",
            reason: "テスト用ID"
          };
        }

        const result = await toolbox.ec2.startStopInstance(ec2, task.resourceId, startIfTrue ? "START" : "STOP");
        switch (result[0]) {
          case "error":
            return { result: "ERROR", reason: result[1] };
          case "nothingToDo":
            return { result: "OK", reason: "nothing to do" }; // 既にチェック済みなのでここには来ない
          case "ok":
            return { result: "OK", reason: "OK" };
          case "timeout":
            return { result: "RETRY", reason: "規定の時間内に状態が変わりませんでした" };
          case "skip":
            return { result: "OK", reason: "nothing to do" }; // 既にチェック済みなのでここには来ない
          default:
            throw new Error("");
        }
      } catch (e) {
        console.error(e);
        return {
          result: "RETRY",
          reason: e
        };
      }

    default:
      return util.neverComesHere(statusCheckResult[0]);
  }
};
