// Email Modal Functionality
const emailModal = document.getElementById('emailModal');
const emailModalClose = document.getElementById('emailModalClose');
const emailForm = document.getElementById('emailForm');
const emailInput = document.getElementById('emailInput');

// Check if user has already submitted email
const hasSubmittedEmail = localStorage.getItem('emailSubmitted') === 'true';

// Show modal on page load if user hasn't submitted email
if (!hasSubmittedEmail) {
  showEmailModal();
}

function showEmailModal() {
  if (emailModal) {
    emailModal.classList.remove('hidden');
    // Focus on email input after modal animation
    setTimeout(() => {
      if (emailInput) emailInput.focus();
    }, 300);
  }
}

function hideEmailModal() {
  if (emailModal) {
    emailModal.classList.add('hidden');
  }
}

// Close modal when clicking X button
if (emailModalClose) {
  emailModalClose.addEventListener('click', hideEmailModal);
}

// Close modal when clicking overlay
if (emailModal) {
  emailModal.addEventListener('click', (e) => {
    if (e.target === emailModal || e.target.classList.contains('email-modal-overlay')) {
      hideEmailModal();
    }
  });
}

// Close modal with Escape key
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && emailModal && !emailModal.classList.contains('hidden')) {
    hideEmailModal();
  }
});

// Handle form submission
if (emailForm) {
  emailForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const email = emailInput.value.trim();
    if (!email) return;

    // Disable submit button and show loading state
    const submitBtn = emailForm.querySelector('.email-submit-btn');
    const originalText = submitBtn.textContent;
    submitBtn.disabled = true;
    submitBtn.textContent = 'Subscribing...';

    try {
      // Here you would typically send the email to your backend
      // For now, we'll simulate an API call
      await simulateEmailSubmission(email);

      // Show success message
      showSuccessMessage();

      // Mark as submitted in localStorage
      localStorage.setItem('emailSubmitted', 'true');

      // Hide modal after short delay
      setTimeout(() => {
        hideEmailModal();
      }, 2000);

    } catch (error) {
      console.error('Email submission failed:', error);
      // Reset button state on error
      submitBtn.disabled = false;
      submitBtn.textContent = originalText;
      showErrorMessage();
    }
  });
}

function simulateEmailSubmission(email) {
  // Make actual API call to backend
  return fetch('/api/email/subscribe', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email })
  })
    .then(response => {
      if (!response.ok) {
        return response.json().then(errorData => {
          throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
        });
      }
      return response.json();
    })
    .then(data => {
      console.log('Email subscription successful:', data);
      return data;
    })
    .catch(error => {
      console.error('Email subscription failed:', error);
      throw error;
    });
}

function showSuccessMessage() {
  // Remove any existing messages
  const existingMessage = emailForm.querySelector('.email-success-message, .email-error-message');
  if (existingMessage) existingMessage.remove();

  const successMessage = document.createElement('div');
  successMessage.className = 'email-success-message';
  successMessage.textContent = '🎉 Thanks for subscribing! You\'ll hear from us soon.';
  emailForm.appendChild(successMessage);
}

function showErrorMessage() {
  // Remove any existing messages
  const existingMessage = emailForm.querySelector('.email-success-message, .email-error-message');
  if (existingMessage) existingMessage.remove();

  const errorMessage = document.createElement('div');
  errorMessage.className = 'email-error-message';
  errorMessage.textContent = '❌ Something went wrong. Please try again.';
  errorMessage.style.cssText = `
    text-align: center;
    color: #ef4444;
    font-size: 16px;
    font-weight: 500;
    margin-top: 16px;
    padding: 12px;
    background: rgba(239, 68, 68, 0.1);
    border-radius: 12px;
    border: 1px solid rgba(239, 68, 68, 0.3);
  `;
  emailForm.appendChild(errorMessage);
}

// Main application code starts here
const connectButton = document.getElementById('connectButton');
// startRecordButton removed – logic merged into connect workflow
const audioPlayer = document.getElementById('audioPlayer');
const wsUrlInput = "https://simul-translator-11820398872.us-central1.run.app";
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
    try { audioMotion.destroy(); } catch (e) { }
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

  const currentWsUrl = "https://simul-translator-11820398872.us-central1.run.app";
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
        stt_config: {
          provider: "groq", // Default provider
          model: "whisper-large-v3",
          source_language: sourceLangSelect.value || undefined,
          target_language: undefined
        },
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