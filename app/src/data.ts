import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Calendar from "expo-calendar";
import * as Notifications from "expo-notifications";
import { Pedometer } from "expo-sensors";

// ---- Types (mirror server/src/roadmap.ts) -----------------------------------

export type CaptureSource = "note" | "voice" | "message" | "share" | "other";
export type Capture = { id: string; at: string; source: CaptureSource; text: string };

export type Roadmap = {
  headline: string;
  top3: { title: string; why: string; firstStep: string }[];
  schedule: { time: string; item: string; kind: string; prep: string }[];
  followUps: { who: string; what: string; suggestedMessage: string }[];
  commitments: { what: string; due: string }[];
  watchList: string[];
  wellbeing: string;
};

export type Settings = {
  serverUrl: string;
  token: string;
  goals: string;
  reminderHour: number;
  reminderMinute: number;
};

const KEYS = {
  captures: "captures.v1",
  settings: "settings.v1",
  roadmap: "roadmap.v1",
};

export const DEFAULT_SETTINGS: Settings = {
  serverUrl: "",
  token: "",
  goals: "",
  reminderHour: 21,
  reminderMinute: 0,
};

async function load<T>(key: string, fallback: T): Promise<T> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
const save = (key: string, value: unknown) => AsyncStorage.setItem(key, JSON.stringify(value));

// ---- Captures ---------------------------------------------------------------

/** Keep 3 days of captures, so the planner sees recent context and old data is dropped. */
const KEEP_MS = 3 * 24 * 60 * 60 * 1000;

export async function getCaptures(): Promise<Capture[]> {
  const all = await load<Capture[]>(KEYS.captures, []);
  const cutoff = Date.now() - KEEP_MS;
  return all.filter((c) => new Date(c.at).getTime() >= cutoff);
}

export async function addCapture(text: string, source: CaptureSource): Promise<Capture[]> {
  const list = await getCaptures();
  const item: Capture = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    at: new Date().toISOString(),
    source,
    text: text.trim(),
  };
  const next = [item, ...list];
  await save(KEYS.captures, next);
  return next;
}

export async function deleteCapture(id: string): Promise<Capture[]> {
  const next = (await getCaptures()).filter((c) => c.id !== id);
  await save(KEYS.captures, next);
  return next;
}

// ---- Settings & saved roadmap ----------------------------------------------

export const getSettings = () => load<Settings>(KEYS.settings, DEFAULT_SETTINGS);
export const saveSettings = (s: Settings) => save(KEYS.settings, s);
export const getSavedRoadmap = () =>
  load<{ forDate: string; roadmap: Roadmap } | null>(KEYS.roadmap, null);

// ---- Phone data: calendar + steps -------------------------------------------

function dayBounds(offsetDays: number) {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() + offsetDays);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start, end };
}

async function readCalendar() {
  const { status } = await Calendar.requestCalendarPermissionsAsync();
  if (status !== "granted") return [];
  const calendars = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
  const { start } = dayBounds(0);
  const { end } = dayBounds(1); // today + tomorrow
  const events = await Calendar.getEventsAsync(
    calendars.map((c) => c.id),
    start,
    end,
  );
  return events.map((e) => ({
    title: e.title,
    start: new Date(e.startDate).toISOString(),
    end: new Date(e.endDate).toISOString(),
    location: e.location ?? undefined,
    notes: e.notes ? e.notes.slice(0, 1000) : undefined,
  }));
}

async function readStepsToday(): Promise<number | undefined> {
  try {
    if (!(await Pedometer.isAvailableAsync())) return undefined;
    const perm = await Pedometer.requestPermissionsAsync();
    if (!perm.granted) return undefined;
    const { start } = dayBounds(0);
    const { steps } = await Pedometer.getStepCountAsync(start, new Date());
    return steps;
  } catch {
    return undefined;
  }
}

// ---- Generate ---------------------------------------------------------------

function localDate(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export async function generateRoadmap(settings: Settings): Promise<{ forDate: string; roadmap: Roadmap }> {
  if (!settings.serverUrl || !settings.token) {
    throw new Error("Add your server URL and token in Settings first.");
  }
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const forDate = localDate(tomorrow);

  const [captures, calendar, stepsToday] = await Promise.all([
    getCaptures(),
    readCalendar(),
    readStepsToday(),
  ]);

  const res = await fetch(`${settings.serverUrl.replace(/\/$/, "")}/roadmap`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${settings.token}`,
    },
    body: JSON.stringify({
      forDate,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      captures: captures.map(({ at, source, text }) => ({ at, source, text })),
      calendar,
      activity: { stepsToday },
      goals: settings.goals || undefined,
    }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Server error ${res.status}`);
  }
  const roadmap = (await res.json()) as Roadmap;
  const saved = { forDate, roadmap };
  await save(KEYS.roadmap, saved);
  return saved;
}

// ---- Nightly reminder -------------------------------------------------------

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

export async function scheduleNightlyReminder(hour: number, minute: number) {
  const perm = await Notifications.requestPermissionsAsync();
  if (!perm.granted) return false;
  await Notifications.cancelAllScheduledNotificationsAsync();
  await Notifications.scheduleNotificationAsync({
    content: {
      title: "Plan tomorrow",
      body: "Add anything from today, then tap Generate for tomorrow's roadmap.",
    },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DAILY, hour, minute },
  });
  return true;
}
