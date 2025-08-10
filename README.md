# Simul-Translator

**Real-time speech-to-speech translation micro-service built with Node.js, TypeScript and WebSockets**

![Node](https://img.shields.io/badge/Node-18.x-green?logo=node.js) ![TypeScript](https://img.shields.io/badge/TypeScript-%5E5.x-blue?logo=typescript) ![License](https://img.shields.io/badge/license-ISC-lightgrey)

---

Simul-Translator turns a microphone stream into translated speech in (near) real-time. Audio frames are streamed over a WebSocket connection where the server pipeline performs:

1. **Voice Activity Detection (VAD)** – detects speech boundaries with [Silero VAD] running on **Sherpa-ONNX**.
2. **Speech-to-Text (STT)** – transcribes the detected segment using **Groq Whisper Large v3 (default)**, with optional ElevenLabs/OpenAI.
3. **Neural Machine Translation (NMT)** – translates the text with the DeepL REST API.
4. **Text-to-Speech (TTS)** – synthesises the translated text with **ElevenLabs TTS** (Flash v2.5 voice) by default.
5. **Streaming back audio & metadata** – the client gets translation text and a TTS audio stream it can play instantly.

> All services are interchangeable thanks to the modular `src/services/**` design – plug in your own STT, NMT or TTS provider.

---

## Demo

Start the server (see **Quick Start** below) and open

```
http://localhost:8080
```

The static demo (`/demo`) captures your microphone, connects to the WebSocket API, translates what you say and speaks it back. It streams 16 kHz, 16‑bit mono PCM frames over the socket and plays TTS via MSE.

---

## Project layout

```
├── src/
│   ├── app.ts                 # HTTP + WebSocket bootstrapper (serves /demo)
│   ├── websocket-server.ts    # WS session handling
│   ├── websocket-types.ts     # Shared WS message contracts
│   ├── services/
│   │   ├── vad/               # Silero VAD (sherpa-onnx)
│   │   ├── stt/               # STT providers (ElevenLabs default, OpenAI, Groq)
│   │   ├── translation/       # DeepL translator
│   │   └── tts/               # TTS providers (ElevenLabs default, OpenAI)
│   ├── workers/               # AudioWorker orchestrator
│   ├── helpers/               # Audio and base64 helpers
│   └── static/                # Silero ONNX model
├── demo/
│   ├── index.html             # UI with language + VAD controls
│   ├── main.js                # client logic
│   └── js/                    # audio MSE + utils + flags
├── Dockerfile
└── README.md
```

---

## Quick Start (local)

1. **Clone & install**
   ```bash
   git clone https://github.com/your-user/simul-translator.git
   cd simul-translator
   npm install
   ```

2. **Create `.env`**
   ```env
   # STT (default): Groq Whisper Large v3
   GROQ_API_KEY=gr-...

   # TTS (default): ElevenLabs
   ELEVENLABS_API_KEY=elv-...

   # Optional alternatives (if you switch providers)
   OPENAI_API_KEY=sk-...

   # Translation (DeepL)
   DEEPL_API_KEY=xxxxxxxx-xxxxxxxx-xxxxxxxxxx:fx

   PORT=8080
   ```

3. **Run**
   ```bash
   npm run build
   node dist/src/app.js
   ```

4. **Open** `http://localhost:8080`.

---

## WebSocket protocol (client ↔ server)

- `session.create`
  - Provide optional config; defaults are used if omitted.
  - Defaults (from server):
    - STT: ElevenLabs Scribe v1
    - TTS: ElevenLabs Flash v2.5, voice `Xb7hH8MSUJpSbSDYk0k2`, format `mp3`
    - Translation: DeepL target `en`, source auto
    - Turn detection: type `silero`, threshold `0.9`, silence `600ms`, prefix padding `500ms`

Example:
```json
{
  "type": "session.create",
  "config": {
    "stt_config": { "provider": "groq", "model": "whisper-large-v3", "source_language": "TR" },
    "translation": { "source_language": "TR", "target_language": "EN" },
    "tts_config": { "provider": "elevenlabs", "voice": "XrExE9yKIg1WjnnlVkGX", "format": "mp3" },
    "turn_detection": { "threshold": 0.85, "silence_duration_ms": 750, "prefix_padding_ms": 1000 }
  }
}
```

- `input_audio_buffer.append`
  - Send base64 for 16 kHz, 16-bit PCM mono frames (~1024 samples per chunk in demo).

- Server events
  - `input_audio_buffer.speech_started` / `.speech_stopped`
  - `response.audio_transcript.done` { transcription, language }
  - `response.translation.done` { text, translation, sourceLanguage, targetLanguage }
  - `response.audio.delta` { audioBase64 } (MP3 chunks by default)
  - `response.audio.done`
  - `response.error` { source, error }

- `session.update`
  - Hot-update parts of the config during a connection, e.g. target language.

---

## Audio & latency notes

- Input: 16 kHz, 16-bit, mono PCM. The demo uses `AudioContext({ sampleRate: 16000 })` and sends base64 PCM in ~8 KB chunks.
- VAD: Silero via `sherpa-onnx-node` with adjustable threshold, silence window, and prefix padding.
- Typical flow: VAD commit → STT (Scribe) → DeepL → TTS (Flash) streaming. First audio chunk is usually available quickly due to chunked TTS streaming.

---

## Pipeline internals (current defaults)

| Stage | Implementation |
|-------|----------------|
| VAD | `services/vad/vad-service.ts` – Silero ONNX via `sherpa-onnx-node` |
| STT | `services/stt/stt-service.ts` – **Groq Whisper Large v3** (default), optional ElevenLabs/OpenAI |
| Translation | `services/translation/translation-service.ts` – DeepL REST |
| TTS | `services/tts/tts-service.ts` – ElevenLabs Flash v2.5 (default), optional OpenAI |

---

## Running with Docker

```bash
docker build -t simul-translator .

docker run -p 8080:8080 \
  -e ELEVENLABS_API_KEY=$ELEVENLABS_API_KEY \
  -e DEEPL_API_KEY=$DEEPL_API_KEY \
  -e GROQ_API_KEY=$GROQ_API_KEY \
  simul-translator
```

Now browse to http://localhost:8080.

---

## WebSocket API

### 1. Handshake

Client opens a WS connection (e.g. `ws://localhost:8080`) and immediately sends:

```json
{
  "type": "session.create",
  "config": {
    "translation": {
      "target_language": "EN",      // ISO-639-1 (DeepL) code
      "source_language": "TR"        // optional – omit to auto-detect
    },
    "tts_config": {
      "provider": "elevenlabs",        // default provider (optional)
      "voice": "Xb7hH8MSUJpSbSDYk0k2", // ElevenLabs voice ID (Nova-like female)
      "format": "mp3"
    },
    "turn_detection": {
      "threshold": 0.85,
      "prefix_padding_ms": 1000,
      "silence_duration_ms": 750
    }
  }
}
```

Server acknowledges:

```json
{ "type": "session.created", "id": "<uuid>", "config": { /* merged defaults */ } }
```

### 2. Streaming audio **to** the server

Send 16 kHz 16-bit *mono* PCM frames (~20 ms each) base64-encoded:

```json
{
  "type": "input_audio_buffer.append",
  "audio": "<base64-pcm>"
}
```

You may keep sending until you wish to close the session. The server’s VAD will take care of detecting speech boundaries.

### 3. Events **from** the server

| Message | Payload | Description |
|---------|---------|-------------|
| `input_audio_buffer.speech_started` | – | VAD flagged start of speech segment |
| `input_audio_buffer.speech_stopped` | – | VAD flagged end of speech segment |
| `response.audio_transcript.done` | `transcription`, `language` | STT finished |
| `response.translation.done` | `text`, `translation`, `sourceLanguage`, `targetLanguage` | DeepL finished |
| `response.audio.start` | – | TTS stream is about to begin |
| `response.audio.delta` | `audioBase64` | Chunk of encoded audio (same format you chose) |
| `response.audio.done` | – | TTS stream finished |
| `response.error` | `source`, `error` | Something went wrong |

### 4. Updating the session on-the-fly

You can tweak parameters without re-connecting:

```json
{ "type": "session.update", "config": { "translation": { "target_language": "DE" } } }
```

Server responds with `session.updated`.

---

## Pipeline internals

| Stage | Implementation |
|-------|----------------|
| VAD | `services/vad/vad-service.ts` – Silero ONNX model via `sherpa-onnx-node` |
| STT | `services/stt/stt-service.ts` – **ElevenLabs Scribe v1** (default) or Whisper (`openai` / `groq`) |
| Translation | `services/translation/translation-service.ts` – DeepL REST |
| TTS | `services/tts/tts-service.ts` – **ElevenLabs Flash v2.5** (default) or OpenAI TTS |

All four stages expose a tiny interface; swap them with your own provider in minutes.

---

## Roadmap

- [ ] Use local LLM for translation
- [ ] Semantic VAD for semantically corrected simultaneous translation
- [ ] Speaker diarisation & multi-party sessions

---

## Contributing

1. Fork ➜ feature branch ➜ PR
2. Follow conventional commits.
3. Run `npm run build && npm run lint` before pushing.

Ideas, issues and PRs are welcome ❤️.

---

## License

This project is licensed under the **ISC License** – see `LICENSE` for details.

