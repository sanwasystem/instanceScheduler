export {};
declare global {
  interface Array<T> {
    flat(): T;
  }
}
