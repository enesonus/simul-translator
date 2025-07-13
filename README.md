# Simul-Translator

**Real-time speech-to-speech translation micro-service built with Node.js, TypeScript and WebSockets**

![Node](https://img.shields.io/badge/Node-18.x-green?logo=node.js) ![TypeScript](https://img.shields.io/badge/TypeScript-%5E5.x-blue?logo=typescript) ![License](https://img.shields.io/badge/license-ISC-lightgrey)

---

Simul-Translator turns a microphone stream into translated speech in (near) real-time. Audio frames are streamed over a WebSocket connection where the server pipeline performs:

1. **Voice Activity Detection (VAD)** – detects speech boundaries with [Silero VAD] running on **Sherpa-ONNX**.
2. **Speech-to-Text (STT)** – transcribes the detected segment using Whisper (OpenAI/Groq).
3. **Neural Machine Translation (NMT)** – translates the text with the DeepL REST API.
4. **Text-to-Speech (TTS)** – synthesises the translated text with the OpenAI TTS endpoint.
5. **Streaming back audio & metadata** – the client gets translation text and a TTS audio stream it can play instantly.

> All services are interchangeable thanks to the modular `src/services/**` design – plug in your own STT, NMT or TTS provider.

---

## Demo

Start the server (see **Quick Start** below) and open

```
http://localhost:8080
```

The static demo (`/demo`) captures your microphone, connects to the WebSocket API, translates what you say and speaks it back.

---

## Project layout

```
├── src/
│   ├── app.ts                 # HTTP + WebSocket bootstrapper
│   ├── websocket-server.ts    # WS session handling
│   ├── websocket-types.ts     # Shared WS message contracts
│   ├── services/              # ✨ Modular pipeline blocks
│   │   ├── vad/               # 1. Voice activity detection
│   │   ├── stt/               # 2. Speech-to-text
│   │   ├── translation/       # 3. Translation
│   │   └── tts/               # 4. Text-to-speech
│   ├── workers/               # Orchestration workers (AudioWorker)
│   ├── helpers/               # Re-usable helpers (PCM↔Float, Base64 …)
│   └── static/                # Silero VAD ONNX model
├── demo/                      # Simple front-end GUI
├── Dockerfile                 # Production image
└── README.md
```

---

## Quick Start (local)

1. **Clone & install**
   ```bash
   git clone https://github.com/your-user/simul-translator.git
   cd simul-translator
   npm install # or yarn
   ```

2. **Create `.env`** (root directory)
   ```env
   # Speech-to-Text (OpenAI Whisper)
   OPENAI_API_KEY=sk-...

   # Alternative STT provider (optional)
   GROQ_API_KEY=gr-...

   # Translation (DeepL)
   DEEPL_API_KEY=xxxxxxxx-xxxxxxxx-xxxxxxxxxx:fx

   # Web server port (optional)
   PORT=8080
   ```

3. **Build & run**
   ```bash
   npm run build        # tsc → dist/
   node dist/src/app.js # serves WS + static demo
   ```

4. **Open the demo**: http://localhost:8080 – choose languages and click *Connect*.

> **Development tip**: `npx tsx src/app.ts` runs directly without compiling.

---

## Quick Start (Docker)

The repository ships with a multi-stage image (≈ 250 MB).

```bash
docker build -t simul-translator .

docker run -p 8080:8080 \
  -e OPENAI_API_KEY=$OPENAI_API_KEY \
  -e DEEPL_API_KEY=$DEEPL_API_KEY \
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
      "voice": "nova",               // see OpenAI voices
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
| STT | `services/stt/stt-service.ts` – Whisper (`openai` or `groq`) |
| Translation | `services/translation/translation-service.ts` – DeepL REST |
| TTS | `services/tts/tts-service.ts` – OpenAI TTS (`gpt-4o-mini-tts`) |

All four stages expose a tiny interface; swap them with your own provider in minutes.

---

## Roadmap

- [ ] Replace DeepL with local LLM fallback
- [ ] gRPC transport (lower overhead) & Auth
- [ ] Speaker diarisation & multi-party sessions
- [ ] OpenAI `audio.translations` streaming once available

---

## Contributing

1. Fork ➜ feature branch ➜ PR
2. Follow conventional commits.
3. Run `npm run build && npm run lint` before pushing.

Ideas, issues and PRs are welcome ❤️.

---

## License

This project is licensed under the **ISC License** – see `LICENSE` for details.

