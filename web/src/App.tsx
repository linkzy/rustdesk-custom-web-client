import { useState, useEffect, useRef, useCallback } from 'react';
import { useGateway } from './hooks/useGateway';
import { ConnectForm } from './components/ConnectForm';
import { RemoteScreen } from './components/RemoteScreen';
import { DebugPanel } from './components/DebugPanel';
import { StatsOverlay } from './components/StatsOverlay';
import { ThemeSelect } from './components/ThemeSelect';
import { LanguageSelect } from './components/LanguageSelect';
import { useTheme } from './utils/theme';
import { useI18n } from './i18n';
import { commitPasswordAfterConnect, discardPasswordAttempt } from './utils/passwordStorage';
import styles from './App.module.css';

function App() {
  const [state, controls] = useGateway();
  const isConnected = state.status === 'connected';
  const appRef = useRef<HTMLDivElement>(null);

  const [showDebug, setShowDebug] = useState<boolean>(() => {
    return localStorage.getItem('rclient_debug_visible') === 'true';
  });

  const [fitToWindow, setFitToWindow] = useState<boolean>(() => {
    return localStorage.getItem('rclient_fit') !== 'false';
  });

  const [isFullscreen, setIsFullscreen] = useState(false);
  const theme = useTheme();
  const { locale, setLocale, t } = useI18n();

  useEffect(() => {
    const onChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  // The password is persisted only after a successful connection, and only
  // when the user ticked "Remember password" in the form.
  useEffect(() => {
    if (state.status === 'connected') commitPasswordAfterConnect();
    else if (state.status === 'error') discardPasswordAttempt();
  }, [state.status]);

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      appRef.current?.requestFullscreen();
    }
  }, []);

  const toggleFit = () => {
    setFitToWindow(prev => {
      const next = !prev;
      localStorage.setItem('rclient_fit', String(next));
      return next;
    });
  };

  return (
    <div className={styles.app} ref={appRef}>
      {isConnected ? (
        <>
          {!isFullscreen && (
            <div className={styles.toolbar} role="toolbar" aria-label={t('toolbar.label')}>
              <span className={styles.toolbarTitle}>rclient</span>
              <span className={styles.toolbarInfo}>
                {state.remoteWidth}×{state.remoteHeight} · {state.codec?.toUpperCase()}
              </span>
              <button
                className={`${styles.toolbarBtn} ${fitToWindow ? styles.toolbarBtnActive : ''}`}
                onClick={toggleFit}
                title={fitToWindow ? t('toolbar.fitTitleOn') : t('toolbar.fitTitleOff')}
                aria-pressed={fitToWindow}
                aria-label={fitToWindow ? t('toolbar.fitAriaOn') : t('toolbar.fitAriaOff')}
              >
                <span aria-hidden="true">{fitToWindow ? `⊡ ${t('toolbar.fit')}` : t('toolbar.native')}</span>
              </button>
              <button
                className={styles.toolbarBtn}
                onClick={toggleFullscreen}
                title={t('toolbar.fullscreen')}
                aria-label={t('toolbar.enterFullscreen')}
              >
                <span aria-hidden="true">⛶ {t('toolbar.fullscreen')}</span>
              </button>
              <LanguageSelect
                className={styles.themeSelect}
                value={locale}
                onChange={setLocale}
                t={t}
              />
              <ThemeSelect
                className={styles.themeSelect}
                value={theme.preference}
                onChange={theme.setPreference}
                t={t}
              />
              <button className={styles.disconnectBtn} onClick={controls.disconnect}>
                {t('toolbar.disconnect')}
              </button>
            </div>
          )}
          <div className={isFullscreen ? styles.screenFullscreen : (fitToWindow ? styles.screenFit : styles.screenNative)}>
            <RemoteScreen state={state} controls={controls} onLog={controls.addLog} fitToWindow={fitToWindow} />
          </div>
          {showDebug && !isFullscreen && <StatsOverlay stats={state.stats} t={t} />}
        </>
      ) : (
        <ConnectForm
          onConnect={(id, pw, cfg, token) => controls.connect(id, pw, cfg, token)}
          onDisconnect={controls.disconnect}
          status={state.status}
          error={state.error}
          showDebug={showDebug}
          onShowDebugChange={setShowDebug}
          theme={theme.preference}
          onThemeChange={theme.setPreference}
          locale={locale}
          onLocaleChange={setLocale}
          t={t}
        />
      )}
      {showDebug && !isFullscreen && <DebugPanel logs={state.logs} t={t} />}
    </div>
  );
}

export default App;
