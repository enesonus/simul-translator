import { initEmailModal } from './js/email-modal.js';
import { injectFlagEmojisForSelect } from './js/language-flags.js';
import { getWsUrl, floatTo16BitPCM, base64EncodeAudio, isMobile } from './js/utils.js';
import { PCMPlayer } from './js/pcm-player.js';

// Initialize email modal
initEmailModal();

// Elements
const connectButton = document.getElementById('connectButton');
const audioPlayer = document.getElementById('audioPlayer');
const sourceLangSelect = document.getElementById('sourceLangSelect');
const targetLangSelect = document.getElementById('targetLangSelect');
const voiceGenderSelect = document.getElementById('voiceGenderSelect');
const thresholdInput = document.getElementById('thresholdInput');
const translationProviderSelect = document.getElementById('translationProviderSelect');
const silenceDurationInput = document.getElementById('silenceDurationInput');
const prefixPaddingInput = document.getElementById('prefixPaddingInput');
const toggleMoreButton = document.getElementById('toggleMoreButton');
const moreParamsSection = document.getElementById('moreParamsSection');
const statusLabel = document.getElementById('statusLabel');
const transcriptDisplay = document.getElementById('transcriptDisplay');
const translationDisplay = document.getElementById('translationDisplay');

// Disable on mobile
// (function blockMobile() {
//   if (!isMobile()) return;
//   const banner = document.getElementById('mobileWarning');
//   if (banner) banner.style.display = 'block';
//   if (connectButton) { connectButton.disabled = true; connectButton.textContent = 'Not supported on mobile'; }
// })();

// Inject flags
injectFlagEmojisForSelect('targetLangSelect');
injectFlagEmojisForSelect('sourceLangSelect');

// Extra params toggle
if (toggleMoreButton && moreParamsSection) {
  toggleMoreButton.addEventListener('click', () => {
    moreParamsSection.classList.toggle('hidden');
  });
}

// Language change -> session.update
let socket = null;
function buildSessionUpdateConfig() {
  return {
    stt_config: {
      provider: 'groq',
      model: 'whisper-large-v3',
      source_language: sourceLangSelect?.value || undefined,
      target_language: undefined,
    },
    translation: {
      provider: translationProviderSelect?.value || "groq",
      source_language: sourceLangSelect?.value || undefined,
      target_language: targetLangSelect?.value || undefined,
    },
  };
}
function sendSessionUpdate() {
  if (!socket || socket.readyState !== WebSocket.OPEN) return;
  socket.send(JSON.stringify({ type: 'session.update', config: buildSessionUpdateConfig() }));
}
sourceLangSelect?.addEventListener('change', sendSessionUpdate);
targetLangSelect?.addEventListener('change', sendSessionUpdate);
translationProviderSelect?.addEventListener('change', sendSessionUpdate);

// PCM audio controller
const pcm = new PCMPlayer({ channels: 1, sampleRate: 24000, flushIntervalMs: 100 });

// Recording/audio capture
let audioContext = null;
let scriptNode = null;
let microphoneSourceNode = null;
let disconnectHandler = null;

function resetUI() {
  connectButton.textContent = 'Connect';
  connectButton.disabled = false;
  audioPlayer?.pause?.();
  if (audioPlayer) audioPlayer.currentTime = 0;
  try { pcm.close(); } catch {}
  if (scriptNode) { scriptNode.disconnect(); scriptNode = null; }
  if (microphoneSourceNode) { microphoneSourceNode.disconnect(); microphoneSourceNode = null; }
  if (audioContext) { audioContext.close(); audioContext = null; }
  if (socket && socket.readyState === WebSocket.OPEN) socket.close();
  socket = null;
  if (statusLabel) statusLabel.textContent = 'Waiting...';
  if (transcriptDisplay) transcriptDisplay.textContent = '';
  if (translationDisplay) translationDisplay.textContent = '';
  if (disconnectHandler) { connectButton.removeEventListener('click', disconnectHandler); disconnectHandler = null; }
}

