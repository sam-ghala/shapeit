import test from "node:test";
import assert from "node:assert/strict";
import { unlockAudio, resultSound } from "../src/game/audio.js";
test("the first result waits for Safari audio to resume and cancels if its dialog closes", async () => {
  let audio,
    release,
    started = 0;
  const pending = new Promise((resolve) => {
    release = resolve;
  });
  const param = {
    setValueAtTime() {},
    linearRampToValueAtTime() {},
    exponentialRampToValueAtTime() {},
  };
  globalThis.window = {
    AudioContext: class {
      constructor() {
        audio = this;
        this.state = "suspended";
        this.currentTime = 0;
      }
      resume() {
        return pending.then(() => {
          this.state = "running";
        });
      }
      createOscillator() {
        return {
          frequency: param,
          connect() {},
          start() {
            started++;
          },
          stop() {},
        };
      }
      createGain() {
        return { gain: param, connect() {}, disconnect() {} };
      }
    },
  };
  unlockAudio();
  const stop = resultSound(true);
  const cancelled = resultSound(true);
  cancelled();
  assert.equal(started, 0);
  release();
  await pending;
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(audio.state, "running");
  assert.equal(started, 1);
  stop();
});
