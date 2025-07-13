import path from "path";
import { Buffer } from "buffer";
import pkg, {
	CircularBuffer as CircularBufferT,
	Vad as VadTypeT,
} from "sherpa-onnx-node";
const { Vad, CircularBuffer } = pkg;
import fs from "fs";
import { AudioHelpers } from "../../helpers/audio-helpers";

// Local interfaces removed, will use imported ones from sherpa-onnx.d.ts

export type VadOptions = {
	threshold: number;
	minSpeechDuration: number;
	minSilenceDuration: number;
	bufferSizeInSeconds: number;
	sampleRate: number; // Default is 16000
	prefixPaddingMs: number; // in milliseconds
};

class VADService {
	private vad: any | null = null;
	private onSpeechStartCallback?: () => void;
	private onSpeechStopCallback?: () => void;
	private isCurrentlySpeaking: boolean = false;
	private modelPath: string;
	private detectionBuffer: CircularBufferT;
	private audioBuffer: CircularBufferT;
	public readonly vadOptions: VadOptions;
	private speechStartIndex: number = 0; // Index where speech started in the audio buffer

	constructor(
		vadOptions: VadOptions = {
			threshold: 0.9,
			minSpeechDuration: 0.5, // seconds
			minSilenceDuration: 0.5, // seconds
			bufferSizeInSeconds: 20, // seconds
			sampleRate: 16000, // Default sample rate
			prefixPaddingMs: 500, // Default prefix padding in milliseconds
		}
	) {
		this.modelPath = path.join(
			__dirname,
			"..",
			"..",
			"static",
			"silero_vad.onnx"
		);
		this.vadOptions = vadOptions;
		this.onSpeechStartCallback = undefined;
		this.onSpeechStopCallback = undefined;
		this.isCurrentlySpeaking = false;

		try {
			const config = {
				sileroVad: {
					model:
						this.modelPath ||
						path.join(process.cwd(), "static", "silero_vad.onnx"),
					threshold: vadOptions.threshold || 0.9,
					minSpeechDuration: vadOptions.minSpeechDuration || 0.25,
					minSilenceDuration: vadOptions.minSilenceDuration / 1000 || 0.5,
					windowSize: 512,
					maxSpeechDuration: 60.0, // Default max speech duration
				},
				sampleRate: vadOptions.sampleRate || vadOptions.sampleRate,
				numThreads: 1,
				provider: "cpu",
				debug: true,
			};

			// Create the VAD instance
			console.log(
				`VADService: Initializing with model path: ${this.modelPath}`
			);
			this.vad = new Vad(config, vadOptions.bufferSizeInSeconds || 60);

			// Create a buffer for audio processing
			console.log(
				`VADService: Creating detection buffer with size: ${vadOptions.bufferSizeInSeconds * vadOptions.sampleRate}`
			);
			this.detectionBuffer = new CircularBuffer(
				(vadOptions.bufferSizeInSeconds || 60) * this.vadOptions.sampleRate
			);
			this.audioBuffer = new CircularBuffer(
				(vadOptions.bufferSizeInSeconds || 60) * this.vadOptions.sampleRate
			);

			console.log(
				`VADService initialized successfully with config: ${JSON.stringify(
					config
				)}`
			);
		} catch (error: any) {
			console.error("Failed to initialize Sherpa-ONNX VAD:", error);
			console.error(
				`Please ensure 'sherpa-onnx-node' is installed and the model path '${this.modelPath}' is correct and accessible.`
			);
			this.vad = null;
			throw new Error(`VADService initialization failed: ${error.message}`);
		}
	}

	startDetection(onSpeechStart: () => void, onSpeechStop: () => void): void {
		if (!this.vad) {
			console.warn("VADService: Cannot start detection, VAD not initialized.");
			return;
		}
		this.onSpeechStartCallback = onSpeechStart;
		this.onSpeechStopCallback = onSpeechStop;
		this.isCurrentlySpeaking = false;
		this.vad.reset();
		console.log(
			"VADService: Detection started, callbacks registered, VAD reset."
		);
	}

