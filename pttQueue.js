// One worker owns download, playback and cleanup until the item really finishes.
function createPttQueue({ process, log }) {
  const pending = [];
  let running = false;
  let stopped = false;
  async function drain() {
    if (running) return;
    running = true;
    try {
      while (!stopped && pending.length) {
        const item = pending.shift();
        log('queue_start', item, { pending: pending.length });
        try { await process(item); }
        catch (error) { log('item_error', item, { error: String(error) }); }
        finally { log('queue_next', item, { pending: pending.length }); }
      }
    } finally { running = false; }
  }
  return {
    enqueue(item) {
      if (stopped) return;
      pending.push(item);
      log('enqueue', item, { pending: pending.length });
      void drain();
    },
    stop() { stopped = true; pending.length = 0; },
  };
}

// Resolve only on native completion, never merely on playAsync's acknowledgement.
async function playPtt({ Audio, uri, onSound, log, item, timers = { setTimeout, clearTimeout } }) {
  let sound;
  let watchdog;
  let settled = false;
  let finish;
  const completion = new Promise((resolve, reject) => {
    finish = error => {
      if (settled) return;
      settled = true;
      error ? reject(error) : resolve();
    };
  });
  // Status errors may arrive before createAsync/playAsync resolves.
  completion.catch(() => {});
  try {
    const created = await Audio.Sound.createAsync(
      { uri },
      { shouldPlay: false, volume: 1.0, playThroughEarpieceAndroid: false, shouldDuckAndroid: false },
      status => {
        if (status.error) finish(new Error(status.error));
        else if (status.didJustFinish) finish();
      }
    );
    sound = created.sound;
    onSound(sound, () => finish(new Error('playback_cancelled')));
    if (settled) await completion;
    const duration = created.status?.durationMillis;
    // A missing native finish/error callback must not hold the queue forever.
    watchdog = timers.setTimeout(() => finish(new Error('playback_timeout')),
      Number.isFinite(duration) && duration > 0 ? duration + 30000 : 300000);
    log('playback_start', item);
    await sound.playAsync();
    await completion;
    log('playback_end', item);
  } catch (error) {
    log('playback_error', item, { error: String(error) });
    throw error;
  } finally {
    timers.clearTimeout(watchdog);
    if (sound) {
      sound.setOnPlaybackStatusUpdate(null);
      try { await sound.unloadAsync(); }
      catch (error) { log('cleanup_error', item, { error: String(error) }); }
    }
    onSound(null, null);
  }
}

module.exports = { createPttQueue, playPtt };
