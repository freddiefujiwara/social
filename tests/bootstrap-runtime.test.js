import { describe, it, expect, vi, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Runtime coverage for the bootstrap dashboard load: when the
// bridge serves action=bootstrap, the whole first load rides
// that one request — its eight sections land in the same
// loaders the individual requests feed, with the detail
// section read as the overview scope (Stage 2's scope state:
// no channel marked loaded, a channel tab still fetches its
// full section on first visit). Three further scenarios pin
// the edges: a bridge too old for the action (it answers with
// a plain report payload) falls back to the eight individual
// requests unchanged; an auth failure off the bootstrap
// request is the verdict itself (expired screen, no fallback);
// and a failed optional section (speed) keeps its tolerant
// rendering while the other sections succeed.
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");

const ARTICLE_ID = "2026010812345678901234567";
const ARTICLE_TITLE = "2026-11-10 検証用の記事タイトル";

const jsonResponse = (data) => ({
  ok: true,
  json: async () => data,
  text: async () => JSON.stringify(data),
});

const report = (rows) => jsonResponse({ ok: true, data: { rows } });
const reportData = (rows) => ({ ok: true, data: { rows } });
const row = (dimensionValues, metricValues) => ({
  dimensionValues: dimensionValues.map((value) => ({ value })),
  metricValues: metricValues.map((value) => ({ value })),
});

const totalsData = () => ({
  ok: true,
  data: {
    rows: [
      {
        metricValues: [{ value: "1000" }, { value: "100" }, { value: "120" }],
      },
    ],
  },
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

const instagramSection = () => ({
  freddiefujiwara: 2000,
  media_count: 100,
  views_30d: 5000,
  follows_30d: 10,
  unfollows_30d: 2,
  interactions_30d: { total: 100, likes: 80, comments: 5, shares: 5, saves: 10 },
  demographics: { age_gender: [], top_cities: [], top_countries: [] },
  daily_follows: [],
  recent_media: [
    mediaRow("m1", "一番目の投稿", 300),
    mediaRow("m2", "二番目の投稿", 200),
    mediaRow("m3", "三番目の投稿", 100),
    mediaRow("m4", "全件だけにある投稿", 50),
  ],
});

// The sns_detail overview scope, as the bootstrap's detail
// section carries it: scalars everywhere, each channel's list
// cut to trimmed preview items.
const overviewDetail = () => ({
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

// The full bootstrap payload: the six report sections in the
// shapes their own fetchReport calls return, plus the detail
// and history sections.
const bootstrapPayload = (overrides = {}) => ({
  ok: true,
  action: "bootstrap",
  totals: totalsData(),
  daily: reportData([row(["20261110"], ["42"])]),
  pages: reportData([row([`/blog/${ARTICLE_ID}`], ["123"])]),
  speed: reportData([row([`/blog/${ARTICLE_ID}`], ["24600", "2", "1"])]),
  scroll: reportData([
    row([`/blog/${ARTICLE_ID}`, "25"], ["90"]),
    row([`/blog/${ARTICLE_ID}`, "50"], ["60"]),
    row([`/blog/${ARTICLE_ID}`, "75"], ["30"]),
    row([`/blog/${ARTICLE_ID}`, "100"], ["15"]),
  ]),
  sources: reportData([row(["Organic Search"], ["77"])]),
  detail: overviewDetail(),
  history: { ok: true, rows: [] },
  ...overrides,
});

// The boot chain is promise-driven, so a bounded run of
// microtask turns settles it without the (faked) clock moving.
async function until(fn, turns = 2000) {
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
  localStorage.clear();
  sessionStorage.clear();
  // A previous scenario's tab selection lives in the URL path
  // (tab activation rewrites it); every scenario starts from
  // the plain root, on the overview tab.
  window.history.replaceState(null, "", "/");
}

// The blog-side fetches that are not part of the bootstrap:
// the RSS feed, the titles payload and the translation status.
function stubBlogSide(url) {
  const text = String(url);
  if (text.includes("o=rss")) {
    return {
      ok: true,
      text: async () =>
        `<rss><channel><item><title>${ARTICLE_TITLE}</title>` +
        `<link>https://freddiefujiwara.com/blog/${ARTICLE_ID}</link></item></channel></rss>`,
    };
  }
  if (text.includes("o=titles")) {
    return jsonResponse({
      titles: { [ARTICLE_ID]: ARTICLE_TITLE },
      tags: { [ARTICLE_ID]: ["川口"] },
    });
  }
  if (text.includes("o=translation-status")) {
    return jsonResponse({});
  }
  return null;
}

describe("bootstrap dashboard load (runtime)", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    window.location.hash = "";
  });

  it("loads the whole dashboard off the one bootstrap request", async () => {
    vi.useFakeTimers();
    bootPage();
    localStorage.setItem("ga-session-token", "test-session-token");

    const counts = { bootstrap: 0, report: 0, detail: 0, history: 0 };
    const detailScopes = [];
    const fetchStub = vi.fn(async (url) => {
      const side = stubBlogSide(url);
      if (side) {
        return side;
      }
      const params = new URL(String(url)).searchParams;
      const action = params.get("action");
      if (action === "bootstrap") {
        counts.bootstrap += 1;
        return jsonResponse(bootstrapPayload());
      }
      if (action === "sns_detail") {
        counts.detail += 1;
        detailScopes.push(params.get("scope"));
        return jsonResponse({
          ok: true,
          action: "sns_detail",
          detail_scope: "instagram",
          collected_at: "2026-11-24T01:00:00Z",
          instagram: instagramSection(),
        });
      }
      if (action === "sns_history") {
        counts.history += 1;
        return jsonResponse({ ok: true, rows: [] });
      }
      counts.report += 1;
      return report([]);
    });
    vi.stubGlobal("fetch", fetchStub);

    await import("../src/main.js");

    // Every section lands off the bootstrap payload: the header
    // totals, the sources ranking, the daily chart, the article
    // table (with its speed column), the top lists and the
    // settled-empty history.
    await until(
      () =>
        document.getElementById("dashboard").hidden === false &&
        document
          .getElementById("blog-article-body")
          .textContent.includes(ARTICLE_TITLE),
    );
    expect(document.getElementById("total-views").textContent).toBe("1,000");
    expect(document.getElementById("top-sources").textContent).toContain(
      "Organic Search",
    );
    expect(document.getElementById("daily-chart").innerHTML).toContain("<svg");
    expect(document.getElementById("total-articles").textContent).toBe("1");
    expect(document.getElementById("blog-article-body").textContent).toContain(
      "12.3",
    );
    expect(document.getElementById("top-posts").textContent).toContain(
      "一番目の投稿",
    );
    expect(document.getElementById("sns-history").textContent).toContain(
      "履歴はまだありません",
    );
    // …and not one of the eight individual requests was made.
    expect(counts.bootstrap).toBe(1);
    expect(counts.report).toBe(0);
    expect(counts.detail).toBe(0);
    expect(counts.history).toBe(0);

    // The detail section reads as the overview scope: the
    // Instagram tab's list sections sit on their loading line
    // (the preview is not the full list) until the first visit
    // fetches the channel's full section, exactly as Stage 2
    // arranged for a fetched overview.
    const mediaBody = () => document.getElementById("sns-media-body");
    expect(mediaBody().textContent).toContain("読み込み中…");
    expect(mediaBody().textContent).not.toContain("全件だけにある投稿");
    document
      .querySelector('#tabs .tab-button[data-tab="instagram"]')
      .dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    await until(
      () =>
        counts.detail === 1 &&
        mediaBody().textContent.includes("全件だけにある投稿"),
    );
    expect(detailScopes).toEqual(["instagram"]);
    expect(document.getElementById("sns-media-range").textContent).toContain(
      "全4件",
    );
  });

  it("falls back to the individual requests when the bridge predates bootstrap", async () => {
    vi.useFakeTimers();
    vi.resetModules();
    bootPage();
    localStorage.setItem("ga-session-token", "test-session-token");

    const counts = { bootstrap: 0, report: 0, detail: 0, history: 0 };
    const fetchStub = vi.fn(async (url) => {
      const side = stubBlogSide(url);
      if (side) {
        return side;
      }
      const params = new URL(String(url)).searchParams;
      const action = params.get("action");
      if (action === "bootstrap") {
        counts.bootstrap += 1;
        // The old bridge's fall-through answer: a plain report
        // payload, ok and all — not a bootstrap.
        return report([]);
      }
      if (action === "sns_detail") {
        counts.detail += 1;
        return jsonResponse(overviewDetail());
      }
      if (action === "sns_history") {
        counts.history += 1;
        return jsonResponse({ ok: true, rows: [] });
      }
      counts.report += 1;
      const dimensions = params.get("dimensions");
      const metrics = params.get("metrics") || "";
      if (metrics.includes("customEvent:render_ms")) {
        return report([row([`/blog/${ARTICLE_ID}`], ["24600", "2", "1"])]);
      }
      if (dimensions === "date") {
        return report([row(["20261110"], ["42"])]);
      }
      if (dimensions === "sessionDefaultChannelGroup") {
        return report([row(["Organic Search"], ["77"])]);
      }
      if (dimensions === "") {
        return jsonResponse(totalsData());
      }
      if (dimensions === "pagePath,customEvent:percent_scrolled") {
        return report([row([`/blog/${ARTICLE_ID}`, "25"], ["90"])]);
      }
      return report([row([`/blog/${ARTICLE_ID}`], ["123"])]);
    });
    vi.stubGlobal("fetch", fetchStub);

    await import("../src/main.js");

    await until(
      () =>
        document.getElementById("dashboard").hidden === false &&
        document.getElementById("top-posts").textContent.includes("一番目の投稿"),
    );
    // The one bootstrap attempt, then today's eight requests:
    // six reports, the overview detail and the history.
    expect(counts.bootstrap).toBe(1);
    expect(counts.report).toBe(6);
    expect(counts.detail).toBe(1);
    expect(counts.history).toBe(1);
    expect(document.getElementById("total-views").textContent).toBe("1,000");
    expect(document.getElementById("kpi-cards").textContent).toContain("2,000");
  });

  it("takes an auth failure off the bootstrap request as the verdict, without falling back", async () => {
    vi.useFakeTimers();
    vi.resetModules();
    bootPage();
    window.location.hash = "#share=dead-share-token";

    const counts = { bootstrap: 0, validate: 0, report: 0, detail: 0, history: 0 };
    const fetchStub = vi.fn(async (url) => {
      const side = stubBlogSide(url);
      if (side) {
        return side;
      }
      const params = new URL(String(url)).searchParams;
      const action = params.get("action");
      if (action === "bootstrap") {
        counts.bootstrap += 1;
        return jsonResponse({
          ok: false,
          status: 401,
          error: "リンクの有効期限が切れています",
        });
      }
      if (action === "sns_detail") {
        counts.detail += 1;
        return jsonResponse({ ok: true });
      }
      if (action === "sns_history") {
        counts.history += 1;
        return jsonResponse({ ok: true, rows: [] });
      }
      if (params.get("limit") === "1") {
        // The share-link validation that precedes the load.
        counts.validate += 1;
        return jsonResponse({
          ok: true,
          _share: { expires_at: "2099-01-01T00:00:00Z" },
        });
      }
      counts.report += 1;
      return report([]);
    });
    vi.stubGlobal("fetch", fetchStub);

    await import("../src/main.js");

    // The share session lands on the expired screen — the same
    // outcome a failed totals request produces today — and the
    // individual requests are never fired.
    await until(
      () => document.getElementById("share-expired").hidden === false,
    );
    expect(document.getElementById("dashboard").hidden).toBe(true);
    expect(counts.validate).toBe(1);
    expect(counts.bootstrap).toBe(1);
    expect(counts.report).toBe(0);
    expect(counts.detail).toBe(0);
    expect(counts.history).toBe(0);
  });

  it("renders a failed speed section tolerantly while the rest of the bootstrap succeeds", async () => {
    vi.useFakeTimers();
    vi.resetModules();
    bootPage();
    localStorage.setItem("ga-session-token", "test-session-token");

    const fetchStub = vi.fn(async (url) => {
      const side = stubBlogSide(url);
      if (side) {
        return side;
      }
      const params = new URL(String(url)).searchParams;
      if (params.get("action") === "bootstrap") {
        return jsonResponse(
          bootstrapPayload({
            speed: { ok: false, error: "表示時間を取得できませんでした" },
          }),
        );
      }
      return report([]);
    });
    vi.stubGlobal("fetch", fetchStub);

    await import("../src/main.js");

    // The article table renders off the pages section; the
    // failed speed section simply leaves its columns without
    // figures (no "12.3" average), and the other sections —
    // sources, totals — are unaffected.
    await until(
      () =>
        document.getElementById("dashboard").hidden === false &&
        document
          .getElementById("blog-article-body")
          .textContent.includes(ARTICLE_TITLE),
    );
    expect(document.getElementById("total-articles").textContent).toBe("1");
    expect(document.getElementById("blog-article-body").textContent).not.toContain(
      "12.3",
    );
    expect(document.getElementById("blog-article-body").textContent).not.toContain(
      "読み込み中…",
    );
    expect(document.getElementById("top-sources").textContent).toContain(
      "Organic Search",
    );
    expect(document.getElementById("total-views").textContent).toBe("1,000");
  });
});
