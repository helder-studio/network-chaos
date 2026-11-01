import { type ReactNode, useRef, useState } from 'react';
import {
  Animated,
  FlatList,
  Modal,
  PanResponder,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { chaos } from '../chaos';
import type { LogEntry } from '../core/engine';
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
} from '../react/shared';

/** React Native: installs interception, shows a draggable badge, and opens the QA panel on tap. */
export function NetworkChaos(props: NetworkChaosProps) {
  useActivation(props);
  return (
    <>
      {props.children}
      {props.enabled && props.badge !== false && (
        <>
          <FloatingBadge />
          <Panel />
        </>
      )}
    </>
  );
}

function FloatingBadge() {
  const state = useChaosState();
  const position = useRef(new Animated.ValueXY({ x: 12, y: 96 })).current;
  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderGrant: () => position.extractOffset(),
      onPanResponderMove: Animated.event([null, { dx: position.x, dy: position.y }], {
        useNativeDriver: false,
      }),
      onPanResponderRelease: (_e, gesture) => {
        position.flattenOffset();
        if (Math.abs(gesture.dx) < 5 && Math.abs(gesture.dy) < 5) chaos.open();
      },
    }),
  ).current;
  return (
    <Animated.View
      {...responder.panHandlers}
      accessibilityRole="button"
      accessibilityLabel={`Network chaos: ${summary(state)}. Open panel`}
      style={[
        styles.badge,
        { backgroundColor: state.on ? '#d93025' : '#5f6368' },
        { transform: position.getTranslateTransform() },
      ]}
    >
      <Text style={styles.badgeText}>⚡ {summary(state)}</Text>
    </Animated.View>
  );
}

const PRESET_OPTIONS: (PresetName | null)[] = [
  null,
  '3g',
  'slow-3g',
  'flaky',
  'offline',
  'llm-slow',
  'llm-flaky',
  'llm-rate-limited',
  'llm-overloaded',
];

function Panel() {
  const state = useChaosState();
  return (
    <Modal visible={state.open} animationType="slide" onRequestClose={chaos.close}>
      <SafeAreaView style={styles.panel}>
        <View style={styles.header}>
          <Text style={styles.title}>Network chaos</Text>
          <Pressable accessibilityRole="button" onPress={chaos.close} hitSlop={12}>
            <Text style={styles.link}>Close</Text>
          </Pressable>
        </View>
        <NetworkChaosPanel />
      </SafeAreaView>
    </Modal>
  );
}

