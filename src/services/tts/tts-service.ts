import { OpenAI } from "openai";
import fs from "fs";
import { Readable, Transform, TransformCallback } from "stream";
import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";

export interface TTSRequest {
	provider: "openai" | "groq" | "elevenlabs" | "deepinfra"; // TTS provider
	voice?: string;
	format?: "mp3" | "opus" | "aac" | "flac" | "wav" | "pcm" | undefined; // e.g., 'mp3', 'pcm'
	sampleRate?: number;
	text: string;
    targetLanguage?: string; // Optional: used to pick best Kokoro voice for language
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
			case "deepinfra":
				ttsStream = await this.synthesizeDeepinfraKokoro(req);
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

		// Map generic format to ElevenLabs output format
		let outputFormat: any = "mp3_22050_32";
		if (req.format === "pcm") {
			outputFormat = "pcm_16000";
		} else if (req.format === "opus") {
			outputFormat = "opus_48000_64";
		} else if (req.format === "mp3") {
			outputFormat = "mp3_22050_32";
		}

		const ttsStream = await client.textToSpeech.stream(
			req.voice || "JBFqnCBsd6RMkjVDRZzb",
			{
				outputFormat,
				text: req.text,
				modelId: "eleven_flash_v2_5",
			}
		);
		return Readable.fromWeb(ttsStream as any);
	}

	async synthesizeDeepinfraKokoro(req: TTSRequest): Promise<Readable> {
		const client = new OpenAI({
			baseURL: "https://api.deepinfra.com/v1/openai",
			apiKey: process.env.DEEPINFRA_API_KEY,
		});

        const selectedVoice = selectKokoroVoiceForLanguage(req.targetLanguage);
		console.log(`Synthesizing with Deepinfra Kokoro with voice ${selectedVoice}`);
        const response = await client.audio.speech.create({
            model: "hexgrad/Kokoro-82M",
            voice: selectedVoice,
            response_format: "mp3",
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
}

function selectKokoroVoiceForLanguage(targetLanguage?: string): string {
    if (!targetLanguage) {
        return "af_heart"; // default high-quality American English female
    }
    const code = targetLanguage.trim().toUpperCase();

    // Map DeepL-style or ISO codes to Kokoro voices
    switch (code) {
        // English (default to American)
        case "EN":
        case "EN-US":
        case "EN-GB":
            // American English: overall best is female only at top grade
            return "af_heart";
        // Japanese
        case "JA":
            return "jf_alpha";
        // Mandarin Chinese
        case "ZH":
        case "ZH-CN":
        case "ZH-HANS":
            // Similar grade for male/female; prefer male per instruction when qualities match
            return "zm_yunxi";
        // Spanish
        case "ES":
            return "em_alex"; // male
        // French
        case "FR":
            return "ff_siwis"; // female
        // Hindi
        case "HI":
            return "hm_omega"; // male
        // Italian
        case "IT":
            return "im_nicola"; // male
        // Portuguese (assume Brazilian Portuguese)
        case "PT":
        case "PT-BR":
            return "pm_alex"; // male
        // British English explicit
        case "EN_GB":
            return "bm_fable"; // male per similar grade
        default:
            // Fallback to high-quality American English
            return "af_heart";
    }
}
