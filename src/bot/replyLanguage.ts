const languageNames = new Intl.DisplayNames(["en"], { type: "language" });

/** Turns a Telegram language_code ("uk", "pt-br") into a name the model understands ("Ukrainian"). */
export function replyLanguage(languageCode: string | undefined, fallbackCode: string): string {
  try {
    return languageNames.of(languageCode || fallbackCode) ?? "English";
  } catch {
    return languageNames.of(fallbackCode) ?? "English";
  }
}
