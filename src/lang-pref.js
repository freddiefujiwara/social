// The language preference shared by the top page and the blog.
// Both apps live on the same origin, so the stored choice sits in
// this origin's local storage and this page can show and clear it
// directly — no API involved. The top page records the language of
// the page it displays into the shared key on every load; the blog
// resolves a language-less URL from the shared key, falling back to
// the legacy blog-only key (written by older blog builds) and then
// to the browser language. Staging builds of both apps use the
// ":staging" key variants so a staging check never disturbs the
// production preference, mirroring the blog's own key selection.
import { isStagingBuild } from "./staging-banner.js";

export const LANG_PREF_KEY = "site:lang:v1";
export const LANG_PREF_STAGING_KEY = "site:lang:v1:staging";
export const LEGACY_LANG_PREF_KEY = "blog:lang:v1";
export const LEGACY_LANG_PREF_STAGING_KEY = "blog:lang:v1:staging";

export function langPrefKeys(staging = isStagingBuild()) {
  return staging
    ? { shared: LANG_PREF_STAGING_KEY, legacy: LEGACY_LANG_PREF_STAGING_KEY }
    : { shared: LANG_PREF_KEY, legacy: LEGACY_LANG_PREF_KEY };
}

const LANG_PREF_LABELS = { ja: "日本語", en: "English", zh: "中文" };

// Display label for a stored value; an unexpected value is shown
// as stored rather than hidden.
export function langPrefLabel(value) {
  if (!value) {
    return null;
  }
  return LANG_PREF_LABELS[value] ?? value;
}

function safeGet(storage, key) {
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

function safeRemove(storage, key) {
  try {
    storage.removeItem(key);
  } catch {
    // A storage failure leaves the key in place; the re-read after
    // clearing reports what is actually stored.
  }
}

// The stored preference for this build's environment:
// { shared, legacy }, each the stored code or null.
export function readLangPref(storage, staging = isStagingBuild()) {
  const store = storage ?? globalThis.localStorage;
  const keys = langPrefKeys(staging);
  return { shared: safeGet(store, keys.shared), legacy: safeGet(store, keys.legacy) };
}

// Removes both keys for this build's environment; the other
// environment's keys are left untouched.
export function clearLangPref(storage, staging = isStagingBuild()) {
  const store = storage ?? globalThis.localStorage;
  const keys = langPrefKeys(staging);
  safeRemove(store, keys.shared);
  safeRemove(store, keys.legacy);
}
