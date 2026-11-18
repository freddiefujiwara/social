import { describe, it, expect, vi, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Runtime coverage for the X tab's per-post reaction detail:
// boots main.js in jsdom with a stubbed fetch, then checks
// that a post with stored reaction facts gets a 詳細 toggle
// whose expansion names the likers and shows the reply body
// with the data's limits stated, a post without facts shows
// the dash instead, and the stored follows render as their
// own line above the table.
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");

const jsonResponse = (data) => ({
  ok: true,
  json: async () => data,
  text: async () => JSON.stringify(data),
});

const report = (rows) => jsonResponse({ ok: true, data: { rows } });

const detailPayload = () =>
  jsonResponse({
    ok: true,
    collected_at: "2026-11-19T01:00:00Z",
    instagram: { recent_media: [] },
    youtube: {},
    threads: {},
    x: {
      followers: 1841,
      username: "freddiefujiwara",
      recent_posts: [
        {
          id: "3001",
          posted_at: "2026-11-18T10:00:00Z",
          text: "反応のある投稿",
          url: "https://x.com/i/web/status/3001",
          views: 500,
          likes: 2,
          reposts: 0,
          replies: 1,
        },
        {
          id: "3002",
          posted_at: "2026-11-17T10:00:00Z",
          text: "反応のない投稿",
          url: "https://x.com/i/web/status/3002",
          views: 100,
          likes: 0,
          reposts: 0,
          replies: 0,
        },
      ],
      reactions: {
        3001: [
          {
            kind: "reply",
            actor_name: "Carol",
            actor_username: "carol",
            text: "返信の本文です",
            reaction_tweet_id: "4001",
            acted_at: "2026-11-18T12:00:00.000Z",
            collected_at: "2026-11-19T01:00:00.000Z",
          },
          {
            kind: "like",
            actor_name: "Alice",
            actor_username: "alice",
            text: null,
            reaction_tweet_id: null,
            acted_at: null,
            collected_at: "2026-11-19T01:00:00.000Z",
          },
          {
            kind: "like",
            actor_name: "Bob",
            actor_username: "bob",
            text: null,
            reaction_tweet_id: null,
            acted_at: null,
            collected_at: "2026-11-19T01:00:00.000Z",
          },
        ],
      },
      recent_follows: [
        {
          actor_name: "Erin",
          actor_username: "erin",
          collected_at: "2026-11-19T01:00:00.000Z",
        },
      ],
    },
  });

// The boot chain is promise-driven, so a bounded run of
// microtask turns settles it without the (faked) clock moving.
async function until(fn, turns = 500) {
  for (let i = 0; i < turns; i += 1) {
    if (fn()) {
      return;
    }
    await Promise.resolve();
  }
  throw new Error("timed out waiting for condition");
}

describe("x reaction detail (runtime)", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("expands a post's stored reactions and lists recent follows", async () => {
    vi.useFakeTimers();
    document.documentElement.innerHTML = html
      .replace(/<script[\s\S]*?<\/script>/g, "")
      .replace(/<!doctype html>/i, "");
    localStorage.setItem("ga-session-token", "test-session-token");

    const fetchStub = vi.fn(async (url) => {
      const text = String(url);
      if (text.includes("o=rss")) {
        return { ok: true, text: async () => "<rss><channel></channel></rss>" };
      }
      if (text.includes("o=titles")) {
        return jsonResponse({ titles: {}, tags: {} });
      }
      const params = new URL(text).searchParams;
      if (params.get("action") === "sns_detail") {
        return detailPayload();
      }
      if (params.get("action") === "sns_history") {
        return jsonResponse({ ok: true, rows: [] });
      }
      return report([]);
    });
    vi.stubGlobal("fetch", fetchStub);

    await import("../src/main.js");

    const dataAsOf = () => document.getElementById("data-asof").textContent;
    await until(
      () =>
        document.getElementById("dashboard").hidden === false &&
        dataAsOf().includes("10:00"),
    );

    document
      .querySelector('#tabs .tab-button[data-tab="x"]')
      .dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    expect(document.getElementById("tab-x").hidden).toBe(false);

    // The stored follows render as their own line.
    expect(
      document.getElementById("x-recent-follows").textContent,
    ).toContain("Erin（@erin）");

    const body = () => document.getElementById("x-posts-body");
    const rows = () => [...body().querySelectorAll("tr")];
    // Sorted by views desc: the post with reactions comes
    // first and carries the toggle; the other shows the dash.
    expect(rows()).toHaveLength(2);
    const firstCells = rows()[0].querySelectorAll("td");
    expect(firstCells).toHaveLength(7);
    const toggle = rows()[0].querySelector(".reaction-toggle");
    expect(toggle).toBeTruthy();
    expect(toggle.textContent).toBe("詳細（3件）");
    const secondCells = rows()[1].querySelectorAll("td");
    expect(secondCells[6].textContent).toBe("—");
    expect(body().textContent).not.toContain("返信の本文です");

    // Expanding names the likers, shows the reply with its
    // body, and states the data's limits alongside.
    toggle.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    expect(rows()).toHaveLength(3);
    const detailText = rows()[1].textContent;
    expect(detailText).toContain("Alice（@alice）");
    expect(detailText).toContain("Bob（@bob）");
    expect(detailText).toContain("返信の本文です");
    expect(detailText).toContain("Carol（@carol）");
    expect(detailText).toContain("全員分が載らないことがあります");
    const replyLink = rows()[1].querySelector(
      'a[href="https://x.com/i/web/status/4001"]',
    );
    expect(replyLink).toBeTruthy();

    // Collapsing removes the expansion again.
    rows()[0]
      .querySelector(".reaction-toggle")
      .dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    expect(rows()).toHaveLength(2);
    expect(body().textContent).not.toContain("返信の本文です");
  });
});
