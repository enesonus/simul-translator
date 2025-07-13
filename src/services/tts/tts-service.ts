import { OpenAI } from "openai";
import fs from "fs";
import { Readable, Transform, TransformCallback } from "stream";
import ffmpeg from "fluent-ffmpeg";
import ffmpegPath from "ffmpeg-static";

export interface TTSRequest {
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
		const client = new OpenAI({
			// baseURL: "https://api.groq.com/openai/v1",
			// apiKey: process.env.GROQ_API_KEY,
		});

		const response = await client.audio.speech.create({
			model: "gpt-4o-mini-tts",
			voice: req.voice?.toLowerCase() || "nova", // Default voice
			response_format: "mp3",
			instructions: "Stable voice, clear and natural.",
			// voice: req.voice || "Aaliyah-PlayAI", // Default voice
			// model: "playai-tts", // Default model
			// response_format: "wav",
			input: req.text,
		});
		if (!response.body) {
			throw new Error("No response body from TTS service");
		}

		// Ensure we have a Node.js Readable stream regardless of runtime implementation
		let wavStream: Readable;
		const body = response.body as any;
		if (body && typeof body.pipe === "function") {
			// In some environments/body implementations, body is already a Node PassThrough/Readable
			wavStream = body as Readable;
		} else {
			// In fetch style environments (e.g., Web streams), convert to Node Readable
			wavStream = Readable.fromWeb(body as any);
		}

		// Pipe through the transformer so downstream readers receive >=8192-byte chunks
		return wavStream.pipe(new ChunkSizeTransform(8 * 1024));
	}
}
