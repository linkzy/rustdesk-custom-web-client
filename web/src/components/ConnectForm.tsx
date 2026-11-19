import { useState, useEffect, useRef } from 'react';
import styles from './ConnectForm.module.css';
import {
  loadPasswordState,
  setRememberPasswordEnabled,
  dropPasswordIfNotOptedIn,
  stagePasswordAttempt,
} from '../utils/passwordStorage';
import { friendlyError } from '../utils/errors';
import {
  LS_ID_KEY,
  LS_HBBS_KEY,
  LS_HBBR_KEY,
  LS_SRVKEY_KEY,
  LS_ADV_KEY,
  LS_DEBUG_KEY,
  normalizeServerConfig,
} from '../utils/connectForm';
import type { ServerConfig } from '../utils/connectForm';

export type { ServerConfig };

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
  showDebug: boolean;
  onShowDebugChange: (v: boolean) => void;
}

export function ConnectForm({ onConnect, onDisconnect, status, error, showDebug, onShowDebugChange }: ConnectFormProps) {
  const [targetId, setTargetId]   = useState(() => localStorage.getItem(LS_ID_KEY)   ?? '');
  // The password is only read back from localStorage when the user opted in with
  // "Remember password"; the preference itself is remembered across visits.
  const [initialPassword] = useState(loadPasswordState);
  const [rememberPassword, setRememberPassword] = useState(initialPassword.remember);
  const [password, setPassword]   = useState(initialPassword.password);
  const [hbbsHost, setHbbsHost]   = useState(() => localStorage.getItem(LS_HBBS_KEY) ?? '');
  const [hbbrHost, setHbbrHost]   = useState(() => localStorage.getItem(LS_HBBR_KEY) ?? '');
  const [serverKey, setServerKey] = useState(() => localStorage.getItem(LS_SRVKEY_KEY) ?? '');
  const [advOpen, setAdvOpen]     = useState(() => localStorage.getItem(LS_ADV_KEY) === 'true');

  const [gwConfig, setGwConfig]       = useState<GatewayConfig | null>(null);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const captchaRendered = useRef(false);

  const save = (key: string, val: string) => localStorage.setItem(key, val);

  // Drop any password left behind by an earlier version (or a previous opt-in)
  // when this browser is not opted in.
  useEffect(() => {
    dropPasswordIfNotOptedIn();
  }, []);

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

  const toggleRemember = () => {
    const next = !rememberPassword;
    setRememberPassword(next);
    // Opting out forgets any saved password right away; opting in only takes
    // effect on the next successful connection.
    setRememberPasswordEnabled(next);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetId.trim()) return;
    const cfg = normalizeServerConfig({ hbbsHost, hbbrHost, serverKey });
    // Nothing is written to localStorage here — the password is only persisted
    // once the connection has actually succeeded (see App.tsx).
    stagePasswordAttempt(password);
    onConnect(targetId.trim(), password, cfg, captchaToken ?? undefined);
  };

  const isConnected  = status === 'connected';
  const isConnecting = status === 'connecting';
  const captchaRequired = gwConfig?.captchaEnabled && !captchaToken;
  const connectDisabled = isConnecting || !targetId.trim() || !!captchaRequired;
  // The raw error stays in the Debug Panel; the form gets a short sentence and a
  // next step instead of RustDesk's own wording.
  const friendly = friendlyError(error);

  return (
    <div className={styles.container}>
      <div className={styles.logo}>
        <span className={styles.logoIcon}>🖥️</span>
        <h1 className={styles.title}>rclient</h1>
        <p className={styles.subtitle}>RustDesk Web Client</p>
      </div>

      {!isConnected ? (
        <form className={styles.form} onSubmit={handleSubmit} aria-label="Connect to a RustDesk machine">
          <div className={styles.field}>
            <label className={styles.label} htmlFor="rclient-device-id">Device ID</label>
            <input
              id="rclient-device-id"
              className={styles.input}
              type="text"
              placeholder="Enter RustDesk ID"
              value={targetId}
              onChange={(e) => { setTargetId(e.target.value); save(LS_ID_KEY, e.target.value); }}
              disabled={isConnecting}
              autoFocus
              autoComplete="off"
              spellCheck={false}
            />
          </div>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="rclient-password">Password</label>
            <input
              id="rclient-password"
              className={styles.input}
              type="password"
              placeholder="Connection password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={isConnecting}
              autoComplete="off"
            />
            <label
              className={styles.checkboxLabel}
              title="Saves the password in this browser's local storage. Leave it unticked on shared computers."
            >
              <input
                type="checkbox"
                className={styles.checkbox}
                checked={rememberPassword}
                onChange={toggleRemember}
                disabled={isConnecting}
              />
              Remember password
            </label>
          </div>

          {/* Advanced options */}
          <button
            type="button"
            className={styles.advancedToggle}
            onClick={toggleAdv}
            aria-expanded={advOpen}
            aria-controls="rclient-advanced"
          >
            <span aria-hidden="true">{advOpen ? '▾' : '▸'}</span> Advanced options
          </button>
          {advOpen && (
            <div className={styles.advancedSection} id="rclient-advanced">
              <p className={styles.advancedHint}>
                Override the server defaults. Leave blank to use the gateway's built-in server.
              </p>
              <div className={styles.field}>
                <label className={styles.label} htmlFor="rclient-hbbs">HBBS Host (rendezvous)</label>
                <input
                  id="rclient-hbbs"
                  className={styles.input}
                  type="text"
                  placeholder="e.g. myserver.com:21118"
                  value={hbbsHost}
                  onChange={(e) => { setHbbsHost(e.target.value); save(LS_HBBS_KEY, e.target.value); }}
                  disabled={isConnecting}
                  autoComplete="off"
                  spellCheck={false}
                />
              </div>
              <div className={styles.field}>
                <label className={styles.label} htmlFor="rclient-hbbr">HBBR Host (relay)</label>
                <input
                  id="rclient-hbbr"
                  className={styles.input}
                  type="text"
                  placeholder="e.g. myserver.com:21119"
                  value={hbbrHost}
                  onChange={(e) => { setHbbrHost(e.target.value); save(LS_HBBR_KEY, e.target.value); }}
                  disabled={isConnecting}
                  autoComplete="off"
                  spellCheck={false}
                />
              </div>
              <div className={styles.field}>
                <label className={styles.label} htmlFor="rclient-server-key">Server Key</label>
                <input
                  id="rclient-server-key"
                  className={styles.input}
                  type="text"
                  placeholder="base64 public key"
                  value={serverKey}
                  onChange={(e) => { setServerKey(e.target.value); save(LS_SRVKEY_KEY, e.target.value); }}
                  disabled={isConnecting}
                />
              </div>
              <label className={styles.checkboxLabel}>
                <input
                  type="checkbox"
                  className={styles.checkbox}
                  checked={showDebug}
                  onChange={(e) => { onShowDebugChange(e.target.checked); save(LS_DEBUG_KEY, String(e.target.checked)); }}
                />
                Show debug info
              </label>
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
            aria-busy={isConnecting}
          >
            {isConnecting ? (
              <><span className={styles.spinner} aria-hidden="true" /> Connecting…</>
            ) : (
              'Connect'
            )}
          </button>
          {(status === 'error' || status === 'disconnected') && (
            <div
              className={styles.statusBadge}
              data-status={status}
              role="alert"
              aria-live="polite"
            >
              {status === 'error' ? (
                <>
                  <span className={styles.errorTitle}>❌ {friendly.title}</span>
                  <span className={styles.errorHint}>{friendly.hint}</span>
                </>
              ) : (
                '⚠️ Disconnected'
              )}
            </div>
          )}
        </form>
      ) : (
        <div className={styles.connectedPanel}>
          <div className={styles.statusBadge} data-status="connected" role="status">✅ Connected</div>
          <button className={`${styles.button} ${styles.disconnectButton}`} onClick={onDisconnect}>
            Disconnect
          </button>
        </div>
      )}
    </div>
  );
}
