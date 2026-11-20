// Site themes. "print" is the red Christmas-seal sheet with glitch-print accents; "crt" is the
// night-shift terminal. Visitors pick AUTO, PRINT or CRT; AUTO follows the system's dark mode,
// then the local clock (CRT from 18:00 to 06:00). src/app.html repeats this rule inline so the
// right theme is set before the first paint.

export const themeModes = ['auto', 'print', 'crt'] as const;
export type ThemeMode = (typeof themeModes)[number];
export type Theme = Exclude<ThemeMode, 'auto'>;

export const themeStorageKey = 'cyberxmas-theme';
const themeColors: Record<Theme, string> = { print: '#9e1b1b', crt: '#170203' };

export const isThemeMode = (value: unknown): value is ThemeMode => themeModes.includes(value as ThemeMode);

export function resolveTheme(mode: ThemeMode, now: Date, prefersDark: boolean): Theme {
  if (mode !== 'auto') return mode;
  const hour = now.getHours();
  return prefersDark || hour >= 18 || hour < 6 ? 'crt' : 'print';
}

export function storedThemeMode(): ThemeMode {
  try {
    const value = localStorage.getItem(themeStorageKey);
    return isThemeMode(value) ? value : 'auto';
  } catch {
    return 'auto';
  }
}

/** Apply a mode to the document and remember it. Returns the theme now showing. */
export function applyThemeMode(mode: ThemeMode, remember = true): Theme {
  const theme = resolveTheme(mode, new Date(), matchMedia('(prefers-color-scheme: dark)').matches);
  const root = document.documentElement;
  root.dataset.theme = theme;
  root.dataset.themeMode = mode;
  document.querySelectorAll('meta[name="theme-color"]').forEach((meta) => meta.setAttribute('content', themeColors[theme]));
  if (remember) {
    try { localStorage.setItem(themeStorageKey, mode); } catch { /* private mode: keep it for this page only */ }
  }
  return theme;
}
