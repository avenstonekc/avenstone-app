const DEFAULT_LAT = 39.0997;
const DEFAULT_LON = -94.5786;

const CACHE_TTL_MS = 30 * 60 * 1000;
let _cache = null;

export async function fetchWeather(lat = DEFAULT_LAT, lon = DEFAULT_LON) {
  if (_cache && _cache.lat === lat && _cache.lon === lon && (Date.now() - _cache.fetched_at) < CACHE_TTL_MS) {
    return { ok: true, data: _cache.data };
  }
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code&daily=temperature_2m_max,temperature_2m_min,weather_code,precipitation_probability_max&temperature_unit=fahrenheit&timezone=auto&forecast_days=7`;
    const res = await fetch(url);
    if (!res.ok) return { ok: false, error: `Weather API ${res.status}` };
    const raw = await res.json();
    const data = {
      current: {
        temp_f: Math.round(raw.current?.temperature_2m ?? 0),
        weather_code: raw.current?.weather_code ?? 0,
        label: weatherLabel(raw.current?.weather_code),
        icon: weatherIcon(raw.current?.weather_code),
      },
      daily: (raw.daily?.time || []).map((dateStr, i) => ({
        date: dateStr,
        high_f: Math.round(raw.daily.temperature_2m_max?.[i] ?? 0),
        low_f: Math.round(raw.daily.temperature_2m_min?.[i] ?? 0),
        weather_code: raw.daily.weather_code?.[i] ?? 0,
        label: weatherLabel(raw.daily.weather_code?.[i]),
        icon: weatherIcon(raw.daily.weather_code?.[i]),
        precip_pct: raw.daily.precipitation_probability_max?.[i] ?? 0,
      })),
    };
    _cache = { fetched_at: Date.now(), lat, lon, data };
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: err?.message || String(err) };
  }
}

export function weatherLabel(code) {
  if (code === 0) return 'Clear';
  if (code === 1) return 'Mostly clear';
  if (code === 2) return 'Partly cloudy';
  if (code === 3) return 'Overcast';
  if (code === 45 || code === 48) return 'Fog';
  if (code >= 51 && code <= 57) return 'Drizzle';
  if (code >= 61 && code <= 67) return 'Rain';
  if (code >= 71 && code <= 77) return 'Snow';
  if (code >= 80 && code <= 82) return 'Showers';
  if (code >= 85 && code <= 86) return 'Snow showers';
  if (code === 95) return 'Thunderstorm';
  if (code === 96 || code === 99) return 'Severe storm';
  return 'Unknown';
}

export function weatherIcon(code) {
  if (code === 0) return '☀️';
  if (code === 1 || code === 2) return '⛅';
  if (code === 3) return '☁️';
  if (code === 45 || code === 48) return '🌫️';
  if (code >= 51 && code <= 67) return '🌧️';
  if (code >= 71 && code <= 77) return '❄️';
  if (code >= 80 && code <= 82) return '🌦️';
  if (code >= 85 && code <= 86) return '🌨️';
  if (code === 95 || code === 96 || code === 99) return '⛈️';
  return '🌡️';
}

export function formatDayLabel(dateStr, i) {
  if (i === 0) return 'Today';
  if (i === 1) return 'Tomorrow';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'short' });
}
