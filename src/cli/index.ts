// eslint-disable-next-line @typescript-eslint/no-var-requires
const myModule = require("../index");
import * as AWS from "aws-sdk";
import * as toolbox from "aws-toolbox";
import * as env from "../env/index";
import { generateTasks } from "../taskGenerator/index";
import * as taskIO from "../taskIO";

const context = toolbox.lambda.generateLambdaContextSample("InstanceScheduler");
const event = {};

(async () => {
  try {
    await myModule.registerTasks(event, {});

    // console.log("-----------");
    // const tasks = await taskIO.getTasks();
    // console.log(tasks);
    // await myModule.processTask({ taskId: tasks[0].key }, {});
  } catch (e) {
    console.error(e);
  }
})();
