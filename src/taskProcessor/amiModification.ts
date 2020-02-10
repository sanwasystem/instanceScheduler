/**
 * AMI登録解除・AMIタグ追加
 */

import * as AWS from "aws-sdk";
import * as env from "../env/index";
import * as TaskTypes from "../types/task";
import * as Types from "../types";

const ec2 = new AWS.EC2({ region: env.region });

type TestIdsType = {
  /**
   * 常に検索・登録解除に成功するAMI ID
   */
  readonly AMI_ID_OK: string;

  /**
   * 検索に失敗するAMI ID
   */
  readonly AMI_ID_NOT_FOUND: string;
  /**
   * 必ず削除に失敗するスナップショットID
   */
  readonly SNAPSHOT_ID_PROTECTED: string;

  /**
   * 常に検索・削除に成功するスナップショットID
   */
  readonly SNAPSHOT_ID_OK: string;
};

export const TEST_IDS: TestIdsType = {
  AMI_ID_OK: "ami-TEST-ok",
  AMI_ID_NOT_FOUND: "ami-TEST-notFound",
  SNAPSHOT_ID_PROTECTED: "snap-TEST-protected",
  SNAPSHOT_ID_OK: "snap-TEST-ok"
};

/**
 * AMIにタグを付ける
 */
export const addTags = async (task: TaskTypes.AddAmiTag): Promise<Types.TaskResultType> => {
  if (env.dryRun) {
    console.log("dryRunが指定されているので何もしません");
    return { result: "OK", reason: "dryRun" };
  }

  try {
    if (task.resourceId === TEST_IDS.AMI_ID_NOT_FOUND) {
      console.log("テスト用AMI IDが見つかりました。見つからなかったことにします");
      throw new Error("ami not found");
    }
    if (task.resourceId === TEST_IDS.AMI_ID_OK) {
      console.log("テスト用AMI IDが見つかりました。タグ追加はスキップして成功したことにします");
      return { result: "OK", reason: "dryRun" };
    }

    const tags = task.tags.map(x => `${x.Key}=${x.Value}`).join(", ");
    console.log(`${task.resourceId} にタグを追加します: ${tags}`);
    await ec2.createTags({ Resources: [task.resourceId], Tags: task.tags }).promise();

    return { result: "OK", reason: "OK" };
  } catch (e) {
    console.error("タグ追加に失敗しました。次回リトライします");
    return {
      result: "RETRY",
      reason: e.toString()
    };
  }
};

const deregisterAmi = async (amiId: string): Promise<boolean> => {
  if (env.dryRun) {
    console.log("dryRunが指定されているのでAMI登録解除はスキップします");
    return true;
  }
  try {
    console.log(`AMI ${amiId} を登録解除します...`);
    if (amiId === TEST_IDS.AMI_ID_NOT_FOUND) {
      throw new Error("テスト用AMI IDが見つかりました。登録解除時に見つからないエラーが起きたことにします");
    }
    if (amiId === TEST_IDS.AMI_ID_OK) {
      console.log("テスト用AMI IDが見つかりました。登録解除できたことにします");
      return true;
    }

    await ec2
      .deregisterImage({
        ImageId: amiId
      })
      .promise();
    return true;
  } catch (e) {
    console.error(e);
    return false;
  }
};

/**
 * 1件のスナップショットを削除する
 */
const deleteSnapshot = async (snapshotId: string): Promise<boolean> => {
  if (env.dryRun) {
    console.log("dryRunが指定されているのでスナップショット削除はスキップします");
    return true;
  }
  try {
    console.log(`スナップショット ${snapshotId} を削除します...`);
    if (snapshotId === TEST_IDS.SNAPSHOT_ID_PROTECTED) {
      throw new Error("テスト用スナップショットIDが見つかりました。削除に失敗したことにします");
    }
    if (snapshotId === TEST_IDS.SNAPSHOT_ID_OK) {
      console.log("テスト用スナップショットIDが見つかりました。削除に成功したことにします");
      return true;
    }

    await ec2.deleteSnapshot({ SnapshotId: snapshotId }).promise();
    return true;
  } catch (e) {
    console.error(e);
    return false;
  }
};

/**
 * AMIを登録解除し、紐付くスナップショットも削除する
 * @param task
 */
export const deleteAmi = async (task: TaskTypes.DeregisterAmi): Promise<Types.TaskResultType> => {
  const amiResult = await deregisterAmi(task.resourceId);
  let amiDeregistrationOk = true;
  let snapshotDeletionAllOk = true;

  if (!amiResult) {
    amiDeregistrationOk = false;
    console.error("AMI登録解除には失敗しましたがスナップショット削除を試みます");
  }

  for (const snapshotId of task.snapshotIds) {
    const snapshotReuslt = await deleteSnapshot(snapshotId);
    snapshotDeletionAllOk = snapshotDeletionAllOk && snapshotReuslt;
  }

  if (amiDeregistrationOk && snapshotDeletionAllOk) {
    return { result: "OK", reason: "AMI登録解除・スナップショット削除成功" };
  }

  if (!amiDeregistrationOk) {
    return { result: "RETRY", reason: "AMI登録解除失敗" };
  }
  if (!snapshotDeletionAllOk) {
    return { result: "RETRY", reason: "AMI登録解除成功、スナップショット削除失敗" };
  }
  return { result: "RETRY", reason: "AMI登録解除もスナップショット削除も失敗" };
};
