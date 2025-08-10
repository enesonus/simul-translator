export interface SessionConfig {
	stt_config: {
		provider: string; // e.g. "openai", "anthropic", "gemini"
		model: string; // e.g. "gpt-4o-mini", "claude-3-5-sonnet-20241022"
		target_language?: string; // e.g. "en", "fr", "es"
		source_language?: string; // e.g. "en", "fr", "es"
	};
	translation: {
		target_language: string;
		source_language?: string; // Optional, if not provided, auto-detect
	};
	tts_config: {
		provider?: "openai" | "elevenlabs" | "groq"; // e.g. "openai", "groq", "elevenlabs"
		voice?: string; // e.g. "alloy", "en-US-Waven
		format?: "mp3" | "opus" | "aac" | "flac" | "wav" | "pcm"; // e.g., 'mp3', 'pcm'
	};
	turn_detection: {
		type: string; // e.g. "silero"
		threshold: number;
		prefix_padding_ms: number; // e.g. 500
		silence_duration_ms: number; // e.g. 600
	};
}

export interface Session {
	config: SessionConfig;
	id: string;
}

export function createSessionConfig(
	config?: Partial<SessionConfig>
): SessionConfig {
	const defaults: SessionConfig = {
		stt_config: {
			provider: "groq", // Default provider
			model: "whisper-large-v3",
			target_language: undefined,
			source_language: undefined, // Auto-detect if not provided
		},
		tts_config: {
			provider: "elevenlabs", // Default provider
			voice: "Xb7hH8MSUJpSbSDYk0k2",
			format: "mp3", // Default format
		},
		turn_detection: {
			type: "silero",
			threshold: 0.9,
			prefix_padding_ms: 500,
			silence_duration_ms: 600,
		},
		translation: {
			target_language: "en",
			source_language: undefined, // Auto-detect if not provided
		},
	};

	return {
		...defaults,
		...config,
		// Deep merge for nested objects if necessary, e.g., turn_detection and client_secret
		turn_detection: {
			...defaults.turn_detection,
			...(config?.turn_detection || {}),
		},
	};
}
