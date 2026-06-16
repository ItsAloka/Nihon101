/* ============================================================================
 * weather — live weather for a few major Japanese cities, for the home ribbon.
 * ============================================================================
 * Source: Open-Meteo (https://open-meteo.com) — free, no API key, commercial use
 * allowed. One request fetches every city (comma-separated coords). The result is
 * baked to KV by the per-minute cron (throttled to ~30 min), and the request path
 * only ever READS KV — so the page never waits on an external call and, if Open-
 * Meteo is down, the ribbon just shows the last good values.
 * ========================================================================== */

interface City { key: string; en: string; ja: string; lat: number; lon: number; }

// A calm rotation of major cities, north to south.
const CITIES: City[] = [
  { key: 'sapporo', en: 'Sapporo', ja: '札幌', lat: 43.0618, lon: 141.3545 },
  { key: 'sendai',  en: 'Sendai',  ja: '仙台', lat: 38.2682, lon: 140.8694 },
  { key: 'tokyo',   en: 'Tokyo',   ja: '東京', lat: 35.6762, lon: 139.6503 },
  { key: 'nagoya',  en: 'Nagoya',  ja: '名古屋', lat: 35.1815, lon: 136.9066 },
  { key: 'kyoto',   en: 'Kyoto',   ja: '京都', lat: 35.0116, lon: 135.7681 },
  { key: 'osaka',   en: 'Osaka',   ja: '大阪', lat: 34.6937, lon: 135.5023 },
  { key: 'fukuoka', en: 'Fukuoka', ja: '福岡', lat: 33.5904, lon: 130.4017 },
  { key: 'naha',    en: 'Naha',    ja: '那覇', lat: 26.2124, lon: 127.6809 },
];

// WMO weather-code → bilingual label + a small glyph.
const WMO: Record<number, { en: string; ja: string; glyph: string }> = {
  0:  { en: 'clear',          ja: '快晴',   glyph: '☀' },
  1:  { en: 'mostly clear',   ja: '晴れ',   glyph: '🌤' },
  2:  { en: 'partly cloudy',  ja: '晴れ時々曇り', glyph: '⛅' },
  3:  { en: 'overcast',       ja: '曇り',   glyph: '☁' },
  45: { en: 'fog',            ja: '霧',     glyph: '🌫' },
  48: { en: 'rime fog',       ja: '霧氷',   glyph: '🌫' },
  51: { en: 'light drizzle',  ja: '霧雨',   glyph: '🌦' },
  53: { en: 'drizzle',        ja: '霧雨',   glyph: '🌦' },
  55: { en: 'heavy drizzle',  ja: '強い霧雨', glyph: '🌧' },
  61: { en: 'light rain',     ja: '小雨',   glyph: '🌧' },
  63: { en: 'rain',           ja: '雨',     glyph: '🌧' },
  65: { en: 'heavy rain',     ja: '大雨',   glyph: '🌧' },
  66: { en: 'freezing rain',  ja: '着氷性の雨', glyph: '🌧' },
  67: { en: 'freezing rain',  ja: '着氷性の雨', glyph: '🌧' },
  71: { en: 'light snow',     ja: '小雪',   glyph: '🌨' },
  73: { en: 'snow',           ja: '雪',     glyph: '❄' },
  75: { en: 'heavy snow',     ja: '大雪',   glyph: '❄' },
  77: { en: 'snow grains',    ja: '霧雪',   glyph: '🌨' },
  80: { en: 'rain showers',   ja: 'にわか雨', glyph: '🌦' },
  81: { en: 'rain showers',   ja: 'にわか雨', glyph: '🌦' },
  82: { en: 'heavy showers',  ja: '激しいにわか雨', glyph: '🌧' },
  85: { en: 'snow showers',   ja: 'にわか雪', glyph: '🌨' },
  86: { en: 'snow showers',   ja: 'にわか雪', glyph: '🌨' },
  95: { en: 'thunderstorm',   ja: '雷雨',   glyph: '⛈' },
  96: { en: 'thunderstorm',   ja: '雷雨',   glyph: '⛈' },
  99: { en: 'thunderstorm',   ja: '雷雨',   glyph: '⛈' },
};
const describe = (code: number) => WMO[code] ?? { en: '—', ja: '—', glyph: '·' };

export interface CityWeather {
  key: string; en: string; ja: string;
  temp: number; condEn: string; condJa: string; glyph: string;
}

const ENDPOINT = 'https://api.open-meteo.com/v1/forecast';

/** Fetch current weather for every city in one Open-Meteo request. */
export async function fetchWeather(): Promise<CityWeather[]> {
  const lat = CITIES.map((c) => c.lat).join(',');
  const lon = CITIES.map((c) => c.lon).join(',');
  const url = `${ENDPOINT}?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code&timezone=Asia%2FTokyo`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`weather_fetch_failed_${res.status}`);
  const data = await res.json();
  const arr = Array.isArray(data) ? data : [data];
  return CITIES.map((c, i) => {
    const cur = (arr[i]?.current ?? {}) as { temperature_2m?: number; weather_code?: number };
    const d = describe(Number(cur.weather_code));
    return {
      key: c.key, en: c.en, ja: c.ja,
      temp: Math.round(Number(cur.temperature_2m ?? 0)),
      condEn: d.en, condJa: d.ja, glyph: d.glyph,
    };
  });
}

const KV_KEY = 'weather:v1';
const REFRESH_MS = 30 * 60 * 1000;   // refresh at most every 30 min
const TTL_SEC = 60 * 90;             // keep ~90 min so a stale value survives a failed refresh

interface Cached { updatedAt: number; cities: CityWeather[]; }

/** Cron-side: refresh + bake to KV, but only if the cached value is older than
 *  REFRESH_MS. Swallows errors so a bad fetch never disturbs the last good value. */
export async function recomputeWeatherCache(kv?: KVNamespace): Promise<void> {
  if (!kv) return;
  try {
    const raw = await kv.get(KV_KEY);
    if (raw) {
      const prev = JSON.parse(raw) as Cached;
      if (prev.updatedAt && Date.now() - prev.updatedAt < REFRESH_MS) return;
    }
    const cities = await fetchWeather();
    await kv.put(KV_KEY, JSON.stringify({ updatedAt: Date.now(), cities } satisfies Cached), {
      expirationTtl: TTL_SEC,
    });
  } catch { /* keep last good value */ }
}

/** Request-side: read the baked value (fast, KV-only). Empty until the cron has
 *  run at least once. */
export async function getWeather(kv?: KVNamespace): Promise<CityWeather[]> {
  if (!kv) return [];
  try {
    const raw = await kv.get(KV_KEY);
    return raw ? ((JSON.parse(raw) as Cached).cities ?? []) : [];
  } catch {
    return [];
  }
}
