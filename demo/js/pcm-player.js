// Minimal PCM streaming player for base64 int16 PCM chunks.
// Plays immediately on first chunk and buffers subsequent chunks sequentially.
export class PCMPlayer {
  constructor(options = {}) {
    this.channels = options.channels || 1;
    this.inputSampleRate = options.sampleRate || 16000; // incoming PCM rate
    this.flushIntervalMs = options.flushIntervalMs || 200;
    this.context = null;
    this.processor = null;
    this.gainNode = null;
    this.bufferQueue = new Float32Array(0);
    this.started = false;
    this._timer = null;
    this._leftoverByte = null; // Uint8Array(1) to hold odd trailing byte between chunks
  }

  init() {
    if (this.context) return;
    const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextCtor) throw new Error('Web Audio not supported');
    this.context = new AudioContextCtor();
    this.gainNode = this.context.createGain();
    // ScriptProcessorNode is deprecated but widely supported; ensures compatibility on iOS Safari
    const bufferSize = 2048; // small for low latency
    this.processor = this.context.createScriptProcessor(bufferSize, 0, this.channels);
    this.processor.onaudioprocess = (e) => this._onAudioProcess(e);
    this.processor.connect(this.gainNode);
    this.gainNode.connect(this.context.destination);
  }

  async resume() {
    if (!this.context) this.init();
    if (this.context.state === 'suspended') {
      try { await this.context.resume(); } catch {}
    }
  }

  setVolume(vol) {
    if (this.gainNode) this.gainNode.gain.value = vol;
  }

  reset() {
    this.bufferQueue = new Float32Array(0);
    this._leftoverByte = null;
  }

  close() {
    try { if (this.processor) this.processor.disconnect(); } catch {}
    try { if (this.gainNode) this.gainNode.disconnect(); } catch {}
    try { if (this.context && this.context.state !== 'closed') this.context.close(); } catch {}
    this.context = null;
    this.processor = null;
    this.gainNode = null;
    this.bufferQueue = new Float32Array(0);
    this.started = false;
    if (this._timer) clearInterval(this._timer);
    this._timer = null;
    this._leftoverByte = null;
  }

  // Accepts base64-encoded 16-bit PCM (LE) mono data
  feedBase64(base64) {
    if (!base64) return;
    this.init();
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    this.feedBytes(bytes.buffer);
  }

  // Accepts ArrayBuffer of 16-bit PCM (LE) mono data
  feedBytes(arrayBuffer) {
    // Ensure we always convert an even number of bytes to Int16.
    // If we get an odd number of bytes, carry over the last byte to combine with the next chunk.
    let bytes = new Uint8Array(arrayBuffer);

    if (this._leftoverByte) {
      // Prepend the leftover single byte to current bytes
      const combined = new Uint8Array(this._leftoverByte.length + bytes.length);
      combined.set(this._leftoverByte, 0);
      combined.set(bytes, this._leftoverByte.length);
      bytes = combined;
      this._leftoverByte = null;
    }

    if ((bytes.byteLength & 1) === 1) {
      // Save the trailing odd byte for next time
      this._leftoverByte = bytes.subarray(bytes.byteLength - 1);
      bytes = bytes.subarray(0, bytes.byteLength - 1);
    }

    if (bytes.byteLength === 0) return;

    const int16 = new Int16Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 2);
    // Convert to Float32 -1..1
    const float32 = new Float32Array(int16.length);
    for (let i = 0; i < int16.length; i++) float32[i] = int16[i] / 32768;

    // Resample if needed to context sample rate
    const targetRate = this.context.sampleRate;
    const resampled = (this.inputSampleRate === targetRate)
      ? float32
      : this._resampleLinear(float32, this.inputSampleRate, targetRate);

    // Append to queue
    this.bufferQueue = PCMPlayer._appendFloat32(this.bufferQueue, resampled);
    this._ensureStarted();
  }

  _ensureStarted() {
    if (this.started) return;
    this.started = true;
    // Kick the processor by scheduling periodic no-op; iOS sometimes needs activity
    if (!this._timer) this._timer = setInterval(() => {}, this.flushIntervalMs);
  }

  _onAudioProcess(e) {
    const output = e.outputBuffer;
    const channelData = [];
    for (let ch = 0; ch < output.numberOfChannels; ch++) {
      channelData[ch] = output.getChannelData(ch);
    }
    const framesNeeded = output.length;

    if (this.bufferQueue.length < framesNeeded) {
      // Underrun: fill with zeros
      for (let ch = 0; ch < output.numberOfChannels; ch++) channelData[ch].fill(0);
      return;
    }

    const chunk = this.bufferQueue.subarray(0, framesNeeded);
    this.bufferQueue = this.bufferQueue.subarray(framesNeeded);
    // Mono to N channels copy
    for (let ch = 0; ch < output.numberOfChannels; ch++) channelData[ch].set(chunk);
  }

  _resampleLinear(input, fromRate, toRate) {
    if (fromRate === toRate) return input;
    const ratio = toRate / fromRate;
    const outputLength = Math.round(input.length * ratio);
    const output = new Float32Array(outputLength);
    for (let i = 0; i < outputLength; i++) {
      const t = i / ratio;
      const i0 = Math.floor(t);
      const i1 = Math.min(i0 + 1, input.length - 1);
      const frac = t - i0;
      output[i] = input[i0] * (1 - frac) + input[i1] * frac;
    }
    return output;
  }

  static _appendFloat32(a, b) {
    const tmp = new Float32Array(a.length + b.length);
    tmp.set(a, 0);
    tmp.set(b, a.length);
    return tmp;
  }
}


