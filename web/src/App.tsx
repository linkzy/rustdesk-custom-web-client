import { useState } from 'react';
import { useGateway } from './hooks/useGateway';
import { ConnectForm } from './components/ConnectForm';
import { RemoteScreen } from './components/RemoteScreen';
import { DebugPanel } from './components/DebugPanel';
import { StatsOverlay } from './components/StatsOverlay';
import styles from './App.module.css';

function App() {
  const [state, controls] = useGateway();
  const isConnected = state.status === 'connected';

  const [fitToWindow, setFitToWindow] = useState<boolean>(() => {
    return localStorage.getItem('rclient_fit') !== 'false';
  });

  const toggleFit = () => {
    setFitToWindow(prev => {
      const next = !prev;
      localStorage.setItem('rclient_fit', String(next));
      return next;
    });
  };

  return (
    <div className={styles.app}>
      {isConnected ? (
        <>
          <div className={styles.toolbar}>
            <span className={styles.toolbarTitle}>rclient</span>
            <span className={styles.toolbarInfo}>
              {state.remoteWidth}×{state.remoteHeight} · {state.codec?.toUpperCase()}
            </span>
            <button
              className={`${styles.toolbarBtn} ${fitToWindow ? styles.toolbarBtnActive : ''}`}
              onClick={toggleFit}
              title={fitToWindow ? 'Switch to 1:1 (native resolution)' : 'Switch to Fit (scale to window)'}
            >
              {fitToWindow ? '⊡ Fit' : '1:1'}
            </button>
            <button className={styles.disconnectBtn} onClick={controls.disconnect}>
              Disconnect
            </button>
          </div>
          <div className={fitToWindow ? styles.screenFit : styles.screenNative}>
            <RemoteScreen state={state} controls={controls} onLog={controls.addLog} fitToWindow={fitToWindow} />
          </div>
          <StatsOverlay stats={state.stats} />
        </>
      ) : (
        <ConnectForm
          onConnect={(id, pw, cfg, token) => controls.connect(id, pw, cfg, token)}
          onDisconnect={controls.disconnect}
          status={state.status}
          error={state.error}
        />
      )}
      <DebugPanel logs={state.logs} />
    </div>
  );
}

export default App;
