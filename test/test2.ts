import * as fs from "fs";
import * as assert from "assert";
import * as AWS from "aws-sdk";
//import AmiRemoverTest from "./amiRemoverTest";
import moment from "moment";
import * as _ from "lodash";
require("dotenv").config();

const ACCOUNT_ID = process.env.AwsAccountId || "";
const region = process.env.AwsRegion || "";
const ec2 = new AWS.EC2();
const dynamo = new AWS.DynamoDB.DocumentClient({ region });

describe("EC2Instance", () => {
  describe("shoudBeRunning", () => {});
});
