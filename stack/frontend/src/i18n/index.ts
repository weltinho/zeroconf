import { UI_TEXT, type UiText } from "./uiText";

export type AppLanguage = "en" | "pt";

export function resolveLanguage(locale: string): AppLanguage {
  return locale.toLowerCase().startsWith("pt") ? "pt" : "en";
}

export function getUiText(locale: string): UiText {
  return UI_TEXT[resolveLanguage(locale)];
}
