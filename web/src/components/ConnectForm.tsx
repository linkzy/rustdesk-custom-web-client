import { useState } from 'react';
import styles from './ConnectForm.module.css';

const LS_ID_KEY  = 'rclient_target_id';
const LS_PW_KEY  = 'rclient_password';

interface ConnectFormProps {
  onConnect: (targetId: string, password: string) => void;
  onDisconnect: () => void;
  status: 'idle' | 'connecting' | 'connected' | 'error' | 'disconnected';
  error: string | null;
}

export function ConnectForm({ onConnect, onDisconnect, status, error }: ConnectFormProps) {
  const [targetId, setTargetId] = useState(() => localStorage.getItem(LS_ID_KEY) ?? '');
  const [password, setPassword] = useState(() => localStorage.getItem(LS_PW_KEY) ?? '');

  const handleIdChange = (v: string) => {
    setTargetId(v);
    localStorage.setItem(LS_ID_KEY, v);
  };

  const handlePasswordChange = (v: string) => {
    setPassword(v);
    localStorage.setItem(LS_PW_KEY, v);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (targetId.trim()) {
      onConnect(targetId.trim(), password);
    }
  };

  const isConnected = status === 'connected';
  const isConnecting = status === 'connecting';

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
              onChange={(e) => handleIdChange(e.target.value)}
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
              onChange={(e) => handlePasswordChange(e.target.value)}
              disabled={isConnecting}
            />
          </div>
          <button
            className={styles.button}
            type="submit"
            disabled={isConnecting || !targetId.trim()}
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
