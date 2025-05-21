import WebSocket from "ws";
import { STTService, STTResult } from "./services/stt-service";
import {
	TranslationService,
	TranslationResult,
} from "./services/translation-service";
import { TTSService, TTSConfig } from "./services/tts-service";
import { VADService } from "./services/vad-service";
import * as WebSocketTypes from "./websocket-types";
import { Buffer } from "node:buffer";
import fs from "fs";
import { FileWriter } from "wav";
import { Base64Encoder } from "./helpers/base64-encoder";

export class AudioWorker {
	private ws: WebSocket;
	private sttService: STTService;
	private translationService: TranslationService;
	private ttsService: TTSService;
	private vadService: VADService;
	private audioBuffer: Buffer[] = [];
	private sessionId: string;
	private conversationId?: string;
	private isVadEnabled: boolean = true; // Default VAD state
	private ttsVoice: string = "default-voice"; // Default TTS voice

	constructor(ws: WebSocket, sessionId: string) {
		this.ws = ws;
		this.sessionId = sessionId;
		this.sttService = new STTService();
		this.translationService = new TranslationService();
		this.ttsService = new TTSService();
		this.vadService = new VADService();

		this.vadService.startDetection(
			this.handleSpeechStarted.bind(this),
			this.handleSpeechStopped.bind(this)
		);
		console.log(`AudioWorker created for session: ${sessionId}`);
	}

	private sendMessage(message: WebSocketTypes.WebSocketMessage) {
		if (this.ws.readyState === WebSocket.OPEN) {
			this.ws.send(JSON.stringify(message));
		}
	}

	public handleMessage(rawMessage: string): void {
		try {
			const message = JSON.parse(rawMessage) as WebSocketTypes.WebSocketMessage;
			if (message.type !== "input_audio_buffer.append") {
				console.log(
					`AudioWorker (session ${this.sessionId}): Received message type ${message.type}`
				);
			}

			switch (message.type) {
				case "session.update":
					this.handleSessionUpdate(message);
					break;
				case "conversation.create":
					this.handleConversationCreate(message);
					break;
				case "conversation.item.create":
					// For now, we only handle audio input, not text chat items directly
					console.warn(
						"conversation.item.create received, but not implemented for direct text yet"
					);
					break;
				case "input_audio_buffer.append":
					this.handleInputAudioAppend(message);
					break;
				case "input_audio_buffer.clear":
					this.handleInputAudioClear();
					break;
				case "input_audio_buffer.commit":
					this.handleInputAudioCommit();
					break;
				default:
					console.warn(
						`AudioWorker (session ${this.sessionId}): Unhandled message type: ${message.type}`
					);
			}
		} catch (error) {
			console.error(
				`AudioWorker (session ${this.sessionId}): Error handling message:`,
				error
			);
			// Optionally send an error message back to client
		}
	}

	private handleSessionUpdate(
		message: WebSocketTypes.SessionUpdateMessage
	): void {
		if (message.vadMode !== undefined) {
			this.isVadEnabled = message.vadMode === "enabled"; // Assuming 'enabled' or 'disabled'
			console.log(
				`AudioWorker (session ${this.sessionId}): VAD mode updated to: ${this.isVadEnabled}`
			);
			if (!this.isVadEnabled) {
				this.vadService.stopDetection(); // Or a mode where it doesn't auto-commit
			} else {
				this.vadService.startDetection(
					this.handleSpeechStarted.bind(this),
					this.handleSpeechStopped.bind(this)
				);
			}
		}
		if (message.speakerVoice) {
			this.ttsVoice = message.speakerVoice;
			console.log(
				`AudioWorker (session ${this.sessionId}): TTS voice updated to: ${this.ttsVoice}`
			);
		}
		this.sendMessage({
			type: "session.updated",
			newState: { vadMode: this.isVadEnabled, speakerVoice: this.ttsVoice },
		});
	}

	private handleConversationCreate(
		message: WebSocketTypes.ConversationCreateMessage
	): void {
		this.conversationId = message.chatId || `conv-${Date.now()}`;
		console.log(
			`AudioWorker (session ${this.sessionId}): Conversation created: ${this.conversationId}`
		);
		this.sendMessage({
			type: "conversation.created",
			conversationId: this.conversationId,
		});
	}

