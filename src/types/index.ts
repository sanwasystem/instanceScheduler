export type TaskResultType = {
  /**
   * 処理結果。
   * OK: 処理が正常に完了した
   * ERROR: 処理は失敗したが、リトライの必要はない
   * RETRY: 処理は失敗したので次回リトライする（リトライカウンタが残っている場合）
   */
  result: "OK" | "RETRY" | "ERROR";
  /**
   * 理由。"OK"の場合は空文字
   */
  reason: string;
};
