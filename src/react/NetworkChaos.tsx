import { type CSSProperties, useState } from 'react';
import { chaos } from '../chaos';
import type { PresetName } from '../core/presets';
import {
  describeRule,
  endpointMatch,
  type NetworkChaosProps,
  QUICK_ACTIONS,
  summary,
  useActivation,
  useChaosLog,
  useChaosState,
} from './shared';

/** Web: installs interception and shows a badge; click it for the panel. */
export function NetworkChaos(props: NetworkChaosProps) {
  useActivation(props);
  return (
    <>
      {props.children}
      {props.enabled && props.badge !== false && <WebDock />}
    </>
  );
}

const font = '13px system-ui, sans-serif';

function WebDock() {
  const state = useChaosState();
  return (
    <>
      <button
        type="button"
        aria-expanded={state.open}
        onClick={() => (state.open ? chaos.close() : chaos.open())}
        style={{
          position: 'fixed',
          left: 12,
          bottom: 12,
          zIndex: 2147483647,
          padding: '6px 12px',
          border: 0,
          borderRadius: 999,
          font: `600 12px system-ui, sans-serif`,
          color: '#fff',
          background: state.on ? '#d93025' : '#5f6368',
          cursor: 'pointer',
        }}
      >
        {`⚡ network chaos: ${summary(state)}`}
      </button>
      {state.open && <WebPanel />}
    </>
  );
}

const PRESET_OPTIONS: (PresetName | null)[] = [null, '3g', 'slow-3g', 'flaky', 'offline'];

const chip = (on = false): CSSProperties => ({
  padding: '4px 10px',
  borderRadius: 999,
  border: `1px solid ${on ? '#1a73e8' : '#dadce0'}`,
  background: on ? '#1a73e8' : '#fff',
  color: on ? '#fff' : '#202124',
  font,
  cursor: 'pointer',
});

function WebPanel() {
  const state = useChaosState();
  const log = useChaosLog();
  const [selected, setSelected] = useState<number | null>(null);
  return (
    <section
      aria-label="Network chaos"
      style={{
        position: 'fixed',
        left: 12,
        bottom: 52,
        zIndex: 2147483647,
        width: 380,
        maxWidth: 'calc(100vw - 24px)',
        maxHeight: '70vh',
        overflow: 'auto',
        padding: 16,
        borderRadius: 12,
        background: '#fff',
        color: '#202124',
        boxShadow: '0 8px 32px rgba(0,0,0,.24)',
        font,
      }}
    >
      <label style={{ display: 'flex', justifyContent: 'space-between' }}>
        Chaos on
        <input type="checkbox" checked={state.on} onChange={(e) => chaos.setOn(e.target.checked)} />
      </label>
      <label style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
        Offline
        <input
          type="checkbox"
          checked={state.offline}
          onChange={(e) => chaos.setOffline(e.target.checked)}
        />
      </label>

      <h3 style={{ font: `600 ${font}`, margin: '16px 0 8px' }}>Preset</h3>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {PRESET_OPTIONS.map((name) => (
          <button
            key={name ?? 'none'}
            type="button"
            aria-pressed={state.preset === name}
            onClick={() => chaos.preset(name)}
            style={chip(state.preset === name)}
          >
            {name ?? 'none'}
          </button>
        ))}
      </div>

      <h3 style={{ font: `600 ${font}`, margin: '16px 0 8px' }}>Rules</h3>
      {state.rules.length === 0 && (
        <p style={{ color: '#5f6368' }}>No rules. Click a request to add one.</p>
      )}
      {state.rules.map((rule) => (
        <div
          key={rule.id}
          style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0' }}
        >
          <input
            type="checkbox"
            aria-label={`Enable ${rule.match}`}
            checked={rule.enabled}
            onChange={(e) => chaos.toggleRule(rule.id, e.target.checked)}
          />
          <span style={{ flex: 1 }}>
            <code>{rule.match}</code>
            <br />
            <small style={{ color: '#5f6368' }}>{describeRule(rule)}</small>
          </span>
          {rule.source === 'panel' && (
            <button
              type="button"
              aria-label={`Remove rule ${rule.match}`}
              onClick={() => chaos.removeRule(rule.id)}
              style={{ ...chip(), color: '#d93025' }}
            >
              ✕
            </button>
          )}
        </div>
      ))}

      <h3 style={{ font: `600 ${font}`, margin: '16px 0 8px' }}>
        Requests{' '}
        <button type="button" onClick={chaos.clearLog} style={chip()}>
          Clear
        </button>
      </h3>
      {log.length === 0 && <p style={{ color: '#5f6368' }}>No requests yet.</p>}
      {log.slice(0, 50).map((entry) => {
        const match = endpointMatch(entry.method, entry.url);
        return (
          <div key={entry.id} style={{ borderTop: '1px solid #f1f3f4', padding: '6px 0' }}>
            <button
              type="button"
              aria-expanded={selected === entry.id}
              onClick={() => setSelected(selected === entry.id ? null : entry.id)}
              style={{ all: 'unset', cursor: 'pointer', display: 'block', width: '100%' }}
            >
              <code>
                {entry.method} {entry.url.replace(/^[a-z]+:\/\/[^/]+/i, '')}
              </code>
              <br />
              <small style={{ color: '#5f6368' }}>
                {entry.status ?? '…'} · {entry.outcome}
                {entry.latencyMs ? ` · +${entry.latencyMs} ms` : ''}
              </small>
            </button>
            {selected === entry.id && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                {Object.entries(QUICK_ACTIONS).map(([label, effect]) => (
                  <button
                    key={label}
                    type="button"
                    onClick={() => chaos.panelRule({ match, ...effect })}
                    style={chip()}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </section>
  );
}
