export interface SessionCreatedMessage {
    type: 'session.created';
    sessionId: string;
    model: string;
    instructions: string;
    voiceIOFormat: string;
    turnDetectionSettings: any; // Define more specifically later
}

export interface SessionUpdateMessage {
    type: 'session.update';
    vadMode?: string;
    speakerVoice?: string;
    // Add other updatable fields
}

export interface SessionUpdatedMessage {
    type: 'session.updated';
    newState: any; // Define more specifically later
}

export interface ConversationCreateMessage {
    type: 'conversation.create';
    chatHistory?: any[]; // Define more specifically later
    chatId?: string;
}

export interface ConversationCreatedMessage {
    type: 'conversation.created';
    conversationId: string;
}

export interface ConversationItemCreateMessage {
    type: 'conversation.item.create';
    text: string;
}

export interface ConversationItemCreatedMessage {
    type: 'conversation.item.created';
    itemId: string;
    previousMessageId?: string;
    transcription?: string;
    language?: string;
    // Add other relevant fields
}

export interface InputAudioBufferAppendMessage {
    type: 'input_audio_buffer.append';
    metadata: string;
    chunk: string; // Base64 encoded audio data
}

export interface InputAudioBufferSpeechStartedMessage {
    type: 'input_audio_buffer.speech_started';
}

export interface InputAudioBufferSpeechStoppedMessage {
    type: 'input_audio_buffer.speech_stopped';
}

export interface InputAudioBufferCommittedMessage {
    type: 'input_audio_buffer.committed';
    reason: 'vad' | 'explicit';
}

export interface InputAudioBufferClearMessage {
    type: 'input_audio_buffer.clear';
}

export interface InputAudioBufferClearedMessage {
    type: 'input_audio_buffer.cleared';
}

export interface InputAudioBufferCommitMessage {
    type: 'input_audio_buffer.commit';
}

export interface ResponseCreatedMessage {
    type: 'response.created';
    responseId: string;
}

export interface ResponseAudioTranscriptStartMessage {
    type: 'response.audio_transcript.start';
}

export interface ResponseAudioTranscriptDoneMessage {
    type: 'response.audio_transcript.done';
    transcription: string;
    language: string;
}

export interface ResponseTextStartMessage {
    type: 'response.text.start';
}

export interface ResponseTextDeltaMessage {
    type: 'response.text.delta';
    textChunk: string;
}

export interface ResponseTextDoneMessage {
    type: 'response.text.done';
    fullText: string;
}

export interface ResponseAudioStartMessage {
    type: 'response.audio.start';
}

export interface ResponseAudioDeltaMessage {
    type: 'response.audio.delta';
    audio: string; // Base64 encoded audio data
}

export interface ResponseAudioVisemeStartMessage {
    type: 'response.audio.viseme.start';
    audioGroupId: string;
}

export interface ResponseAudioVisemeDoneMessage {
    type: 'response.audio.viseme.done';
    visemes: any[]; // Define more specifically later
    audioGroupId: string;
}

export interface ResponseAudioDoneMessage {
    type: 'response.audio.done';
}

export interface ResponseDoneMessage {
    type: 'response.done';
    sttDurationMs: number;
    llmTokens: number;
    ttsChars: number;
    billingInfo: any; // Define more specifically later
}

export type WebSocketMessage =
    | SessionCreatedMessage
    | SessionUpdateMessage
    | SessionUpdatedMessage
    | ConversationCreateMessage
    | ConversationCreatedMessage
    | ConversationItemCreateMessage
    | ConversationItemCreatedMessage
    | InputAudioBufferAppendMessage
    | InputAudioBufferSpeechStartedMessage
    | InputAudioBufferSpeechStoppedMessage
    | InputAudioBufferCommittedMessage
    | InputAudioBufferClearMessage
    | InputAudioBufferClearedMessage
    | InputAudioBufferCommitMessage
    | ResponseCreatedMessage
    | ResponseAudioTranscriptStartMessage
    | ResponseAudioTranscriptDoneMessage
    | ResponseTextStartMessage
    | ResponseTextDeltaMessage
    | ResponseTextDoneMessage
    | ResponseAudioStartMessage
    | ResponseAudioDeltaMessage
    | ResponseAudioVisemeStartMessage
    | ResponseAudioVisemeDoneMessage
    | ResponseAudioDoneMessage
    | ResponseDoneMessage; 