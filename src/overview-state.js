// The overview pulls its numbers from three independent loads (GA
// totals, the SNS snapshot, the SNS history). Each loader stores
// its result here and re-renders; a figure whose load has not
// arrived yet carries that load's state line (kpiLoadState /
// topPostsPendingText) instead of a bare "—", and carries no
// change line.

export const overviewState = {
  gaTotals: null,
  detail: null,
  // The detail lands scoped (see fetchSnsDetail / mergeSnsDetail
  // in api.js): the overview scope first, then each channel's
  // full section the first time its tab is opened. These maps
  // track, per channel, whether the full section has been
  // fetched, whether such a fetch is in flight, and whether the
  // last one failed — a channel still holding only the
  // overview's trimmed top-3 preview must never render its tab's
  // full lists from the preview items, so the renderers gate on
  // these flags. A full (unscoped) response marks every channel
  // loaded at once.
  detailScopes: {
    instagram: false,
    youtube: false,
    threads: false,
    x: false,
    tiktok: false,
  },
  detailScopeLoading: {
    instagram: false,
    youtube: false,
    threads: false,
    x: false,
    tiktok: false,
  },
  detailScopeFailed: {
    instagram: false,
    youtube: false,
    threads: false,
    x: false,
    tiktok: false,
  },
  // Whether each late-arriving load has finished (and whether
  // it failed). Sections filled by a load that is still in
  // flight show the loading line; once it has failed they show
  // the failure line; only a settled load may fall back to a
  // section's ordinary empty state. See section-status.js.
  detailSettled: false,
  detailFailed: false,
  historyRows: null,
  historySettled: false,
  historyFailed: false,
  // The blog's top articles for the overview's per-channel top
  // lists, ranked from the GA page rows when the report lands
  // (null until then; the blog section shows its load state).
  blogTop: null,
  blogSettled: false,
  blogFailed: false,
};
