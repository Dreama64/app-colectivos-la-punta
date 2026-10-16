const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createPttQueue, playPtt } = require('../pttQueue');
const flush = async () => { for (let i = 0; i < 40; i++) await Promise.resolve(); };

function nativeAudio() {
  const sounds = [], events = [], timers = new Map();
  let active = 0;
  return {
    sounds, events, timers,
    clock: { setTimeout(fn, ms) { timers.set(fn, ms); return fn; }, clearTimeout(fn) { timers.delete(fn); } },
    Audio: { Sound: { async createAsync({ uri }, options, callback) {
      assert.equal(options.shouldPlay, false);
      const sound = {
        callback,
        async playAsync() { active++; assert.equal(active, 1, 'native players overlap'); events.push(`play:${uri}`); },
        setOnPlaybackStatusUpdate(cb) { this.callback = cb; },
        async unloadAsync() { active--; events.push(`unload:${uri}`); },
      };
      sounds.push(sound);
      return { sound, status: { durationMillis: 4000 } };
    } } },
  };
}

test('burst of 20 PTT waits for each native finish and unloads before next download', async () => {
  const native = nativeAudio(), logs = [], downloads = [];
  const queue = createPttQueue({ log: (stage, item) => logs.push(`${stage}:${item.id}`),
    async process(item) {
      downloads.push(item.id);
      await playPtt({ ...native, timers: native.clock, uri: item.id, item, log() {}, onSound() {} });
    },
  });
  for (let id = 0; id < 20; id++) queue.enqueue({ id });
  await flush();
  assert.deepEqual(downloads, [0]); // playAsync resolved, but playback has not finished.
  for (let id = 0; id < 20; id++) {
    assert.equal(native.sounds.length, id + 1);
    assert.deepEqual(downloads, Array.from({ length: id + 1 }, (_, i) => i));
    native.sounds[id].callback({ isLoaded: true, didJustFinish: true });
    await flush();
  }
  assert.deepEqual(native.events, Array.from({ length: 20 }, (_, id) => [`play:${id}`, `unload:${id}`]).flat());
  assert.equal(logs.filter(x => x.startsWith('queue_next:')).length, 20);
  assert.equal(native.timers.size, 0);
});

test('download rejection, native playback error and playback start rejection do not block next item', async () => {
  const native = nativeAudio(), errors = [], completed = [];
  const queue = createPttQueue({ log(stage, item) { if (stage === 'item_error') errors.push(item.id); },
    async process(item) {
      if (item.id === 0) throw Error('download failed');
      if (item.id === 2) {
        await playPtt({ Audio: { Sound: { async createAsync() { throw Error('decoder failed'); } } },
          uri: 'bad', item, onSound() {}, log() {} });
        return;
      }
      await playPtt({ ...native, timers: native.clock, uri: item.id, item, log() {}, onSound() {} });
      completed.push(item.id);
    },
  });
  [0, 1, 2, 3].forEach(id => queue.enqueue({ id }));
  await flush(); native.sounds[0].callback({ isLoaded: false, error: 'native error' });
  await flush(); native.sounds[1].callback({ isLoaded: true, didJustFinish: true });
  await flush(); assert.deepEqual(errors, [0, 1, 2]); assert.deepEqual(completed, [3]);
});

test('watchdog and explicit cancellation unload player and allow progress; late callbacks are harmless', async () => {
  for (const mode of ['timeout', 'cancel']) {
    const native = nativeAudio(); let cancel;
    const promise = playPtt({ ...native, timers: native.clock, uri: mode, item: {}, log() {},
      onSound(sound, fn) { if (sound) cancel = fn; } });
    await flush(); const late = native.sounds[0].callback;
    if (mode === 'timeout') {
      assert.equal([...native.timers.values()][0], 34000);
      [...native.timers.keys()][0]();
    } else cancel();
    await assert.rejects(promise, /playback_(timeout|cancelled)/);
    late({ didJustFinish: true });
    assert.deepEqual(native.events, [`play:${mode}`, `unload:${mode}`]);
    assert.equal(native.timers.size, 0);
  }
});

test('stop discards pending items and ignores subsequent events', async () => {
  let release; const started = [];
  const queue = createPttQueue({ log() {}, process: item => {
    started.push(item.id); return new Promise(resolve => { release = resolve; });
  } });
  queue.enqueue({ id: 1 }); queue.enqueue({ id: 2 }); queue.stop(); queue.enqueue({ id: 3 });
  release(); await flush(); assert.deepEqual(started, [1]);
});
