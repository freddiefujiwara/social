import { describe, expect, it } from "vitest";
import * as fc from "fast-check";
import {
  blogArticleDateKey,
  captionHead,
  dailyLatestSeries,
  formatClockDuration,
  formatCount,
  formatDelta,
  formatPercent,
  formatSeconds,
  formatUsd,
  formatWatchRate,
  historyDailyDelta,
  jstDateKey,
  mergeBlogTitles,
  parseTranslationStatus,
  snsHistorySeries,
  sortMedia,
  xApiRunwayMonths,
} from "../src/api.js";
import {
  classifyCaption,
  classifyXText,
  formatRate,
  genreStatsForMedia,
} from "../src/genres.js";
import { formatAxisValue, niceAxisScale } from "../src/chart.js";
import {
  genreHeatMix,
  layoutWithLabelRoom,
  squarifiedLayout,
} from "../src/treemap.js";

// Property-based tests (fast-check): the invariants the pure
// transforms claim in their own comments, checked over generated
// inputs instead of hand-picked examples. Domains stay inside
// what real callers can produce (counts are non-negative, history
// rows carry ISO timestamps or junk fields, layout values are
// positive magnitudes) — the deformities beyond that are the
// abnormal-case suite's job (tests/api-abnormal.test.js).

const NUM_RUNS = { numRuns: 100 };

const junkValue = fc.oneof(
  fc.double(),
  fc.integer(),
  fc.string(),
  fc.boolean(),
  fc.constant(null),
  fc.constant(undefined),
  fc.constant(Number.NaN),
  fc.constant(Number.POSITIVE_INFINITY),
  fc.constant(Number.NEGATIVE_INFINITY),
);

describe("formatters never leak a non-value", () => {
  const formatters = {
    formatCount,
    formatPercent,
    formatSeconds,
    formatWatchRate,
    formatUsd,
    formatRate,
    formatAxisValue,
  };
  for (const [name, format] of Object.entries(formatters)) {
    it(`${name} always returns a clean string`, () => {
      fc.assert(
        fc.property(junkValue, (value) => {
          const out = format(value);
          expect(typeof out).toBe("string");
          expect(out).not.toMatch(/NaN|undefined/);
        }),
        NUM_RUNS,
      );
    });
  }

  it("formatClockDuration round-trips positive seconds", () => {
    fc.assert(
      fc.property(fc.double({ min: 0.1, max: 3600 * 48, noNaN: true }), (value) => {
        const out = formatClockDuration(value);
        const parts = out.split(":").map(Number);
        const back =
          parts.length === 3
            ? parts[0] * 3600 + parts[1] * 60 + parts[2]
            : parts[0] * 60 + parts[1];
        expect(back).toBe(Math.round(value));
      }),
      NUM_RUNS,
    );
    expect(formatClockDuration(0)).toBe("—");
    expect(formatClockDuration(-5)).toBe("—");
  });

  it("formatDelta signs its output by the input's sign", () => {
    fc.assert(
      fc.property(junkValue, (value) => {
        const out = formatDelta(value);
        if (typeof value !== "number" || !Number.isFinite(value)) {
          expect(out).toBeNull();
        } else if (value > 0) {
          expect(out.startsWith("+")).toBe(true);
        } else if (value < 0) {
          expect(out.startsWith("-")).toBe(true);
        } else {
          expect(out).toBe("±0");
        }
      }),
      NUM_RUNS,
    );
  });

  it("jstDateKey yields a YYYYMMDD key or null, deterministically", () => {
    fc.assert(
      fc.property(fc.string(), (value) => {
        const key = jstDateKey(value);
        expect(key === null || /^\d{8}$/.test(key)).toBe(true);
        expect(jstDateKey(value)).toBe(key);
      }),
      NUM_RUNS,
    );
  });

  it("blogArticleDateKey yields a plausible day key or null", () => {
    fc.assert(
      fc.property(fc.string(), (title) => {
        const key = blogArticleDateKey(title);
        if (key === null) {
          return;
        }
        expect(key).toMatch(/^\d{8}$/);
        const month = Number(key.slice(4, 6));
        const day = Number(key.slice(6, 8));
        expect(month).toBeGreaterThanOrEqual(1);
        expect(month).toBeLessThanOrEqual(12);
        expect(day).toBeGreaterThanOrEqual(1);
        expect(day).toBeLessThanOrEqual(31);
      }),
      NUM_RUNS,
    );
  });

  it("captionHead never exceeds the cap by more than the ellipsis", () => {
    fc.assert(
      fc.property(fc.string(), fc.integer({ min: 1, max: 200 }), (caption, max) => {
        const out = captionHead(caption, max);
        expect(out.length).toBeLessThanOrEqual(max + 1);
        const normalized = caption.replace(/\s+/g, " ").trim();
        if (normalized.length <= max) {
          expect(out).toBe(normalized);
        } else {
          expect(out.endsWith("…")).toBe(true);
        }
      }),
      NUM_RUNS,
    );
  });
});

