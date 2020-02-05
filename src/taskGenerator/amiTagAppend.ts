/**
 * AMIタグ追加のタスクを生成する
 */

import * as Types from "../types/task";
import * as toolbox from "aws-toolbox";
import moment from "moment";
import * as util from "../util";

export const generate = (instance: toolbox.ec2.Instance, amiId: string, forceToReboot: boolean): Types.AddAmiTag => {
  const execTime = moment().add(5, "minute");
  const amiData = util.generateAmiInfo(instance, forceToReboot);

  return {
    key: "",
    task: "AddAmiTag",
    scheduledTime: util.formatMomentToLocalTime(execTime),
    resourceId: amiId,
    resourceType: "AMI",
    tags: [
      { Key: "InstanceId", Value: instance.InstanceId },
      { Key: "ExpiresAt", Value: amiData.expiresAt },
      { Key: "Name", Value: amiData.nameJp },
      { Key: "ImageType", Value: "AutomatedSnapshot" }
    ],
    remainingRetryCount: 2,
    TTL: 0,
    lastModified: "2020-02-04T09:59:00+09:00"
  };
};
