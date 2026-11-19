import { describe, expect, it, vi } from "vitest";
import {
  parseTranslationStatus,
  fetchTranslationStatus,
  translationAttention,
} from "../src/api.js";
import { renderBlogTranslationStatus } from "../src/render-blog.js";
import {
  SECTION_FAILED_TEXT,
  setSectionFailed,
} from "../src/section-status.js";

// The blog tab's 翻訳ステータス section: blog-gas's
// ?o=translation-status payload shaped by parseTranslationStatus
// and rendered by renderBlogTranslationStatus. The fixtures use
// the payload's documented shape; the summary counts in them
// describe all 46 articles while the article rows are a
// three-row excerpt, the same relationship the real payload
// has (its summary always covers every article).
const ID_FRESH = "1l1bhbVkel_UNXvrUrHmOiz0bm4djN8jgD3muuP3Brbc";
const ID_STALE = "1tn5P1vB1jnKHSay_FC2AEtNxH0gQZ3_jffRnHuz4YpM";
const ID_MISSING = "1rb1BZG19mzzSQ9qK8thIl_LpGySGJgi7K2ZoKLzCB7U";

const STATUS = {
  generatedAt: "2026-11-19T17:30:00.000Z",
  total: 46,
  languages: {
    en: { fresh: 44, stale: 1, missing: 1 },
    zh: { fresh: 45, stale: 0, missing: 1 },
  },
  articles: [
    {
      id: ID_FRESH,
      title: "2026-11-18 川口の外国人は57,000人超",
      en: "fresh",
      zh: "fresh",
    },
    {
      id: ID_STALE,
      title: "2021-02-16 持ち物リスト",
      en: "stale",
      zh: "fresh",
    },
    {
      id: ID_MISSING,
      title: "2026-11-12 nginxのログで家電を動かす",
      en: "missing",
      zh: "missing",
    },
  ],
};

describe("parseTranslationStatus", () => {
  it("shapes the payload, keeping its own summary counts", () => {
    const status = parseTranslationStatus(STATUS);
    expect(status.generatedAt).toBe("2026-11-19T17:30:00.000Z");
    expect(status.total).toBe(46);
    expect(status.languages).toEqual({
      en: { fresh: 44, stale: 1, missing: 1 },
      zh: { fresh: 45, stale: 0, missing: 1 },
    });
    expect(status.articles).toHaveLength(3);
    expect(status.articles[1]).toEqual({
      id: ID_STALE,
      title: "2021-02-16 持ち物リスト",
      en: "stale",
      zh: "fresh",
    });
  });

  it("derives the counts from the article rows when the summary is absent", () => {
    const { languages, ...rest } = STATUS;
    const status = parseTranslationStatus(rest);
    expect(status.languages).toEqual({
      en: { fresh: 1, stale: 1, missing: 1 },
      zh: { fresh: 2, stale: 0, missing: 1 },
    });
  });

  it("returns null for payloads that are not a translation status", () => {
    // The blog-gas default payload (what ?o= answers until the
    // translation-status route exists) and a GA report shape
    // must not render as invented numbers.
    expect(
      parseTranslationStatus({ ids: [ID_FRESH], titles: {}, tags: {} }),
    ).toBeNull();
    expect(parseTranslationStatus({ ok: true, data: { rows: [] } })).toBeNull();
    for (const junk of [null, undefined, "nope", 42, []]) {
      expect(parseTranslationStatus(junk)).toBeNull();
    }
  });

  it("coerces unknown statuses to missing and drops unusable rows", () => {
    const status = parseTranslationStatus({
      total: 2,
      articles: [
        { id: ID_FRESH, title: "題", en: "weird", zh: "fresh" },
        { title: "idのない行", en: "fresh", zh: "fresh" },
        { id: ID_STALE, en: "fresh", zh: "stale" },
      ],
    });
    expect(status.articles).toHaveLength(2);
    expect(status.articles[0].en).toBe("missing");
    // A row without a title falls back to its id.
    expect(status.articles[1].title).toBe(ID_STALE);
    expect(status.languages.en).toEqual({ fresh: 1, stale: 0, missing: 1 });
    expect(status.languages.zh).toEqual({ fresh: 1, stale: 1, missing: 0 });
  });
});

