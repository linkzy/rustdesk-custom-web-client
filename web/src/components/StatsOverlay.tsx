import { useEffect, useState } from 'react';
import type { ConnectionStats } from '../hooks/useGateway';
import styles from './StatsOverlay.module.css';

interface StatsOverlayProps {
  stats: ConnectionStats;
}

// Color-code a value: green = good, yellow = warn, red = bad
function color(value: number, warn: number, bad: number): string {
  if (value >= bad) return styles.bad;
  if (value >= warn) return styles.warn;
  return styles.good;
}

export function StatsOverlay({ stats }: StatsOverlayProps) {
  // Live "ms since last frame" — updates every 500ms independently of stats state
  const [msSinceFrame, setMsSinceFrame] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      setMsSinceFrame(
        stats.lastFrameAt > 0 ? Math.round(performance.now() - stats.lastFrameAt) : 0
      );
    }, 500);
    return () => clearInterval(id);
  }, [stats.lastFrameAt]);

  const fmt = (n: number, unit: string) => `${n}${unit}`;

  return (
    <div className={styles.overlay}>
      <div className={styles.row}>
        <span className={styles.label}>FPS</span>
        <span className={`${styles.value} ${color(30 - stats.fps, 15, 25)}`}>
          {stats.fps > 0 ? stats.fps : '—'}
        </span>
      </div>
      <div className={styles.row}>
        <span className={styles.label}>Frame Δ</span>
        <span className={`${styles.value} ${stats.frameIntervalMs > 0 ? color(stats.frameIntervalMs, 100, 250) : ''}`}>
          {stats.frameIntervalMs > 0 ? fmt(stats.frameIntervalMs, 'ms') : '—'}
        </span>
      </div>
      <div className={styles.row}>
        <span className={styles.label}>Decode</span>
        <span className={`${styles.value} ${stats.decodeTimeMs > 0 ? color(stats.decodeTimeMs, 20, 50) : ''}`}>
          {stats.decodeTimeMs > 0 ? fmt(stats.decodeTimeMs, 'ms') : '—'}
        </span>
      </div>
      <div className={styles.row}>
        <span className={styles.label}>Ping</span>
        <span className={`${styles.value} ${stats.pingMs !== null ? color(stats.pingMs, 150, 400) : ''}`}>
          {stats.pingMs !== null ? fmt(stats.pingMs, 'ms') : '—'}
        </span>
      </div>
      <div className={styles.row}>
        <span className={styles.label}>Last frame</span>
        <span className={`${styles.value} ${msSinceFrame > 0 ? color(msSinceFrame, 500, 2000) : ''}`}>
          {msSinceFrame > 0 ? fmt(msSinceFrame, 'ms ago') : '—'}
        </span>
      </div>
    </div>
  );
}
