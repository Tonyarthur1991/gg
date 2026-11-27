import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useState, type ComponentProps, type ReactNode } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  SafeAreaView,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  useColorScheme,
  View,
} from "react-native";
import {
  addCapture,
  Capture,
  CaptureSource,
  DEFAULT_SETTINGS,
  deleteCapture,
  generateRoadmap,
  getCaptures,
  getSavedRoadmap,
  getSettings,
  Roadmap,
  saveSettings,
  scheduleNightlyReminder,
  Settings,
} from "./src/data";

type Tab = "capture" | "roadmap" | "settings";

export default function App() {
  const dark = useColorScheme() === "dark";
  const c = dark ? darkColors : lightColors;
  const [tab, setTab] = useState<Tab>("capture");

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: c.bg }]}>
      <StatusBar style={dark ? "light" : "dark"} />
      <View style={{ flex: 1 }}>
        {tab === "capture" && <CaptureScreen c={c} />}
        {tab === "roadmap" && <RoadmapScreen c={c} />}
        {tab === "settings" && <SettingsScreen c={c} />}
      </View>
      <View style={[styles.tabBar, { borderColor: c.border, backgroundColor: c.card }]}>
        {(
          [
            ["capture", "Capture"],
            ["roadmap", "Roadmap"],
            ["settings", "Settings"],
          ] as const
        ).map(([key, label]) => (
          <Pressable key={key} style={styles.tab} onPress={() => setTab(key)}>
            <Text style={{ color: tab === key ? c.accent : c.muted, fontWeight: "600" }}>{label}</Text>
          </Pressable>
        ))}
      </View>
    </SafeAreaView>
  );
}

// ---- Capture ----------------------------------------------------------------

const SOURCES: [CaptureSource, string][] = [
  ["note", "Note"],
  ["voice", "Voice note"],
  ["message", "Message"],
];

function CaptureScreen({ c }: { c: Colors }) {
  const [text, setText] = useState("");
  const [source, setSource] = useState<CaptureSource>("note");
  const [items, setItems] = useState<Capture[]>([]);

  useEffect(() => {
    getCaptures().then(setItems);
  }, []);

  const onAdd = async () => {
    if (!text.trim()) return;
    setItems(await addCapture(text, source));
    setText("");
  };

  return (
    <ScrollView contentContainerStyle={styles.pad} keyboardShouldPersistTaps="handled">
      <Text style={[styles.h1, { color: c.text }]}>What happened today?</Text>
      <Text style={[styles.hint, { color: c.muted }]}>
        Type, or tap the 🎤 on the keyboard to dictate. Paste in WhatsApp or iMessage text you want the
        planner to see (long-press a message → Copy).
      </Text>
      <View style={styles.row}>
        {SOURCES.map(([key, label]) => (
          <Pressable
            key={key}
            onPress={() => setSource(key)}
            style={[
              styles.chip,
              { borderColor: c.border },
              source === key && { backgroundColor: c.accent, borderColor: c.accent },
            ]}
          >
            <Text style={{ color: source === key ? "#fff" : c.text }}>{label}</Text>
          </Pressable>
        ))}
      </View>
      <TextInput
        multiline
        value={text}
        onChangeText={setText}
        placeholder="e.g. Promised Sarah the budget draft by Friday"
        placeholderTextColor={c.muted}
        style={[styles.input, { color: c.text, borderColor: c.border, backgroundColor: c.card }]}
      />
      <Button c={c} label="Add" onPress={onAdd} />

      <Text style={[styles.h2, { color: c.text }]}>Last 3 days ({items.length})</Text>
      {items.map((it) => (
        <View key={it.id} style={[styles.card, { backgroundColor: c.card, borderColor: c.border }]}>
          <Text style={{ color: c.muted, fontSize: 12 }}>
            {it.source} · {new Date(it.at).toLocaleString()}
          </Text>
          <Text style={{ color: c.text, marginTop: 4 }}>{it.text}</Text>
          <Pressable onPress={async () => setItems(await deleteCapture(it.id))}>
            <Text style={{ color: c.danger, marginTop: 6 }}>Delete</Text>
          </Pressable>
        </View>
      ))}
    </ScrollView>
  );
}

