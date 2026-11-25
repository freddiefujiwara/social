import { describe, expect, it } from "vitest";
import {
  articlePageViews,
  blogScrollMap,
  blogSpeedMap,
  canonicalPageKey,
  pageDisplay,
  pageRanking,
} from "../src/api.js";

// Dummy article ids (long URL-safe tokens, like the blog's real
// ones in shape only). The language forms of an article —
// /blog/en/<id> and /blog/zh/<id> — must key to the same article
// as /blog/<id>, mirroring social-gas's articleIdFromPath_:
// the language segment counts only immediately after /blog/.
const ID_A = "1DummyArticleTokenForKeyTests00000001";
const ID_B = "2DummyArticleTokenForKeyTests00000002";
const ORIGIN = "https://freddiefujiwara.com";

const response = (rows) => ({ ok: true, data: { rows } });
const pageRow = (path, views) => ({
  dimensionValues: [{ value: path }],
  metricValues: [{ value: String(views) }],
});

describe("canonicalPageKey with language article paths", () => {
  it("merges the English and Chinese article paths into the article", () => {
    expect(canonicalPageKey(`/blog/en/${ID_A}`)).toBe(`/blog/${ID_A}`);
    expect(canonicalPageKey(`/blog/zh/${ID_A}`)).toBe(`/blog/${ID_A}`);
  });

  it("tolerates a trailing slash on the language forms", () => {
    expect(canonicalPageKey(`/blog/en/${ID_A}/`)).toBe(`/blog/${ID_A}`);
    expect(canonicalPageKey(`/blog/zh/${ID_A}/`)).toBe(`/blog/${ID_A}`);
  });

  it("keeps the language indexes and language roots as their own identity", () => {
    expect(canonicalPageKey("/blog/en/")).toBe("/blog/en/");
    expect(canonicalPageKey("/blog/zh/")).toBe("/blog/zh/");
    expect(canonicalPageKey("/blog/en")).toBe("/blog/en");
    expect(canonicalPageKey("/blog/zh")).toBe("/blog/zh");
    expect(canonicalPageKey("/en/")).toBe("/en/");
    expect(canonicalPageKey("/zh/")).toBe("/zh/");
  });

  it("does not treat a bare language-prefixed id as an article", () => {
    expect(canonicalPageKey(`/en/${ID_A}`)).toBe(`/en/${ID_A}`);
    expect(canonicalPageKey(`/zh/${ID_A}`)).toBe(`/zh/${ID_A}`);
  });

  it("leaves staging and look-alike segments untouched", () => {
    expect(canonicalPageKey(`/blog/staging/${ID_A}`)).toBe(
      `/blog/staging/${ID_A}`,
    );
    expect(canonicalPageKey(`/blog/enx/${ID_A}`)).toBe(`/blog/enx/${ID_A}`);
    expect(canonicalPageKey(`/blog/en/en/${ID_A}`)).toBe(
      `/blog/en/en/${ID_A}`,
    );
  });
});

describe("pageDisplay with language article paths", () => {
  const titles = new Map([[ID_A, "ダミー記事のタイトル"]]);

  it("resolves a translation path to the title and the canonical URL", () => {
    expect(pageDisplay(`/blog/en/${ID_A}`, titles, ORIGIN)).toEqual({
      label: "ダミー記事のタイトル",
      href: `${ORIGIN}/blog/${ID_A}`,
    });
    expect(pageDisplay(`/blog/zh/${ID_A}`, titles, ORIGIN)).toEqual({
      label: "ダミー記事のタイトル",
      href: `${ORIGIN}/blog/${ID_A}`,
    });
  });

  it("keeps the raw path for the language index and bare language ids", () => {
    expect(pageDisplay("/blog/en/", titles, ORIGIN)).toEqual({
      label: "/blog/en/",
      href: `${ORIGIN}/blog/en/`,
    });
    expect(pageDisplay(`/en/${ID_A}`, titles, ORIGIN)).toEqual({
      label: `/en/${ID_A}`,
      href: `${ORIGIN}/en/${ID_A}`,
    });
  });
});

describe("pageRanking with language article paths", () => {
  it("sums the Japanese, English and Chinese rows into one article row", () => {
    const titles = new Map([[ID_A, "ダミー記事のタイトル"]]);
    const ranking = pageRanking(
      response([
        pageRow(`/blog/${ID_A}`, 100),
        pageRow(`/blog/en/${ID_A}`, 30),
        pageRow(`/blog/zh/${ID_A}`, 5),
        pageRow(`/blog/${ID_B}`, 50),
      ]),
      titles,
      ORIGIN,
      10,
    );
    expect(ranking).toEqual([
      { label: "ダミー記事のタイトル", href: `${ORIGIN}/blog/${ID_A}`, views: 135 },
      { label: `/blog/${ID_B}`, href: `${ORIGIN}/blog/${ID_B}`, views: 50 },
    ]);
  });
});

describe("articlePageViews with language article paths", () => {
  it("sums the three language forms and skips non-article language paths", () => {
    const views = articlePageViews(
      response([
        pageRow(`/${ID_A}`, 10),
        pageRow(`/blog/${ID_A}`, 100),
        pageRow(`/blog/en/${ID_A}`, 30),
        pageRow(`/blog/zh/${ID_A}`, 5),
        pageRow(`/en/${ID_A}`, 999),
        pageRow("/blog/en/", 888),
        pageRow(`/blog/staging/${ID_A}`, 777),
      ]),
    );
    expect(views).toEqual([{ id: ID_A, views: 145 }]);
  });
});

describe("blogScrollMap with language article paths", () => {
  const scrollRow = (path, percent, count) => ({
    dimensionValues: [{ value: path }, { value: String(percent) }],
    metricValues: [{ value: String(count) }],
  });

  it("merges translation rows into the article's milestones", () => {
    const map = blogScrollMap(
      response([
        scrollRow(`/blog/${ID_A}`, 25, 40),
        scrollRow(`/blog/en/${ID_A}`, 25, 10),
        scrollRow(`/blog/zh/${ID_A}`, 25, 2),
        scrollRow(`/blog/en/${ID_A}`, 100, 3),
      ]),
    );
    expect(map.size).toBe(1);
    expect(map.get(ID_A)).toEqual({
      scroll25: 52,
      scroll50: 0,
      scroll75: 0,
      scroll100: 3,
    });
  });
});

describe("blogSpeedMap with language article paths", () => {
  const speedRow = (path, total, samples, slow) => ({
    dimensionValues: [{ value: path }],
    metricValues: [
      { value: String(total) },
      { value: String(samples) },
      { value: String(slow) },
    ],
  });

  it("merges translation rows into the article's totals", () => {
    const map = blogSpeedMap(
      response([
        speedRow(`/blog/${ID_A}`, 10000, 2, 1),
        speedRow(`/blog/en/${ID_A}`, 6000, 2, 0),
        speedRow(`/blog/zh/${ID_A}`, 4000, 1, 1),
      ]),
    );
    expect(map.size).toBe(1);
    // (10000 + 6000 + 4000) / (2 + 2 + 1) = 4000ms across the forms.
    expect(map.get(ID_A)).toEqual({ avgMs: 4000, samples: 5, slow: 2 });
  });
});
