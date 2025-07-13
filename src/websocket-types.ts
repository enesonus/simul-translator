import { SessionConfig } from "./workers/types/models";

export interface SessionCreateMessage {
	type: "session.create";
	config?: Partial<SessionConfig>;
}

export interface SessionCreatedMessage {
	type: "session.created";
	id: string;
	config: SessionConfig;
}

export interface SessionUpdateMessage {
	type: "session.update";
	config?: Partial<SessionConfig>;
}

export interface SessionUpdatedMessage {
	type: "session.updated";
	config: any; // Define more specifically later
}

export interface InputAudioBufferAppendMessage {
	type: "input_audio_buffer.append";
	metadata?: string;
	audio: string; // Base64 encoded audio data
}

export interface InputAudioBufferSpeechStartedMessage {
	type: "input_audio_buffer.speech_started";
}

export interface InputAudioBufferSpeechStoppedMessage {
	type: "input_audio_buffer.speech_stopped";
}

export interface InputAudioBufferCommittedMessage {
	type: "input_audio_buffer.committed";
	reason: "vad" | "explicit";
}

export interface ResponseAudioTranscriptDoneMessage {
	type: "response.audio_transcript.done";
	transcription: string;
	language: string;
}

export interface ResponseTranslationDoneMessage {
	type: "response.translation.done";
	text: string;
	translation: string;
	sourceLanguage: string;
	targetLanguage: string;
}

export interface ResponseAudioStartMessage {
	type: "response.audio.start";
}

export interface ResponseAudioDeltaMessage {
	type: "response.audio.delta";
	audioBase64: string; // Base64 encoded audio data
}

export interface ResponseAudioDoneMessage {
	type: "response.audio.done";
}

export interface ResponseErrorMessage {
	type: "response.error";
	source: "stt" | "llm" | "tts" | "other";
	error: string;
}

export type WebSocketMessage =
	| SessionCreateMessage
	| SessionCreatedMessage
	| SessionUpdateMessage
	| SessionUpdatedMessage
	| InputAudioBufferAppendMessage
	| InputAudioBufferSpeechStartedMessage
	| InputAudioBufferSpeechStoppedMessage
	| InputAudioBufferCommittedMessage
	| ResponseAudioTranscriptDoneMessage
	| ResponseTranslationDoneMessage
	| ResponseAudioStartMessage
	| ResponseAudioDeltaMessage
	| ResponseAudioDoneMessage
	| ResponseAudioStartMessage
	| ResponseAudioDoneMessage
	| ResponseErrorMessage;
