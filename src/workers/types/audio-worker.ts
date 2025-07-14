import WebSocket from "ws";
import { v4 as uuidv4 } from "uuid";
import { STTService, STTResult } from "../../services/stt/stt-service";
import {
	TranslationService,
	TranslationResult,
} from "../../services/translation/translation-service";
import { TTSService } from "../../services/tts/tts-service";
import { VadOptions, VADService } from "../../services/vad/vad-service";
import * as WebSocketTypes from "../../websocket-types";
import { Buffer } from "node:buffer";
import fs from "fs";
import { FileWriter } from "wav";
import { Base64Encoder } from "../../helpers/base64-encoder";
import { AudioHelpers } from "../../helpers/audio-helpers";
import { Session, createSessionConfig } from "./models";

// Map STT language names (e.g., "English") to DeepL language codes (e.g., "EN")
const LANGUAGE_NAME_TO_CODE: Record<string, string> = {
	arabic: "AR",
	bulgarian: "BG",
	czech: "CS",
	danish: "DA",
	german: "DE",
	greek: "EL",
	english: "EN",
	spanish: "ES",
	estonian: "ET",
	finnish: "FI",
	french: "FR",
	hebrew: "HE",
	hungarian: "HU",
	indonesian: "ID",
	italian: "IT",
	japanese: "JA",
	korean: "KO",
	lithuanian: "LT",
	latvian: "LV",
	"norwegian bokmål": "NB",
	dutch: "NL",
	polish: "PL",
	portuguese: "PT",
	romanian: "RO",
	russian: "RU",
	slovak: "SK",
	slovenian: "SL",
	swedish: "SV",
	thai: "TH",
	turkish: "TR",
	ukrainian: "UK",
	vietnamese: "VI",
	chinese: "ZH",
};

function mapLanguageNameToCode(name?: string): string | undefined {
	if (!name) return undefined;
	return LANGUAGE_NAME_TO_CODE[name.trim().toLowerCase()];
}

export class AudioWorker {
	public session?: Session;
	private ws: WebSocket;
	private sttService: STTService;
	private translationService: TranslationService;
	private ttsService: TTSService;
	private vadService?: VADService;

	constructor(ws: WebSocket, session?: Session) {
		this.ws = ws;
		this.ttsService = new TTSService();
		this.sttService = new STTService();
		this.translationService = new TranslationService();
		if (session) {
			this.setSession(session);
		}
	}

	public setSession(session: Session): void {
		try {
			console.log(`AudioWorker: Setting session with ID ${session.id}`);
			this.session = session;
			console.log(
				`AudioWorker (session ${session.id}): TTS Config: ${JSON.stringify(session.config.tts_config)}`
			);
			console.log(
				`AudioWorker (session ${session.id}): STT Config: ${JSON.stringify(session.config.stt_config)}`
			);
			if (session.config.turn_detection !== null) {
				const vadOptions: VadOptions = {
					threshold: session.config.turn_detection.threshold || 0.5,
					minSilenceDuration:
						session.config.turn_detection.silence_duration_ms || 500,
					prefixPaddingMs:
						session.config.turn_detection.prefix_padding_ms || 1000,
					minSpeechDuration: 0.1,
					bufferSizeInSeconds: 60,
					sampleRate: 16000,
				};
				this.vadService = new VADService(vadOptions);
				this.vadService.startDetection(
					this.handleSpeechStarted.bind(this),
					this.handleSpeechStopped.bind(this)
				);
			}
		} catch (error: any) {
			const err = "SET_SESSION_ERROR";
			console.error(`AudioWorker: Error setting session:`, err);
			throw err;
		}
	}

	public sendMessage(message: WebSocketTypes.WebSocketMessage) {
		if (this.ws.readyState === WebSocket.OPEN) {
			this.ws.send(JSON.stringify(message));
		}
	}

	public handleMessage(rawMessage: string): void {
		try {
			const message = JSON.parse(rawMessage) as WebSocketTypes.WebSocketMessage;
			if (message.type !== "input_audio_buffer.append") {
				console.log(
					`AudioWorker (session ${this.session?.id}): Received message type ${message.type}`
				);
			}

			switch (message.type) {
				case "session.update":
					this.handleSessionUpdate(
						message as WebSocketTypes.SessionUpdateMessage
					);
					break;
				case "input_audio_buffer.append":
					this.handleInputAudioAppend(
						message as WebSocketTypes.InputAudioBufferAppendMessage
					);
					break;
				default:
					console.warn(
						`AudioWorker (session ${
							this.session?.id
						}): Unhandled message type: ${(message as any).type}`
					);
			}
		} catch (error) {
			console.error(
				`AudioWorker (session ${this.session?.id}): Error handling message:`,
				error
			);
		}
	}

	private handleSessionUpdate(
		message: WebSocketTypes.SessionUpdateMessage
	): void {
		if (this.session) {
			const updatedSessionConfig = createSessionConfig({
				...this.session.config,
				...message.config,
			});
			this.session.config = updatedSessionConfig;
			this.sendMessage({
				type: "session.updated",
				config: this.session.config,
			});
		}
	}

