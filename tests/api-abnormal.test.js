import { describe, expect, it } from "vitest";
import {
  articlePageViews,
  blogScrollMap,
  blogSpeedMap,
  dailySeries,
  demographicsBars,
  dimensionRanking,
  followChartDays,
  historyDailyDelta,
  instagramDailyFollows,
  pageRanking,
  parseBlogMeta,
  parseRssTitles,
  parseTranslationStatus,
  rowsOf,
  snsHistorySeries,
  snsOverview,
  snsTotalFollowers,
  threadsTotals,
  topDemographics,
  totalsOf,
  xReactionGroups,
  xApiRunwayMonths,
  xTotals,
  youtubeTotals,
} from "../src/api.js";
import { genreStatsForMedia } from "../src/genres.js";
import { channelAudiences } from "../src/treemap.js";

// Abnormal-case tests: deformed /exec payloads fed to the shaping
// layer. The endpoints are bridges over other services (GA, Meta,
// blog-gas), so the JSON that arrives can be a shape the happy
// path never produces — rows without their value arrays, counts
// as strings, sections of the wrong type. Every case asserts the
// documented graceful behaviour: no throw, and the sane fallback
// (empty list, zero totals, "—" cards, counts derived from the
// article rows) rather than a crash or invented numbers.

const gaRow = (path, views) => ({
  dimensionValues: [{ value: path }],
  metricValues: [{ value: String(views) }],
});
const gaResponse = (rows) => ({ ok: true, data: { rows } });
const ARTICLE_ID = "1AbC2dEf3GhI4jKl5MnO6pQr7StUv";
const ARTICLE_PATH = `/blog/${ARTICLE_ID}`;

describe("GA report rows of the wrong shape", () => {
  it("rowsOf yields [] when data.rows is not an array", () => {
    for (const rows of ["junk", 42, { 0: gaRow("/", 1) }, true]) {
      expect(rowsOf(gaResponse(rows))).toEqual([]);
    }
    expect(rowsOf({ ok: true, data: {} })).toEqual([]);
    expect(rowsOf({ ok: true })).toEqual([]);
  });

  it("totalsOf reads zeros from rows that carry no metric values", () => {
    const zero = { views: 0, users: 0, sessions: 0 };
    expect(totalsOf(gaResponse([{}]))).toEqual(zero);
    expect(totalsOf(gaResponse([null]))).toEqual(zero);
    expect(totalsOf(gaResponse([{ metricValues: "junk" }]))).toEqual(zero);
    expect(totalsOf(gaResponse([{ dimensionValues: [{ value: "x" }] }]))).toEqual(zero);
  });

  it("dailySeries drops rows it cannot shape and keeps the valid ones", () => {
    // A row with a date but no metric values reads as 0 views
    // (the totals contract); a row without a date cannot be
    // placed on the axis at all and drops out.
    const series = dailySeries(
      gaResponse([
        gaRow("20261102", 5),
        { dimensionValues: [{ value: "20261101" }] },
        { metricValues: [{ value: "9" }] },
        null,
        gaRow("20261101", 3),
      ]),
    );
    expect(series).toEqual([
      { date: "20261101", views: 0 },
      { date: "20261101", views: 3 },
      { date: "20261102", views: 5 },
    ]);
  });

  it("dimensionRanking drops rows it cannot shape", () => {
    const ranking = dimensionRanking(
      gaResponse([gaRow("date", 7), { metricValues: [{ value: "1" }] }, null, {}]),
    );
    expect(ranking).toEqual([{ name: "date", views: 7 }]);
  });

  it("pageRanking survives deformed rows and still ranks the valid ones", () => {
    const ranking = pageRanking(
      gaResponse([
        gaRow("/", 10),
        { dimensionValues: [] },
        { metricValues: [{ value: "5" }] },
        null,
      ]),
      new Map(),
      "https://example.com",
    );
    expect(ranking).toEqual([
      { label: "トップページ", href: "https://example.com/", views: 10 },
    ]);
  });

  it("articlePageViews skips rows without a dimension value", () => {
    const views = articlePageViews(
      gaResponse([
        gaRow(ARTICLE_PATH, 4),
        { metricValues: [{ value: "9" }] },
        { dimensionValues: [] },
        null,
      ]),
    );
    expect(views).toEqual([{ id: ARTICLE_ID, views: 4 }]);
  });

  it("blogSpeedMap skips rows without a dimension value", () => {
    const speedRow = {
      dimensionValues: [{ value: ARTICLE_PATH }],
      metricValues: [{ value: "2000" }, { value: "4" }, { value: "1" }],
    };
    const map = blogSpeedMap(
      gaResponse([speedRow, { metricValues: [{ value: "5" }] }, null, {}]),
    );
    expect(map.get(ARTICLE_ID)).toEqual({ avgMs: 500, samples: 4, slow: 1 });
    expect(map.size).toBe(1);
  });

  it("blogScrollMap skips a row whose first dimension value is missing", () => {
    const map = blogScrollMap(
      gaResponse([
        {
          dimensionValues: [null, { value: "25" }],
          metricValues: [{ value: "3" }],
        },
        {
          dimensionValues: [{ value: ARTICLE_PATH }, { value: "25" }],
          metricValues: [{ value: "2" }],
        },
      ]),
    );
    expect(map.get(ARTICLE_ID)).toEqual({
      scroll25: 2,
      scroll50: 0,
      scroll75: 0,
      scroll100: 0,
    });
    expect(map.size).toBe(1);
  });
});

