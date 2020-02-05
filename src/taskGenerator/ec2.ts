/**
 * EC2起動・停止、AMI登録・AMIタグ追加のタスクを生成する
 */

import * as AWS from "aws-sdk";
import * as env from "../env/index";
import * as Types from "../types/task";
import * as toolbox from "aws-toolbox";
import moment from "moment";
import * as util from "../util";

const ec2 = new AWS.EC2({ region: env.region });

type TaskName = "StopEC2" | "StartEC2" | "RegisterAmi";

/**
 * 与えたインスタンスとタグ名からタスクを生成する。何もすることがなければ空の配列を返す
 * @param instance インスタンス
 * @param tagName "AutoStopSchedule"など
 * @param taskName
 * @param hours タスクを生成する範囲（時間）
 * @param now タスクを生成する基準となる日時
 */
function generateTask<TaskName>(
  instance: toolbox.ec2.Instance,
  tagName: string,
  taskName: TaskName,
  hours: number,
  now: moment.Moment
): {
  instanceId: string;
  task: TaskName;
  schedule: moment.Moment;
}[] {
  if (!util.validateCronExpression(instance.Tag[tagName])) {
    return [];
  }
  return util.generateInterval(instance.Tag[tagName], hours, now).map(schedule => {
    return {
      instanceId: instance.InstanceId,
      task: taskName,
      schedule: schedule
    };
  });
}

/**
 * EC2インスタンスのタグ情報から今後25時間のAMI登録タスクを生成する
 * @param instances EC2インスタンス
 * @param forceToReboot AMI作成時に強制リブートをかけるならtrue
 * @param hours タスクを生成する範囲
 * @param now タスクを生成する基準となる日時。省略時は現在時刻
 */
export const generateAmiRegistrationTasks = (
  instances: toolbox.ec2.Instance[],
  forceToReboot: boolean,
  hours: number,
  now: moment.Moment
): Types.RegisterAmi[] => {
  const tagName = forceToReboot ? "AmiSchedule_ForceToReboot" : "AmiSchedule";
  const source = instances.map(x => generateTask<"RegisterAmi">(x, tagName, "RegisterAmi", hours, now)).flat();

  return source.map(x => {
    return {
      key: "",
      task: "RegisterAmi",
      resourceType: "EC2",
      scheduledTime: util.formatMomentToLocalTime(x.schedule),
      resourceId: x.instanceId,
      ec2ForceToReboot: forceToReboot,
      remainingRetryCount: 1,
      TTL: 0,
      lastModified: ""
    };
  });
};

/**
 * EC2インスタンスのタグ情報からEC2起動・停止タスクを生成する
 * @param instances EC2インスタンスのリスト
 * @param hours 今後何時間分のタスクを生成するか（24時間・1日1回だとタスク生成に漏れが生ずる可能性がある）
 * @param now タスク生成の基準日時
 */
export const generateEC2StartStopAMITasks = (
  instances: toolbox.ec2.Instance[],
  hours: number,
  now: moment.Moment
): Types.StartStopEC2[] => {
  const start = instances.map(x =>
    generateTask<"StartEC2" | "StopEC2">(x, "AutoStartSchedule", "StartEC2", hours, now)
  );
  const stop = instances.map(x => generateTask<"StartEC2" | "StopEC2">(x, "AutoStopSchedule", "StopEC2", hours, now));

  const source = start.flat().concat(stop.flat());

  return source.map(x => {
    return {
      key: "",
      task: x.task,
      resourceType: "EC2",
      scheduledTime: util.formatMomentToLocalTime(x.schedule),
      resourceId: x.instanceId,
      remainingRetryCount: 2,
      TTL: 0,
      lastModified: ""
    };
  });
};

export const generateTasks = async (
  hours: number,
  now: moment.Moment
): Promise<(Types.StartStopEC2 | Types.RegisterAmi)[]> => {
  const allInstances = await toolbox.ec2.getAllInstances(ec2);
  let tasks: (Types.StartStopEC2 | Types.RegisterAmi)[] = [];

  tasks = tasks.concat(generateEC2StartStopAMITasks(allInstances, hours, now));
  tasks = tasks.concat(generateAmiRegistrationTasks(allInstances, true, hours, now));
  tasks = tasks.concat(generateAmiRegistrationTasks(allInstances, false, hours, now));

  return tasks;
};
