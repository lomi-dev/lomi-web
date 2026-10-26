import type { Landing } from '../../content/landing-schema';

/** Each mounted signup owns its listeners and any in-flight request. */
export class NewsletterSignupElement extends HTMLElement {
  private cleanup?: () => void;

  connectedCallback() {
    if (this.cleanup) return;
    const form = this.querySelector<HTMLFormElement>('#newsletter-form');
    const newsletter = this.querySelector<HTMLElement>('.newsletter');
    const emailInput = this.querySelector<HTMLInputElement>('#newsletter-email');
    const submitButton = form?.querySelector<HTMLButtonElement>('button[type="submit"]');
    const submitLabel = submitButton?.querySelector<HTMLElement>('[data-submit-label]');
    const status = this.querySelector<HTMLElement>('#newsletter-status');
    if (!form || !newsletter || !emailInput || !submitButton || !submitLabel || !status) return;

    const endpoint = form.dataset.endpoint;
    const copy = JSON.parse(form.dataset.copy || '{}') as Landing['newsletter']['form'];
    const lifecycle = new AbortController();
    let request: AbortController | undefined;
    const setState = (state: 'idle' | 'pending' | 'success' | 'error', message = '') => {
      if (lifecycle.signal.aborted || !this.isConnected) return;
      newsletter.dataset.state = state;
      status.dataset.state = state;
      status.textContent = message;
      form.setAttribute('aria-busy', String(state === 'pending'));
      emailInput.disabled = false;
      emailInput.readOnly = state === 'pending';
      submitButton.disabled = state === 'pending';
      submitLabel.textContent = state === 'pending' ? copy.pendingLabel : state === 'success' ? copy.successLabel : copy.submitLabel;
    };

    emailInput.addEventListener('input', () => {
      if (endpoint && newsletter.dataset.state !== 'pending') setState('idle');
    }, { signal: lifecycle.signal });
    form.addEventListener('submit', async event => {
      event.preventDefault();
      if (submitButton.disabled || !form.reportValidity() || !endpoint) return;
      const email = emailInput.value.trim();
      setState('pending', copy.pendingMessage);
      const current = request = new AbortController();
      try {
        const response = await fetch(endpoint, {
          method: 'POST',
          credentials: 'omit',
          redirect: 'error',
          signal: AbortSignal.any([AbortSignal.timeout(10000), current.signal]),
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email }),
        });
        if (lifecycle.signal.aborted) return;
        if (response.status === 429) { setState('error', copy.rateLimitMessage); return; }
        if (response.status !== 202 || (await response.json()).accepted !== true) throw new Error('Signup request unavailable');
        if (lifecycle.signal.aborted) return;
        form.reset();
        setState('success', copy.successMessage);
      } catch {
        if (!lifecycle.signal.aborted) setState('error', copy.errorMessage);
      } finally {
        if (request === current) request = undefined;
      }
    }, { signal: lifecycle.signal });
    this.cleanup = () => { lifecycle.abort(); request?.abort(); };
    if (endpoint) setState('idle');
  }

  disconnectedCallback() { this.cleanup?.(); this.cleanup = undefined; }
}
