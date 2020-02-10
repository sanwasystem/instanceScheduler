// InstanceScheduler v1.1.0
// https://github.com/sanwasystem/instance-scheduler
/* eslint-disable @typescript-eslint/no-unused-vars */
import * as AWS from "aws-sdk";
import * as env from "./env/index";
import * as LambdaTypes from "aws-lambda";
import { generateTasks } from "./taskGenerator/index";
import { processTask } from "./taskProcessor";
import * as taskIO from "./taskIO";
import * as slack from "./slack";
import * as ec2alarm from "./ec2alarm";
import * as util from "./util";
import * as _ from "lodash";
import moment from "moment";

const lambda = new AWS.Lambda({ region: env.region });

/**
 * 今後25時間分のタスクを生成し、DynamoDBに登録する
 */
exports.registerTasks = async (event: any, context: LambdaTypes.Context): Promise<boolean> => {
  const tasks = await generateTasks(25, moment());
  const grouped = _.groupBy(tasks, "task");
  const counts = Object.keys(grouped).map(x => `${x}: ${grouped[x].length} 件`);
  await slack.log(`今後25時間分の${tasks.length}件のタスクを生成しました\n` + counts.join("\n"));
  for (const task of tasks) {
    console.log(task);
    await taskIO.putTask(task);
  }
  console.log("タスクの登録が完了しました");
  return true;
};

/**
 * 1. 起動しているはずのEC2が停止していたら（runnningではなかったら）アラートを出す
 * 2. D2ynamoDBから実行すべきスケジュールを取得して別のLambdaに渡して処理する
 */
exports.processTasks = async (event: any, context: LambdaTypes.Context): Promise<void> => {
  // 処理すべきタスクを取得し、別Lambdaに渡して処理させる
  const tasks = await taskIO.getTasks();
  for (const task of tasks) {
    console.log(`次のタスクを実行します: ${task.key}`);
    await lambda
      .invoke({
        FunctionName: "InstanceScheduler_TaskProcessor",
        InvocationType: "Event",
        Payload: JSON.stringify({ taskId: task.key })
      })
      .promise();
  }
  console.log("タスクの実行は完了しました。EC2起動チェックを行います");

  // EC2を全部取得する
  const alarm = await ec2alarm.getEc2ToAlarm();
  if (alarm.length > 0) {
    const lines = alarm.map(x => `* ID: ${x.InstanceId} Name: ${x.NameTag} IpAddress: ${x.IpAddress}`);
    const message = ["AlwaysRunning（常時起動）タグが付いているのに停止しているインスタンスがあります", ...lines].join(
      "\r\n"
    );
    await slack.error(message);
  }
};

/**
 * 引数taksIdでDynamoDBを検索し、タスクを処理する
 */
exports.processTask = async (event: any, context: LambdaTypes.Context): Promise<boolean> => {
  const taskId = event.taskId;
  if (typeof taskId !== "string") {
    throw new Error("引数が指定されていません");
  }

  const task = await taskIO.getTaskById(taskId);
  console.log("次のタスクを処理します:");
  console.log(task);
  const result = await processTask(task);
  if (typeof result === "boolean") {
    if (result) {
      // 成功した
      console.log("タスクは成功しました");
      await taskIO.removeTask(task);
      return true;
    } else {
      console.log("タスクは失敗しました");
      // 失敗した。リトライする（リトライカウンタが0だったら削除する）
      await taskIO.decrementRetryCount(task);
      return false;
    }
  } else {
    await slack.log(`タスクの内容: ${JSON.stringify(task)}, 結果: ${result.result}, 理由: ${result.reason}`);
    switch (result.result) {
      case "OK":
        await taskIO.removeTask(task);
        return true;

      case "ERROR":
        await taskIO.removeTask(task);
        return false;

      case "RETRY":
        await taskIO.decrementRetryCount(task);
        return false;

      default:
        return util.neverComesHere(result.result);
    }
  }
};
