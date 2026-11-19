// The overview pulls its numbers from three independent loads (GA
// totals, the SNS snapshot, the SNS history). Each loader stores
// its result here and re-renders; a figure whose load has not
// arrived yet carries that load's state line (kpiLoadState /
// topPostsPendingText) instead of a bare "—", and carries no
// change line.

export const overviewState = {
  gaTotals: null,
  detail: null,
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
