export type Theme = "dark" | "light";

const THEME_KEY = "hoshiza_theme";

/** Current theme. Read `theme.value`; flip it with `toggleTheme`. */
export const theme = $state<{ value: Theme }>({ value: "dark" });

function readSavedTheme(): Theme | null {
  try {
    const v = localStorage.getItem(THEME_KEY);
    if (v === "dark" || v === "light") return v;
  } catch {
    // storage unavailable (e.g. strict private mode); fall through to system
  }
  return null;
}

function systemTheme(): Theme {
  // Light is the default scene (a daytime triage board); the system only picks
  // dark when it is explicitly asked for.
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function apply(t: Theme): void {
  document.documentElement.dataset.theme = t;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", t === "dark" ? "#0d1117" : "#ffffff");
}

/** Resolve the saved/system theme and paint it. app.html sets it pre-hydration to avoid a flash. */
export function initTheme(): void {
  if (typeof document === "undefined") return;
  theme.value = readSavedTheme() ?? systemTheme();
  apply(theme.value);
}

export function toggleTheme(): void {
  const t = theme.value === "dark" ? "light" : "dark";
  theme.value = t;
  apply(t);
  try {
    localStorage.setItem(THEME_KEY, t);
  } catch {
    // ignore; the toggle still applies for this session
  }
}
