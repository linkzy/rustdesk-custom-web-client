import { useGateway } from './hooks/useGateway';
import { ConnectForm } from './components/ConnectForm';
import { RemoteScreen } from './components/RemoteScreen';
import { DebugPanel } from './components/DebugPanel';
import { StatsOverlay } from './components/StatsOverlay';
import styles from './App.module.css';

function App() {
  const [state, controls] = useGateway();
  const isConnected = state.status === 'connected';

  return (
    <div className={styles.app}>
      {isConnected ? (
        <>
          <div className={styles.toolbar}>
            <span className={styles.toolbarTitle}>rclient</span>
            <span className={styles.toolbarInfo}>
              {state.remoteWidth}×{state.remoteHeight} · {state.codec?.toUpperCase()}
            </span>
            <button className={styles.disconnectBtn} onClick={controls.disconnect}>
              Disconnect
            </button>
          </div>
          <div className={styles.screen}>
            <RemoteScreen state={state} controls={controls} onLog={controls.addLog} />
          </div>
          <StatsOverlay stats={state.stats} />
        </>
      ) : (
        <ConnectForm
          onConnect={controls.connect}
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
