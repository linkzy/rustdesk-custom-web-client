import { useEffect, useState } from 'react';
import type { ConnectionStats } from '../hooks/useGateway';
import type { TFunction } from '../i18n';
import styles from './StatsOverlay.module.css';

interface StatsOverlayProps {
  stats: ConnectionStats;
  t: TFunction;
}

// Color-code a value: green = good, yellow = warn, red = bad
function color(value: number, warn: number, bad: number): string {
  if (value >= bad) return styles.bad;
  if (value >= warn) return styles.warn;
  return styles.good;
}

export function StatsOverlay({ stats, t }: StatsOverlayProps) {
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

  const dash = t('stats.noValue');

  return (
    <div className={styles.overlay}>
      <div className={styles.row}>
        <span className={styles.label}>{t('stats.gwFps')}</span>
        <span className={`${styles.value} ${color(30 - stats.gwFps, 15, 25)}`}>
          {stats.gwFps > 0 ? stats.gwFps : dash}
        </span>
      </div>
      <div className={styles.row}>
        <span className={styles.label}>{t('stats.fps')}</span>
        <span className={`${styles.value} ${color(30 - stats.fps, 15, 25)}`}>
          {stats.fps > 0 ? stats.fps : dash}
        </span>
      </div>
      <div className={styles.row}>
        <span className={styles.label}>{t('stats.frameDelta')}</span>
        <span className={`${styles.value} ${stats.frameIntervalMs > 0 ? color(stats.frameIntervalMs, 100, 250) : ''}`}>
          {stats.frameIntervalMs > 0 ? `${stats.frameIntervalMs}ms` : dash}
        </span>
      </div>
      <div className={styles.row}>
        <span className={styles.label}>{t('stats.decode')}</span>
        <span className={`${styles.value} ${stats.decodeTimeMs > 0 ? color(stats.decodeTimeMs, 20, 50) : ''}`}>
          {stats.decodeTimeMs > 0 ? `${stats.decodeTimeMs}ms` : dash}
        </span>
      </div>
      <div className={styles.row}>
        <span className={styles.label}>{t('stats.ping')}</span>
        <span className={`${styles.value} ${stats.pingMs !== null ? color(stats.pingMs, 150, 400) : ''}`}>
          {stats.pingMs !== null ? `${stats.pingMs}ms` : dash}
        </span>
      </div>
      <div className={styles.row}>
        <span className={styles.label}>{t('stats.lastFrame')}</span>
        <span className={`${styles.value} ${msSinceFrame > 0 ? color(msSinceFrame, 500, 2000) : ''}`}>
          {msSinceFrame > 0 ? t('stats.msAgo', { value: msSinceFrame }) : dash}
        </span>
      </div>
    </div>
  );
}
