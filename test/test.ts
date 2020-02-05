import * as fs from "fs";
import * as assert from "assert";
import * as AWS from "aws-sdk";
import moment from "moment";
import * as util from "../src/util";
import * as _ from "lodash";
import * as env from "../src/env";
import * as toolbox from "aws-toolbox";
import * as taskGenerator_ami from "../src/taskGenerator/amiDeregistration";
import * as taskGenerator_ec2 from "../src/taskGenerator/ec2";
import * as taskGenerator_rds from "../src/taskGenerator/rds";
import * as taskProcessor_ec2 from "../src/taskProcessor/ec2startStop";
import * as TaskType from "../src/types/task";
import * as ec2alarm from "../src/ec2alarm";
import * as taskIO from "../src/taskIO";

const region = env.region;
const ec2 = new AWS.EC2();
const dynamo = new AWS.DynamoDB.DocumentClient({ region });

function loadJson<T>(filename: string, typeguards?: (arg: any) => arg is T): T {
  const raw = fs.readFileSync(`test/fixtures/${filename}`).toString("utf8");
  const data = JSON.parse(raw);
  if (typeguards) {
    if (typeguards(data)) {
      return data;
    } else {
      throw new Error("JSONの形式が一致しません");
    }
  }
  return data as T;
}

describe("task generator", () => {
  describe("amiDeregistration", () => {
    describe("simplify", () => {
      it("test1", () => {
        const ami = loadJson<AWS.EC2.Image>("Ami1.json");
        const result = taskGenerator_ami.simplify(ami);
        assert.equal(result.imageId, "ami-33333333333333333");
        assert.equal(result.snapshotIds.length, 2);
        assert.equal(result.imageName, "AutoGeneratedAMI_HogeFugaServer_20200127_0101_i-88888888888888888");
        assert.equal(result.imageType, "AutomatedSnapshot");
        assert.equal(result.instanceId, "i-88888888888888888");
        assert.equal(result.snapshotIds[0], "snap-11111111111111111");
        assert.equal(result.snapshotIds[1], "snap-22222222222222222");
      });
    });
  });

  describe("rds", () => {
    it("statStop", () => {
      // AutoStopSchedule": "0 8 @ @ @"
      const rdsInstance = loadJson<toolbox.rds.DBInstance>("RDSInstance1.json");

      const startStop = taskGenerator_rds._generateRDSStartStopTasks(
        [rdsInstance],
        24,
        moment("2020-02-01T09:00:00+09:00")
      );
      assert.equal(startStop.length, 1);
      assert.equal(startStop[0].resourceId, rdsInstance.DBInstanceIdentifier);
      assert.equal(startStop[0].resourceType, "RDS");
      assert.equal(startStop[0].scheduledTime, "2020-02-02T08:00:00+09:00"); // 翌日の8:00
    });

    it("statStop2", () => {
      const rdsInstance = loadJson<toolbox.rds.DBInstance>("RDSInstance1.json");
      rdsInstance.Tag.AutoStopSchedule = "0,20 9 @ @ @";
      rdsInstance.Tag.AutoStartSchedule = "0,20 10 @ @ @";
      rdsInstance.Tags = [
        { Key: "AutoStopSchedule", Value: "0,20 9 @ @ @" },
        { Key: "AutoStartSchedule", Value: "0,20 10 @ @ @" }
      ];

      const startStop = taskGenerator_rds._generateRDSStartStopTasks(
        [rdsInstance],
        24,
        moment("2020-02-01T08:00:00+09:00")
      );

      assert.equal(startStop.length, 4);
      const start = startStop.filter(x => x.task == "StartRDS");
      const stop = startStop.filter(x => x.task == "StopRDS");
      assert.equal(start[0].resourceId, rdsInstance.DBInstanceIdentifier);
      assert.equal(start[1].resourceId, rdsInstance.DBInstanceIdentifier);
      assert.equal(stop[0].resourceId, rdsInstance.DBInstanceIdentifier);
      assert.equal(stop[1].resourceId, rdsInstance.DBInstanceIdentifier);

      assert.equal(start[0].resourceType, "RDS");
      assert.equal(start[1].resourceType, "RDS");
      assert.equal(stop[0].resourceType, "RDS");
      assert.equal(stop[1].resourceType, "RDS");

      assert.equal(start[0].scheduledTime, "2020-02-01T10:00:00+09:00");
      assert.equal(start[1].scheduledTime, "2020-02-01T10:20:00+09:00");
      assert.equal(stop[0].scheduledTime, "2020-02-01T09:00:00+09:00");
      assert.equal(stop[1].scheduledTime, "2020-02-01T09:20:00+09:00");
    });
  });

  describe("ec2", () => {
    // AutoStartSchedule: 30 6 * * *
    // AutoStopSchedule: 0 23 * * *
    // AmiSchedule: 10 3 * * *
    const ec2Instance = loadJson<toolbox.ec2.Instance>("EC2Instance1.json");

    it("amiTask", () => {
      const ami1 = taskGenerator_ec2.generateAmiRegistrationTasks(
        [ec2Instance],
        true,
        24,
        moment("2020-02-01T09:00:00+09:00")
      );
      const ami2 = taskGenerator_ec2.generateAmiRegistrationTasks(
        [ec2Instance],
        false,
        24,
        moment("2020-02-01T09:00:00+09:00")
      );
      // 強制再起動なしのスケジュールがある
      assert.equal(ami1.length, 0);
      assert.equal(ami2.length, 1);
      assert.equal(ami2[0].resourceId, ec2Instance.InstanceId);
      assert.equal(ami2[0].resourceType, "EC2");
      assert.equal(ami2[0].scheduledTime, "2020-02-02T03:10:00+09:00"); // 翌日3:10
    });
    it("startStop", () => {
      const startStop = taskGenerator_ec2.generateEC2StartStopAMITasks(
        [ec2Instance],
        24,
        moment("2020-02-01T09:00:00+09:00")
      );
      assert.equal(startStop.length, 2);
      const start = startStop.filter(x => x.task === "StartEC2")[0];
      const stop = startStop.filter(x => x.task === "StopEC2")[0];

      assert.equal(start.resourceId, ec2Instance.InstanceId);
      assert.equal(stop.resourceId, ec2Instance.InstanceId);
      assert.equal(start.resourceType, "EC2");
      assert.equal(stop.resourceType, "EC2");
      assert.equal(start.scheduledTime, "2020-02-02T06:30:00+09:00"); // 翌日の6:30
      assert.equal(stop.scheduledTime, "2020-02-01T23:00:00+09:00"); // 当日の23:00
    });
  });
});