describe("SNS detail sections of the wrong shape", () => {
  it("treats string metrics as missing, never as numbers", () => {
    const detail = {
      instagram: { freddiefujiwara: "2100" },
      threads: { followers: 100 },
      youtube: { subscribers: "300" },
      x: { followers: null },
    };
    expect(snsTotalFollowers(detail)).toBe(100);
  });

  it("snsOverview renders dash cards when the section is not an object", () => {
    for (const instagram of ["junk", 42, null, []]) {
      const cards = snsOverview({ instagram }, []);
      expect(cards).toHaveLength(9);
      for (const card of cards) {
        expect(card.value).toBe("—");
      }
    }
  });

  it("channel totals tolerate a history of the wrong type", () => {
    const detail = {
      youtube: { subscribers: 10, total_views: 20, video_count: 3 },
      threads: { followers: 5, views_30d: 6, interactions_30d: { total: 7 } },
    };
    for (const history of ["junk", 42, null, {}]) {
      expect(youtubeTotals(detail, history)[0].value).toBe("10");
      expect(threadsTotals(detail, history)[0].value).toBe("5");
    }
    expect(youtubeTotals(null, null)).toHaveLength(3);
    expect(threadsTotals(undefined, undefined)).toHaveLength(3);
  });

  it("xTotals sums only the numeric post metrics", () => {
    const detail = {
      x: {
        followers: "500",
        recent_posts: [
          { views: "10", likes: 5 },
          null,
          { views: 20, likes: "x" },
          { views: 30 },
        ],
      },
    };
    const boxes = xTotals(detail, []);
    expect(boxes[0].value).toBe("—");
    expect(boxes[1].value).toBe("5");
    expect(boxes[2].value).toBe("50");
    expect(boxes[3].value).toBe("25");
  });

  it("channelAudiences tolerates junk totals and history", () => {
    const entries = channelAudiences(null, { users: "100" }, "junk");
    expect(entries).toHaveLength(5);
    for (const entry of entries) {
      expect(entry.value).toBeNull();
      expect(entry.valueLabel).toBe("—");
    }
  });

  it("demographicsBars filters entries without a numeric value", () => {
    const detail = {
      instagram: {
        demographics: {
          age_gender: [
            null,
            { key: "18-24/M" },
            { key: "18-24/F", value: "30" },
            { key: "18-24/F", value: 12 },
            "junk",
          ],
        },
      },
    };
    const rows = demographicsBars(detail);
    const cell = rows.find((row) => row.key === "18-24/F");
    expect(cell.value).toBe(12);
    expect(cell.pct).toBe(100);
    expect(demographicsBars({ instagram: { demographics: { age_gender: {} } } })).toEqual([]);
    expect(demographicsBars(null)).toEqual([]);
  });

  it("topDemographics keeps only string-keyed numeric entries", () => {
    const list = [
      { key: 42, value: 10 },
      { key: "東京", value: "5" },
      null,
      { key: "大阪", value: 7 },
      { value: 3 },
    ];
    expect(topDemographics(list)).toEqual([{ name: "大阪", value: 7 }]);
    expect(topDemographics("junk")).toEqual([]);
  });

  it("followChartDays turns string counts into gaps and drops bad dates", () => {
    const detail = {
      instagram: {
        daily_follows: [
          { date: "2026-11-01", follows: "3", unfollows: 1 },
          { date: "not-a-date", follows: 9, unfollows: 9 },
          null,
        ],
        recent_media: "junk",
      },
    };
    const days = followChartDays(detail);
    expect(days).toEqual([
      { date: "20261101", follows: null, unfollows: 1, posts: [] },
    ]);
  });

  it("list readers yield [] when the stored value is not a list", () => {
    expect(instagramDailyFollows({ instagram: { daily_follows: {} } })).toEqual([]);
    expect(instagramDailyFollows(null)).toEqual([]);
  });

  it("history shaping ignores rows with unusable timestamps or string metrics", () => {
    const rows = [
      { collected_at: 42, total_followers: 10 },
      null,
      { collected_at: "2026-11-01T00:00:00Z", total_followers: "10" },
    ];
    expect(snsHistorySeries(rows)).toEqual([]);
    expect(historyDailyDelta(rows, "total_followers")).toBeNull();
    expect(historyDailyDelta("junk", "total_followers")).toBeNull();
  });

  it("xReactionGroups drops unknown kinds, including prototype names", () => {
    const groups = xReactionGroups([
      { kind: "__proto__", actor_name: "a" },
      { kind: "constructor", actor_name: "b" },
      { kind: "like", actor_name: "c" },
      "junk",
      null,
    ]);
    expect(groups.like).toHaveLength(1);
    expect(groups.reply).toEqual([]);
    expect({}.polluted).toBeUndefined();
    expect(xReactionGroups("junk")).toEqual({
      like: [],
      retweet: [],
      reply: [],
      quote: [],
    });
  });

  it("genreStatsForMedia counts posts whose metrics arrive as strings as unmeasured", () => {
    const stats = genreStatsForMedia([
      null,
      { caption: 42, views: "10" },
      { caption: "ラーメンを食べた", views: 100, saves: 10, likes: 5 },
    ]);
    const byGenre = new Map(stats.map((row) => [row.genre, row]));
    expect(stats.reduce((sum, row) => sum + row.count, 0)).toBe(2);
    expect(byGenre.get("グルメ").totalViews).toBe(100);
    expect(byGenre.get("グルメ").saveRate).toBeCloseTo(0.1);
    const fallback = stats.find((row) => row.totalViews === 0);
    expect(fallback.count).toBe(1);
    expect(fallback.avgViews).toBeNull();
  });
});