	stopDetection(): void {
		this.onSpeechStartCallback = undefined;
		this.onSpeechStopCallback = undefined;
		this.isCurrentlySpeaking = false;
		console.log("VADService: Detection stopped, callbacks cleared.");
	}

	reset(): void {
		if (!this.vad) {
			console.warn("VADService: Cannot reset, VAD not initialized.");
			return;
		}
		this.vad.reset();
		this.isCurrentlySpeaking = false;
		console.log("VADService: Reset.");
	}

	processAudioChunk(audioChunk: Buffer): void {
		if (!this.vad || !this.detectionBuffer || audioChunk.length === 0) {
			return;
		}

		if (audioChunk.length % 2 !== 0) {
			console.warn(
				`VADService: Audio chunk length is not a multiple of 2 (${audioChunk.length}) (for 16-bit WAV). Skipping chunk.`
			);
			return;
		}

		// Convert Int16 samples to Float32
		const samples = new Float32Array(audioChunk.length / 2);
		for (let i = 0; i < samples.length; i++) {
			samples[i] = audioChunk.readInt16LE(i * 2) / 32768.0;
		}

		// Push samples to buffer
		this.detectionBuffer.push(AudioHelpers.bufferToFloat32Array(audioChunk));
		this.audioBuffer.push(AudioHelpers.bufferToFloat32Array(audioChunk));

		// Process buffer in chunks
		const windowSize = this.vad.config.sileroVad.windowSize;
		while (this.detectionBuffer.size() >= windowSize) {
			const sampleChunk = this.detectionBuffer.get(
				this.detectionBuffer.head(),
				windowSize
			);
			this.detectionBuffer.pop(windowSize);

			this.vad.acceptWaveform(sampleChunk);
			const speechDetected = this.vad.isDetected();

			if (speechDetected && !this.isCurrentlySpeaking) {
				this.isCurrentlySpeaking = true;
				this.speechStartIndex = this.audioBuffer.size() - 1; // Save the index where speech started
				console.log(
					`VADService: Speech detected at index ${this.speechStartIndex}`
				);
				if (this.onSpeechStartCallback) {
					this.onSpeechStartCallback();
				}
			} else if (!speechDetected && this.isCurrentlySpeaking) {
				this.isCurrentlySpeaking = false;
				if (this.onSpeechStopCallback) {
					this.onSpeechStopCallback();
					console.log(
						`VADService: Speech stopped at index ${this.audioBuffer.size() - 1}`
					);
				}
			}
		}
	}

	getCurrentSegment(): Float32Array | undefined {
		if (!this.vad) {
			console.warn("VADService: Cannot get segments, VAD not initialized.");
			return;
		}
		if (!this.vad.isEmpty()) {
			const prefixPaddingMs = this.vadOptions.prefixPaddingMs || 0;
			console.log(
				`VADService: Getting current segment with prefix padding of ${prefixPaddingMs} ms`
			);
			const segment = this.vad.front();
			const paddingSampleCount =
				(prefixPaddingMs / 1000) * this.vadOptions.sampleRate;

			const startIndex = Math.max(
				this.speechStartIndex - paddingSampleCount,
				0
			);
			console.log(`Buffer size: ${this.audioBuffer.size()}, startIndex: ${startIndex}`);
			console.log(`Samples length: ${segment.samples.length}, paddingSampleCount: ${paddingSampleCount}`);

			const numOfSamples = Math.min(
				segment.samples.length + paddingSampleCount,
				this.audioBuffer.size() - startIndex
			);
			const samples = this.audioBuffer.get(startIndex, numOfSamples);
			this.audioBuffer.reset();
			this.vad.pop();
			// console.log(`VADService: Returning current segment with ${samples.length} samples.`);
			return samples;
		}
		return;
	}
}

export { VADService };