/** The panel content, also used as the dev-dock tab. */
export function NetworkChaosPanel() {
  const state = useChaosState();
  const log = useChaosLog();
  const [selected, setSelected] = useState<number | null>(null);
  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Row label="Chaos on">
        <Switch value={state.on} onValueChange={chaos.setOn} />
      </Row>
      <Row label="Offline">
        <Switch value={state.offline} onValueChange={chaos.setOffline} />
      </Row>

      <Text style={styles.section}>Preset</Text>
      <View style={styles.chips}>
        {PRESET_OPTIONS.map((name) => (
          <Pressable
            key={name ?? 'none'}
            accessibilityRole="button"
            accessibilityState={{ selected: state.preset === name }}
            onPress={() => chaos.preset(name)}
            style={[styles.chip, state.preset === name && styles.chipOn]}
          >
            <Text style={state.preset === name ? styles.chipTextOn : undefined}>
              {name ?? 'none'}
            </Text>
          </Pressable>
        ))}
      </View>

      <Text style={styles.section}>Rules</Text>
      {state.rules.length === 0 && (
        <Text style={styles.muted}>No rules. Tap a request below to add one.</Text>
      )}
      {state.rules.map((rule) => (
        <View key={rule.id} style={styles.rule}>
          <View style={styles.flex}>
            <Text style={styles.mono}>{rule.match}</Text>
            <Text style={styles.muted}>{describeRule(rule)}</Text>
          </View>
          <Switch value={rule.enabled} onValueChange={(on) => chaos.toggleRule(rule.id, on)} />
          {rule.source === 'panel' && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Remove rule ${rule.match}`}
              onPress={() => chaos.removeRule(rule.id)}
              hitSlop={12}
            >
              <Text style={styles.remove}>✕</Text>
            </Pressable>
          )}
        </View>
      ))}

      <View style={styles.header}>
        <Text style={styles.section}>Requests</Text>
        <Pressable accessibilityRole="button" onPress={chaos.clearLog} hitSlop={12}>
          <Text style={styles.link}>Clear</Text>
        </Pressable>
      </View>
      <FlatList
        scrollEnabled={false}
        data={log.slice(0, 50)}
        keyExtractor={(entry) => String(entry.id)}
        ListEmptyComponent={<Text style={styles.muted}>No requests yet.</Text>}
        renderItem={({ item }) => (
          <LogRow
            entry={item}
            expanded={selected === item.id}
            onPress={() => setSelected(selected === item.id ? null : item.id)}
          />
        )}
      />
    </ScrollView>
  );
}

function LogRow({
  entry,
  expanded,
  onPress,
}: {
  entry: LogEntry;
  expanded: boolean;
  onPress: () => void;
}) {
  const match = endpointMatch(entry.method, entry.url);
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={styles.logRow}>
      <Text style={styles.mono} numberOfLines={1}>
        {entry.method} {entry.url.replace(/^[a-z]+:\/\/[^/]+/i, '')}
      </Text>
      <Text style={styles.muted}>
        {entry.status ?? '…'} · {entry.outcome}
        {entry.latencyMs ? ` · +${entry.latencyMs} ms` : ''}
      </Text>
      {expanded && (
        <View style={styles.chips}>
          {Object.entries(QUICK_ACTIONS).map(([label, effect]) => (
            <Pressable
              key={label}
              accessibilityRole="button"
              accessibilityLabel={`${label} for ${match}`}
              onPress={() => chaos.panelRule({ match, ...effect })}
              style={styles.chip}
            >
              <Text>{label}</Text>
            </Pressable>
          ))}
        </View>
      )}
    </Pressable>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View style={styles.row}>
      <Text>{label}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    position: 'absolute',
    top: 0,
    left: 0,
    zIndex: 9999,
    elevation: 9999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
  },
  badgeText: { color: '#fff', fontWeight: '600', fontSize: 12 },
  panel: { flex: 1, backgroundColor: '#fff' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  title: { fontSize: 18, fontWeight: '600' },
  content: { padding: 16, gap: 8 },
  section: { fontWeight: '600', marginTop: 16 },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    minHeight: 44,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#dadce0',
    minHeight: 36,
    justifyContent: 'center',
  },
  chipOn: { backgroundColor: '#1a73e8', borderColor: '#1a73e8' },
  chipTextOn: { color: '#fff' },
  rule: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48 },
  flex: { flex: 1 },
  mono: { fontFamily: 'Courier', fontSize: 13 },
  muted: { color: '#5f6368', fontSize: 12 },
  link: { color: '#1a73e8', fontWeight: '600' },
  remove: { color: '#d93025', fontSize: 16, paddingHorizontal: 4 },
  logRow: {
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: '#dadce0',
  },
});

/**
 * Tab for `@helder-studio/dev-dock`. Render `<NetworkChaos enabled badge={false}>` as usual for
 * interception and storage, and pass this to `<DevDock tabs={[networkChaosTab]} />`.
 */
export const networkChaosTab = {
  id: 'network-chaos',
  title: 'Network',
  status: () => {
    const state = chaos.getState();
    const active =
      state.on && (state.offline || state.preset || state.rules.some((r) => r.enabled));
    return active ? summary(state) : null;
  },
  subscribe: chaos.subscribe,
  render: () => <NetworkChaosPanel />,
};
