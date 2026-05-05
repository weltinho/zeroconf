import { UI_TEXT, type UiText } from "./uiText";

export type AppLanguage = "en" | "pt";

export function resolveLanguage(locale: string): AppLanguage {
  return locale.toLowerCase().startsWith("pt") ? "pt" : "en";
}

/** Interface sempre em português do Brasil (textos em `UI_TEXT.pt`). */
export function getUiText(_locale?: string): UiText {
  void _locale;
  return UI_TEXT.pt;
}
