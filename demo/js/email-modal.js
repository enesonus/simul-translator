export function initEmailModal() {
  const emailModal = document.getElementById('emailModal');
  const emailModalClose = document.getElementById('emailModalClose');
  const emailForm = document.getElementById('emailForm');
  const emailInput = document.getElementById('emailInput');

  const hasSubmittedEmail = localStorage.getItem('emailSubmitted') === 'true';
  if (!hasSubmittedEmail) showEmailModal();

  function showEmailModal() {
    if (!emailModal) return;
    emailModal.classList.remove('hidden');
    emailModal.style.display = '';
    setTimeout(() => { if (emailInput) emailInput.focus(); }, 300);
  }
  function hideEmailModal() {
    if (!emailModal) return;
    emailModal.classList.add('hidden');
    emailModal.style.display = 'none';
  }

  emailModalClose?.addEventListener('click', hideEmailModal);
  emailModal?.addEventListener('click', (e) => {
    const target = e.target;
    if (!target) return;
    if (target === emailModal || (target.classList && target.classList.contains('email-modal-overlay'))) {
      hideEmailModal();
    }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && emailModal && !emailModal.classList.contains('hidden')) hideEmailModal();
  });

  emailForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = emailInput?.value.trim();
    if (!email) return;
    const submitBtn = emailForm.querySelector('.email-submit-btn');
    const originalText = submitBtn ? submitBtn.textContent : '';
    if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Subscribing...'; }
    try {
      await fetch('/api/email/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      }).then((r) => {
        if (!r.ok) return r.json().then((e) => { throw new Error(e.error || `HTTP ${r.status}`); });
        return r.json();
      });
      const existing = emailForm.querySelector('.email-success-message, .email-error-message');
      if (existing) existing.remove();
      const success = document.createElement('div');
      success.className = 'email-success-message';
      success.textContent = "🎉 Thanks for subscribing! You'll hear from us soon.";
      emailForm.appendChild(success);
      localStorage.setItem('emailSubmitted', 'true');
      setTimeout(() => hideEmailModal(), 2000);
    } catch (err) {
      console.error('Email submission failed:', err);
      if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = originalText; }
      const existing = emailForm.querySelector('.email-success-message, .email-error-message');
      if (existing) existing.remove();
      const error = document.createElement('div');
      error.className = 'email-error-message';
      error.textContent = '❌ Something went wrong. Please try again.';
      Object.assign(error.style, {
        textAlign: 'center', color: '#ef4444', fontSize: '16px', fontWeight: '500', marginTop: '16px', padding: '12px',
        background: 'rgba(239, 68, 68, 0.1)', borderRadius: '12px', border: '1px solid rgba(239, 68, 68, 0.3)'
      });
      emailForm.appendChild(error);
    }
  });
}

