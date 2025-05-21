import { Buffer } from "buffer";
import OpenAI, { toFile } from "openai";
import { FileWriter } from "wav";
import { finished } from "stream/promises";
import fs from "fs";


export interface STTResult {
	transcription: string;
	language: string;
	confidence?: number;
}

export class STTService {
	constructor() {
		console.log("STTService initialized");
	}

	async transcribe(audioData: Buffer): Promise<STTResult> {
		// Dummy implementation
		const client = new OpenAI({
			baseURL: "https://api.groq.com/openai/v1",
			apiKey: process.env.GROQ_API_KEY,
		});
		const fileName = `./audio.wav`;
		const writer = new FileWriter(fileName, {
			channels: 1,
			sampleRate: 16000,
			bitDepth: 16,
		});
		writer.write(audioData);
        writer.end();
        await finished(writer);

		const transcription = await client.audio.transcriptions.create({
			file: fs.createReadStream(fileName),
			model: "whisper-large-v3-turbo",
			response_format: "verbose_json",
		});

		return {
			transcription: transcription.text,
			language: transcription.language,
		};
	}
}
