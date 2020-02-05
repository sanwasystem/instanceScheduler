/**
 * RDS起動・停止のタスクを生成する
 */

import * as AWS from "aws-sdk";
import * as env from "../env/index";
import * as Types from "../types/task";
import * as toolbox from "aws-toolbox";
import moment from "moment";
import * as util from "../util";

const rds = new AWS.RDS({ region: env.region });

type TaskName = "StartRDS" | "StopRDS";

/**
 * 与えたインスタンスとタグ名からタスクを生成する。何もすることがなければ空の配列を返す
 * @param instance インスタンス
 * @param tagName "AutoStopSchedule"など
 * @param taskName
 * @param hours
 * @param now
 */
function generateTask<TaskName>(
  instance: toolbox.rds.DBInstance,
  tagName: string,
  taskName: TaskName,
  hours: number,
  now: moment.Moment
): {
  identifier: string;
  task: TaskName;
  schedule: moment.Moment;
}[] {
  const cronExperssion = (instance.Tag[tagName] || "").replace(/@/g, "*");
  if (!util.validateCronExpression(cronExperssion)) {
    return [];
  }

  return util.generateInterval(cronExperssion, hours, now).map(schedule => {
    return {
      identifier: instance.DBInstanceIdentifier,
      task: taskName,
      schedule: schedule
    };
  });
}

/**
 * RDSインスタンスのタグ情報からRDSの起動・停止タスクを生成する
 * @param instances
 * @param hours
 * @param now
 */
export const _generateRDSStartStopTasks = (
  instances: toolbox.rds.DBInstance[],
  hours: number,
  now: moment.Moment
): Types.StartStopRDS[] => {
  const start = instances.map(x => generateTask<TaskName>(x, "AutoStartSchedule", "StartRDS", hours, now));
  const stop = instances.map(x => generateTask<TaskName>(x, "AutoStopSchedule", "StopRDS", hours, now));

  const source = start.flat().concat(stop.flat());

  return source.map(x => {
    return {
      key: "",
      task: x.task,
      resourceType: "RDS",
      scheduledTime: util.formatMomentToLocalTime(x.schedule),
      resourceId: x.identifier,
      remainingRetryCount: 2,
      TTL: 0,
      lastModified: ""
    };
  });
};

export const generateTasks = async (hours: number, now: moment.Moment): Promise<Types.StartStopRDS[]> => {
  const allInstances = await toolbox.rds.getAllInstances(rds);
  if (allInstances === null) {
    throw new Error("DBインスタンス取得に失敗しました");
  }
  return _generateRDSStartStopTasks(allInstances, hours, now);
};