describe("sorting keeps every row and sinks missing values", () => {
  // Rows are generated plain and tagged with unique ids
  // afterwards, so permutation checks can track them.
  const mediaRows = fc
    .array(
      fc.record({
        views: fc.oneof(
          fc.integer({ min: 0, max: 100000 }),
          fc.constant(null),
          fc.constant(undefined),
          fc.constant(Number.NaN),
        ),
      }),
      { maxLength: 12 },
    )
    .map((rows) => rows.map((row, i) => ({ ...row, id: `r${i}` })));

  it("sortMedia permutes its input and orders present values", () => {
    fc.assert(
      fc.property(mediaRows, fc.constantFrom("asc", "desc"), (rows, dir) => {
        const sorted = sortMedia(rows, "views", dir);
        expect(sorted.map((r) => r.id).sort()).toEqual(rows.map((r) => r.id).sort());
        const present = sorted.filter(
          (r) => typeof r.views === "number" && Number.isFinite(r.views),
        );
        const missing = sorted.filter(
          (r) => !(typeof r.views === "number" && Number.isFinite(r.views)),
        );
        // Every present value comes before every missing one.
        expect(sorted.slice(0, present.length)).toEqual(present);
        expect(sorted.slice(present.length)).toEqual(missing);
        const values = present.map((r) => r.views);
        const ordered = [...values].sort((a, b) => (dir === "asc" ? a - b : b - a));
        expect(values).toEqual(ordered);
      }),
      NUM_RUNS,
    );
  });

  it("sortMedia on a non-array yields []", () => {
    expect(sortMedia("junk")).toEqual([]);
    expect(sortMedia(null)).toEqual([]);
  });
});

describe("dailyLatestSeries collapses to one point per day, last wins", () => {
  it("keeps the last point of each date and no other", () => {
    const point = fc.record({
      date: fc.constantFrom("20261101", "20261102", "20261103"),
      views: fc.integer({ min: 0, max: 1000 }),
    });
    fc.assert(
      fc.property(fc.array(point, { maxLength: 15 }), (points) => {
        const out = dailyLatestSeries(points);
        const dates = out.map((p) => p.date);
        expect(new Set(dates).size).toBe(dates.length);
        for (const p of out) {
          const last = [...points].reverse().find((q) => q.date === p.date);
          expect(p).toBe(last);
        }
        // First-insertion order of the dates is preserved.
        const firstSeen = [];
        for (const p of points) {
          if (!firstSeen.includes(p.date)) {
            firstSeen.push(p.date);
          }
        }
        expect(dates).toEqual(firstSeen);
      }),
      NUM_RUNS,
    );
  });
});

describe("history shaping never throws and stays ordered", () => {
  // Domain note: collected_at is written by the collector as
  // an ISO timestamp, so the generator uses ISO strings plus
  // clearly unparseable junk. Arbitrary strings that Date
  // happens to parse anyway ("3", "Nov 1 2026") are not a
  // shape the history sheet can hold, and their string order
  // is not chronological — outside the reachable domain.
  const historyRow = fc.record({
    collected_at: fc.oneof(
      fc.constantFrom(
        "2026-11-01T00:00:00Z",
        "2026-11-01T12:00:00Z",
        "2026-11-02T00:00:00Z",
        "2026-11-03T06:00:00Z",
        "junk",
        "",
        "not-a-date",
      ),
      fc.constant(null),
    ),
    total_followers: fc.oneof(
      fc.integer({ min: 0, max: 100000 }),
      fc.constant(null),
      fc.string(),
    ),
  });

  it("snsHistorySeries points ascend by day with finite values", () => {
    fc.assert(
      fc.property(fc.array(historyRow, { maxLength: 15 }), (rows) => {
        const series = snsHistorySeries(rows);
        for (const s of series) {
          const dates = s.points.map((p) => p.date);
          expect(dates).toEqual([...dates].sort());
          for (const p of s.points) {
            expect(Number.isFinite(p.views)).toBe(true);
          }
          expect(s.latest).toBe(s.points[s.points.length - 1].views);
        }
        expect(() => historyDailyDelta(rows, "total_followers")).not.toThrow();
      }),
      NUM_RUNS,
    );
  });

  it("xApiRunwayMonths is null or a positive finite number", () => {
    const balanceRow = fc.record({
      collected_at: fc.constantFrom(
        "2026-10-01T00:00:00Z",
        "2026-10-15T00:00:00Z",
        "2026-11-01T00:00:00Z",
        "2026-11-10T00:00:00Z",
      ),
      x_api_balance_usd: fc.oneof(
        fc.double({ min: 0, max: 100, noNaN: true }),
        fc.constant(null),
      ),
    });
    fc.assert(
      fc.property(fc.array(balanceRow, { maxLength: 12 }), (rows) => {
        const months = xApiRunwayMonths(rows);
        expect(
          months === null || (Number.isFinite(months) && months > 0),
        ).toBe(true);
      }),
      NUM_RUNS,
    );
  });
});

