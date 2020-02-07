/**
 * AlwaysRunningタグに「true」と書いてあって、かつ状態がrunningでないものを探す
 */
import * as AWS from "aws-sdk";
import * as env from "./env/index";
import * as util from "./util";
import * as toolbox from "aws-toolbox";
import moment from "moment";

const ec2 = new AWS.EC2({ region: env.region });

/**
 * AlwaysRunningタグに「true」と書いてあって、スケジュールを算出すると起動中のはずで、かつ状態がrunningでもpendingでもないものを探す
 * @param ec2Instances
 */
export const _getEc2ToAlarm = (ec2Instances: toolbox.ec2.Instance[], now: moment.Moment): toolbox.ec2.Instance[] => {
  return ec2Instances.filter(x => {
    const alwaysRunning = x.Tag.AlwaysRunning?.toLowerCase() === "true";
    const scheduledStatus = util.getScheduledStatus(
      x.Tag.AutoStartSchedule,
      x.Tag.AutoStopSchedule,
      moment(now).add(1, "minutes")
    );
    const isRunning = [toolbox.ec2.StatusCode.RUNNING, toolbox.ec2.StatusCode.PENDING].includes(x.State.Code);
    // console.log(`alwaysRunning=${alwaysRunning}, isRunning=${isRunning}, scheduledStatus=${scheduledStatus}`);
    return alwaysRunning && scheduledStatus === "RUNNING" && !isRunning;
  });
};

export const getEc2ToAlarm = async (): Promise<toolbox.ec2.Instance[]> => {
  const ec2Instances = await toolbox.ec2.getAllInstances(ec2);
  return _getEc2ToAlarm(ec2Instances, moment());
};
