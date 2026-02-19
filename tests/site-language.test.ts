import {
  docsHrefForLang,
  normalizeSiteLang,
  readStoredSiteLang,
  SITE_LANG_STORAGE_KEY,
  storeSiteLang,
} from "@/lib/site-language";

describe("site language helpers", () => {
  it("normalizes unknown values to english", () => {
    expect(normalizeSiteLang("zh")).toBe("zh");
    expect(normalizeSiteLang("en")).toBe("en");
    expect(normalizeSiteLang("anything-else")).toBe("en");
  });

  it("stores and reads language preference from localStorage", () => {
    storeSiteLang("zh");
    expect(window.localStorage.getItem(SITE_LANG_STORAGE_KEY)).toBe("zh");
    expect(readStoredSiteLang()).toBe("zh");
  });

  it("builds docs href with language parameter", () => {
    expect(docsHrefForLang("en")).toBe("/docs?lang=en");
    expect(docsHrefForLang("zh")).toBe("/docs?lang=zh");
  });
});