	private async handleInputAudioAppend(
		message: WebSocketTypes.InputAudioBufferAppendMessage
	): Promise<void> {
		if (!this.conversationId) {
			console.warn(
				`AudioWorker (session ${this.sessionId}): Audio received before conversation started. Ignoring.`
			);
			return;
		}
		try {
			const base64Audio = message.chunk;
			const audioChunk = Buffer.from(base64Audio, "base64");
			this.audioBuffer.push(audioChunk);
			this.vadService.processAudioChunk(audioChunk);
		} catch (error) {
			console.error(
				`AudioWorker (session ${this.sessionId}): Error processing audio chunk:`,
				error
			);
		}
	}

	private handleSpeechStarted(): void {
		console.log(
			`AudioWorker (session ${this.sessionId}): VAD detected speech started.`
		);
		this.sendMessage({ type: "input_audio_buffer.speech_started" });
	}

	private handleSpeechStopped(): void {
		console.log(
			`AudioWorker (session ${this.sessionId}): VAD detected speech stopped.`
		);
		this.sendMessage({ type: "input_audio_buffer.speech_stopped" });
		// VAD detected end of turn, commit the audio
		if (this.isVadEnabled) {
			console.log(
				`AudioWorker (session ${this.sessionId}): VAD committing audio due to speech stop.`
			);
			this.commitAudioBuffer("vad");
		}
	}

	private handleInputAudioClear(): void {
		this.audioBuffer = [];
		this.vadService.reset(); // Reset VAD state as well
		console.log(
			`AudioWorker (session ${this.sessionId}): Audio buffer cleared.`
		);
		this.sendMessage({ type: "input_audio_buffer.cleared" });
	}

	private handleInputAudioCommit(): void {
		if (this.isVadEnabled) {
			console.warn(
				`AudioWorker (session ${this.sessionId}): Explicit commit received while VAD is enabled. VAD should handle commits.`
			);
			// Decide if explicit commit overrides VAD or is ignored
			// For now, let VAD handle it, but we can change this behavior.
			// If VAD is off, this is the primary way to commit.
		} else {
			console.log(
				`AudioWorker (session ${this.sessionId}): Explicit audio commit.`
			);
			this.commitAudioBuffer("explicit");
		}
	}