describe("task processor", () => {
  describe("ec2", () => {
    describe("start", () => {
      const getEC2StartTask = (id: string): TaskType.StartStopEC2 => {
        return {
          TTL: 0,
          key: "",
          remainingRetryCount: 2,
          resourceId: id,
          resourceType: "EC2",
          task: "StartEC2",
          scheduledTime: moment().format(),
          lastModified: moment().format()
        };
      };

      it("error", async () => {
        // インスタンス取得に失敗するパターン。リトライはしない
        const task = getEC2StartTask(taskProcessor_ec2.TEST_IDS.EC2_ID_NOTFOUND);
        const result = await taskProcessor_ec2.startStop(task);
        assert.equal(result.result, "ERROR");
        assert.equal(result.reason, "何もせずに終了します。理由: インスタンス取得時にエラー");
      });

      it("alreadyRunning", async () => {
        // 起動しようとしたら既に起動していた。何もしない
        const task = getEC2StartTask(taskProcessor_ec2.TEST_IDS.EC2_ID_RUNNING);
        const result = await taskProcessor_ec2.startStop(task);
        assert.equal(result.result, "OK");
        assert.equal(result.reason, "何もせずに終了します。理由: インスタンスが既に起動していた");
      });

      it("retry-shuttingdown", async () => {
        // 起動しようとしたら起動中でも停止中でもなかった。手動操作とかぶる事故を防ぐためにリトライはしない
        const task = getEC2StartTask(taskProcessor_ec2.TEST_IDS.EC2_ID_SHUTTINGDOWN);
        const result = await taskProcessor_ec2.startStop(task);
        assert.equal(result.result, "OK");
        assert.equal(result.reason, "何もせずに終了します。理由: インスタンスの状態が32");
      });

      it("start", async () => {
        // 停止中だったので普通に起動する
        const task = getEC2StartTask(taskProcessor_ec2.TEST_IDS.EC2_ID_STOPPED);
        const result = await taskProcessor_ec2.startStop(task);
        assert.equal(result.result, "OK");
        assert.equal(result.reason, "テスト用ID");
      });
    });

    describe("stop", () => {
      const getEC2StopTask = (id: string): TaskType.StartStopEC2 => {
        return {
          TTL: 0,
          key: "",
          remainingRetryCount: 2,
          resourceId: id,
          resourceType: "EC2",
          task: "StopEC2",
          scheduledTime: "",
          lastModified: moment().format()
        };
      };

      it("error", async () => {
        // インスタンス取得に失敗するパターン。リトライはしない
        const task = getEC2StopTask(taskProcessor_ec2.TEST_IDS.EC2_ID_NOTFOUND);
        const result = await taskProcessor_ec2.startStop(task);
        assert.equal(result.result, "ERROR");
        assert.equal(result.reason, "何もせずに終了します。理由: インスタンス取得時にエラー");
      });

      it("alreadyStopped", async () => {
        // 停止しようとしたら既に停止していた。何もしない
        const task = getEC2StopTask(taskProcessor_ec2.TEST_IDS.EC2_ID_STOPPED);
        const result = await taskProcessor_ec2.startStop(task);
        assert.equal(result.result, "OK");
        assert.equal(result.reason, "何もせずに終了します。理由: インスタンスが既に停止していた");
      });

      it("retry-shuttingdown", async () => {
        // 停止しようとしたら起動中でも停止中でもなかった。手動操作とかぶる事故を防ぐためにリトライはしない
        const task = getEC2StopTask(taskProcessor_ec2.TEST_IDS.EC2_ID_SHUTTINGDOWN);
        const result = await taskProcessor_ec2.startStop(task);
        assert.equal(result.result, "OK");
        assert.equal(result.reason, "何もせずに終了します。理由: インスタンスの状態が32");
      });

      it("stop", async () => {
        // 起動中だったので普通に停止する
        const task = getEC2StopTask(taskProcessor_ec2.TEST_IDS.EC2_ID_RUNNING);
        const result = await taskProcessor_ec2.startStop(task);
        assert.equal(result.result, "OK");
        assert.equal(result.reason, "テスト用ID");
      });
    });
  });

  describe("ami registration", () => {});
});

