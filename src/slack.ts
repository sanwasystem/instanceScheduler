import * as AWS from "aws-sdk";
import * as env from "./env";
import * as envSlack from "./env/slack";

const lambda = new AWS.Lambda({ region: env.region });

const send = async (message: string | object, channel: string): Promise<void> => {
  const text = typeof message === "object" ? JSON.stringify(message) : message;

  // チャンネル名が空文字かnoneだったらSlackへの送信はスキップ
  if (channel === "" || channel === "none") {
    console.log(text);
    return;
  }

  console.log(`Slackへ送信: channel=${channel}, message=${text}`);
  const payload = {
    text: text,
    channel: channel,
    name: envSlack.AccountNickName,
    icon: envSlack.Icon
  };

  await lambda
    .invoke({
      FunctionName: envSlack.ClientLambdaName,
      Payload: JSON.stringify(payload)
    })
    .promise();
};

export const log = async (message: string | object): Promise<void> => {
  await send(message, envSlack.Channel);
};

export const error = async (message: string | object): Promise<void> => {
  await send(message, envSlack.ErrorChannel);
};