describe("genre rollup conserves counts and views", () => {
  const post = fc.record({
    caption: fc.constantFrom(
      "ラーメンを食べた",
      "川口を散歩した",
      "#川口カフェ でモーニング",
      "Sunoで曲を作った",
      "ただの日記",
      "",
    ),
    views: fc.oneof(fc.integer({ min: 0, max: 10000 }), fc.constant(null)),
    saves: fc.oneof(fc.integer({ min: 0, max: 100 }), fc.constant(null)),
    likes: fc.oneof(fc.integer({ min: 0, max: 100 }), fc.constant(null)),
  });

  it("counts and view totals add back up to the input", () => {
    fc.assert(
      fc.property(fc.array(post, { maxLength: 15 }), (posts) => {
        const stats = genreStatsForMedia(posts);
        expect(stats.reduce((sum, row) => sum + row.count, 0)).toBe(posts.length);
        const expectedViews = posts.reduce(
          (sum, p) => sum + (typeof p.views === "number" ? p.views : 0),
          0,
        );
        expect(stats.reduce((sum, row) => sum + row.totalViews, 0)).toBe(expectedViews);
        const totals = stats.map((row) => row.totalViews);
        expect(totals).toEqual([...totals].sort((a, b) => b - a));
        for (const row of stats) {
          expect(typeof row.genre).toBe("string");
          expect(row.genre.length).toBeGreaterThan(0);
        }
      }),
      NUM_RUNS,
    );
  });

  it("classifiers always answer with a non-empty genre string", () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 300 }), (text) => {
        for (const genre of [classifyCaption(text), classifyXText(text)]) {
          expect(typeof genre).toBe("string");
          expect(genre.length).toBeGreaterThan(0);
        }
      }),
      NUM_RUNS,
    );
  });
});

