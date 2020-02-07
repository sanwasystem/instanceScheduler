import * as AWS from "aws-sdk";
import * as env from "../env/index";
import * as TaskTypes from "../types/task";
import * as Types from "../types/index";
import * as toolbox from "aws-toolbox";
import * as slack from "../slack";
const ec2 = new AWS.EC2({ region: env.region });

/**
 * EC2を起動・停止した後のステータスチェックを行う
 */
export const statusCheck = async (task: TaskTypes.EC2StatusCheck): Promise<Types.TaskResultType> => {
  try {
    const instance = await toolbox.ec2.getInstanceById(ec2, task.resourceId);
    if (instance === null) {
      // 削除済み。リトライしても仕方がない
      return {
        result: "OK",
        reason: "削除済み"
      };
    }

    if (task.statusIsNot.includes(instance.State.Code)) {
      await slack.error(
        `10分前にスケジュールされていた起動・停止処理が完了していません\n` +
          `EC2 ID: ${task.resourceId}, status=${instance.State.Name} (${instance.State.Code})`
      );
      return {
        result: "ERROR",
        reason: "ステータスが不正"
      };
    } else {
      return {
        result: "OK",
        reason: `${instance.InstanceId}: status=${instance.State.Name} (${instance.State.Code})`
      };
    }
  } catch (e) {
    // ステータス取得自体に失敗したのでリトライ
    console.error(e.toString());
    return {
      result: "RETRY",
      reason: e.toString()
    };
  }
};
