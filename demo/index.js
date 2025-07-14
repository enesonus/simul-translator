const connectButton = document.getElementById('connectButton');
// startRecordButton removed – logic merged into connect workflow
const audioPlayer = document.getElementById('audioPlayer');
const wsUrlInput = document.getElementById('wsUrlInput');
const sourceLangSelect = document.getElementById('sourceLangSelect');
const targetLangSelect = document.getElementById('targetLangSelect');
const voiceGenderSelect = document.getElementById('voiceGenderSelect');
const thresholdInput = document.getElementById('thresholdInput');
const silenceDurationInput = document.getElementById('silenceDurationInput');
const prefixPaddingInput = document.getElementById('prefixPaddingInput');
// New UI elements
const toggleMoreButton = document.getElementById('toggleMoreButton');
const moreParamsSection = document.getElementById('moreParamsSection');
const statusLabel = document.getElementById('statusLabel');
const transcriptDisplay = document.getElementById('transcriptDisplay');
const translationDisplay = document.getElementById('translationDisplay');
// Handler for toggling connect button into disconnect mode
let disconnectHandler = null;

// --- Inject flag emojis into Target Language options ---
const langToCountry = {
  AR: 'AE',
  BG: 'BG',
  CS: 'CZ',
  DA: 'DK',
  DE: 'DE',
  EL: 'GR',
  EN: 'GB',
  'EN-GB': 'GB',
  'EN-US': 'US',
  ES: 'ES',
  'ES-419': 'MX',
  ET: 'EE',
  FI: 'FI',
  FR: 'FR',
  HE: 'IL',
  HU: 'HU',
  ID: 'ID',
  IT: 'IT',
  JA: 'JP',
  KO: 'KR',
  LT: 'LT',
  LV: 'LV',
  NB: 'NO',
  NL: 'NL',
  PL: 'PL',
  PT: 'PT',
  'PT-BR': 'BR',
  'PT-PT': 'PT',
  RO: 'RO',
  RU: 'RU',
  SK: 'SK',
  SL: 'SI',
  SV: 'SE',
  TH: 'TH',
  TR: 'TR',
  UK: 'UA',
  VI: 'VN',
  ZH: 'CN',
  'ZH-HANS': 'CN',
  'ZH-HANT': 'TW',
};

function countryCodeToFlagEmoji(cc) {
  if (!cc || cc.length !== 2) return '';
  const [first, second] = cc.toUpperCase().split('');
  const base = 0x1F1E6;
  return String.fromCodePoint(base + first.charCodeAt(0) - 65, base + second.charCodeAt(0) - 65);
}

function injectFlagEmojis() {
  const selectEl = document.getElementById('targetLangSelect');
  if (!selectEl) return;
  Array.from(selectEl.options).forEach((opt) => {
    // Remove any existing emoji flags (two regional indicator symbols)
    const cleanedText = opt.textContent.replace(/^[\uD83C-\uDBFF\uDC00-\uDFFF]{2}\s*/, '');
    const countryCode = langToCountry[opt.value] || langToCountry[cleanedText] || opt.value.split('-')[0];
    const flag = countryCodeToFlagEmoji(countryCode);
    opt.textContent = flag ? `${flag} ${cleanedText}` : cleanedText;
  });
}

injectFlagEmojis();

// Toggle visibility for extra parameters
if (toggleMoreButton && moreParamsSection) {
  toggleMoreButton.addEventListener('click', () => {
    moreParamsSection.classList.toggle('hidden');
  });
}

let socket = null;
// Audio receiving
let mediaSource = null;
let sourceBuffer = null;
let pendingAudioChunks = [];
let isSourceBufferReady = false;

// Audio sending
let audioContext = null;
let scriptNode = null;
let microphoneSourceNode = null;
let audioMotion = null;