describe("ECAlarm", () => {
  describe("ec2alarm", () => {
    it("running & has tag", () => {
      // 既にタグが付いている状態
      const ec2Instance = loadJson<toolbox.ec2.Instance>("EC2Instance1.json");
      ec2Instance.InstanceId = "i-running";
      ec2Instance.State = { Code: toolbox.ec2.StatusCode.RUNNING, Name: "running" };

      // タグが付いていてrunningなのでエラー対象ではない
      const result = ec2alarm._getEc2ToAlarm([ec2Instance]);
      assert.equal(result.length, 0);
    });

    it("stopped & has tag", () => {
      const ec2Instance = loadJson<toolbox.ec2.Instance>("EC2Instance1.json");
      ec2Instance.InstanceId = "i-stopped";
      ec2Instance.State = { Code: toolbox.ec2.StatusCode.STOPPED, Name: "stopped" };

      // タグが付いていてstoppedなのでエラーになる
      const result = ec2alarm._getEc2ToAlarm([ec2Instance]);
      assert.equal(result.length, 1);
    });

    it("running & has no tag", () => {
      const ec2Instance = loadJson<toolbox.ec2.Instance>("EC2Instance1.json");
      ec2Instance.InstanceId = "i-running";
      ec2Instance.State = { Code: toolbox.ec2.StatusCode.RUNNING, Name: "running" };
      delete ec2Instance.Tag.AlwaysRunning;
      ec2Instance.Tags = [];

      // タグが付いていなくてrunning. どうでもいい
      const result = ec2alarm._getEc2ToAlarm([ec2Instance]);
      assert.equal(result.length, 0);
    });

    it("stopped & has no tag", () => {
      const ec2Instance = loadJson<toolbox.ec2.Instance>("EC2Instance1.json");
      ec2Instance.InstanceId = "i-stopped";
      ec2Instance.State = { Code: toolbox.ec2.StatusCode.STOPPED, Name: "stopped" };

      // タグがfalseになっていてrunning. どうでもいい
      ec2Instance.Tag.AlwaysRunning = "false";
      ec2Instance.Tags = [{ Key: "AlwaysRunning", Value: "false" }];
    });
  });
});