// ---- Roadmap ----------------------------------------------------------------

function RoadmapScreen({ c }: { c: Colors }) {
  const [data, setData] = useState<{ forDate: string; roadmap: Roadmap } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getSavedRoadmap().then(setData);
  }, []);

  const onGenerate = useCallback(async () => {
    setBusy(true);
    try {
      setData(await generateRoadmap(await getSettings()));
    } catch (e) {
      Alert.alert("Couldn't build the roadmap", e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, []);

  const r = data?.roadmap;
  return (
    <ScrollView contentContainerStyle={styles.pad}>
      <Button c={c} label={busy ? "Planning…" : "Generate tomorrow's roadmap"} onPress={onGenerate} disabled={busy} />
      {busy && <ActivityIndicator style={{ marginTop: 16 }} />}
      {!r && !busy && (
        <Text style={[styles.hint, { color: c.muted, marginTop: 16 }]}>
          No roadmap yet. Add a few captures, then generate.
        </Text>
      )}
      {r && (
        <>
          <Text style={[styles.hint, { color: c.muted, marginTop: 16 }]}>For {data!.forDate}</Text>
          <Text style={[styles.h1, { color: c.text }]}>{r.headline}</Text>

          <Section c={c} title="🎯 Top 3">
            {r.top3.map((t, i) => (
              <View key={i} style={{ marginBottom: 10 }}>
                <Text style={[styles.strong, { color: c.text }]}>
                  {i + 1}. {t.title}
                </Text>
                <Text style={{ color: c.muted }}>{t.why}</Text>
                <Text style={{ color: c.accent }}>First step: {t.firstStep}</Text>
              </View>
            ))}
          </Section>

          <Section c={c} title="📅 Schedule">
            {r.schedule.map((s, i) => (
              <View key={i} style={{ flexDirection: "row", marginBottom: 8 }}>
                <Text style={{ color: c.muted, width: 56, fontVariant: ["tabular-nums"] }}>{s.time}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: c.text }}>{s.item}</Text>
                  {!!s.prep && <Text style={{ color: c.muted, fontSize: 13 }}>{s.prep}</Text>}
                </View>
              </View>
            ))}
          </Section>

          {r.followUps.length > 0 && (
            <Section c={c} title="✉️ Replies you owe">
              {r.followUps.map((f, i) => (
                <View key={i} style={{ marginBottom: 10 }}>
                  <Text style={[styles.strong, { color: c.text }]}>
                    {f.who}: {f.what}
                  </Text>
                  <Pressable onPress={() => Share.share({ message: f.suggestedMessage })}>
                    <Text style={{ color: c.accent }}>“{f.suggestedMessage}” · Share</Text>
                  </Pressable>
                </View>
              ))}
            </Section>
          )}

          {r.commitments.length > 0 && (
            <Section c={c} title="🤝 Commitments">
              {r.commitments.map((m, i) => (
                <Text key={i} style={{ color: c.text, marginBottom: 4 }}>
                  • {m.what} <Text style={{ color: c.muted }}>({m.due})</Text>
                </Text>
              ))}
            </Section>
          )}

          {r.watchList.length > 0 && (
            <Section c={c} title="⏳ Watch list">
              {r.watchList.map((w, i) => (
                <Text key={i} style={{ color: c.text, marginBottom: 4 }}>
                  • {w}
                </Text>
              ))}
            </Section>
          )}

          <Section c={c} title="🌿 Energy">
            <Text style={{ color: c.text }}>{r.wellbeing}</Text>
          </Section>
        </>
      )}
    </ScrollView>
  );
}

// ---- Settings ---------------------------------------------------------------

