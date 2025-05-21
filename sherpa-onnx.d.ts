declare module 'sherpa-onnx' {
    // Configuration interfaces (can be exported if needed elsewhere)
    export interface SileroVadConfig {
        model: string;
        threshold: number;
        minSpeechDuration: number;
        minSilenceDuration: number;
    }

    export interface VadModelConfig {
        sileroVad: SileroVadConfig;
        sampleRate: number;
        numThreads: number;
        provider?: string;
        debug?: boolean;
    }

    // Interface for the VAD instance returned by createVad
    export interface Vad {
        acceptWaveform(samples: Float32Array): void;
        isDetected(): boolean;
        isEmpty(): boolean; // Common method for VADs, good to check if it exists
        reset(): void;
        // pop(): void; // Another common method, check if needed/exists
        // clear(): void;
    }
    
    // Main module interface reflecting the logged output
    interface SherpaOnnxModule {
        createOnlineRecognizer?: Function; // Add other functions as needed, with proper types
        createOfflineRecognizer?: Function;
        createOfflineTts?: Function;
        createKws?: Function;
        readWave?: Function;
        readWaveFromBinaryData?: Function;
        writeWave?: Function;
        createCircularBuffer?: Function;
        createVad: (config: VadModelConfig, windowSizeInSeconds: number) => Vad; // Typed createVad
        createOfflineSpeakerDiarization?: Function;
        createOfflineSpeechDenoiser?: Function;
    }

    const sherpaOnnxDefault: SherpaOnnxModule;
    export default sherpaOnnxDefault;
} 