describe("fetchTranslationStatus", () => {
  const jsonResponse = (obj) => ({ json: async () => obj });

  it("resolves with the shaped status", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(STATUS));
    const status = await fetchTranslationStatus(
      "https://example.com/exec?o=translation-status",
      fetchImpl,
    );
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(status.total).toBe(46);
    expect(status.languages.en.fresh).toBe(44);
  });

  it("resolves to null when the fetch fails", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("offline");
    });
    await expect(
      fetchTranslationStatus("https://example.com/exec", fetchImpl),
    ).resolves.toBeNull();
  });

  it("resolves to null for a payload of another shape", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ ids: [], titles: {}, tags: {} }),
    );
    await expect(
      fetchTranslationStatus("https://example.com/exec", fetchImpl),
    ).resolves.toBeNull();
  });
});

describe("translationAttention", () => {
  it("keeps only the articles that are not fresh in some language", () => {
    const attention = translationAttention(parseTranslationStatus(STATUS));
    expect(attention.map((article) => article.id)).toEqual([
      ID_STALE,
      ID_MISSING,
    ]);
    expect(attention[0].problems).toEqual([
      { lang: "en", label: "英語", status: "stale" },
    ]);
    expect(attention[1].problems).toEqual([
      { lang: "en", label: "英語", status: "missing" },
      { lang: "zh", label: "中国語", status: "missing" },
    ]);
  });

  it("is empty when everything is fresh, and tolerates junk", () => {
    const fresh = parseTranslationStatus({
      total: 1,
      articles: [{ id: ID_FRESH, title: "題", en: "fresh", zh: "fresh" }],
    });
    expect(translationAttention(fresh)).toEqual([]);
    expect(translationAttention(null)).toEqual([]);
  });
});

describe("renderBlogTranslationStatus", () => {
  const setup = () => {
    document.body.innerHTML = '<div id="blog-translation-status"></div>';
    return document.getElementById("blog-translation-status");
  };

  it("renders the per-language summary and the attention list", () => {
    const wrap = setup();
    renderBlogTranslationStatus(parseTranslationStatus(STATUS));
    // The status carries its generation time, in JST.
    expect(wrap.textContent).toContain("2026/11/20");
    expect(wrap.textContent).toContain("2:30");
    expect(wrap.textContent).toContain("時点の状態です");
    const boxes = [...wrap.querySelectorAll(".total-box")];
    expect(boxes).toHaveLength(2);
    expect(boxes[0].querySelector(".total-label").textContent).toBe("英語");
    expect(boxes[0].querySelector(".total-value").textContent).toBe("44/46");
    expect(boxes[0].textContent).toContain("古い 1件");
    expect(boxes[0].textContent).toContain("未翻訳 1件");
    expect(boxes[1].querySelector(".total-label").textContent).toBe("中国語");
    expect(boxes[1].querySelector(".total-value").textContent).toBe("45/46");
    expect(boxes[1].textContent).toContain("未翻訳 1件");
    expect(boxes[1].textContent).not.toContain("古い");
    // Only the articles needing attention are listed, each with
    // a link to the article and its per-language problems.
    const items = [...wrap.querySelectorAll("ul.ranking li")];
    expect(items).toHaveLength(2);
    const first = items[0].querySelector("a");
    expect(first.textContent).toBe("2021-02-16 持ち物リスト");
    expect(first.href).toBe(`https://freddiefujiwara.com/blog/${ID_STALE}`);
    expect(items[0].textContent).toContain("英語：古い");
    expect(items[1].textContent).toContain("英語：未翻訳／中国語：未翻訳");
    expect(wrap.textContent).not.toContain("川口の外国人は57,000人超");
  });

  it("renders the all-clear state when every article is fresh", () => {
    const wrap = setup();
    renderBlogTranslationStatus(
      parseTranslationStatus({
        generatedAt: "2026-11-19T17:30:00.000Z",
        total: 46,
        languages: {
          en: { fresh: 46, stale: 0, missing: 0 },
          zh: { fresh: 46, stale: 0, missing: 0 },
        },
        articles: [
          { id: ID_FRESH, title: "2026-11-18 記事", en: "fresh", zh: "fresh" },
        ],
      }),
    );
    expect(wrap.textContent).toContain("すべての記事の翻訳が最新です。");
    expect(wrap.querySelector("ul.ranking")).toBeNull();
    const boxes = [...wrap.querySelectorAll(".total-box")];
    expect(boxes.map((box) => box.querySelector(".total-value").textContent))
      .toEqual(["46/46", "46/46"]);
    expect(wrap.querySelector(".kpi-delta")).toBeNull();
  });

  it("shows the failure line in the section when the status is null", () => {
    // The wiring main.js applies to a null status: the section
    // ends on the shared failure line instead of staying blank.
    const wrap = setup();
    setSectionFailed(wrap);
    expect(wrap.textContent).toBe(SECTION_FAILED_TEXT);
    expect(wrap.querySelector("p").className).toContain("section-failed");
  });
});
