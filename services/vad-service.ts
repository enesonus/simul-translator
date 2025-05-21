const sherpa_onnx = require("sherpa-onnx-node");
const path = require("path");
import { Buffer } from "buffer";
import fs from "fs";

// Local interfaces removed, will use imported ones from sherpa-onnx.d.ts

class VADService {
	private vad: any | null = null;
	private onSpeechStartCallback?: () => void;
	private onSpeechStopCallback?: () => void;
	private isCurrentlySpeaking: boolean = false;
	private readonly sampleRate: number = 16000;
	private modelPath: string;
	private buffer: any | null = null;

	constructor(
		modelRelativePath = "static/silero_vad.onnx",
		threshold = 0.9,
		minSpeechDuration = 0.05,
		minSilenceDuration = 1.0,
		bufferSizeInSeconds = 30
	) {
		this.modelPath = path.join(process.cwd(), modelRelativePath);
		this.sampleRate = 16000;
		this.onSpeechStartCallback = undefined;
		this.onSpeechStopCallback = undefined;
		this.isCurrentlySpeaking = false;

		console.log(`VADService: Attempting to load model from: ${this.modelPath}`);

		try {
			const config = {
				sileroVad: {
					model: this.modelPath,
					threshold: threshold,
					minSpeechDuration: minSpeechDuration,
					minSilenceDuration: minSilenceDuration,
					windowSize: 512,
				},
				sampleRate: this.sampleRate,
				numThreads: 1,
				debug: false,
			};

			// Create the VAD instance
			this.vad = new sherpa_onnx.Vad(config, bufferSizeInSeconds);

			// Create a buffer for audio processing
			this.buffer = new sherpa_onnx.CircularBuffer(
				bufferSizeInSeconds * this.sampleRate
			);

			console.log(
				`VADService initialized successfully with config: ${JSON.stringify(
					config
				)}`
			);
		} catch (error) {
			console.error("Failed to initialize Sherpa-ONNX VAD:", error);
			console.error(
				`Please ensure 'sherpa-onnx-node' is installed and the model path '${this.modelPath}' is correct and accessible.`
			);
			this.vad = null;
			this.buffer = null;
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
		if (!this.vad || !this.buffer || audioChunk.length === 0) {
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
		this.buffer.push(samples);

		// Process buffer in chunks
		const windowSize = this.vad.config.sileroVad.windowSize / 512;
		while (this.buffer.size() > windowSize) {
			const sampleChunk = this.buffer.get(this.buffer.head(), windowSize);
			this.buffer.pop(windowSize);

			this.vad.acceptWaveform(sampleChunk);
			const speechDetected = this.vad.isDetected();

			if (speechDetected && !this.isCurrentlySpeaking) {
				this.isCurrentlySpeaking = true;
				if (this.onSpeechStartCallback) {
					this.onSpeechStartCallback();
				}
			} else if (!speechDetected && this.isCurrentlySpeaking) {
				this.isCurrentlySpeaking = false;
				if (this.onSpeechStopCallback) {
					this.onSpeechStopCallback();
				}
			}

			// Handle any completed speech segments if needed
			while (!this.vad.isEmpty()) {
				const segment = this.vad.front();
				// this.vad.pop();
                // Save the audio segment to a file
				const duration = segment.samples.length / this.vad.config.sampleRate;
				console.log(`End of speech. Duration: ${duration} seconds`);
				// We don't save files like in the example, but we could do additional processing here
			}
		}
	}

	getCurrentSegment(): any {
		if (!this.vad) {
			console.warn("VADService: Cannot get segments, VAD not initialized.");
			return [];
		}
		if (!this.vad.isEmpty()) {
			const segment = this.vad.front();
			this.vad.pop();
			return segment;
		}
		return null;
	}
}

export { VADService };
