// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  snsTotalFollowers,
  tiktokTotals,
  tiktokVideos,
  topPostsByChannel,
} from "../src/api.js";
import { overviewState } from "../src/overview-state.js";
import { createTiktokRenderer } from "../src/render-tiktok.js";

afterEach(() => {
  overviewState.detailScopes.tiktok = false;
  document.body.replaceChildren();
});

const DETAIL = {
  tiktok: {
    followers: 80,
    following: 121,
    total_likes: 7,
    video_count: 10,
    recent_videos: [
      {
        id: "v1",
        title: "小さい動画",
        url: "https://www.tiktok.com/@freddiefujiwara/video/1",
        published_at: "2026-11-28T01:00:00Z",
        views: 10,
        likes: 1,
        comments: 0,
        shares: 0,
        duration_sec: 50,
      },
      {
        id: "v2",
        title: "大きい動画",
        url: "https://www.tiktok.com/@freddiefujiwara/video/2",
        cover_url: "https://example.com/covers/2.jpg",
        published_at: "2026-11-28T02:00:00Z",
        views: 1234,
        likes: 56,
        comments: 7,
        shares: 8,
        duration_sec: 121,
      },
    ],
  },
};

function setupDom() {
  document.body.innerHTML =
    '<p id="tiktok-videos-range"></p>' +
    '<table id="sns-tiktok-table"><thead><tr>' +
    '<th aria-label="サムネイル"></th>' +
    '<th class="sortable" data-sort-key="title">タイトル</th>' +
    '<th class="sortable" data-sort-key="published_at">公開日時</th>' +
    '<th class="num sortable" data-sort-key="duration_sec">長さ</th>' +
    '<th class="num sortable" data-sort-key="views">再生回数</th>' +
    '<th class="num sortable" data-sort-key="likes">いいね</th>' +
    '<th class="num sortable" data-sort-key="comments">コメント</th>' +
    '<th class="num sortable" data-sort-key="shares">シェア</th>' +
    '</tr></thead><tbody id="sns-tiktok-body"></tbody></table>';
}

function createRenderer(overrides = {}) {
  return createTiktokRenderer({
    fillTotalBoxes: vi.fn(),
    fillDetailPending: () => false,
    fillScopePending: () => false,
    ...overrides,
  });
}

