import { describe, expect, it, vi } from "vitest";
import {
  fetchSnsDetail,
  mergeSnsDetail,
  topPostsByChannel,
  SNS_DETAIL_PLATFORMS,
} from "../src/api.js";

const ENDPOINT = "https://example.com/exec";
const jsonResponse = (obj) => ({ json: async () => obj });

const NO_SCOPES = Object.freeze({
  instagram: false,
  youtube: false,
  threads: false,
  x: false,
});

// The overview scope's payload, in the shape social-gas serves
// it: every scalar, and each channel's recent list cut to the
// top 3 by views with only the fields the overview's top lists
// read (Instagram: caption / type / permalink / views; YouTube:
// title / url / views; Threads: text / permalink / views; X:
// text / url / views).
const OVERVIEW = {
  ok: true,
  action: "sns_detail",
  detail_scope: "overview",
  collected_at: "2026-11-24T01:00:00Z",
  instagram: {
    freddiefujiwara: 2000,
    media_count: 100,
    views_30d: 5000,
    recent_media: [
      {
        caption: "三番目の投稿",
        type: "IMAGE",
        permalink: "https://www.instagram.com/p/c/",
        views: 30,
      },
      {
        caption: "一番目の投稿",
        type: "REELS",
        permalink: "https://www.instagram.com/reel/a/",
        views: 300,
      },
      {
        caption: null,
        type: "REELS",
        permalink: "https://www.instagram.com/reel/b/",
        views: null,
      },
    ],
  },
  youtube: {
    subscribers: 10,
    recent_videos: [
      { title: "動画A", url: "https://www.youtube.com/watch?v=a", views: 40 },
    ],
  },
  threads: {
    followers: 300,
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
    recent_posts: [
      { text: "Xの投稿", url: "https://x.com/i/web/status/1", views: 60 },
    ],
    reactions: {},
    unattributed_reactions: [],
    recent_follows: [],
  },
};

const INSTAGRAM_SECTION = {
  freddiefujiwara: 2000,
  media_count: 100,
  views_30d: 5000,
  recent_media: [
    {
      id: "m1",
      type: "REELS",
      posted_at: "2026-11-23T01:00:00Z",
      caption: "全件の投稿",
      permalink: "https://www.instagram.com/reel/m1/",
      views: 300,
      likes: 10,
    },
  ],
};

const instagramResponse = (collectedAt = "2026-11-24T02:00:00Z") => ({
  ok: true,
  action: "sns_detail",
  detail_scope: "instagram",
  collected_at: collectedAt,
  instagram: INSTAGRAM_SECTION,
});

// A full (unscoped) snapshot: every channel key, no
// detail_scope — what a pre-scope bridge answers to any
// request, scoped or not.
const FULL = {
  ok: true,
  action: "sns_detail",
  collected_at: "2026-11-24T03:00:00Z",
  instagram: INSTAGRAM_SECTION,
  youtube: { subscribers: 10, recent_videos: [] },
  threads: { followers: 300, recent_posts: [] },
  x: { followers: 1800, recent_posts: [] },
};

describe("fetchSnsDetail scopes", () => {
  it("adds the scope parameter when one is given", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ ok: true }));
    await fetchSnsDetail(ENDPOINT, { idToken: "idt" }, fetchImpl, "overview");
    const url = new URL(fetchImpl.mock.calls[0][0]);
    expect(url.searchParams.get("action")).toBe("sns_detail");
    expect(url.searchParams.get("scope")).toBe("overview");
  });

  it("omits the scope parameter when none is given (the full snapshot)", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ ok: true }));
    await fetchSnsDetail(ENDPOINT, { idToken: "idt" }, fetchImpl);
    const url = new URL(fetchImpl.mock.calls[0][0]);
    expect(url.searchParams.get("scope")).toBeNull();
  });
});

