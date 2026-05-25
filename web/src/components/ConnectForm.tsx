import { useState, useEffect, useRef } from 'react';
import styles from './ConnectForm.module.css';

const LS_ID_KEY      = 'rclient_target_id';
const LS_PW_KEY      = 'rclient_password';
const LS_HBBS_KEY    = 'rclient_hbbs_host';
const LS_HBBR_KEY    = 'rclient_hbbr_host';
const LS_SRVKEY_KEY  = 'rclient_server_key';
const LS_ADV_KEY     = 'rclient_advanced_open';

export interface ServerConfig {
  hbbsHost?: string;
  hbbsPort?: string;
  hbbrHost?: string;
  hbbrPort?: string;
  serverKey?: string;
}

interface GatewayConfig {
  captchaEnabled: boolean;
  hcaptchaSiteKey: string;
}

// Augment window for hCaptcha
declare global {
  interface Window {
    hcaptcha?: {
      render: (id: string, opts: { sitekey: string; callback: (t: string) => void; 'expired-callback': () => void }) => void;
      reset: (id?: string) => void;
    };
    onHcaptchaLoad?: () => void;
  }
}

interface ConnectFormProps {
  onConnect: (targetId: string, password: string, serverConfig?: ServerConfig, captchaToken?: string) => void;
  onDisconnect: () => void;
  status: 'idle' | 'connecting' | 'connected' | 'error' | 'disconnected';
  error: string | null;
}

