/**
 * AMI削除処理のタスクを生成する
 */

import * as AWS from "aws-sdk";
import * as env from "../env/index";
import * as Types from "../types/task";
import * as toolbox from "aws-toolbox";
import moment from "moment";
import * as util from "../util";
import * as _ from "lodash";

const ec2 = new AWS.EC2({ region: env.region });

/**
 * AWS.EC2.Imageを簡略化したもの
 */
export type SimplifiedImageType = {
  imageId: string;
  imageName: string;
  instanceId: string;
  expiresAt: moment.Moment | null;
  imageType: string;
  snapshotIds: string[];
};

export const simplify = (image: AWS.EC2.Image): SimplifiedImageType => {
  // ExiresAtタグの値を日付としてパース、成功したらMomentインスタンスとして返す
  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
  const expiresAt = (t => {
    try {
      return moment(t);
    } catch (e) {
      return null;
    }
  })(toolbox.getTag(image.Tags, "ExpiresAt"));

  const isStr = (arg: any): arg is string => typeof arg === "string";
  const snapshotIds: string[] =
    image.BlockDeviceMappings?.map(x => x.Ebs)
      .map(x => x?.SnapshotId)
      .filter<string>(isStr) ?? [];

  return {
    imageId: image.ImageId || "",
    imageName: image.Name || "",
    instanceId: toolbox.getTag(image.Tags, "InstanceId"),
    expiresAt: expiresAt,
    imageType: toolbox.getTag(image.Tags, "ImageType"),
    snapshotIds: snapshotIds
  };
};

/**
 * 自分が所有していて、名前が特定の文字列から始まるAMIを返す
 */
const getAllMyImages = async (): Promise<SimplifiedImageType[]> => {
  const filter = {
    Owners: [env.AccountNo],
    Filters: [{ Name: "name", Values: ["AutoGeneratedAMI_*"] }]
  };

  const data = await ec2.describeImages(filter).promise();
  return (data.Images || []).map(x => simplify(x));
};

export const getExpiredImages = (images: SimplifiedImageType[]): SimplifiedImageType[] => {
  const now = moment();
  let expired = images.filter(x => x.expiresAt !== null && now.diff(x.expiresAt, "day") > 0);
  console.log(`有効期限切れのAMIはそのうち${expired.length}件あります。「ラスト1個」のチェックを行います`);

  const instanceIds = new Set(expired.map(x => x.instanceId).filter(x => x));
  console.log(`うちユニークなインスタンスIDは${instanceIds.size}件です`);
  for (const instanceId of instanceIds) {
    // 全てのAMIのうち、このインスタンスIDを持つもの
    const all = images.filter(x => x.instanceId === instanceId);

    // 今回削除するAMIのうち、このインスタンスIDを持つもの
    const exp = expired.filter(x => x.instanceId === instanceId);

    if (all.length === exp.length) {
      // 件数が同じということは、このまま削除するとなくなってしまう。削除はやめる
      console.log(`${instanceId}を持つAMI ${exp.map(x => x.imageId).join(", ")} は最後なので残します`);
      expired = expired.filter(x => x.instanceId !== instanceId);
    }
  }

  console.log(`最終的に${expired.length}件を削除します`);
  return expired;
};

/**
 * AMI登録解除タスクを生成する
 */
export const generateTasks = async (hours: number, now: moment.Moment): Promise<Types.DeregisterAmi[]> => {
  const images = await getAllMyImages();
  console.log(`${images.length}件のAMIを取得しました`);

  const _now = moment(now || moment());
  const expired = getExpiredImages(images);

  return expired.map(x => {
    // 300～1500秒後にランダムにずらす
    const timestamp = _now.add(300 + Math.random() * 1200, "second");
    const timestampStr = util.formatMomentToLocalTime(timestamp);
    return {
      key: "",
      task: "DeregisterAmi",
      resourceType: "AMI",
      scheduledTime: timestampStr,
      resourceId: x.imageId,
      snapshotIds: x.snapshotIds,
      TTL: 0,
      remainingRetryCount: 2,
      lastModified: ""
    };
  });
};
