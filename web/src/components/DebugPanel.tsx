import { useState, useRef, useEffect } from 'react';
import styles from './DebugPanel.module.css';

interface DebugPanelProps {
  logs: string[];
}

export function DebugPanel({ logs }: DebugPanelProps) {
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
        {open ? '▼ Hide logs' : '▲ Debug logs'}
        {!open && logs.length > 0 && <span className={styles.badge}>{logs.length}</span>}
      </button>
      {open && (
        <div className={styles.panel}>
          <div className={styles.toolbar}>
            <span className={styles.count}>{logs.length} entries</span>
            <button className={styles.copyBtn} onClick={copy}>
              {copied ? '✅ Copied!' : '📋 Copy all'}
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
