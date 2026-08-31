const KEY = "hoshiza_suggest_dismissed";

/** Whether the suggestions banner is dismissed; survives reloads. */
export const suggestDismissed = $state({ value: false });

try {
  suggestDismissed.value =
    typeof localStorage !== "undefined" && localStorage.getItem(KEY) === "1";
} catch {
  // storage unavailable (private mode); keep the banner visible
}

export function dismissSuggestions(): void {
  suggestDismissed.value = true;
  try {
    localStorage.setItem(KEY, "1");
  } catch {
    // no-op
  }
}

export function showSuggestions(): void {
  suggestDismissed.value = false;
  try {
    localStorage.removeItem(KEY);
  } catch {
    // no-op
  }
}
