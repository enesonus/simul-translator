import { OpenAI } from "openai";
import fs from "fs";
import { Readable, Transform, TransformCallback } from "stream";
import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";

export interface TTSRequest {
	provider: "openai" | "groq" | "elevenlabs"; // TTS provider
	voice?: string;
	format?: "mp3" | "opus" | "aac" | "flac" | "wav" | "pcm" | undefined; // e.g., 'mp3', 'pcm'
	sampleRate?: number;
	text: string;
}

class ChunkSizeTransform extends Transform {
	private buffer: Buffer = Buffer.alloc(0);

	constructor(private readonly chunkSize = 8192) {
		super();
	}

	_transform(chunk: Buffer, _enc: BufferEncoding, cb: TransformCallback) {
		// Accumulate data until we've reached the desired minimum size
		this.buffer = Buffer.concat([this.buffer, chunk]);

		if (this.buffer.length >= this.chunkSize) {
			this.push(this.buffer);
			this.buffer = Buffer.alloc(0);
		}
		cb();
	}

	_flush(cb: TransformCallback) {
		// Push any remaining buffered data (may be < chunkSize)
		if (this.buffer.length) {
			this.push(this.buffer);
		}
		cb();
	}
}

export class TTSService {
	constructor() {
		console.log("TTSService initialized");
	}

	async synthesize(req: TTSRequest): Promise<Readable> {
		const CHUNK_SIZE = 8 * 1024; // 8KB
		let ttsStream: Readable;
		switch (req.provider) {
			case "openai":
				ttsStream = await this.synthesizeOpenAI(req);
				break;
			// case "groq":
			// 	return this.synthesizeGroq(req);
			case "elevenlabs":
				ttsStream = await this.synthesizeElevenlabs(req);
				break;
			default:
				throw new Error(`Unsupported TTS provider: ${req.provider}`);
		}
		return ttsStream.pipe(new ChunkSizeTransform(CHUNK_SIZE));
	}

	async synthesizeOpenAI(req: TTSRequest): Promise<Readable> {
		const client = new OpenAI();
		const response = await client.audio.speech.create({
			model: "gpt-4o-mini-tts",
			voice: req.voice?.toLowerCase() || "nova", // Default voice
			response_format: "mp3",
			instructions: "Stable voice, clear and natural.",
			input: req.text,
		});

		if (!response.body) {
			throw new Error("No response body from TTS service");
		}

		let ttsStream: Readable;
		const body = response.body as any;
		if (body && typeof body.pipe === "function") {
			ttsStream = body as Readable;
		} else {
			ttsStream = Readable.fromWeb(body as any);
		}

		return ttsStream;
	}

	async synthesizeElevenlabs(req: TTSRequest): Promise<Readable> {
		const client = new ElevenLabsClient({
			apiKey: process.env.ELEVENLABS_API_KEY,
		});
		console.log(`Synthesizing with ElevenLabs: ${req.text}`);
		const ttsStream = await client.textToSpeech.stream(
			req.voice || "JBFqnCBsd6RMkjVDRZzb",
			{
				outputFormat: "mp3_22050_32",
				text: req.text,
				modelId: "eleven_flash_v2_5",
			}
		);
		return Readable.fromWeb(ttsStream as any);
	}
}