export function ConnectForm({ onConnect, onDisconnect, status, error }: ConnectFormProps) {
  const [targetId, setTargetId]   = useState(() => localStorage.getItem(LS_ID_KEY)   ?? '');
  const [password, setPassword]   = useState(() => localStorage.getItem(LS_PW_KEY)   ?? '');
  const [hbbsHost, setHbbsHost]   = useState(() => localStorage.getItem(LS_HBBS_KEY) ?? '');
  const [hbbrHost, setHbbrHost]   = useState(() => localStorage.getItem(LS_HBBR_KEY) ?? '');
  const [serverKey, setServerKey] = useState(() => localStorage.getItem(LS_SRVKEY_KEY) ?? '');
  const [advOpen, setAdvOpen]     = useState(() => localStorage.getItem(LS_ADV_KEY) === 'true');

  const [gwConfig, setGwConfig]       = useState<GatewayConfig | null>(null);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const captchaRendered = useRef(false);

  const save = (key: string, val: string) => localStorage.setItem(key, val);

  // Fetch gateway config (captcha settings) on mount
  useEffect(() => {
    fetch('/config')
      .then((r) => r.json())
      .then((cfg: GatewayConfig) => setGwConfig(cfg))
      .catch(() => setGwConfig({ captchaEnabled: false, hcaptchaSiteKey: '' }));
  }, []);

  // Load hCaptcha script and render widget once config is known
  useEffect(() => {
    if (!gwConfig?.captchaEnabled || !gwConfig.hcaptchaSiteKey || captchaRendered.current) return;
    captchaRendered.current = true;

    const render = () => {
      window.hcaptcha?.render('hcaptcha-widget', {
        sitekey: gwConfig.hcaptchaSiteKey,
        callback: (token: string) => setCaptchaToken(token),
        'expired-callback': () => setCaptchaToken(null),
      });
    };

    if (window.hcaptcha) {
      render();
    } else {
      window.onHcaptchaLoad = render;
      const script = document.createElement('script');
      script.src = 'https://js.hcaptcha.com/1/api.js?onload=onHcaptchaLoad&render=explicit';
      script.async = true;
      document.head.appendChild(script);
    }
  }, [gwConfig]);

  // Reset captcha after each connection attempt
  useEffect(() => {
    if ((status === 'error' || status === 'disconnected') && gwConfig?.captchaEnabled) {
      window.hcaptcha?.reset();
      setCaptchaToken(null);
    }
  }, [status, gwConfig]);

  const toggleAdv = () => {
    const next = !advOpen;
    setAdvOpen(next);
    localStorage.setItem(LS_ADV_KEY, String(next));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetId.trim()) return;
    const cfg: ServerConfig = {};
    if (hbbsHost.trim())  cfg.hbbsHost  = hbbsHost.trim();
    if (hbbrHost.trim())  cfg.hbbrHost  = hbbrHost.trim();
    if (serverKey.trim()) cfg.serverKey = serverKey.trim();
    onConnect(
      targetId.trim(),
      password,
      Object.keys(cfg).length ? cfg : undefined,
      captchaToken ?? undefined,
    );
  };

  const isConnected  = status === 'connected';
  const isConnecting = status === 'connecting';
  const captchaRequired = gwConfig?.captchaEnabled && !captchaToken;
  const connectDisabled = isConnecting || !targetId.trim() || !!captchaRequired;

  return (
    <div className={styles.container}>
      <div className={styles.logo}>
        <span className={styles.logoIcon}>🖥️</span>
        <h1 className={styles.title}>rclient</h1>
        <p className={styles.subtitle}>RustDesk Web Client</p>
      </div>

      {!isConnected ? (
        <form className={styles.form} onSubmit={handleSubmit}>
          <div className={styles.field}>
            <label className={styles.label}>Device ID</label>
            <input
              className={styles.input}
              type="text"
              placeholder="Enter RustDesk ID"
              value={targetId}
              onChange={(e) => { setTargetId(e.target.value); save(LS_ID_KEY, e.target.value); }}
              disabled={isConnecting}
              autoFocus
            />
          </div>
          <div className={styles.field}>
            <label className={styles.label}>Password</label>
            <input
              className={styles.input}
              type="password"
              placeholder="Connection password"
              value={password}
              onChange={(e) => { setPassword(e.target.value); save(LS_PW_KEY, e.target.value); }}
              disabled={isConnecting}
            />
          </div>

          {/* Advanced options */}
          <button type="button" className={styles.advancedToggle} onClick={toggleAdv}>
            <span>{advOpen ? '▾' : '▸'}</span> Advanced options
          </button>
          {advOpen && (
            <div className={styles.advancedSection}>
              <p className={styles.advancedHint}>
                Override the server defaults. Leave blank to use the gateway's built-in server.
              </p>
              <div className={styles.field}>
                <label className={styles.label}>HBBS Host (rendezvous)</label>
                <input
                  className={styles.input}
                  type="text"
                  placeholder="e.g. myserver.com:21118"
                  value={hbbsHost}
                  onChange={(e) => { setHbbsHost(e.target.value); save(LS_HBBS_KEY, e.target.value); }}
                  disabled={isConnecting}
                />
              </div>
              <div className={styles.field}>
                <label className={styles.label}>HBBR Host (relay)</label>
                <input
                  className={styles.input}
                  type="text"
                  placeholder="e.g. myserver.com:21119"
                  value={hbbrHost}
                  onChange={(e) => { setHbbrHost(e.target.value); save(LS_HBBR_KEY, e.target.value); }}
                  disabled={isConnecting}
                />
              </div>
              <div className={styles.field}>
                <label className={styles.label}>Server Key</label>
                <input
                  className={styles.input}
                  type="text"
                  placeholder="base64 public key"
                  value={serverKey}
                  onChange={(e) => { setServerKey(e.target.value); save(LS_SRVKEY_KEY, e.target.value); }}
                  disabled={isConnecting}
                />
              </div>
            </div>
          )}

          {/* hCaptcha widget — only rendered when CAPTCHA_ENABLED=true on gateway */}
          {gwConfig?.captchaEnabled && (
            <div id="hcaptcha-widget" className={styles.captchaWidget} />
          )}

          <button
            className={styles.button}
            type="submit"
            disabled={connectDisabled}
          >
            {isConnecting ? (
              <><span className={styles.spinner} /> Connecting…</>
            ) : (
              'Connect'
            )}
          </button>
          {(status === 'error' || status === 'disconnected') && (
            <div className={styles.statusBadge} data-status={status}>
              {status === 'error' ? `❌ ${error ?? 'Connection failed'}` : '⚠️ Disconnected'}
            </div>
          )}
        </form>
      ) : (
        <div className={styles.connectedPanel}>
          <div className={styles.statusBadge} data-status="connected">✅ Connected</div>
          <button className={`${styles.button} ${styles.disconnectButton}`} onClick={onDisconnect}>
            Disconnect
          </button>
        </div>
      )}
    </div>
  );
}
