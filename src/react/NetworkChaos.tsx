import { type NetworkChaosProps, summary, useActivation, useChaosState } from './shared';

/**
 * Web: installs interception and shows a small badge while active. A DOM panel comes in v0.2;
 * until then drive it with `chaos.*` from your own dev menu or the console.
 */
export function NetworkChaos(props: NetworkChaosProps) {
  useActivation(props);
  return (
    <>
      {props.children}
      {props.enabled && <Badge />}
    </>
  );
}

function Badge() {
  const state = useChaosState();
  return (
    <div
      role="status"
      style={{
        position: 'fixed',
        left: 12,
        bottom: 12,
        zIndex: 2147483647,
        padding: '4px 10px',
        borderRadius: 999,
        font: '600 12px system-ui, sans-serif',
        color: '#fff',
        background: state.on ? '#d93025' : '#5f6368',
        pointerEvents: 'none',
      }}
    >
      {`⚡ network chaos: ${summary(state)}`}
    </div>
  );
}