describe("taskIO", () => {
  describe("hasExectimeArrived", () => {
    it("test1", () => {
      const task = loadJson("task1.json", TaskType.isTaskRecordOnDb);
      // "schedule": "2020-02-04T03:00:00+09:00",
      const result = taskIO.hasExectimeArrived(task, moment("2020-02-04T02:59:00+09:00"));
      assert.equal(result, false);
    });

    it("test2", () => {
      const task = loadJson("task1.json", TaskType.isTaskRecordOnDb);
      // "schedule": "2020-02-04T03:00:00+09:00",
      const result = taskIO.hasExectimeArrived(task, moment("2020-02-04T03:01:00+09:00"));
      assert.equal(result, true);
    });
  });
});

describe("Image", () => {
  describe("constructor", async () => {
    it("from file (rawAmiSample.json)", () => {
      const rawImage = JSON.parse(fs.readFileSync("test/fixtures/rawAmiSample.json").toString("utf-8"));
      // "ImageId": "ami-0004c56f4b8b92645",
      // ...,
      // "Tags": [
      //   {
      //     "Key": "ExpiresAt",
      //     "Value": "2018-11-10"
      //   },
      //   {
      //     "Key": "ImageType",
      //     "Value": "AutomatedSnapshot"
      //   },
      //   {
      //     "Key": "InstanceId",
      //     "Value": "i-0f76348c771209baa"
      //   },
      //   {
      //     "Key": "Name",
      //     "Value": "【自動生成AMI】ファイルサーバー(i-0f76348c771209baa), 強制リブート: しない"
      //   }
      // ],
      // const result = new Image(rawImage, Logger.getInstanceWithoutSlack(), true);
      // assert.strictEqual(result.expiresAt, "2018-11-10");
      // assert.strictEqual(result.imageId, "ami-0004c56f4b8b92645");
      // assert.strictEqual(result.instanceId, "i-0f76348c771209baa");
      // assert.strictEqual(result.nameTag, "【自動生成AMI】ファイルサーバー(i-0f76348c771209baa), 強制リブート: しない");
    });
  });

  describe("isExpired()", () => {
    const template = JSON.parse(fs.readFileSync("test/fixtures/rawAmiSample.json").toString("utf-8")) as AWS.EC2.Image;
    it("test", () => {
      // const image = _.cloneDeep(template);
      // image.Tags = [{Key: "expiresAt", Value: "2010-01-01"}];
      // const result = new Image(image, logger, true);
      // assert.strictEqual(result.isExpired(), true);
    });

    it("test", () => {
      // const image = _.cloneDeep(template);
      // image.Tags = [{Key: "expiresAt", Value: "2030-01-01"}];
      // const result = new Image(image, logger, true);
      // assert.strictEqual(result.isExpired(), false);
    });
  });
});