describe("mergeSnsDetail", () => {
  it("lands the overview on an empty state with nothing marked loaded", () => {
    const { detail, loadedScopes } = mergeSnsDetail(null, OVERVIEW, NO_SCOPES);
    expect(detail).toEqual(OVERVIEW);
    // The preview items are not a loaded section: every channel
    // still owes its full fetch.
    expect(loadedScopes).toEqual({
      instagram: false,
      youtube: false,
      threads: false,
      x: false,
    });
  });

  it("populates the overview's top lists from the trimmed preview items", () => {
    const { detail } = mergeSnsDetail(null, OVERVIEW, NO_SCOPES);
    const sections = topPostsByChannel(detail, [], 3);
    const byChannel = Object.fromEntries(
      sections.map((section) => [section.channel, section.items]),
    );
    // Views descending, the view-less post last; a caption-less
    // post falls back to its type label, like the full payload's
    // rows do.
    expect(byChannel["Instagram"]).toEqual([
      {
        label: "一番目の投稿",
        href: "https://www.instagram.com/reel/a/",
        value: 300,
      },
      {
        label: "三番目の投稿",
        href: "https://www.instagram.com/p/c/",
        value: 30,
      },
      { label: "リール", href: "https://www.instagram.com/reel/b/", value: null },
    ]);
    expect(byChannel["YouTube"]).toEqual([
      { label: "動画A", href: "https://www.youtube.com/watch?v=a", value: 40 },
    ]);
    expect(byChannel["Threads"]).toEqual([
      {
        label: "スレッドの投稿",
        href: "https://www.threads.net/t/1",
        value: 50,
      },
    ]);
    expect(byChannel["X"]).toEqual([
      { label: "Xの投稿", href: "https://x.com/i/web/status/1", value: 60 },
    ]);
  });

  it("merges a channel scope by replacing only that channel's section", () => {
    const first = mergeSnsDetail(null, OVERVIEW, NO_SCOPES);
    const { detail, loadedScopes } = mergeSnsDetail(
      first.detail,
      instagramResponse(),
      first.loadedScopes,
    );
    expect(detail.instagram).toBe(INSTAGRAM_SECTION);
    expect(detail.youtube).toBe(OVERVIEW.youtube);
    expect(detail.threads).toBe(OVERVIEW.threads);
    expect(detail.x).toBe(OVERVIEW.x);
    expect(detail.collected_at).toBe("2026-11-24T02:00:00Z");
    expect(loadedScopes).toEqual({
      instagram: true,
      youtube: false,
      threads: false,
      x: false,
    });
    // The flags the caller passed in are not mutated.
    expect(first.loadedScopes).toEqual({
      instagram: false,
      youtube: false,
      threads: false,
      x: false,
    });
  });

  it("keeps a loaded channel's full section across an overview refresh", () => {
    const first = mergeSnsDetail(null, OVERVIEW, NO_SCOPES);
    const loaded = mergeSnsDetail(
      first.detail,
      instagramResponse(),
      first.loadedScopes,
    );
    const refreshedOverview = {
      ...OVERVIEW,
      collected_at: "2026-11-24T04:00:00Z",
      youtube: { subscribers: 11, recent_videos: [] },
    };
    const { detail, loadedScopes } = mergeSnsDetail(
      loaded.detail,
      refreshedOverview,
      loaded.loadedScopes,
    );
    // Instagram's full section survives; the rest of the detail
    // is the refreshed overview's, timestamp included.
    expect(detail.instagram).toBe(INSTAGRAM_SECTION);
    expect(detail.youtube).toBe(refreshedOverview.youtube);
    expect(detail.collected_at).toBe("2026-11-24T04:00:00Z");
    expect(loadedScopes.instagram).toBe(true);
    expect(loadedScopes.youtube).toBe(false);
  });

  it("reads a full payload answering a scoped request as fully loaded", () => {
    const first = mergeSnsDetail(null, OVERVIEW, NO_SCOPES);
    const { detail, loadedScopes } = mergeSnsDetail(
      first.detail,
      FULL,
      first.loadedScopes,
    );
    expect(detail).toBe(FULL);
    expect(loadedScopes).toEqual({
      instagram: true,
      youtube: true,
      threads: true,
      x: true,
    });
  });

  it("reads a full payload as the very first response as fully loaded", () => {
    const { detail, loadedScopes } = mergeSnsDetail(null, FULL, NO_SCOPES);
    expect(detail).toBe(FULL);
    for (const platform of SNS_DETAIL_PLATFORMS) {
      expect(loadedScopes[platform]).toBe(true);
    }
  });

  it("leaves the state untouched by an unusable response", () => {
    const first = mergeSnsDetail(null, OVERVIEW, NO_SCOPES);
    const { detail, loadedScopes } = mergeSnsDetail(
      first.detail,
      null,
      first.loadedScopes,
    );
    expect(detail).toBe(first.detail);
    expect(loadedScopes).toEqual(first.loadedScopes);
  });
});