function enableDisconnectMode() {
  if (disconnectHandler) connectButton.removeEventListener('click', disconnectHandler);
  disconnectHandler = (e) => { e.stopImmediatePropagation(); resetUI(); };
  connectButton.textContent = 'Disconnect';
  connectButton.disabled = false;
  connectButton.addEventListener('click', disconnectHandler, { once: true });
}

connectButton.addEventListener('click', () => {
  connectButton.textContent = 'Connecting...';
  connectButton.disabled = true;

  socket = new WebSocket(getWsUrl());
  pcm.init();
  pcm.resume();

  socket.onerror = (err) => { console.error('WebSocket error:', err); resetUI(); };
  socket.onclose = (evt) => { console.warn('WebSocket closed:', evt.code, evt.reason); resetUI(); };

  socket.onopen = () => {
    const turnDetectionCfg = {};
    const t = parseFloat(thresholdInput.value); const s = parseInt(silenceDurationInput.value); const p = parseInt(prefixPaddingInput.value);
    if (!isNaN(t)) turnDetectionCfg.threshold = t;
    if (!isNaN(s)) turnDetectionCfg.silence_duration_ms = s;
    if (!isNaN(p)) turnDetectionCfg.prefix_padding_ms = p;
    const sessionCreateMessage = {
      type: 'session.create',
      config: {
        stt_config: { provider: 'groq', model: 'whisper-large-v3', source_language: sourceLangSelect.value || undefined, target_language: undefined },
        translation: { provider: translationProviderSelect?.value || "groq", source_language: sourceLangSelect.value || undefined, target_language: targetLangSelect.value },
        tts_config: {provider: "deepinfra" , voice: voiceGenderSelect.value === 'male' ? 'onwK4e9ZLuTAKqWW03F9' : (voiceGenderSelect.value === 'female' ? 'XrExE9yKIg1WjnnlVkGX' : undefined), format: 'pcm' },
        turn_detection: Object.keys(turnDetectionCfg).length ? turnDetectionCfg : undefined,
      },
    };
    socket.send(JSON.stringify(sessionCreateMessage));
  };

  socket.onmessage = (event) => {
    const messageData = JSON.parse(event.data);
    console.log('Received message:', messageData.type);
    if (messageData.type === 'session.created') {
      startRecording();
    } else if (messageData.type === 'response.audio.delta') {
      pcm.feedBase64(messageData.audioBase64);
    } else if (messageData.type === 'response.audio_transcript.done') {
      if (transcriptDisplay) transcriptDisplay.textContent = messageData.transcription || '';
      if (translationDisplay) translationDisplay.textContent = '';
    } else if (messageData.type === 'response.translation.done') {
      if (translationDisplay) translationDisplay.textContent = messageData.translation || '';
    } else if (messageData.type === 'input_audio_buffer.speech_started') {
      pcm.reset();
    } else if (messageData.type === 'response.error') {
      resetUI();
    }
  };
});

async function startRecording() {
  if (!socket || socket.readyState !== WebSocket.OPEN) return;
  connectButton.textContent = 'Disconnect';
  if (statusLabel) statusLabel.textContent = 'Sending Audio...';
  enableDisconnectMode();
  audioContext = new AudioContext({ sampleRate: 16000 });
  const userStream = await navigator.mediaDevices.getUserMedia({ audio: { sampleRate: 16000, channelCount: 1 } });
  microphoneSourceNode = audioContext.createMediaStreamSource(userStream);
  scriptNode = audioContext.createScriptProcessor(1024, 1, 1);
  scriptNode.onaudioprocess = (e) => {
    const audioData = e.inputBuffer.getChannelData(0);
    const base64Chunk = base64EncodeAudio(floatTo16BitPCM(audioData));
    socket?.send(JSON.stringify({ type: 'input_audio_buffer.append', audio: base64Chunk }));
  };
  microphoneSourceNode.connect(scriptNode);
  scriptNode.connect(audioContext.destination);
}

