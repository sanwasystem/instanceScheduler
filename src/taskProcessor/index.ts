import * as TaskTypes from "../types/task";
import * as Types from "../types/index";
import * as ec2startStop from "./ec2startStop";
import * as ec2statusCheck from "./ec2statusCheck";
import * as ami1 from "./amiRegistration";
import * as ami2 from "./amiModification";
import * as rds from "./rds";
import * as util from "../util";

export const processTask = async (task: TaskTypes.TaskRecord): Promise<Types.TaskResultType> => {
  switch (task.task) {
    case "StartEC2":
      return await ec2startStop.startStop(task);

    case "StopEC2":
      return await ec2startStop.startStop(task);

    case "EC2StatusCheck":
      return await ec2statusCheck.statusCheck(task);

    case "RegisterAmi":
      return await ami1.createAMI(task);

    case "DeregisterAmi":
      return await ami2.deleteAmi(task);

    case "AddAmiTag":
      return await ami2.addTags(task);

    case "StartRDS":
      return await rds.startStop(task);

    case "StopRDS":
      return await rds.startStop(task);

    default:
      return util.neverComesHere(task);
  }
};
