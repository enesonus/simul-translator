const langToCountry = {
  AR: 'AE', BG: 'BG', CS: 'CZ', DA: 'DK', DE: 'DE', EL: 'GR', EN: 'GB', 'EN-GB': 'GB', 'EN-US': 'US', ES: 'ES', 'ES-419': 'MX', ET: 'EE', FI: 'FI', FR: 'FR', HE: 'IL', HU: 'HU', ID: 'ID', IT: 'IT', JA: 'JP', KO: 'KR', LT: 'LT', LV: 'LV', NB: 'NO', NL: 'NL', PL: 'PL', PT: 'PT', 'PT-BR': 'BR', 'PT-PT': 'PT', RO: 'RO', RU: 'RU', SK: 'SK', SL: 'SI', SV: 'SE', TH: 'TH', TR: 'TR', UK: 'UA', VI: 'VN', ZH: 'CN', 'ZH-HANS': 'CN', 'ZH-HANT': 'TW',
  HI: 'IN',
};

function countryCodeToFlagEmoji(cc) {
  if (!cc || cc.length !== 2) return '';
  const [first, second] = cc.toUpperCase().split('');
  const base = 0x1F1E6;
  return String.fromCodePoint(base + first.charCodeAt(0) - 65, base + second.charCodeAt(0) - 65);
}

export function injectFlagEmojisForSelect(selectId) {
  const selectEl = document.getElementById(selectId);
  if (!selectEl) return;
  Array.from(selectEl.options).forEach((opt) => {
    if (opt.value === '') {
      const baseText = (opt.textContent || 'Auto Detect').replace(/^🌐\s*/, '').trim() || 'Auto Detect';
      opt.textContent = `🌐 ${baseText}`;
      return;
    }
    let cleanedText = opt.textContent.replace(/^[\uD83C-\uDBFF\uDC00-\uDFFF]{2}\s*/, '');
    if (cleanedText.startsWith('🌐 ')) cleanedText = cleanedText.slice(2);
    const countryCode = langToCountry[opt.value] || langToCountry[cleanedText] || opt.value.split('-')[0];
    const flag = countryCodeToFlagEmoji(countryCode);
    opt.textContent = flag ? `${flag} ${cleanedText}` : cleanedText;
  });
}