describe("createTiktokRenderer", () => {
  it("labels the recent rows separately from the account's video total", () => {
    setupDom();
    overviewState.detailScopes.tiktok = true;
    const fillTotalBoxes = vi.fn();
    const { renderTiktok } = createRenderer({ fillTotalBoxes });
    renderTiktok(DETAIL);

    const range = document.getElementById("tiktok-videos-range");
    expect(range.textContent).toBe("対象：最近の動画（表示：2件）");
    expect(range.querySelector(".amount-value").textContent).toBe("2");
    expect(document.querySelectorAll("#sns-tiktok-body tr")).toHaveLength(2);
    expect(fillTotalBoxes).toHaveBeenCalledWith(
      "sns-tiktok-totals",
      tiktokTotals(DETAIL),
    );
  });

  it("renders each video most-viewed first, with its counts and duration", () => {
    setupDom();
    overviewState.detailScopes.tiktok = true;
    const { renderTiktok } = createRenderer();
    renderTiktok(DETAIL);

    const rows = document.querySelectorAll("#sns-tiktok-body tr");
    const first = rows[0].querySelectorAll("td");
    const link = first[1].querySelector("a");
    expect(link.textContent).toBe("大きい動画");
    expect(link.href).toBe("https://www.tiktok.com/@freddiefujiwara/video/2");
    expect(first[2].textContent).toContain("2026");
    expect(first[3].textContent).toBe("2:01");
    expect([...first].slice(4).map((td) => td.textContent)).toEqual([
      "1,234",
      "56",
      "7",
      "8",
    ]);
    // Every count cell masks like the other channels' counts.
    for (const td of [...first].slice(3)) {
      expect(td.className).toContain("amount-value");
    }
    const second = rows[1].querySelectorAll("td");
    expect(second[1].querySelector("a").textContent).toBe("小さい動画");
    expect(second[3].textContent).toBe("0:50");
  });

  it("leads each row with the cover in a vertical thumbnail frame", () => {
    setupDom();
    overviewState.detailScopes.tiktok = true;
    const { renderTiktok } = createRenderer();
    renderTiktok(DETAIL);

    const rows = document.querySelectorAll("#sns-tiktok-body tr");
    // The covered video: a vertical frame holding its cover image.
    const covered = rows[0].querySelectorAll("td")[0];
    expect(covered.className).toContain("thumb-cell");
    const frame = covered.querySelector(".thumb-frame");
    expect(frame.className).toContain("thumb-vertical");
    expect(frame.querySelector("img").src).toBe(
      "https://example.com/covers/2.jpg",
    );
    // The coverless video: the same frame, empty, and the rest
    // of the row renders as usual.
    const bare = rows[1].querySelectorAll("td");
    expect(bare[0].className).toContain("thumb-cell");
    expect(bare[0].querySelector(".thumb-frame")).not.toBeNull();
    expect(bare[0].querySelector("img")).toBeNull();
    expect(bare[1].querySelector("a").textContent).toBe("小さい動画");
    expect(bare).toHaveLength(8);
  });

  it("holds the overview's preview back until the full section lands", () => {
    setupDom();
    overviewState.detailScopes.tiktok = false;
    const fillScopePending = vi.fn(() => true);
    const { renderTiktok } = createRenderer({ fillScopePending });
    renderTiktok(DETAIL);

    expect(fillScopePending).toHaveBeenCalled();
    expect(document.getElementById("tiktok-videos-range").textContent).toBe("");
    expect(document.querySelectorAll("#sns-tiktok-body tr")).toHaveLength(0);
  });

  it("shows the empty state for a loaded section with no videos", () => {
    setupDom();
    overviewState.detailScopes.tiktok = true;
    const { renderTiktok } = createRenderer();
    renderTiktok({ tiktok: { followers: 80, recent_videos: [] } });

    const rows = document.querySelectorAll("#sns-tiktok-body tr");
    expect(rows).toHaveLength(1);
    expect(rows[0].textContent).toBe("データがありません");
    expect(rows[0].querySelector("td").colSpan).toBe(8);
  });

  it("shows the empty state while the account is not authorized yet", () => {
    setupDom();
    overviewState.detailScopes.tiktok = true;
    const { renderTiktok } = createRenderer();
    renderTiktok({
      tiktok: {
        followers: null,
        following: null,
        total_likes: null,
        video_count: null,
        recent_videos: null,
        tiktok_error: "TikTok is not configured",
      },
    });

    const rows = document.querySelectorAll("#sns-tiktok-body tr");
    expect(rows).toHaveLength(1);
    expect(rows[0].textContent).toBe("データがありません");
  });
});

describe("tiktokTotals", () => {
  it("formats the account numbers, none of them public", () => {
    expect(tiktokTotals(DETAIL)).toEqual([
      { label: "フォロワー数", value: "80" },
      { label: "フォロー数", value: "121" },
      { label: "総いいね数", value: "7" },
      { label: "動画数", value: "10" },
    ]);
  });

  it("shows dashes for a missing or unauthorized section", () => {
    expect(tiktokTotals(null).every((c) => c.value === "—")).toBe(true);
    expect(
      tiktokTotals({ tiktok: { followers: null } }).every(
        (c) => c.value === "—",
      ),
    ).toBe(true);
  });
});

describe("tiktokVideos", () => {
  it("passes the array through and tolerates junk", () => {
    expect(tiktokVideos(DETAIL)).toHaveLength(2);
    expect(tiktokVideos(null)).toEqual([]);
    expect(tiktokVideos({ tiktok: { recent_videos: "x" } })).toEqual([]);
  });
});

describe("TikTok in the shared figures", () => {
  it("is part of the combined follower total", () => {
    expect(
      snsTotalFollowers({
        instagram: { freddiefujiwara: 2000 },
        threads: { followers: 300 },
        youtube: { subscribers: 10 },
        x: { followers: 1800 },
        tiktok: { followers: 80 },
      }),
    ).toBe(4190);
    expect(snsTotalFollowers({ tiktok: { followers: 80 } })).toBe(80);
  });

  it("joins the overview's top lists under its own channel name", () => {
    const sections = topPostsByChannel(DETAIL, [], 3);
    const tiktok = sections.find((s) => s.channel === "TikTok");
    expect(tiktok.metric).toBe("再生回数");
    expect(tiktok.items).toEqual([
      {
        label: "大きい動画",
        href: "https://www.tiktok.com/@freddiefujiwara/video/2",
        value: 1234,
      },
      {
        label: "小さい動画",
        href: "https://www.tiktok.com/@freddiefujiwara/video/1",
        value: 10,
      },
    ]);
    // The blog section still closes the list.
    expect(sections[sections.length - 1].channel).toBe("ブログ");
  });
});