// Utility to restore default button states and clean up resources
function resetUI() {
  // Reset buttons
  connectButton.textContent = "Connect";
  connectButton.disabled = false;
  // no secondary button anymore

  // Stop any playing audio
  if (audioPlayer) {
    audioPlayer.pause();
    audioPlayer.currentTime = 0;
  }

  // Clean up MediaSource / buffers
  cleanupMediaSource();

  // Stop microphone capture
  if (scriptNode) {
    scriptNode.disconnect();
    scriptNode = null;
  }
  if (microphoneSourceNode) {
    microphoneSourceNode.disconnect();
    microphoneSourceNode = null;
  }
  if (audioContext) {
    audioContext.close();
    audioContext = null;
  }
  if (audioMotion) {
    try { audioMotion.destroy(); } catch(e){}
    audioMotion = null;
  }

  // Close socket if still open
  if (socket && socket.readyState === WebSocket.OPEN) {
    socket.close();
  }
  socket = null;
  if (statusLabel) statusLabel.textContent = "Waiting...";
  updateWave(0);
  if (transcriptDisplay) transcriptDisplay.textContent = "";
  if (translationDisplay) translationDisplay.textContent = "";
  if (disconnectHandler) {
    connectButton.removeEventListener('click', disconnectHandler);
    disconnectHandler = null;
  }
}

function enableDisconnectMode() {
  // Restore previous listener (if any)
  if (disconnectHandler) {
    connectButton.removeEventListener('click', disconnectHandler);
  }

  disconnectHandler = (e) => {
    // Prevent the original connect listener from running
    e.stopImmediatePropagation();
    resetUI();
  };

  connectButton.textContent = "Disconnect";
  connectButton.disabled = false;
  connectButton.addEventListener('click', disconnectHandler, { once: true });
}

connectButton.addEventListener('click', () => {
  connectButton.textContent = "Connecting...";
  connectButton.disabled = true;
  // no secondary button anymore

  const currentWsUrl = wsUrlInput.value;
  socket = new WebSocket(currentWsUrl);
  setupStreamingAudio();

  // Handle connection errors / closures
  socket.onerror = (err) => {
    console.error("WebSocket error:", err);
    resetUI();
  };

  socket.onclose = (evt) => {
    console.warn("WebSocket closed:", evt.code, evt.reason);
    resetUI();
  };

  socket.onopen = () => {
    const turnDetectionCfg = {};
    const thresholdVal = parseFloat(thresholdInput.value);
    const silenceVal = parseInt(silenceDurationInput.value);
    const prefixVal = parseInt(prefixPaddingInput.value);
    if (!isNaN(thresholdVal)) turnDetectionCfg.threshold = thresholdVal;
    if (!isNaN(silenceVal)) turnDetectionCfg.silence_duration_ms = silenceVal;
    if (!isNaN(prefixVal)) turnDetectionCfg.prefix_padding_ms = prefixVal;

    const sessionCreateMessage = {
      type: "session.create",
      config: {
        translation: {
          source_language: sourceLangSelect.value || undefined,
          target_language: targetLangSelect.value,
        },
        tts_config: {
          voice: voiceGenderSelect.value === 'male' ? 'onwK4e9ZLuTAKqWW03F9' : (voiceGenderSelect.value === 'female' ? 'XrExE9yKIg1WjnnlVkGX' : undefined),
        },
        turn_detection: Object.keys(turnDetectionCfg).length ? turnDetectionCfg : undefined,
      },
    };
    socket.send(JSON.stringify(sessionCreateMessage));
  };

  socket.onmessage = (event) => {
    const messageData = JSON.parse(event.data);
    console.log("Received message:", messageData.type);

    if (messageData.type === "session.created") {
      // automatically begin recording
      startRecording();
    } else if (messageData.type === "response.audio.delta") {
      console.log("Received audio delta length:", messageData.audioBase64.length);
      if (audioPlayer.paused) {
        audioPlayer.play();
      }
      const byteCharacters = atob(messageData.audioBase64);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      pendingAudioChunks.push(byteArray.buffer);
      processPendingChunks();
    } else if (messageData.type === "response.audio_transcript.done") {
      if (transcriptDisplay) transcriptDisplay.textContent = messageData.transcription || '';
      if (translationDisplay) translationDisplay.textContent = '';
    } else if (messageData.type === "response.translation.done") {
      if (translationDisplay) translationDisplay.textContent = messageData.translation || '';
    } else if (messageData.type === "input_audio_buffer.speech_started") {
      mediaSource.removeSourceBuffer(sourceBuffer);
      mediaSource.endOfStream();
      setupStreamingAudio();
      pendingAudioChunks = [];
    } else if (messageData.type === "response.error") {
      // Backend signalled an error – reset the UI so user can reconnect
      resetUI();
    }
  };
});