describe("treemap layout honours its geometric contract", () => {
  const items = fc
    .array(
      fc.record({
        value: fc.integer({ min: 1, max: 100000 }),
      }),
      { minLength: 1, maxLength: 10 },
    )
    .map((list) => list.map((item, i) => ({ ...item, id: `t${i}` })));
  const box = fc.constantFrom([100, 100], [250, 100], [100, 250], [37, 53]);

  const expectLayoutSound = (rects, source, width, height) => {
    expect(rects).toHaveLength(source.length);
    expect(rects.map((r) => r.id).sort()).toEqual(source.map((r) => r.id).sort());
    const eps = 1e-6 * Math.max(width, height);
    for (const rect of rects) {
      expect(Number.isFinite(rect.x)).toBe(true);
      expect(rect.w).toBeGreaterThan(0);
      expect(rect.h).toBeGreaterThan(0);
      expect(rect.x).toBeGreaterThanOrEqual(-eps);
      expect(rect.y).toBeGreaterThanOrEqual(-eps);
      expect(rect.x + rect.w).toBeLessThanOrEqual(width + eps);
      expect(rect.y + rect.h).toBeLessThanOrEqual(height + eps);
    }
    for (let i = 0; i < rects.length; i++) {
      for (let j = i + 1; j < rects.length; j++) {
        const a = rects[i];
        const b = rects[j];
        const overlapW =
          Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
        const overlapH =
          Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
        expect(Math.max(0, overlapW) * Math.max(0, overlapH)).toBeLessThanOrEqual(eps);
      }
    }
  };

  it("squarifiedLayout tiles the box exactly, areas proportional", () => {
    fc.assert(
      fc.property(items, box, (list, [width, height]) => {
        const rects = squarifiedLayout(list, width, height);
        expectLayoutSound(rects, list, width, height);
        const areaSum = rects.reduce((sum, r) => sum + r.w * r.h, 0);
        expect(Math.abs(areaSum - width * height)).toBeLessThanOrEqual(
          width * height * 1e-6,
        );
        const valueSum = list.reduce((sum, item) => sum + item.value, 0);
        for (const rect of rects) {
          const expected = (rect.value / valueSum) * width * height;
          expect(Math.abs(rect.w * rect.h - expected)).toBeLessThanOrEqual(
            expected * 1e-4 + 1e-9,
          );
        }
      }),
      NUM_RUNS,
    );
  });

  it("squarifiedLayout keeps only positive finite values", () => {
    const mixed = fc.array(
      fc.record({
        value: fc.oneof(
          fc.integer({ min: 1, max: 1000 }),
          fc.constant(0),
          fc.integer({ min: -100, max: -1 }),
          fc.constant(Number.NaN),
          fc.constant("50"),
        ),
      }),
      { maxLength: 8 },
    );
    fc.assert(
      fc.property(mixed, (list) => {
        const tagged = list.map((item, i) => ({ ...item, id: `m${i}` }));
        const rects = squarifiedLayout(tagged, 100, 100);
        const kept = tagged.filter(
          (item) =>
            typeof item.value === "number" &&
            Number.isFinite(item.value) &&
            item.value > 0,
        );
        expect(rects.map((r) => r.id).sort()).toEqual(kept.map((r) => r.id).sort());
      }),
      NUM_RUNS,
    );
  });

  it("layoutWithLabelRoom still tiles the box without overlaps", () => {
    fc.assert(
      fc.property(items, (list) => {
        const rects = layoutWithLabelRoom(list);
        expectLayoutSound(rects, list, 100, 100);
      }),
      NUM_RUNS,
    );
  });

  it("genreHeatMix stays within its cap and rises with the average", () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0, max: 10000, noNaN: true }),
        fc.double({ min: 0, max: 10000, noNaN: true }),
        fc.double({ min: 0, max: 10000, noNaN: true }),
        fc.double({ min: 0, max: 10000, noNaN: true }),
        (min, max, a1, a2) => {
          fc.pre(min < max);
          const lo = Math.min(a1, a2);
          const hi = Math.max(a1, a2);
          const mixLo = genreHeatMix(lo, min, max);
          const mixHi = genreHeatMix(hi, min, max);
          for (const mix of [mixLo, mixHi]) {
            expect(mix === null || (Number.isInteger(mix) && mix >= 0 && mix <= 55)).toBe(true);
          }
          if (mixLo !== null && mixHi !== null) {
            expect(mixLo).toBeLessThanOrEqual(mixHi);
          }
        },
      ),
      NUM_RUNS,
    );
  });
});

describe("niceAxisScale brackets its range with ascending ticks", () => {
  it("contains the range and never produces NaN ticks", () => {
    // Domain note: the generated values stay at count-like
    // magnitudes (the chart's inputs are follower counts and
    // view totals). Denormal-magnitude inputs underflow the
    // scale arithmetic — a span below ~1e-308 makes
    // 10 ** floor(log10(step)) collapse to 0, and a denormal
    // endpoint makes the ceil snapping round the axis max to
    // zero — but no caller can produce such values, so,
    // following the blog #140 precedent, the generator stays
    // inside the reachable domain instead of contorting the
    // production code.
    const saneEndpoint = (v) => v === 0 || Math.abs(v) >= 1e-6;
    const range = fc
      .tuple(
        fc.double({ min: -1e9, max: 1e9, noNaN: true }),
        fc.double({ min: -1e9, max: 1e9, noNaN: true }),
      )
      .map(([a, b]) => (a <= b ? [a, b] : [b, a]))
      .filter(
        ([min, max]) =>
          saneEndpoint(min) &&
          saneEndpoint(max) &&
          (max - min === 0 || max - min >= 1e-3),
      );
    fc.assert(
      fc.property(range, ([min, max]) => {
        const scale = niceAxisScale(min, max);
        expect(scale).not.toBeNull();
        expect(scale.lo).toBeLessThanOrEqual(min);
        expect(scale.hi).toBeGreaterThanOrEqual(max);
        if (min >= 0) {
          expect(scale.lo).toBeGreaterThanOrEqual(0);
        }
        expect(scale.ticks.length).toBeGreaterThanOrEqual(2);
        // -0 and 0 are the same axis value; Object.is (vitest's
        // toBe) tells them apart, so compare numerically.
        const sameNumber = (a, b) => a === b || (a === 0 && b === 0);
        expect(sameNumber(scale.ticks[0], scale.lo)).toBe(true);
        expect(sameNumber(scale.ticks[scale.ticks.length - 1], scale.hi)).toBe(true);
        for (let i = 0; i < scale.ticks.length; i++) {
          expect(Number.isFinite(scale.ticks[i])).toBe(true);
          if (i > 0) {
            expect(scale.ticks[i]).toBeGreaterThan(scale.ticks[i - 1]);
          }
        }
      }),
      NUM_RUNS,
    );
  });
});