describe("translation status summaries that disagree with the rows", () => {
  const articles = [
    { id: "a1", title: "2026-11-19 記事", en: "fresh", zh: "fresh" },
    { id: "a2", title: "2026-11-18 記事", en: "stale", zh: "fresh" },
  ];

  it("derives a language the languages object does not mention", () => {
    const status = parseTranslationStatus({
      articles,
      languages: { en: { fresh: 5, stale: 0, missing: 0 } },
    });
    expect(status.languages.en).toEqual({ fresh: 5, stale: 0, missing: 0 });
    expect(status.languages.zh).toEqual({ fresh: 2, stale: 0, missing: 0 });
  });

  it("derives the counts when they arrive as strings", () => {
    const status = parseTranslationStatus({
      articles,
      languages: {
        en: { fresh: "1", stale: "1", missing: "0" },
        zh: { fresh: "2", stale: "0", missing: "0" },
      },
    });
    expect(status.languages.en).toEqual({ fresh: 1, stale: 1, missing: 0 });
    expect(status.languages.zh).toEqual({ fresh: 2, stale: 0, missing: 0 });
  });

  it("never lets a half-numeric summary disagree with the article rows", () => {
    // One count as a string makes the summary unusable as a
    // whole: the screen must fall back to the rows, so the
    // headline counts and the attention list cannot diverge.
    const status = parseTranslationStatus({
      articles,
      languages: {
        en: { fresh: "1", stale: 0, missing: 0 },
        zh: { fresh: 2, stale: "0", missing: 0 },
      },
    });
    expect(status.languages.en).toEqual({ fresh: 1, stale: 1, missing: 0 });
    expect(status.languages.zh).toEqual({ fresh: 2, stale: 0, missing: 0 });
  });

  it("falls back to the row count when total arrives as a string", () => {
    const status = parseTranslationStatus({ articles, total: "46" });
    expect(status.total).toBe(2);
    const generated = parseTranslationStatus({ articles, generatedAt: 42 });
    expect(generated.generatedAt).toBeNull();
  });
});

describe("X API runway that rounds to nothing", () => {
  it("reports no estimate when the balance is nearly spent", () => {
    // $1.00 down to $0.01 over a month: the raw estimate is a
    // small positive number of months, but rounded to one
    // decimal it is zero — and "あと約0か月分" is not an
    // estimate, so the function must stay null.
    const rows = [
      { collected_at: "2026-10-12T00:00:00Z", x_api_balance_usd: 1.0 },
      { collected_at: "2026-11-10T00:00:00Z", x_api_balance_usd: 0.01 },
    ];
    expect(xApiRunwayMonths(rows)).toBeNull();
  });
});

describe("blog meta and RSS payloads of the wrong shape", () => {
  it("parseBlogMeta keeps only string titles and clean string tag lists", () => {
    const meta = parseBlogMeta({
      titles: { a: 42, b: "2026-11-19 題" },
      tags: { a: "技術", b: ["技術", 42, " 技術 ", ""], c: [] },
    });
    expect([...meta.titles.entries()]).toEqual([["b", "2026-11-19 題"]]);
    expect([...meta.tags.entries()]).toEqual([["b", ["技術"]]]);
    expect(parseBlogMeta("junk").titles.size).toBe(0);
  });

  it("parseRssTitles skips items without a title or a link", () => {
    const xml = [
      "<rss><channel>",
      "<item><title>題だけ</title></item>",
      "<item><link>https://example.com/blog/abc</link></item>",
      "<item><title>2026-11-19 本題</title><link>https://example.com/blog/xyz</link></item>",
      "</channel></rss>",
    ].join("");
    const titles = parseRssTitles(xml);
    expect([...titles.entries()]).toEqual([["xyz", "2026-11-19 本題"]]);
    expect(parseRssTitles(42).size).toBe(0);
    expect(parseRssTitles("<html>not a feed").size).toBe(0);
  });
});