	private async handleInputAudioAppend(
		message: WebSocketTypes.InputAudioBufferAppendMessage
	): Promise<void> {
		try {
			const base64Audio = message.audio;
			const audioChunk = Buffer.from(base64Audio, "base64");
			if (this.vadService) {
				this.vadService.processAudioChunk(audioChunk);
			}
		} catch (error) {
			console.error(
				`AudioWorker (session ${this.session?.id}): Error processing audio chunk:`,
				error
			);
		}
	}

	private handleSpeechStarted(): void {
		console.log(
			`AudioWorker (session ${this.session?.id}): VAD detected speech started.`
		);
		this.sendMessage({
			type: "input_audio_buffer.speech_started",
		} as WebSocketTypes.InputAudioBufferSpeechStartedMessage);
	}

	private handleSpeechStopped(): void {
		console.log(
			`AudioWorker (session ${this.session?.id}): VAD detected speech stopped.`
		);
		this.sendMessage({
			type: "input_audio_buffer.speech_stopped",
		} as WebSocketTypes.InputAudioBufferSpeechStoppedMessage);
		// VAD detected end of turn, commit the audio
		if (this.session?.config.turn_detection !== null) {
			console.log(
				`AudioWorker (session ${this.session?.id}): VAD committing audio due to speech stop.`
			);
			this.commitAudioBuffer("vad");
		}
	}

	private async commitAudioBuffer(reason: "vad" | "explicit"): Promise<void> {
		const responseId = `resp-${Date.now()}`;

		try {
			console.time(`Total_Start_${responseId}`);
			console.log(
				`AudioWorker (session ${this.session?.id}): Committing audio buffer for reason: ${reason}`
			);
			const segment = this.vadService?.getCurrentSegment();
			if (!segment) {
				console.warn(
					`AudioWorker (session ${this.session?.id}): No audio segment available for processing.`
				);
				return;
			}
			const pcm16Buffer = AudioHelpers.float32toPcm16(segment);
			const wavBuffer = AudioHelpers.createWavBuffer(pcm16Buffer, {
				numChannels: 1,
				sampleRate: this.vadService?.vadOptions.sampleRate || 16000,
				bitsPerSample: 16,
			});
			console.time(`STT_${responseId}`);
			// 1. STT
			const sttResult = await this.sttService.transcribe(this.session?.config.stt_config.provider, {
				audioData: wavBuffer,
				sourceLanguage:
					this.session!.config.translation.source_language?.toLowerCase(),
				model: this.session!.config.stt_config.model,
			});
			console.log(
				`AudioWorker (session ${this.session?.id}): STT Result:`,
				sttResult
			);
			console.timeEnd(`STT_${responseId}`);
			this.sendMessage({
				type: "response.audio_transcript.done",
				transcription: sttResult.transcription,
				language: sttResult.language,
			} as WebSocketTypes.ResponseAudioTranscriptDoneMessage);

			console.time(`Translation_${responseId}`);
			// 2. Translation
			const translationResult = await this.translationService.translate({
				text: sttResult.transcription,
				targetLanguage: this.session!.config.translation.target_language,
				sourceLanguage: mapLanguageNameToCode(sttResult.language),
			});
			console.timeEnd(`Translation_${responseId}`);
			console.log(
				`AudioWorker (session ${this.session?.id}): Translation Result:`,
				translationResult
			);
			this.sendMessage({
				type: "response.translation.done",
				text: sttResult.transcription,
				translation: translationResult.translatedText,
				sourceLanguage: translationResult.sourceLanguage,
				targetLanguage: translationResult.targetLanguage,
			} as WebSocketTypes.ResponseTranslationDoneMessage);

			// 3. TTS
			console.time(`TTS_Full_${responseId}`);
			let isFirstChunk = true;
			console.time(`TTS_Start_${responseId}`);
			const ttsStream = await this.ttsService.synthesize({
				provider: this.session!.config.tts_config.provider || "elevenlabs",
				voice: this.session!.config.tts_config.voice,
				format: this.session!.config.tts_config.format,
				text: translationResult.translatedText,
			});
			ttsStream.on("data", (chunk: Buffer) => {
				if (isFirstChunk) {
					console.timeEnd(`TTS_Start_${responseId}`);
					console.timeEnd(`Total_Start_${responseId}`);
					isFirstChunk = false;
				}
				this.sendMessage({
					type: "response.audio.delta",
					audioBase64: chunk.toString("base64"),
				} as WebSocketTypes.ResponseAudioDeltaMessage);
			});
			ttsStream.on("end", () => {
				console.log(
					`AudioWorker (session ${this.session!.id}): TTS stream ended.`
				);
				console.timeEnd(`TTS_Full_${responseId}`);
				this.sendMessage({
					type: "response.audio.done",
				} as WebSocketTypes.ResponseAudioDoneMessage);
			});
			ttsStream.on("error", (err: Error) => {
				console.error("Error in TTS stream:", err);
				this.sendMessage({
					type: "response.error",
				} as WebSocketTypes.ResponseErrorMessage);
			});
		} catch (error) {
			console.error(
				`AudioWorker (session ${this.session!.id}): Error in processing pipeline:`,
				error
			);
			// Send an error message to the client, e.g., response.error
		} finally {
			// Final response metadata
			console.log(
				`AudioWorker (session ${this.session!.id}): Full processing turn complete.`
			);
		}
	}

	public cleanup(): void {
		console.log(`AudioWorker (session ${this.session?.id}): Cleaning up.`);
		// Any other cleanup tasks
	}
}
