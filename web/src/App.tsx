import { useState, useEffect, useRef, useCallback } from 'react';
import { useGateway } from './hooks/useGateway';
import { ConnectForm } from './components/ConnectForm';
import { RemoteScreen } from './components/RemoteScreen';
import { DebugPanel } from './components/DebugPanel';
import { StatsOverlay } from './components/StatsOverlay';
import { ThemeSelect } from './components/ThemeSelect';
import { useTheme } from './utils/theme';
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
            <div className={styles.toolbar} role="toolbar" aria-label="Session controls">
              <span className={styles.toolbarTitle}>rclient</span>
              <span className={styles.toolbarInfo}>
                {state.remoteWidth}×{state.remoteHeight} · {state.codec?.toUpperCase()}
              </span>
              <button
                className={`${styles.toolbarBtn} ${fitToWindow ? styles.toolbarBtnActive : ''}`}
                onClick={toggleFit}
                title={fitToWindow ? 'Switch to 1:1 (native resolution)' : 'Switch to Fit (scale to window)'}
                aria-pressed={fitToWindow}
                aria-label={fitToWindow ? 'Fit to window, on' : 'Fit to window, off'}
              >
                <span aria-hidden="true">{fitToWindow ? '⊡ Fit' : '1:1'}</span>
              </button>
              <button
                className={styles.toolbarBtn}
                onClick={toggleFullscreen}
                title="Fullscreen"
                aria-label="Enter fullscreen"
              >
                <span aria-hidden="true">⛶ Fullscreen</span>
              </button>
              <ThemeSelect
                className={styles.themeSelect}
                value={theme.preference}
                onChange={theme.setPreference}
              />
              <button className={styles.disconnectBtn} onClick={controls.disconnect}>
                Disconnect
              </button>
            </div>
          )}
          <div className={isFullscreen ? styles.screenFullscreen : (fitToWindow ? styles.screenFit : styles.screenNative)}>
            <RemoteScreen state={state} controls={controls} onLog={controls.addLog} fitToWindow={fitToWindow} />
          </div>
          {showDebug && !isFullscreen && <StatsOverlay stats={state.stats} />}
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
        />
      )}
      {showDebug && !isFullscreen && <DebugPanel logs={state.logs} />}
    </div>
  );
}

export default App;
