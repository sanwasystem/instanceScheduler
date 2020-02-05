const _isTaskRecordBase = (arg: any): arg is _TaskRecordBase => {
  if (!arg) {
    return false;
  }
  if (typeof arg !== "object") {
    return false;
  }
  if (typeof arg.key !== "string") {
    return false;
  }
  if (typeof arg.TTL !== "number") {
    return false;
  }
  if (typeof arg.resourceId !== "string") {
    return false;
  }
  if (typeof arg.remainingRetryCount !== "number") {
    return false;
  }
  if (typeof arg.scheduledTime !== "string") {
    return false;
  }
  if (typeof arg.lastModified !== "string") {
    return false;
  }

  return true;
};

export const isStartStopEC2 = (_arg: any): _arg is StartStopEC2 => {
  if (!_isTaskRecordBase(_arg)) {
    return false;
  }
  const arg = _arg as any;
  if (arg.task != "StopEC2" && arg.task !== "StartEC2") {
    return false;
  }
  if (arg.resourceType != "EC2") {
    return false;
  }
  if (!/^i-.*$/.test(arg.resourceId)) {
    return false;
  }
  return true;
};

export const isRegisterAmi = (_arg: any): _arg is RegisterAmi => {
  if (!_isTaskRecordBase(_arg)) {
    return false;
  }
  const arg = _arg as any;
  if (arg.task != "RegisterAmi") {
    return false;
  }
  if (arg.resourceType != "EC2") {
    return false;
  }
  if (typeof arg.ec2ForceToReboot != "boolean") {
    return false;
  }
  if (!/^i-.*$/.test(arg.resourceId)) {
    return false;
  }
  return true;
};

export const isAddAmiTag = (_arg: any): _arg is AddAmiTag => {
  if (!_isTaskRecordBase(_arg)) {
    return false;
  }
  const arg = _arg as any;
  if (arg.task != "AddAmiTag") {
    return false;
  }
  if (arg.resourceType != "AMI") {
    return false;
  }
  if (!Array.isArray(arg.tags)) {
    return false;
  }
  if (!/^ami-.*$/.test(arg.resourceId)) {
    return false;
  }
  for (const item of arg.tags) {
    if (typeof item.Key !== "string") {
      return false;
    }
    if (typeof item.Value !== "string") {
      return false;
    }
  }
  return true;
};

export const isDeregisterAmi = (_arg: any): _arg is DeregisterAmi => {
  if (!_isTaskRecordBase(_arg)) {
    return false;
  }
  const arg = _arg as any;
  if (arg.task != "DeregisterAmi") {
    return false;
  }
  if (arg.resourceType != "AMI") {
    return false;
  }
  if (!Array.isArray(arg.snapshotIds)) {
    return false;
  }
  if (!/^ami-.*$/.test(arg.resourceId)) {
    return false;
  }
  for (const item of arg.snapshotIds) {
    if (typeof item !== "string") {
      return false;
    }
  }
  return true;
};

export const isStartStopRDS = (_arg: any): _arg is StartStopRDS => {
  if (!_isTaskRecordBase(_arg)) {
    return false;
  }
  const arg = _arg as any;
  if (arg.task != "StopRDS" && arg.task !== "StartRDS") {
    return false;
  }
  if (arg.resourceType != "RDS") {
    return false;
  }
  return true;
};

// eslint-disable-next-line @typescript-eslint/class-name-casing
export interface _TaskRecordBase {
  /**
   * レコード一意のキー。 resourceType, instanceId, task, scheduledTime をすべて繋げたもの
   */
  key: string;

  /**
   * レコードのTTL
   */
  TTL: number;

  /**
   * タスクを実行する日時
   */
  scheduledTime: string;

  /**
   * リソース対象のID
   */
  resourceId: string;

  /**
   * このレコードの最終更新日時
   */
  lastModified: string;

  /**
   * 残り再実行回数。失敗（リトライして成功する見込みがある場合）したらこの値を1減らす。
   * この値が0のときに失敗したらレコードを削除する。
   */
  remainingRetryCount: number;
}

export interface StartStopEC2 extends _TaskRecordBase {
  /**
   * 実行すべきタスク
   */
  task: "StopEC2" | "StartEC2";

  /**
   * 処理対象のリソース
   */
  resourceType: "EC2";
}

export interface RegisterAmi extends _TaskRecordBase {
  /**
   * 実行すべきタスク
   */
  task: "RegisterAmi";

  /**
   * 処理対象のリソース
   */
  resourceType: "EC2";

  /**
   * EC2再起動をするか
   */
  ec2ForceToReboot: boolean;
}

export interface AddAmiTag extends _TaskRecordBase {
  /**
   * 実行すべきタスク
   */
  task: "AddAmiTag";

  /**
   * 処理対象のリソース
   */
  resourceType: "AMI";

  /**
   * 付加するタグ
   */
  tags: {
    Key: string;
    Value: string;
  }[];
}

export interface DeregisterAmi extends _TaskRecordBase {
  /**
   * 実行すべきタスク
   */
  task: "DeregisterAmi";

  /**
   * 処理対象のリソース
   */
  resourceType: "AMI";

  /**
   * 紐付いているスナップショットID
   */
  snapshotIds: string[];
}

export interface StartStopRDS extends _TaskRecordBase {
  /**
   * 実行すべきタスク
   */
  task: "StopRDS" | "StartRDS";

  /**
   * 処理対象のリソース
   */
  resourceType: "RDS";
}

export type TaskRecord = StartStopEC2 | RegisterAmi | AddAmiTag | DeregisterAmi | StartStopRDS;

export const isTaskRecordOnDb = (arg: any): arg is TaskRecord => {
  return isStartStopEC2(arg) || isRegisterAmi(arg) || isAddAmiTag(arg) || isDeregisterAmi(arg) || isStartStopRDS(arg);
};