function SettingsScreen({ c }: { c: Colors }) {
  const [s, setS] = useState<Settings>(DEFAULT_SETTINGS);
  useEffect(() => {
    getSettings().then(setS);
  }, []);

  const onSave = async () => {
    await saveSettings(s);
    const ok = await scheduleNightlyReminder(s.reminderHour, s.reminderMinute);
    Alert.alert("Saved", ok ? "Nightly reminder set." : "Saved, but notifications are off for this app.");
  };

  const field = (label: string, key: keyof Settings, opts: Partial<ComponentProps<typeof TextInput>> = {}) => (
    <View style={{ marginBottom: 14 }}>
      <Text style={{ color: c.muted, marginBottom: 4 }}>{label}</Text>
      <TextInput
        value={String(s[key])}
        onChangeText={(v) =>
          setS({ ...s, [key]: typeof DEFAULT_SETTINGS[key] === "number" ? Number(v) || 0 : v })
        }
        autoCapitalize="none"
        autoCorrect={false}
        style={[styles.input, { minHeight: 44, color: c.text, borderColor: c.border, backgroundColor: c.card }]}
        placeholderTextColor={c.muted}
        {...opts}
      />
    </View>
  );

  return (
    <ScrollView contentContainerStyle={styles.pad} keyboardShouldPersistTaps="handled">
      <Text style={[styles.h1, { color: c.text }]}>Settings</Text>
      {field("Server URL", "serverUrl", { placeholder: "https://your-server.onrender.com", keyboardType: "url" })}
      {field("App token", "token", { secureTextEntry: true, placeholder: "same as APP_TOKEN on the server" })}
      {field("Goals the planner should keep in mind", "goals", {
        multiline: true,
        placeholder: "e.g. Finish thesis chapter 3 by Dec 15; gym 3x a week",
      })}
      <View style={{ flexDirection: "row", gap: 12 }}>
        <View style={{ flex: 1 }}>{field("Reminder hour (0–23)", "reminderHour", { keyboardType: "number-pad" })}</View>
        <View style={{ flex: 1 }}>{field("Minute", "reminderMinute", { keyboardType: "number-pad" })}</View>
      </View>
      <Button c={c} label="Save" onPress={onSave} />
      <Text style={[styles.hint, { color: c.muted, marginTop: 16 }]}>
        Your captures stay on this phone. They're sent to your own server only when you tap Generate, and
        are deleted after 3 days.
      </Text>
    </ScrollView>
  );
}

// ---- UI bits ----------------------------------------------------------------

function Section({ c, title, children }: { c: Colors; title: string; children: ReactNode }) {
  return (
    <View style={[styles.card, { backgroundColor: c.card, borderColor: c.border, marginTop: 14 }]}>
      <Text style={[styles.h2, { color: c.text, marginTop: 0 }]}>{title}</Text>
      {children}
    </View>
  );
}

function Button({ c, label, onPress, disabled }: { c: Colors; label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={[styles.button, { backgroundColor: c.accent, opacity: disabled ? 0.6 : 1 }]}
    >
      <Text style={{ color: "#fff", fontWeight: "700" }}>{label}</Text>
    </Pressable>
  );
}

type Colors = typeof lightColors;
const lightColors = {
  bg: "#f6f6f4",
  card: "#ffffff",
  text: "#1b1b1a",
  muted: "#6b6b66",
  border: "#e3e3de",
  accent: "#2f6f5e",
  danger: "#b3261e",
};
const darkColors: Colors = {
  bg: "#121211",
  card: "#1c1c1b",
  text: "#f1f1ee",
  muted: "#a0a09a",
  border: "#2e2e2c",
  accent: "#5fb49c",
  danger: "#f2b8b5",
};

const styles = StyleSheet.create({
  root: { flex: 1 },
  pad: { padding: 16, paddingBottom: 40 },
  h1: { fontSize: 24, fontWeight: "700", marginBottom: 8 },
  h2: { fontSize: 17, fontWeight: "700", marginTop: 20, marginBottom: 8 },
  hint: { fontSize: 14, lineHeight: 20, marginBottom: 12 },
  strong: { fontWeight: "600" },
  row: { flexDirection: "row", gap: 8, marginBottom: 10 },
  chip: { borderWidth: 1, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 6 },
  input: { borderWidth: 1, borderRadius: 10, padding: 12, minHeight: 100, fontSize: 16, textAlignVertical: "top" },
  button: { borderRadius: 10, paddingVertical: 14, alignItems: "center", marginTop: 4 },
  card: { borderWidth: 1, borderRadius: 12, padding: 14, marginBottom: 10 },
  tabBar: { flexDirection: "row", borderTopWidth: 1 },
  tab: { flex: 1, alignItems: "center", paddingVertical: 14 },
});
