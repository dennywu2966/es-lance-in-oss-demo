export const SITE_LANG_STORAGE_KEY = "demo_site_lang";

export type SiteLang = "en" | "zh";

export function normalizeSiteLang(value: unknown): SiteLang {
  return value === "zh" ? "zh" : "en";
}

export function docsHrefForLang(lang: SiteLang): string {
  return `/docs?lang=${lang}`;
}

export function readStoredSiteLang(storage: Storage = window.localStorage): SiteLang {
  try {
    return normalizeSiteLang(storage.getItem(SITE_LANG_STORAGE_KEY));
  } catch {
    return "en";
  }
}

export function storeSiteLang(lang: SiteLang, storage: Storage = window.localStorage): void {
  try {
    storage.setItem(SITE_LANG_STORAGE_KEY, normalizeSiteLang(lang));
  } catch {
    // Ignore storage errors in restricted browser contexts.
  }
}
