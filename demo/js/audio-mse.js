export class MSEAudio {
  constructor(audioEl) {
    this.audio = audioEl;
    this.mediaSource = null;
    this.sourceBuffer = null;
    this.pending = [];
    this.ready = false;
  }

  init() {
    if (typeof MediaSource === 'undefined') {
      console.warn('MediaSource not supported');
      return;
    }
    this.mediaSource = new MediaSource();
    this.audio.src = URL.createObjectURL(this.mediaSource);
    this.pending = [];
    this.sourceBuffer = null;
    this.ready = false;
    this.mediaSource.addEventListener('sourceopen', () => {
      this.sourceBuffer = this.mediaSource.addSourceBuffer('audio/mpeg');
      this.ready = true;
      this.sourceBuffer.addEventListener('updateend', () => this.process());
      this.process();
    });
  }

  append(base64) {
    const bin = atob(base64);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    this.pending.push(arr.buffer);
    this.process();
  }

  process() {
    if (!this.ready || !this.sourceBuffer || this.sourceBuffer.updating || this.pending.length === 0) return;
    if (this.audio && this.audio.error) {
      console.warn('Audio element error, resetting MSE');
      try { this.cleanup(); this.init(); } catch (e) { console.error('Failed MSE reset', e); }
      return;
    }
    const chunk = this.pending.shift();
    try {
      this.sourceBuffer.appendBuffer(chunk);
      if (this.audio.paused) this.audio.play().catch(() => {});
    } catch (e) {
      console.error('appendBuffer failed, resetting MSE', e);
      try { this.cleanup(); this.init(); } catch (err) { console.error('Failed MSE recovery', err); }
      this.pending.unshift(chunk);
    }
  }

  resetOnTurnStart() {
    if (this.mediaSource) {
      try {
        if (this.sourceBuffer) this.mediaSource.removeSourceBuffer(this.sourceBuffer);
        if (this.mediaSource.readyState === 'open') this.mediaSource.endOfStream();
      } catch (e) { console.warn('MSE reset error', e); }
      this.init();
    }
    this.pending = [];
  }

  cleanup() {
    if (this.mediaSource && this.mediaSource.readyState === 'open') {
      try {
        if (this.sourceBuffer) this.mediaSource.removeSourceBuffer(this.sourceBuffer);
        this.mediaSource.endOfStream();
      } catch (e) { console.error('Error cleaning up MediaSource:', e); }
    }
    this.sourceBuffer = null;
    this.pending = [];
    if (this.audio) this.audio.src = '';
  }
}

