/**
 * Browser embed: <yuppay-button> custom element.
 *
 * Usage on a static site:
 *
 *   <script type="module" src="https://unpkg.com/@yuppay/sdk/dist/browser-button.js"></script>
 *   <yuppay-button
 *      pay-url="https://www.yupland.io/pay/i/abcdef..."
 *      pay-tg-url="https://t.me/Yup_Ai_bot?startapp=i_abcdef..."
 *      label="Оплатить через YupPay">
 *   </yuppay-button>
 *
 * The element does NOT call the YupPay API — invoices must be created on
 * the merchant's server (so the API key never leaves the backend). This
 * embed only renders the button and opens the right link (Telegram inside
 * tg WebApp, browser elsewhere).
 */

declare global {
  interface Window {
    Telegram?: {
      WebApp?: {
        openTelegramLink?: (url: string) => void;
        openLink?: (url: string) => void;
      };
    };
  }
}

const STYLE = `
:host {
  display: inline-block;
  font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
}
button {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 10px 18px;
  border: 0;
  border-radius: 10px;
  background: linear-gradient(135deg, #6c5ce7, #00b894);
  color: #fff;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  transition: transform .08s ease, box-shadow .15s ease, opacity .15s ease;
  box-shadow: 0 1px 2px rgba(0,0,0,.08), 0 4px 16px rgba(108,92,231,.25);
}
button:hover { transform: translateY(-1px); box-shadow: 0 2px 4px rgba(0,0,0,.12), 0 6px 22px rgba(108,92,231,.35); }
button:active { transform: translateY(0); }
button:disabled { opacity: .55; cursor: not-allowed; }
.dot { width: 8px; height: 8px; border-radius: 50%; background: #fff; opacity: .9; }
`;

function isInTelegramWebApp(): boolean {
  return typeof window !== 'undefined' && !!window.Telegram?.WebApp;
}

class YupPayButton extends HTMLElement {
  static get observedAttributes(): string[] {
    return ['pay-url', 'pay-tg-url', 'label', 'disabled'];
  }

  private btn!: HTMLButtonElement;

  connectedCallback(): void {
    if (this.shadowRoot) return;
    const root = this.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = STYLE;
    const btn = document.createElement('button');
    btn.type = 'button';
    const dot = document.createElement('span');
    dot.className = 'dot';
    const label = document.createElement('span');
    label.textContent = this.getAttribute('label') ?? 'Pay with YupPay';
    btn.append(dot, label);
    root.append(style, btn);
    this.btn = btn;
    this.btn.addEventListener('click', this.handleClick);
    this.syncDisabled();
  }

  disconnectedCallback(): void {
    this.btn?.removeEventListener('click', this.handleClick);
  }

  attributeChangedCallback(name: string): void {
    if (!this.shadowRoot) return;
    if (name === 'label') {
      const span = this.shadowRoot.querySelector('span:not(.dot)');
      if (span) span.textContent = this.getAttribute('label') ?? 'Pay with YupPay';
    }
    if (name === 'disabled' || name === 'pay-url' || name === 'pay-tg-url') {
      this.syncDisabled();
    }
  }

  private syncDisabled(): void {
    if (!this.btn) return;
    const explicitlyDisabled = this.hasAttribute('disabled');
    const noUrl = !this.getAttribute('pay-url') && !this.getAttribute('pay-tg-url');
    this.btn.disabled = explicitlyDisabled || noUrl;
  }

  private handleClick = (): void => {
    const payUrl = this.getAttribute('pay-url') ?? '';
    const tgUrl = this.getAttribute('pay-tg-url') ?? '';
    const inTg = isInTelegramWebApp();

    if (inTg && tgUrl && window.Telegram?.WebApp?.openTelegramLink) {
      window.Telegram.WebApp.openTelegramLink(tgUrl);
      this.emit('yuppay:open', { url: tgUrl, channel: 'telegram' });
      return;
    }
    const target = payUrl || tgUrl;
    if (!target) {
      this.emit('yuppay:error', { reason: 'no-url' });
      return;
    }
    if (inTg && window.Telegram?.WebApp?.openLink) {
      window.Telegram.WebApp.openLink(target);
    } else {
      window.open(target, '_blank', 'noopener,noreferrer');
    }
    this.emit('yuppay:open', { url: target, channel: 'browser' });
  };

  private emit(name: string, detail: Record<string, unknown>): void {
    this.dispatchEvent(new CustomEvent(name, { detail, bubbles: true, composed: true }));
  }
}

if (typeof window !== 'undefined' && typeof customElements !== 'undefined') {
  if (!customElements.get('yuppay-button')) {
    customElements.define('yuppay-button', YupPayButton);
  }
}

export { YupPayButton };
