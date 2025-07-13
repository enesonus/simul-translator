import { Buffer } from "buffer";
import OpenAI, { toFile } from "openai";
import { FileWriter } from "wav";
import { finished } from "stream/promises";
import fs from "fs";
import { AudioHelpers } from "../../helpers/audio-helpers";

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
}