async function startRecording() {
  if (!socket || socket.readyState !== WebSocket.OPEN) {
    return;
  }
  connectButton.textContent = "Disconnect";
  if (statusLabel) statusLabel.textContent = "Sending Audio...";

  // Switch Connect button to Disconnect mode
  enableDisconnectMode();

  audioContext = new AudioContext({ sampleRate: 16000 });
  const userStream = await navigator.mediaDevices.getUserMedia({
    audio: { sampleRate: 16000, channelCount: 1 },
  });

  microphoneSourceNode = audioContext.createMediaStreamSource(userStream);
  scriptNode = audioContext.createScriptProcessor(1024, 1, 1);

  scriptNode.onaudioprocess = (audioProcessingEvent) => {
    const audioData = audioProcessingEvent.inputBuffer.getChannelData(0);
    sendAudioChunk(audioData);
  };

  microphoneSourceNode.connect(scriptNode);
  scriptNode.connect(audioContext.destination);
}

function sendAudioChunk(audioData) {
  if (socket && socket.readyState === WebSocket.OPEN) {
    const base64Chunk = base64EncodeAudio(floatTo16BitPCM(audioData));
    const msg = { type: "input_audio_buffer.append", audio: base64Chunk };
    socket.send(JSON.stringify(msg));
  }
}

function floatTo16BitPCM(float32Array) {
  const buffer = new ArrayBuffer(float32Array.length * 2);
  const view = new DataView(buffer);
  for (let i = 0; i < float32Array.length; i++) {
    const s = Math.max(-1, Math.min(1, float32Array[i]));
    view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
  }
  return buffer;
}

function base64EncodeAudio(arrayBuffer) {
  let binary = "";
  const bytes = new Uint8Array(arrayBuffer);
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function setupStreamingAudio() {
  mediaSource = new MediaSource();
  audioPlayer.src = URL.createObjectURL(mediaSource);
  pendingAudioChunks = [];
  sourceBuffer = null;
  isSourceBufferReady = false;

  mediaSource.addEventListener('sourceopen', () => {
    sourceBuffer = mediaSource.addSourceBuffer('audio/mpeg');
    // sourceBuffer.mode = 'sequence';
    isSourceBufferReady = true;
    sourceBuffer.addEventListener('updateend', processPendingChunks);
    processPendingChunks();
  });
}

function processPendingChunks() {
  if (!isSourceBufferReady || !sourceBuffer || sourceBuffer.updating || pendingAudioChunks.length === 0) {
    return;
  }

  // If the <audio> element is in an error state, reset the MediaSource pipeline
  if (audioPlayer && audioPlayer.error) {
    console.warn("audio element in error state (", audioPlayer.error.code, ") – resetting MediaSource");
    try {
      cleanupMediaSource();
      setupStreamingAudio();
    } catch (e) {
      console.error("Error while resetting MediaSource after audio error", e);
    }
    return;
  }

  const chunkToAppend = pendingAudioChunks.shift();
  try {
    sourceBuffer.appendBuffer(chunkToAppend);
  } catch (e) {
    console.error("appendBuffer failed – resetting MediaSource", e);
    // Put the chunk back to be retried after reset
    pendingAudioChunks.unshift(chunkToAppend);
    try {
      cleanupMediaSource();
      setupStreamingAudio();
    } catch (err) {
      console.error("Failed to recover MediaSource", err);
    }
  }
}

function cleanupMediaSource() {
  if (mediaSource && mediaSource.readyState === "open") {
    try {
      if (sourceBuffer) {
        mediaSource.removeSourceBuffer(sourceBuffer);
      }
      mediaSource.endOfStream();
    } catch (e) {
      console.error("Error cleaning up MediaSource:", e);
    }
  }
  sourceBuffer = null;
  pendingAudioChunks = [];

  if (audioPlayer) {
    audioPlayer.src = "";
  }
}