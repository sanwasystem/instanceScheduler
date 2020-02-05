import * as Types from "../types/task";
import * as amiDeregistration from "./amiDeregistration";
import * as rds from "./rds";
import * as ec2 from "./ec2";
import moment from "moment";

type taskGenerator = (hours: number, now: moment.Moment) => Promise<Types.TaskRecord[]>;

export const generateTasks = async (hours: number, now: moment.Moment): Promise<Types.TaskRecord[]> => {
  const generators: taskGenerator[] = [ec2.generateTasks, rds.generateTasks, amiDeregistration.generateTasks];
  let result: Types.TaskRecord[] = [];
  for (const generator of generators) {
    const tasks = await generator(hours, now);
    result = result.concat(tasks);
  }

  return result;
};
