import { describe, it, expect, vi, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Runtime coverage for the scoped SNS detail: the dashboard
// boots on the overview scope alone (its trimmed top-3 preview
// fills the overview's top lists, while a channel tab's list
// sections sit on their loading line and never render the
// preview as the full list), the first visit to a channel tab
// fetches that channel's full section exactly once, and the
// ten-minute auto-refresh re-fetches only the scopes already
// loaded — the overview plus the opened channel — without the
// overview's preview overwriting the loaded full section.
// The second scenario covers the merge tolerance: a bridge too
// old for scopes answers the overview request with the full
// snapshot, which must read as "everything loaded" (no scoped
// fetch follows, and the tabs render in full at once).
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");

const jsonResponse = (data) => ({
  ok: true,
  json: async () => data,
  text: async () => JSON.stringify(data),
});

const report = (rows) => jsonResponse({ ok: true, data: { rows } });
const row = (dimensionValues, metricValues) => ({
  dimensionValues: dimensionValues.map((value) => ({ value })),
  metricValues: metricValues.map((value) => ({ value })),
});

const mediaRow = (id, caption, views) => ({
  id,
  type: "REELS",
  posted_at: "2026-11-23T01:00:00Z",
  caption,
  permalink: `https://www.instagram.com/reel/${id}/`,
  views,
  reach: views,
  likes: 10,
  comments: 1,
  shares: 2,
  saves: 3,
  avg_watch_sec: 8,
  total_watch_sec: 800,
  duration_sec: 20,
});

const instagramSection = (topViews) => ({
  freddiefujiwara: 2000,
  media_count: 100,
  views_30d: 5000,
  follows_30d: 10,
  unfollows_30d: 2,
  interactions_30d: { total: 100, likes: 80, comments: 5, shares: 5, saves: 10 },
  demographics: { age_gender: [], top_cities: [], top_countries: [] },
  daily_follows: [],
  recent_media: [
    mediaRow("m1", "一番目の投稿", topViews),
    mediaRow("m2", "二番目の投稿", 200),
    mediaRow("m3", "三番目の投稿", 100),
    mediaRow("m4", "全件だけにある投稿", 50),
  ],
});

// The overview scope: scalars everywhere, and each channel's
// list cut to trimmed preview items (only the fields the
// overview's top lists read).
const overviewPayload = () =>
  jsonResponse({
    ok: true,
    action: "sns_detail",
    detail_scope: "overview",
    collected_at: "2026-11-24T01:00:00Z",
    instagram: {
      freddiefujiwara: 2000,
      media_count: 100,
      views_30d: 5000,
      follows_30d: 10,
      unfollows_30d: 2,
      interactions_30d: {
        total: 100,
        likes: 80,
        comments: 5,
        shares: 5,
        saves: 10,
      },
      demographics: { age_gender: [], top_cities: [], top_countries: [] },
      daily_follows: [],
      recent_media: [
        {
          caption: "一番目の投稿",
          type: "REELS",
          permalink: "https://www.instagram.com/reel/m1/",
          views: 300,
        },
        {
          caption: "二番目の投稿",
          type: "REELS",
          permalink: "https://www.instagram.com/reel/m2/",
          views: 200,
        },
        {
          caption: "三番目の投稿",
          type: "REELS",
          permalink: "https://www.instagram.com/reel/m3/",
          views: 100,
        },
      ],
    },
    youtube: {
      subscribers: 10,
      total_views: 1000,
      video_count: 3,
      recent_videos: [
        { title: "動画A", url: "https://www.youtube.com/watch?v=a", views: 40 },
      ],
    },
    threads: {
      followers: 300,
      views_30d: 900,
      interactions_30d: {
        total: null,
        likes: null,
        replies: null,
        reposts: null,
        quotes: null,
      },
      recent_posts: [
        {
          text: "スレッドの投稿",
          permalink: "https://www.threads.net/t/1",
          views: 50,
        },
      ],
    },
    x: {
      followers: 1800,
      username: "freddiefujiwara",
      recent_posts: [
        { text: "Xの投稿", url: "https://x.com/i/web/status/1", views: 60 },
      ],
      reactions: {},
      unattributed_reactions: [],
      recent_follows: [],
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

function bootPage() {
  document.documentElement.innerHTML = html
    .replace(/<script[\s\S]*?<\/script>/g, "")
    .replace(/<!doctype html>/i, "");
  localStorage.setItem("ga-session-token", "test-session-token");
}

function stubGaReports(fetchStub) {
  return async (url) => {
    const text = String(url);
    if (text.includes("o=rss")) {
      return { ok: true, text: async () => "<rss><channel></channel></rss>" };
    }
    if (text.includes("o=titles")) {
      return jsonResponse({ titles: {}, tags: {} });
    }
    const params = new URL(text).searchParams;
    const dimensions = params.get("dimensions");
    const metrics = params.get("metrics") || "";
    if (metrics.includes("customEvent:render_ms")) {
      return report([]);
    }
    if (dimensions === "date") {
      return report([row(["20261124"], ["42"])]);
    }
    if (dimensions === "sessionDefaultChannelGroup") {
      return report([row(["Organic Search"], ["77"])]);
    }
    if (dimensions === "") {
      return jsonResponse({
        ok: true,
        data: {
          rows: [
            {
              metricValues: [{ value: "1000" }, { value: "100" }, { value: "120" }],
            },
          ],
        },
      });
    }
    return report([]);
  };
}

describe("scoped SNS detail (runtime)", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("boots on the overview scope, fetches a channel on first visit, and refreshes only loaded scopes", async () => {
    vi.useFakeTimers();
    bootPage();

    const counts = {
      overview: 0,
      instagram: 0,
      youtube: 0,
      threads: 0,
      x: 0,
      full: 0,
      history: 0,
    };
    let instagramTopViews = 300;
    const gaReports = stubGaReports();
    const fetchStub = vi.fn(async (url) => {
      const params = new URL(String(url)).searchParams;
      if (params.get("action") === "sns_detail") {
        const scope = params.get("scope");
        if (scope === "overview") {
          counts.overview += 1;
          return overviewPayload();
        }
        if (scope === "instagram") {
          counts.instagram += 1;
          return jsonResponse({
            ok: true,
            action: "sns_detail",
            detail_scope: "instagram",
            collected_at: "2026-11-24T01:00:00Z",
            instagram: instagramSection(instagramTopViews),
          });
        }
        if (scope && scope in counts) {
          counts[scope] += 1;
          return jsonResponse({ ok: true });
        }
        counts.full += 1;
        return jsonResponse({ ok: true });
      }
      if (params.get("action") === "sns_history") {
        counts.history += 1;
        return jsonResponse({ ok: true, rows: [] });
      }
      return gaReports(url);
    });
    vi.stubGlobal("fetch", fetchStub);

    await import("../src/main.js");

    const mediaBody = () => document.getElementById("sns-media-body");

    // The overview renders from the overview scope alone: the
    // KPI cards carry the scalars and the top lists are filled
    // from the trimmed preview items.
    await until(
      () =>
        document.getElementById("dashboard").hidden === false &&
        document.getElementById("top-posts").textContent.includes("一番目の投稿"),
    );
    expect(counts.overview).toBe(1);
    expect(counts.instagram).toBe(0);
    expect(document.getElementById("kpi-cards").textContent).toContain("2,000");
    // The Instagram tab's list sections hold the scope's
    // loading line: the preview items are not rendered as the
    // full media list, and no range or filter is stated yet.
    expect(mediaBody().textContent).toContain("読み込み中…");
    expect(mediaBody().textContent).not.toContain("全件だけにある投稿");
    expect(document.getElementById("sns-media-range").textContent).toBe("");
    expect(document.getElementById("sns-media-genre-tabs").innerHTML).toBe("");

    // The first visit to the Instagram tab fetches its full
    // section once, and the table fills with the full list —
    // including the post the preview never carried.
    document
      .querySelector('#tabs .tab-button[data-tab="instagram"]')
      .dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    await until(
      () =>
        counts.instagram === 1 &&
        mediaBody().textContent.includes("全件だけにある投稿"),
    );
    expect(document.getElementById("sns-media-range").textContent).toContain(
      "全4件",
    );

    // Leaving and returning does not refetch.
    document
      .querySelector('#tabs .tab-button[data-tab="overview"]')
      .dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    document
      .querySelector('#tabs .tab-button[data-tab="instagram"]')
      .dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    expect(counts.instagram).toBe(1);

    // The auto-refresh re-fetches the overview and the one
    // loaded channel — never the channels never opened — and
    // the loaded section is refreshed in full, not overwritten
    // by the overview's preview.
    instagramTopViews = 999;
    await vi.advanceTimersByTimeAsync(10 * 60 * 1000);
    await until(() => counts.overview === 2 && counts.instagram === 2);
    expect(counts.youtube).toBe(0);
    expect(counts.threads).toBe(0);
    expect(counts.x).toBe(0);
    expect(counts.full).toBe(0);
    expect(mediaBody().textContent).toContain("999");
    expect(mediaBody().textContent).toContain("全件だけにある投稿");
  });

  it("treats a full payload answering the overview request as fully loaded", async () => {
    vi.useFakeTimers();
    vi.resetModules();
    bootPage();

    let detailCalls = 0;
    const gaReports = stubGaReports();
    const fetchStub = vi.fn(async (url) => {
      const params = new URL(String(url)).searchParams;
      if (params.get("action") === "sns_detail") {
        detailCalls += 1;
        // A pre-scope bridge: the full snapshot, every channel
        // key and no detail_scope, whatever was asked for.
        return jsonResponse({
          ok: true,
          action: "sns_detail",
          collected_at: "2026-11-24T01:00:00Z",
          instagram: instagramSection(300),
          youtube: { subscribers: 10, recent_videos: [] },
          threads: { followers: 300, recent_posts: [] },
          x: { followers: 1800, recent_posts: [] },
        });
      }
      if (params.get("action") === "sns_history") {
        return jsonResponse({ ok: true, rows: [] });
      }
      return gaReports(url);
    });
    vi.stubGlobal("fetch", fetchStub);

    await import("../src/main.js");

    const mediaBody = () => document.getElementById("sns-media-body");
    // The media table renders in full straight from the boot
    // load: the payload already carried the full section.
    await until(
      () =>
        document.getElementById("dashboard").hidden === false &&
        mediaBody().textContent.includes("全件だけにある投稿"),
    );
    expect(detailCalls).toBe(1);
    expect(mediaBody().textContent).not.toContain("読み込み中…");

    // Opening the Instagram tab fetches nothing more.
    document
      .querySelector('#tabs .tab-button[data-tab="instagram"]')
      .dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    expect(detailCalls).toBe(1);
    expect(mediaBody().textContent).toContain("全件だけにある投稿");
  });
});
