import { useState, useEffect, useRef } from 'react';
import styles from './DebugPanel.module.css';
import type { TFunction } from '../i18n';

interface DebugPanelProps {
  logs: string[];
  t: TFunction;
}

export function DebugPanel({ logs, t }: DebugPanelProps) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs, open]);

  const copy = () => {
    navigator.clipboard.writeText(logs.join('\n')).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className={styles.root}>
      <button className={styles.toggle} onClick={() => setOpen((o) => !o)}>
        {open ? `▼ ${t('debug.hide')}` : `▲ ${t('debug.show')}`}
        {!open && logs.length > 0 && <span className={styles.badge}>{logs.length}</span>}
      </button>
      {open && (
        <div className={styles.panel}>
          <div className={styles.toolbar}>
            <span className={styles.count}>{t('debug.entries', { count: logs.length })}</span>
            <button className={styles.copyBtn} onClick={copy}>
              {copied ? `✅ ${t('debug.copied')}` : `📋 ${t('debug.copy')}`}
            </button>
          </div>
          <div className={styles.logArea}>
            {logs.map((l, i) => <div key={i} className={styles.line}>{l}</div>)}
            <div ref={bottomRef} />
          </div>
        </div>
      )}
    </div>
  );
}
