declare module 'sherpa-onnx-node' {
  // VAD Configuration
  export interface SileroVadConfig {
    /**
     * Path to the Silero VAD model file.
     * If not provided, it defaults to an empty string in the C++ layer,
     * which will likely result in an initialization error unless handled.
     * @example "./silero_vad.onnx"
     */
    model?: string;
    /**
     * Speech detection threshold. Values usually between 0 and 1.
     * Defaults to 0.5 if not provided.
     */
    threshold?: number;
    /**
     * Minimum duration of silence in seconds to be considered a pause between speech segments.
     * Defaults to 0.5 if not provided.
     */
    minSilenceDuration?: number;
    /**
     * Minimum duration of speech in seconds for a segment to be considered valid speech.
     * Defaults to 0.25 if not provided.
     */
    minSpeechDuration?: number;
    /**
     * Maximum allowed duration of a single speech segment in seconds.
     * If speech exceeds this, VAD parameters might be adjusted internally.
     * Defaults to 20.0 if not provided.
     */
    maxSpeechDuration?: number;
    /**
     * The window size in samples used for VAD processing.
     * Defaults to 512 if not provided.
     */
    windowSize?: number;
  }

  export interface VadConfig {
    /**
     * Configuration specific to the Silero VAD model.
     * If this entire object is omitted, default Silero VAD parameters will be used.
     */
    sileroVad?: SileroVadConfig;
    /**
     * Sample rate of the audio in Hz that the VAD expects.
     * Defaults to 16000 if not provided.
     */
    sampleRate?: number;
    /**
     * Number of threads to use for ONNX runtime inference.
     * Defaults to 1 if not provided.
     */
    numThreads?: number;
    /**
     * The ONNX runtime provider to use (e.g., "cpu", "cuda").
     * Defaults to "cpu" if not provided.
     */
    provider?: string;
    /**
     * Debug flag. If set to `true` or a non-zero number, enables debug output from the VAD.
     * Defaults to `false` (or 0) if not provided.
     */
    debug?: boolean | number;
  }

  /**
   * Represents a detected speech segment returned from the VAD.
   */
  export interface SpeechSegment {
    /**
     * The audio samples of the detected speech segment.
     */
    samples: Float32Array;
    /**
     * The starting timestamp of the speech segment in the overall audio stream,
     * measured in samples from the beginning of processing (since VAD creation or last reset).
     */
    start: number;
  }

  /**
   * Manages a circular buffer for audio samples.
   */
  export class CircularBuffer {
    /**
     * Creates a new CircularBuffer instance.
     * @param capacity The initial maximum number of elements the buffer can hold.
     *                 The buffer may resize if more elements are pushed than its current capacity.
     */
    constructor(capacity: number);

    /**
     * Pushes samples to the circular buffer.
     * @param samples - Float32Array of audio samples.
     */
    push(samples: Float32Array): void;

    /**
     * Retrieves samples from the circular buffer.
     * @param startIndex - The absolute starting index from which to retrieve samples (not relative to head).
     * @param n - The number of samples to retrieve.
     * @param enableExternalBuffer - If true (default), returns a view into an underlying C++ buffer
     *                               (more efficient, memory managed by JS GC).
     *                               If false, copies the data to a new ArrayBuffer.
     * @returns A Float32Array containing the retrieved samples. Returns an empty array for invalid parameters.
     */
    get(startIndex: number, n: number, enableExternalBuffer?: boolean): Float32Array;

    /**
     * Removes `n` samples from the front (oldest part) of the circular buffer by advancing the head.
     * @param n - The number of samples to pop.
     */
    pop(n: number): void;

    /**
     * Get the current number of elements stored in the circular buffer.
     * @returns The current size of the circular buffer.
     */
    size(): number;

    /**
     * Get the head index of the circular buffer (absolute index of the oldest sample).
     * @returns The head index.
     */
    head(): number;

    /**
     * Resets the circular buffer, clearing all stored samples and resetting head/tail pointers.
     * Capacity is maintained.
     */
    reset(): void;
  }

  /**
   * Performs Voice Activity Detection on audio streams.
   */
  export class Vad {
    /**
     * The configuration used to initialize this VAD instance.
     * This reflects the configuration provided at construction, with defaults applied by the native layer.
     */
    public readonly config: VadConfig; // Assuming the JS class stores and exposes this.

    /**
     * Creates a new Voice Activity Detector instance.
     * @param config - The VAD model configuration.
     * @param bufferSizeInSeconds - The size of the internal buffer in seconds, used to store audio for VAD processing.
     */
    constructor(config: VadConfig, bufferSizeInSeconds: number);

    /**
     * Accepts new waveform samples for VAD processing.
     * These samples are added to the VAD's internal buffer.
     * @param samples - Float32Array of audio samples.
     */
    acceptWaveform(samples: Float32Array): void;

    /**
     * Checks if the voice activity detector's internal queue of detected speech segments is empty.
     * @returns True if no completed speech segments are currently waiting, false otherwise.
     */
    isEmpty(): boolean;

    /**
     * Checks if speech is currently being detected (i.e., an utterance has started but not necessarily ended).
     * @returns True if speech is considered active by the VAD, false otherwise.
     */
    isDetected(): boolean;

    /**
     * Removes the oldest detected speech segment from the VAD's internal queue.
     * Should be called after retrieving a segment with `front()`.
     */
    pop(): void;

    /**
     * Clears all completed detected speech segments from the VAD's internal queue.
     * The VAD's internal audio buffer and ongoing detection state are not reset.
     */
    clear(): void;

    /**
     * Retrieves the front-most (oldest) detected speech segment from the VAD's internal queue.
     * This method does NOT remove the segment from the queue; call `pop()` afterwards.
     * **Important**: Only call this when `isEmpty()` is `false`.
     * @param enableExternalBuffer - If true (default), returns a view into an underlying C++ buffer
     *                               (more efficient, memory managed by JS GC).
     *                               If false, copies the data to a new ArrayBuffer.
     * @returns A SpeechSegment object.
     */
    front(enableExternalBuffer?: boolean): SpeechSegment;

    /**
     * Resets the voice activity detector's internal state and buffers,
     * clearing any buffered audio and detected segments.
     * This is useful for starting a new detection session.
     */
    reset(): void;

    /**
     * Flushes any remaining audio in the VAD's internal buffer,
     * forcing the processing of any ongoing speech.
     * If an active speech segment exists, it will be finalized and added to the queue.
     */
    flush(): void;
  }
}