describe("parseTranslationStatus keeps counts and rows consistent", () => {
  const statusValue = fc.constantFrom("fresh", "stale", "missing", "weird", null, 42);
  const article = fc.record({
    id: fc.string({ minLength: 1, maxLength: 6 }),
    title: fc.string({ maxLength: 10 }),
    en: statusValue,
    zh: statusValue,
  });
  const count = fc.oneof(
    fc.integer({ min: 0, max: 60 }),
    fc.integer({ min: 0, max: 60 }).map(String),
    fc.constant(null),
  );
  const summary = fc.record({ fresh: count, stale: count, missing: count });

  it("counts are non-negative integers that match the summary or the rows", () => {
    fc.assert(
      fc.property(
        fc.array(article, { maxLength: 8 }),
        fc.oneof(summary, fc.constant(null)),
        fc.oneof(summary, fc.constant(null)),
        (articles, en, zh) => {
          const payload = { articles };
          const summaries = {};
          if (en) {
            summaries.en = en;
          }
          if (zh) {
            summaries.zh = zh;
          }
          if (en || zh) {
            payload.languages = summaries;
          }
          const status = parseTranslationStatus(payload);
          expect(status).not.toBeNull();
          for (const key of ["en", "zh"]) {
            const counts = status.languages[key];
            for (const name of ["fresh", "stale", "missing"]) {
              expect(Number.isInteger(counts[name])).toBe(true);
              expect(counts[name]).toBeGreaterThanOrEqual(0);
            }
            const sum = counts.fresh + counts.stale + counts.missing;
            const summaryOf = summaries[key];
            const summaryUsable =
              summaryOf &&
              ["fresh", "stale", "missing"].every(
                (name) => typeof summaryOf[name] === "number",
              );
            if (summaryUsable) {
              // A fully numeric summary is authoritative, with
              // each count floored and clamped at zero.
              const expected = ["fresh", "stale", "missing"].reduce(
                (total, name) =>
                  total + Math.max(0, Math.floor(summaryOf[name])),
                0,
              );
              expect(sum).toBe(expected);
            } else {
              // Otherwise the counts are derived from the rows,
              // so they always add up to the row count.
              expect(sum).toBe(status.articles.length);
            }
          }
          // Rows keep their order and only carry known statuses.
          expect(status.articles.map((a) => a.id)).toEqual(
            articles.map((a) => a.id),
          );
          for (const a of status.articles) {
            expect(["fresh", "stale", "missing"]).toContain(a.en);
            expect(["fresh", "stale", "missing"]).toContain(a.zh);
          }
        },
      ),
      NUM_RUNS,
    );
  });
});

describe("mergeBlogTitles unions two maps, RSS winning overlaps", () => {
  it("keeps every entry and leaves both inputs untouched", () => {
    const entries = fc.array(
      fc.tuple(fc.string({ minLength: 1, maxLength: 5 }), fc.string({ maxLength: 8 })),
      { maxLength: 8 },
    );
    fc.assert(
      fc.property(entries, entries, (metaEntries, rssEntries) => {
        const meta = new Map(metaEntries);
        const rss = new Map(rssEntries);
        const merged = mergeBlogTitles(meta, rss);
        expect(merged.size).toBe(new Set([...meta.keys(), ...rss.keys()]).size);
        for (const [id, title] of rss) {
          expect(merged.get(id)).toBe(title);
        }
        for (const [id, title] of meta) {
          if (!rss.has(id)) {
            expect(merged.get(id)).toBe(title);
          }
        }
        expect(meta.size).toBe(new Map(metaEntries).size);
        expect(rss.size).toBe(new Map(rssEntries).size);
      }),
      NUM_RUNS,
    );
  });
});
