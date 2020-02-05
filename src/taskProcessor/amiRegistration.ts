/**
 * AMI登録
 */

import * as AWS from "aws-sdk";
import * as env from "../env/index";
import * as TaskTypes from "../types/task";
import * as Types from "../types";
import * as toolbox from "aws-toolbox";
import { Instance } from "aws-toolbox/dist/src/ec2";
import * as util from "../util";
import * as taskIO from "../taskIO";
import * as amiTag from "../taskGenerator/amiTagAppend";
const ec2 = new AWS.EC2({ region: env.region });

type TestIdsType = {
  /**
   * 常にAMI登録に成功するEC2 ID
   */
  readonly EC2_ID_OK: string;

  /**
   * 存在しないEC2 ID
   */
  readonly EC2_ID_NOT_FOUND: string;
  /**
   * AMI作成時にエラーが起きるEC2 ID
   */
  readonly EC2_ID_ERROR: string;
};

export const TEST_IDS: TestIdsType = {
  EC2_ID_OK: "i-TEST-ok",
  EC2_ID_NOT_FOUND: "i-TEST-notFound",
  EC2_ID_ERROR: "i-TEST-Error"
};

const getInstanceById = async (instanceId: string): Promise<Instance | null> => {
  if (instanceId === TEST_IDS.EC2_ID_NOT_FOUND) {
    console.log("テスト用IDが見つかりました。EC2が見つからなかったことにします");
    return null;
  }
  return await toolbox.ec2.getInstanceById(ec2, instanceId);
};

export const createAMI = async (task: TaskTypes.RegisterAmi): Promise<Types.TaskResultType> => {
  try {
    if (task.resourceId === TEST_IDS.EC2_ID_ERROR) {
      throw new Error("テスト用IDが見つかりました。AMI登録時にエラーが起きたことにします");
    }

    if (task.resourceId === TEST_IDS.EC2_ID_OK) {
      console.log("テスト用IDが見つかりました。AMI登録が成功したことにします");
      return { result: "OK", reason: "" };
    }

    // EC2インスタンスを取得
    const instance = await getInstanceById(task.resourceId);

    if (instance === null) {
      return { result: "ERROR", reason: `EC2 ID ${task.resourceId} は見つかりませんでした。リトライはしません` };
    }

    // EC2インスタンスのタグ情報からAMIの名前やタグ情報を生成する
    const amiInfo = util.generateAmiInfo(instance, task.ec2ForceToReboot);

    // AMI作成
    const amiData = await ec2
      .createImage({
        InstanceId: instance.InstanceId,
        Name: amiInfo.amiName,
        Description: amiInfo.description,
        NoReboot: !task.ec2ForceToReboot
      })
      .promise();

    if (!amiData.ImageId) {
      return { result: "RETRY", reason: "AMI IDが取得できません。AMI作成に失敗したようです" };
    }

    console.log(`${instance.InstanceId} のAMI ${amiData.ImageId} を作成しました。タグ登録タスクを登録します`);

    // ここで得たAMI IDを入れたタグ追加タスクを登録する
    const newTask = amiTag.generate(instance, amiData.ImageId, task.ec2ForceToReboot);
    await taskIO.putTask(newTask);

    console.log(`タグ登録タスクを登録しました`);
    console.log(newTask);

    return { result: "OK", reason: "" };
  } catch (e) {
    console.error(e);
    return { result: "OK", reason: e.toString() };
  }
};
