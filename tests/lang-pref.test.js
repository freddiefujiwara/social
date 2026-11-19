import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it } from "vitest";
import {
  LANG_PREF_KEY,
  LANG_PREF_STAGING_KEY,
  LEGACY_LANG_PREF_KEY,
  LEGACY_LANG_PREF_STAGING_KEY,
  clearLangPref,
  langPrefKeys,
  langPrefLabel,
  readLangPref,
} from "../src/lang-pref.js";
import { renderLangPref } from "../src/render-blog.js";

describe("lang pref keys", () => {
  it("pins the key names the top page and the blog use", () => {
    expect(LANG_PREF_KEY).toBe("site:lang:v1");
    expect(LANG_PREF_STAGING_KEY).toBe("site:lang:v1:staging");
    expect(LEGACY_LANG_PREF_KEY).toBe("blog:lang:v1");
    expect(LEGACY_LANG_PREF_STAGING_KEY).toBe("blog:lang:v1:staging");
  });

  it("selects the staging variants only for staging builds", () => {
    expect(langPrefKeys(false)).toEqual({
      shared: "site:lang:v1",
      legacy: "blog:lang:v1",
    });
    expect(langPrefKeys(true)).toEqual({
      shared: "site:lang:v1:staging",
      legacy: "blog:lang:v1:staging",
    });
  });
});

describe("langPrefLabel", () => {
  it("labels the three stored codes", () => {
    expect(langPrefLabel("ja")).toBe("日本語");
    expect(langPrefLabel("en")).toBe("English");
    expect(langPrefLabel("zh")).toBe("中文");
  });

  it("shows an unexpected value as stored and null for nothing", () => {
    expect(langPrefLabel("fr")).toBe("fr");
    expect(langPrefLabel(null)).toBeNull();
    expect(langPrefLabel("")).toBeNull();
  });
});

describe("readLangPref / clearLangPref", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("reads the shared and legacy values for the environment", () => {
    localStorage.setItem("site:lang:v1", "en");
    localStorage.setItem("blog:lang:v1", "ja");
    expect(readLangPref(localStorage, false)).toEqual({
      shared: "en",
      legacy: "ja",
    });
  });

  it("reads nulls when nothing is stored", () => {
    expect(readLangPref(localStorage, false)).toEqual({
      shared: null,
      legacy: null,
    });
  });

  it("keeps the two environments apart", () => {
    localStorage.setItem("site:lang:v1:staging", "zh");
    expect(readLangPref(localStorage, false).shared).toBeNull();
    expect(readLangPref(localStorage, true).shared).toBe("zh");
  });

  it("clearing removes both keys of that environment only", () => {
    localStorage.setItem("site:lang:v1", "en");
    localStorage.setItem("blog:lang:v1", "ja");
    localStorage.setItem("site:lang:v1:staging", "zh");
    localStorage.setItem("blog:lang:v1:staging", "zh");
    clearLangPref(localStorage, false);
    expect(localStorage.getItem("site:lang:v1")).toBeNull();
    expect(localStorage.getItem("blog:lang:v1")).toBeNull();
    expect(localStorage.getItem("site:lang:v1:staging")).toBe("zh");
    expect(localStorage.getItem("blog:lang:v1:staging")).toBe("zh");
  });
});

describe("renderLangPref", () => {
  beforeEach(() => {
    localStorage.clear();
    document.body.innerHTML = `<div id="blog-lang-pref"></div>`;
  });

  it("shows the stored shared preference by its label", () => {
    localStorage.setItem("site:lang:v1", "en");
    renderLangPref();
    const wrap = document.getElementById("blog-lang-pref");
    expect(wrap.textContent).toContain("現在の保存：English");
    expect(wrap.querySelector("button").disabled).toBe(false);
  });

  it("shows 未保存 and a disabled reset when nothing is stored", () => {
    renderLangPref();
    const wrap = document.getElementById("blog-lang-pref");
    expect(wrap.textContent).toContain("現在の保存：未保存");
    const button = wrap.querySelector("button");
    expect(button.textContent).toBe("保存をリセット");
    expect(button.disabled).toBe(true);
  });

  it("mentions a legacy-only value alongside 未保存", () => {
    localStorage.setItem("blog:lang:v1", "zh");
    renderLangPref();
    const wrap = document.getElementById("blog-lang-pref");
    expect(wrap.textContent).toContain("現在の保存：未保存");
    expect(wrap.textContent).toContain("旧キー");
    expect(wrap.textContent).toContain("中文");
    expect(wrap.querySelector("button").disabled).toBe(false);
  });

  it("reset clears both keys and explains what happens next", () => {
    localStorage.setItem("site:lang:v1", "ja");
    localStorage.setItem("blog:lang:v1", "en");
    renderLangPref();
    document
      .getElementById("blog-lang-pref")
      .querySelector("button")
      .click();
    expect(localStorage.getItem("site:lang:v1")).toBeNull();
    expect(localStorage.getItem("blog:lang:v1")).toBeNull();
    const wrap = document.getElementById("blog-lang-pref");
    expect(wrap.textContent).toContain("現在の保存：未保存");
    expect(wrap.textContent).toContain("リセットしました");
    expect(wrap.textContent).toContain("ブラウザの言語にしたがいます");
    expect(wrap.querySelector("button").disabled).toBe(true);
  });

  it("is wired into the page and the dashboard load", () => {
    const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
    const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
    expect(html).toContain('id="blog-lang-pref"');
    expect(html).toContain("言語の保存");
    const main = fs.readFileSync(path.join(root, "src", "main.js"), "utf8");
    expect(main).toContain("renderLangPref()");
  });
});