	private async commitAudioBuffer(reason: "vad" | "explicit"): Promise<void> {
		if (this.audioBuffer.length === 0) {
			console.log(
				`AudioWorker (session ${this.sessionId}): Commit called but buffer is empty.`
			);
			return;
		}

		const fullAudioData = this.concatenateAudioChunks(this.audioBuffer);
		const segment = this.vadService.getCurrentSegment();
		// save file for debugging
		const writer = new FileWriter(`./audio-debug-buffer.wav`, {
			channels: 1,
			sampleRate: 16000,
			bitDepth: 16,
		});
		const startOffset = Math.floor(segment.start * 1 * (16 / 8));
		const audioOffset = Math.floor(segment.samples.length * 1 * (16 / 8));
		console.log(`startOffset: ${startOffset}, audioOffset: ${audioOffset}`);

		const trimmedAudioData = fullAudioData.subarray(
			startOffset,
			startOffset + audioOffset
		);
		// writer.write(trimmedAudioData);

		console.log(
			`Segment (${segment.samples / 16000}s): \nStart: ${segment.start}\n${
				segment.samples.length
			} samples saved`
		);
		this.audioBuffer = []; // Clear buffer after concatenating
		this.vadService.reset(); // Reset VAD for the next turn

		console.log(
			`AudioWorker (session ${this.sessionId}): Committing audio buffer, reason: ${reason}, total size: ${fullAudioData.length}`
		);
		this.sendMessage({ type: "input_audio_buffer.committed", reason });

		const responseId = `resp-${Date.now()}`;
		this.sendMessage({ type: "response.created", responseId });

		let sttResult: STTResult | undefined; // Ensure sttResult is in scope for finally
		let translationResult: TranslationResult | undefined; // Ensure translationResult is in scope for finally

		// try {
		this.sendMessage({ type: "response.audio_transcript.start" });
		console.time(`STT_Transcription_${responseId}`);
		sttResult = await this.sttService.transcribe(trimmedAudioData);
		console.timeEnd(`STT_Transcription_${responseId}`);
		console.log(
			`AudioWorker (session ${this.sessionId}): STT Result:`,
			sttResult
		);
		this.sendMessage({
			type: "response.audio_transcript.done",
			transcription: sttResult.transcription,
			language: sttResult.language,
		});

		// Send conversation.item.created with transcription
		this.sendMessage({
			type: "conversation.item.created",
			itemId: `item-${Date.now()}`,
			transcription: sttResult.transcription,
			language: sttResult.language,
			// previousMessageId: this.lastItemId // TODO: manage last item ID
		});

		// 2. Translation (asynchronously)
		this.sendMessage({ type: "response.text.start" }); // This might be for LLM, but we use it for translation start
		// Assuming target language comes from session config or is fixed for now
		const targetLanguage = "English"; // Example target language
		console.time(`Translation_${responseId}`);
		translationResult = await this.translationService.translate(
			sttResult.transcription,
			targetLanguage,
			sttResult.language
		);
		console.timeEnd(`Translation_${responseId}`);
		console.log(
			`AudioWorker (session ${this.sessionId}): Translation Result:`,
			translationResult
		);
		// Send translation as a delta and done, or just done if not streaming translation text itself.
		// For simplicity, sending it like a chat item or specific translation message.
		// The original spec has response.text.delta/done for LLM, let's adapt or add new message types later if needed.
		// Sending as a conversation item for now, as per the user's description for transcription AND translation
		this.sendMessage({
			type: "conversation.item.created", // Re-using for translation for now
			itemId: `item-trans-${Date.now()}`,
			transcription: translationResult.translatedText, // Storing translation in 'transcription' field
			language: translationResult.targetLanguage,
			// previousMessageId: this.lastItemId // TODO: manage last item ID
		});
		this.sendMessage({
			type: "response.text.done",
			fullText: translationResult.translatedText,
		}); // Confirming translation is done

		//     // 3. TTS (asynchronously, streaming)
		this.sendMessage({ type: "response.audio.start" });
		const ttsConfig: TTSConfig = { voice: this.ttsVoice, format: "wav" }; // Example config

		// Optional: Visemes start
		// this.sendMessage({ type: 'response.audio.viseme.start', audioGroupId: 'main-audio' });
		// const visemes = await this.ttsService.getVisemes(translationResult.translatedText);
		//  this.sendMessage({ type: 'response.audio.viseme.done', visemes, audioGroupId: 'main-audio' });

		fs.writeFileSync("./audio_server.txt", ""); // Clear the file before writing
		const b64encoder = new Base64Encoder();
		let ttsFirstByteSent = false;
		const ttsStartTime = Date.now();
		console.time(`TTS_Synthesis_Full_${responseId}`);

		await this.ttsService.synthesize(
			translationResult.translatedText,
			ttsConfig,
			(rawAudioChunk: Buffer) => {
				if (!ttsFirstByteSent) {
					console.log(
						`TTS_TimeToFirstByte_${responseId}: ${
							Date.now() - ttsStartTime
						}ms`
					);
					ttsFirstByteSent = true;
				}
				// 1) get any full 3-byte groups encoded:
				const mid = b64encoder.encode(rawAudioChunk);
				if (mid) {
					this.sendMessage({
						type: "response.audio.delta",
						audio: mid,
					});
					fs.appendFileSync("./audio_server.txt", mid);
				}
			}
		);
		console.timeEnd(`TTS_Synthesis_Full_${responseId}`);

		// 2) after the stream ends, emit the final padded bytes:
		const last = b64encoder.flush();
		if (last) {
			this.sendMessage({
				type: "response.audio.delta",
				audio: last,
			});
			fs.appendFileSync("./audio_server.txt", last);
		}
		this.sendMessage({ type: "response.audio.done" });
		console.log(`AudioWorker (session ${this.sessionId}): TTS synthesis done.`);

		// } catch (error) {
		//     console.error(`AudioWorker (session ${this.sessionId}): Error in processing pipeline:`, error);
		//     // Send an error message to the client, e.g., response.error
		// } finally {
		//     // Final response metadata
		//     this.sendMessage({
		//         type: 'response.done',
		//         sttDurationMs: 100, // Dummy value
		//         llmTokens: 0, // No LLM in this flow directly
		//         ttsChars: translationResult?.translatedText.length || 0, // Dummy or calculated value
		//         billingInfo: { amount: 0.01 } // Dummy value
		//     });
		//     console.log(`AudioWorker (session ${this.sessionId}): Full processing turn complete.`);
		// }
	}

	private concatenateAudioChunks(chunks: Buffer[]): Buffer {
		return Buffer.concat(chunks);
	}

	public cleanup(): void {
		console.log(`AudioWorker (session ${this.sessionId}): Cleaning up.`);
		this.vadService.stopDetection();
		this.audioBuffer = [];
		// Any other cleanup tasks
	}
}
