// A handle is what a long-running action returns (a camera move, a walk, a line of speech).
// The scene system waits until `done` is true. Cancelling marks it done and lets the owner stop.
export class Handle {
  constructor(label = '', onCancel = null) {
    this.label = label;
    this.done = false;
    this.cancelled = false;
    this.onCancel = onCancel;
  }

  finish() {
    this.done = true;
    return this;
  }

  cancel() {
    if (this.done) return;
    this.cancelled = true;
    this.done = true;
    this.onCancel?.();
  }
}

/** An action that completes at once (placing an actor, starting a continuous camera mode). */
export const DONE = Object.freeze({ done: true, cancelled: false, label: 'done', cancel() {} });
