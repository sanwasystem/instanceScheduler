/**
 * EC2起動・停止、ステータスチェック、AMI登録・AMIタグ追加のタスクを生成する
 */

import * as AWS from "aws-sdk";
import * as env from "../env/index";
import * as Types from "../types/task";
import * as toolbox from "aws-toolbox";
import moment from "moment";
import * as util from "../util";

const ec2 = new AWS.EC2({ region: env.region });

/**
 * EC2インスタンスのタグ情報からAMI登録タスクを生成する
 * @param instances EC2インスタンスのリスト
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
  const source = instances.map(x => util.generateTask<"RegisterAmi">(x, tagName, "RegisterAmi", hours, now)).flat();

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

type StartStopStatusCheckTasks = Types.StartStopEC2 | Types.EC2StatusCheck;

/**
 * EC2インスタンスのタグ情報からEC2起動・停止タスクを生成し、さらにその10分後にステータスチェックタスクを生成する
 * @param instances EC2インスタンスのリスト
 * @param hours タスクを生成する範囲
 * @param now タスク生成の基準日時
 */
export const generateEC2StartStopAMITasks = (
  instances: toolbox.ec2.Instance[],
  hours: number,
  now: moment.Moment
): StartStopStatusCheckTasks[] => {
  const start = instances.map(x =>
    util.generateTask<"StartEC2" | "StopEC2">(x, "AutoStartSchedule", "StartEC2", hours, now)
  );
  const stop = instances.map(x =>
    util.generateTask<"StartEC2" | "StopEC2">(x, "AutoStopSchedule", "StopEC2", hours, now)
  );

  const source = start.flat().concat(stop.flat());

  // 起動スケジュール時刻のしばらく後にこれだったらおかしい
  const statusList1 = [toolbox.ec2.StatusCode.STOPPED, toolbox.ec2.StatusCode.PENDING];
  // 停止スケジュール時刻のしばらく後にこれだったらおかしい
  const statusList2 = [toolbox.ec2.StatusCode.RUNNING, toolbox.ec2.StatusCode.STOPPING];

  return source
    .map(x => {
      const startStop: Types.StartStopEC2 = {
        key: "",
        task: x.task,
        resourceType: "EC2",
        scheduledTime: util.formatMomentToLocalTime(x.schedule),
        resourceId: x.instanceId,
        remainingRetryCount: 2,
        TTL: 0,
        lastModified: ""
      };

      const ten_minutes_after = moment(x.schedule).add(10, "minute");
      const statusCheck: Types.EC2StatusCheck = {
        key: "",
        task: "EC2StatusCheck",
        resourceType: "EC2",
        scheduledTime: util.formatMomentToLocalTime(ten_minutes_after),
        resourceId: x.instanceId,
        remainingRetryCount: 0,
        statusIsNot: x.task === "StartEC2" ? statusList1 : statusList2,
        TTL: 0,
        lastModified: ""
      };

      return [startStop, statusCheck];
    })
    .flat();
};

export const generateTasks = async (
  hours: number,
  now: moment.Moment
): Promise<(Types.StartStopEC2 | Types.RegisterAmi | Types.EC2StatusCheck)[]> => {
  const allInstances = await toolbox.ec2.getAllInstances(ec2);
  let tasks: (Types.StartStopEC2 | Types.RegisterAmi | Types.EC2StatusCheck)[] = [];

  tasks = tasks.concat(generateEC2StartStopAMITasks(allInstances, hours, now));
  tasks = tasks.concat(generateAmiRegistrationTasks(allInstances, true, hours, now));
  tasks = tasks.concat(generateAmiRegistrationTasks(allInstances, false, hours, now));

  return tasks;
};