describe("util", () => {
  describe("isExpired", () => {
    const now = moment("2020-01-30");
    before(async () => {});

    it("white space", () => {
      assert.strictEqual(util.isExpired("", now), false);
    });

    it("not a date", () => {
      assert.strictEqual(util.isExpired("hogehoge", now), false);
    });

    it("long long ago", () => {
      assert.strictEqual(util.isExpired("2010-01-01", now), true);
    });

    it("so future", () => {
      assert.strictEqual(util.isExpired("2030-12-31", now), false);
    });

    it("yesterday", () => {
      assert.strictEqual(util.isExpired("2020-01-30", now), true);
    });

    it("today", () => {
      assert.strictEqual(util.isExpired("2020-01-30", now), true);
    });

    it("tomorrow", () => {
      assert.strictEqual(util.isExpired("2020-02-01", now), false);
    });
  });

  describe("validateCronExpression", () => {
    it("white space", () => {
      assert.strictEqual(util.validateCronExpression(""), false);
    });

    it("every morning (0 9 * * *)", () => {
      assert.strictEqual(util.validateCronExpression("0 9 * * *"), true);
    });

    it("2 times per day (0, 30 9 * * *)", () => {
      assert.strictEqual(util.validateCronExpression("0, 30 9 * * *"), true);
    });

    it("2 times per day (*/30 9 * * *)", () => {
      assert.strictEqual(util.validateCronExpression("*/30 9 * * *"), true);
    });

    it("3 times per day (*/20 9 * * *)", () => {
      assert.strictEqual(util.validateCronExpression("*/20 9 * * *"), true);
    });

    it("3 times per day (0,10,20 9 * * *)", () => {
      assert.strictEqual(util.validateCronExpression("0,10,20 9 * * *"), true);
    });

    it("3 times per day (0,10,20 9 * * *)", () => {
      assert.strictEqual(util.validateCronExpression("0,10,20 9 * * *"), true);
    });

    it("4 times per day (0,30 9,10 * * *)", () => {
      assert.strictEqual(util.validateCronExpression("0,30 9,10 * * *"), false);
    });
  });

  describe("generateInterval", () => {
    const fmt = util.formatMomentToLocalTime;

    it("every 9:00", () => {
      const result = util.generateInterval("0 9 * * *", 24, moment("2020-10-01T08:00:00+09:00")); // 朝8時
      assert.strictEqual(result.length, 1);
      assert.strictEqual(fmt(result[0]), "2020-10-01T09:00:00+09:00"); // 当日の朝9時になる
    });

    it("every 9:00, 10:00", () => {
      const result = util.generateInterval("0 9,10 * * *", 24, moment(new Date("2020-10-01T19:00:00+09:00")));
      assert.strictEqual(result.length, 2);
      assert.strictEqual(fmt(result[0]), "2020-10-02T09:00:00+09:00"); // 翌日の朝9時になる
      assert.strictEqual(fmt(result[1]), "2020-10-02T10:00:00+09:00"); // 翌日の朝10時になる
    });

    it("every 9:30, 10:30", () => {
      const result = util.generateInterval("30 9,10 * * *", 24, moment("2020-10-01T10:00:00+09:00")); // 10時
      assert.strictEqual(result.length, 2);
      assert.strictEqual(fmt(result[0]), "2020-10-01T10:30:00+09:00"); // 当日の10:30
      assert.strictEqual(fmt(result[1]), "2020-10-02T09:30:00+09:00"); // 翌日の9:30
    });

    it("every 11:00", () => {
      const result = util.generateInterval("0 11 * * *", 24, moment("2020-11-20T11:30:00+09:00")); // 日本時間で2020/11/20 11:30
      assert.strictEqual(result.length, 1);
      assert.strictEqual(fmt(result[0]), "2020-11-21T11:00:00+09:00"); // 翌日の11:30
    });
  });
});
