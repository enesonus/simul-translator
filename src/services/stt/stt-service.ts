import { Buffer } from "buffer";
import OpenAI, { toFile } from "openai";
import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";
import isoConv from "iso-language-converter";

export interface STTResult {
	transcription: string;
	language: string;
	confidence?: number;
}

export interface STTRequest {
	audioData: Buffer;
	sourceLanguage?: string; // Optional source language
	model: string; // Optional model name, default is "whisper-1"
}

export class STTService {
	constructor() {
		console.log("STTService initialized");
	}

	async transcribe(
		provider = "groq",
		sttRequest: STTRequest
	): Promise<STTResult> {
		let transcription: STTResult;

		switch (provider) {
			case "groq":
				transcription = await this.transcribeGroq(sttRequest);
				break;
			case "openai":
				transcription = await this.transcribeOpenAI(sttRequest);
				break;
			case "elevenlabs":
				transcription = await this.transcribeElevenlabs(sttRequest);
				break;
			default:
				throw new Error(`Unsupported STT provider: ${provider}`);
		}

		return {
			transcription: transcription.transcription,
			language: transcription.language,
		};
	}

	async transcribeGroq(req: STTRequest): Promise<STTResult> {
		const client = new OpenAI({
			baseURL: "https://api.groq.com/openai/v1",
			apiKey: process.env.GROQ_API_KEY,
		});
		console.log(`Transcribing with Groq: language: ${req.sourceLanguage}, Model: ${req.model}`);
		const transcription = await client.audio.transcriptions.create({
			file: await toFile(req.audioData, "audio.wav"),
			language: req.sourceLanguage,
			model: req.model,
			response_format: "verbose_json",
		});

		return {
			transcription: transcription.text,
			language: transcription.language,
		};
	}

	async transcribeOpenAI(req: STTRequest): Promise<STTResult> {
		const client = new OpenAI();
		const transcription = await client.audio.transcriptions.create({
			file: await toFile(req.audioData, "audio.wav"),
			language: req.sourceLanguage,
			model: "whisper-1",
			response_format: "verbose_json",
		});

		return {
			transcription: transcription.text,
			language: transcription.language,
		};
	}

	async transcribeElevenlabs(req: STTRequest): Promise<STTResult> {
		const elevenlabs = new ElevenLabsClient();

		const transcription = await elevenlabs.speechToText.convert({
			file: req.audioData,
			modelId: "scribe_v1", // Model to use, for now only "scribe_v1" is supported.
			tagAudioEvents: false, // Tag audio events like laughter, applause, etc.
			languageCode: req.sourceLanguage, // Language of the audio file. If set to null, the model will detect the language automatically.
			diarize: false, // Whether to annotate who is speaking
		});

		// map ISO-639-1 lang code (e.g. "eng", "tur", "fra", etc.) to "Turkish", "English", etc.
		const languageName = isoConv(transcription.languageCode || "unknown");

		return {
			transcription: transcription.text,
			language: languageName || "unknown",
		};
	}
}
