/**
 * AlwaysRunningタグに「true」と書いてあって、かつ状態がrunningでないものを探す
 */
import * as AWS from "aws-sdk";
import * as env from "./env/index";
import * as toolbox from "aws-toolbox";

const ec2 = new AWS.EC2({ region: env.region });

export const _getEc2ToAlarm = (ec2Instances: toolbox.ec2.Instance[]): toolbox.ec2.Instance[] => {
  // AlwaysRunningタグに「true」と書いてあって、かつ状態がrunningでないものを探す
  return ec2Instances.filter(x => {
    const alwaysRunning = x.Tag.AlwaysRunning?.toLowerCase() === "true";
    const notRunning = x.State.Code !== toolbox.ec2.StatusCode.RUNNING;
    return alwaysRunning && notRunning;
  });
};

export const getEc2ToAlarm = async (): Promise<toolbox.ec2.Instance[]> => {
  const ec2Instances = await toolbox.ec2.getAllInstances(ec2);
  return _getEc2ToAlarm(ec2Instances);
};
