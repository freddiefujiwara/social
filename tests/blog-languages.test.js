import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { blogLanguageOfPath, blogLanguageViews } from "../src/api.js";
import { renderBlogLanguages } from "../src/render-blog.js";

// The blog tab's 言語別（過去28日）section: a prefix split of
// the GA page rows the dashboard already loads. English lives
// under /en/ and /blog/en/, Chinese under /zh/ and /blog/zh/,
// and everything else — the Japanese-only app paths included —
// counts as Japanese, so the three buckets always reconcile
// with the pages report's own total.
const row = (path, views) => ({
  dimensionValues: [{ value: path }],
  metricValues: [{ value: String(views) }],
});
const response = (rows) => ({ ok: true, data: { rows } });

// The production split at the time of writing (2026-11-26):
// ja 6,989 / en 424 / zh 108 = 7,521, the site total.
const PRODUCTION_LIKE = response([
  row("/", 1000),
  row("/blog/1egcvG9FvC232mYN--ZYr7nH65uVPDT5QgUlNhAGAm-w", 5000),
  row("/list-of-stuff/", 989),
  row("/blog/en/1egcvG9FvC232mYN--ZYr7nH65uVPDT5QgUlNhAGAm-w", 400),
  row("/en/", 24),
  row("/blog/zh/186JmaWRWpqCCu97m1EJHliffTNbgMlf4ivYFcY8lB6k", 100),
  row("/zh/", 8),
]);

describe("blogLanguageOfPath", () => {
  it("classifies the English roots and everything under them", () => {
    expect(blogLanguageOfPath("/en")).toBe("en");
    expect(blogLanguageOfPath("/en/")).toBe("en");
    expect(blogLanguageOfPath("/en/blog/some-article")).toBe("en");
    expect(blogLanguageOfPath("/blog/en/")).toBe("en");
    expect(blogLanguageOfPath("/blog/en/1abcDEF")).toBe("en");
  });

  it("classifies the Chinese roots and everything under them", () => {
    expect(blogLanguageOfPath("/zh")).toBe("zh");
    expect(blogLanguageOfPath("/zh/")).toBe("zh");
    expect(blogLanguageOfPath("/blog/zh/")).toBe("zh");
    expect(blogLanguageOfPath("/blog/zh/1abcDEF")).toBe("zh");
  });

  it("counts everything else as Japanese, app paths included", () => {
    expect(blogLanguageOfPath("/")).toBe("ja");
    expect(blogLanguageOfPath("/blog/")).toBe("ja");
    expect(blogLanguageOfPath("/blog/1abcDEF")).toBe("ja");
    // A split article's base-relative row is Japanese either way.
    expect(blogLanguageOfPath("/1abcDEF")).toBe("ja");
    expect(blogLanguageOfPath("/list-of-stuff/")).toBe("ja");
    expect(blogLanguageOfPath("/health/")).toBe("ja");
    // The prefix must be a whole segment: lookalikes stay Japanese.
    expect(blogLanguageOfPath("/english/")).toBe("ja");
    expect(blogLanguageOfPath("/blog/en")).toBe("ja");
  });
});

describe("blogLanguageViews", () => {
  it("sums each bucket and reconciles with the report total", () => {
    const langs = blogLanguageViews(PRODUCTION_LIKE);
    expect(langs.map((l) => l.key)).toEqual(["ja", "en", "zh"]);
    expect(langs.map((l) => l.label)).toEqual(["日本語", "英語", "中国語"]);
    expect(langs.map((l) => l.views)).toEqual([6989, 424, 108]);
    const bucketTotal = langs.reduce((sum, l) => sum + l.views, 0);
    expect(bucketTotal).toBe(7521);
    expect(langs.map((l) => l.share)).toEqual([92.9, 5.6, 1.4]);
  });

  it("returns zeroed buckets for a failed or empty report", () => {
    for (const bad of [{ ok: false }, response([]), null]) {
      const langs = blogLanguageViews(bad);
      expect(langs.map((l) => l.views)).toEqual([0, 0, 0]);
      expect(langs.map((l) => l.share)).toEqual([0, 0, 0]);
    }
  });

  it("drops rows without a path dimension, like the other shapers", () => {
    const langs = blogLanguageViews(
      response([{ dimensionValues: [], metricValues: [{ value: "10" }] }, row("/", 5)]),
    );
    expect(langs.map((l) => l.views)).toEqual([5, 0, 0]);
  });
});

describe("renderBlogLanguages", () => {
  const setup = () => {
    document.body.innerHTML = '<ul id="blog-languages" class="ranking"></ul>';
    return document.getElementById("blog-languages");
  };

  it("renders the three languages with masked counts and visible shares", () => {
    const list = setup();
    renderBlogLanguages(PRODUCTION_LIKE);
    const items = [...list.querySelectorAll("li")];
    expect(items).toHaveLength(3);
    expect(items[0].textContent).toContain("日本語");
    expect(items[1].textContent).toContain("英語");
    expect(items[2].textContent).toContain("中国語");
    // The count sits in the masking class, like every blog figure.
    const count = items[0].querySelector(".amount-value");
    expect(count.textContent).toBe("6,989");
    // The share is a ratio: shown as-is, outside the masked span.
    expect(items[0].textContent).toContain("回（92.9%）");
    expect(count.textContent).not.toContain("%");
    expect(items[1].textContent).toContain("回（5.6%）");
    expect(items[2].textContent).toContain("回（1.4%）");
  });
});

describe("language split wiring (main.js / index.html)", () => {
  const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
  const mainJs = fs.readFileSync(path.join(root, "src", "main.js"), "utf8");
  const indexHtml = fs.readFileSync(path.join(root, "index.html"), "utf8");

  it("renders from fillBlogPages, after the pages failure guard", () => {
    const fillStart = mainJs.indexOf("async function fillBlogPages");
    const fill = mainJs.slice(fillStart, fillStart + 5000);
    const guard = fill.indexOf("pages.ok === false");
    const render = fill.indexOf("renderBlogLanguages(pages)");
    expect(guard).toBeGreaterThan(-1);
    expect(render).toBeGreaterThan(guard);
  });

  it("leaves the block unrendered when the page rows fail", () => {
    // settleBlogPagesFailed is the pages-failure path: it must
    // not touch the language list at all — no failure line, no
    // render — so the section simply stays empty.
    const failStart = mainJs.indexOf("function settleBlogPagesFailed()");
    const fail = mainJs.slice(failStart, failStart + 800);
    expect(fail).not.toContain("blog-languages");
    expect(fail).not.toContain("renderBlogLanguages");
  });

  it("has the section in the blog tab, titled 言語別（過去28日）", () => {
    expect(indexHtml).toContain('id="blog-languages"');
    expect(indexHtml).toContain("言語別（過去28日）");
  });
});
