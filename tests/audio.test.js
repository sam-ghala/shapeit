import test from "node:test";
import assert from "node:assert/strict";
import {
  unlockAudio,
  resultSound,
  resultProgress,
  setSoundEnabled,
  playSound,
} from "../src/shared/audio.js";

test("Safari unlock, meter milestones, loss tones, mute and cancellation share one audio lifecycle", async () => {
  let audio,
    release,
    visualStarts = 0;
  const notes = [],
    saved = new Map();
  globalThis.localStorage = {
    getItem: (k) => saved.get(k) ?? null,
    setItem: (k, v) => saved.set(k, v),
  };
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
        this.currentTime = 12;
      }
      resume() {
        return pending.then(() => {
          this.state = "running";
        });
      }
      createOscillator() {
        const note = {
          frequency: param,
          connect() {},
          disconnect() {},
          start(at) {
            this.at = at;
            notes.push(this);
          },
          stop(at) {
            if (at === undefined) this.cancelled = true;
          },
        };
        return note;
      }
      createGain() {
        return { gain: param, connect() {}, disconnect() {} };
      }
    },
  };
  void unlockAudio();
  let clock;
  const stop = resultSound(true, 2, (elapsed) => {
    visualStarts++;
    clock = elapsed;
  });
  const cancelled = resultSound(true, 2, () =>
    assert.fail("closed dialog animated"),
  );
  cancelled();
  assert.equal(notes.length, 0);
  assert.equal(visualStarts, 0);
  release();
  await pending;
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(audio.state, "running");
  assert.equal(visualStarts, 1);
  assert.ok(clock() >= 0 && clock() < 0.1);
  assert.equal(notes.length, 11);
  notes
    .slice(0, 8)
    .forEach((note, i) =>
      assert.ok(Math.abs(resultProgress(note.at - 12) - i / 8) < 1e-10),
    );
  assert.ok(notes.slice(8).every((n) => n.at === 14));
  stop();
  assert.ok(notes.every((n) => n.cancelled));
  const stopLoss = resultSound(false, 0);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(notes.length, 13);
  assert.ok(Math.abs(notes[12].at - notes[11].at - 0.16) < 1e-10);
  setSoundEnabled(false);
  assert.ok(notes.every((n) => n.cancelled));
  let mutedAnimation = false;
  const stopMuted = resultSound(true, 2, () => {
    mutedAnimation = true;
  });
  playSound("laser");
  await new Promise((resolve) => setImmediate(resolve));
  assert.ok(mutedAnimation);
  assert.equal(notes.length, 13);
  stopMuted();
  stopLoss();
  // Broken audio cannot suppress the result or its animation.
  setSoundEnabled(true);
  audio.createOscillator = () => {
    throw new Error("device unavailable");
  };
  let silentFallback = false;
  const stopBroken = resultSound(true, 2, () => {
    silentFallback = true;
  });
  await new Promise((resolve) => setImmediate(resolve));
  assert.ok(silentFallback);
  stopBroken();
});
