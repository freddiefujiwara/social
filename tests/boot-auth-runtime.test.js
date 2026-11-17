import { describe, it, expect, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Runtime coverage for the two gate messages the structural
// tests cannot see working end to end:
//   - a saved owner session the bridge rejects lands on the
//     gate with the expiry notice (and the dead token dropped);
//   - a Google sign-in script that never arrives (blocked, say)
//     ends the gate's silent wait with the load-failure notice.
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");

const jsonResponse = (data) => ({
  ok: true,
  json: async () => data,
  text: async () => JSON.stringify(data),
});

async function until(fn, timeoutMs = 5000) {
  const start = Date.now();
  while (!fn()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error("timed out waiting for condition");
    }
    await new Promise((r) => setTimeout(r, 10));
  }
}

function bootPage() {
  document.documentElement.innerHTML = html
    .replace(/<script[\s\S]*?<\/script>/g, "")
    .replace(/<!doctype html>/i, "");
  localStorage.clear();
  sessionStorage.clear();
}

// Every bridge call answers "not ok": the saved session is dead
// and the anonymous probe finds nothing to show.
const rejectingFetch = vi.fn(async (url) => {
  const text = String(url);
  if (text.includes("o=rss")) {
    return { ok: true, text: async () => "", json: async () => ({}) };
  }
  if (text.includes("o=titles")) {
    return jsonResponse({ titles: {}, tags: {} });
  }
  return jsonResponse({ ok: false, error: "unauthorized" });
});

describe("boot gate messages (runtime)", () => {
  it("lands a rejected saved session on the gate with the expiry notice", async () => {
    bootPage();
    localStorage.setItem("ga-session-token", "dead-session-token");
    vi.stubGlobal("fetch", rejectingFetch);

    await import("../src/main.js");

    await until(
      () =>
        document.getElementById("gate").hidden === false &&
        document.getElementById("gate-error").textContent ===
          "ログインの有効期限が切れました。再度ログインしてください。",
    );
    expect(document.getElementById("boot-loading").hidden).toBe(true);
    // The dead token is dropped so the next visit starts clean.
    expect(localStorage.getItem("ga-session-token")).toBeNull();
  });

  it("announces a Google script that never arrives", async () => {
    vi.resetModules();
    bootPage();
    vi.stubGlobal("fetch", rejectingFetch);

    await import("../src/main.js");

    // The gate appears once the probe fails; the script-wait
    // gives up after about three seconds and says why the
    // sign-in area is empty.
    await until(
      () =>
        document.getElementById("gate-error").textContent ===
        "Googleログインスクリプトの読み込みに失敗しました。広告ブロック等を解除して再読み込みしてください。",
      8000,
    );
    expect(document.getElementById("gate").hidden).toBe(false);
    expect(document.getElementById("boot-loading").hidden).toBe(true);
  });
});
