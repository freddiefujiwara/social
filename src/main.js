import "./style.css";
import { CONFIG } from "./config.js";
import { decodeJwtPayload } from "./auth.js";
import { THEME_KEY, resolveTheme, nextTheme, applyTheme } from "./theme.js";
import {
  PRIVACY_KEY,
  resolvePrivacy,
  applyPrivacy,
} from "./privacy.js";
import {
  fetchReport,
  validateShareToken,
  shareAction,
  exchangeSession,
  revokeSession,
  totalsOf,
  dailySeries,
  fetchArticleTitles,
  pageRanking,
  fetchBlogMeta,
  fetchTranslationStatus,
  mergeBlogTitles,
  blogArticleList,
  blogScrollMap,
  blogSpeedMap,
  fetchSnsDetail,
  SNS_DETAIL_PLATFORMS,
  mergeSnsDetail,
  fetchSnsHistory,
  fetchBootstrap,
  isBootstrapResponse,
  isAuthFailureResponse,
  dataAsOfText,
  snsHistoryRows,
  snsHistorySeries,
  threadsHistorySeries,
  threadsTotals,
  threadsInteractions,
  threadsErrorNotes,
  xHistorySeries,
  xTotals,
  xDailyUsage,
  xPosts,
  xReactions,
  xErrorNotes,
  overviewKpis,
  topPostsByChannel,
  youtubeHistorySeries,
  articleViewStats,
  formatCount,
  formatJstDateTime,
  snsInteractions,
  demographicsPyramid,
  topDemographics,
  sortMedia,
  captionHead,
  snsErrorNotes,
} from "./api.js";
import {
  buildLineChartSvg,
  buildBarChartSvg,
  formatDateFull,
} from "./chart.js";
import {
  genreStatsForX,
  xGenreOptions,
  filterXByGenre,
  classifyXText,
  articleGenreOptions,
  filterArticlesByGenre,
} from "./genres.js";
import {
  tabFromHash,
  tabFromPath,
  pathForTab,
  hasTabPart,
  hashWithoutTab,
} from "./tabs.js";
import { channelTreemap } from "./treemap.js";
import {
  parseShareToken,
  buildShareUrl,
  shareSecondsLeft,
  formatShareRemaining,
  formatShareExpiry,
} from "./share.js";
import {
  bootEntry,
  loadSavedSessionToken,
  saveSessionToken,
  clearSavedSessionToken,
  clearSavedIdToken,
  loadSavedShareToken,
  saveShareToken,
  clearSavedShareToken,
} from "./session.js";
import { isStagingBuild, showStagingBanner } from "./staging-banner.js";
import { createAutoRefresher } from "./auto-refresh.js";
import {
  SECTION_LOADING_TEXT,
  SECTION_FAILED_TEXT,
  setSectionLoading,
  setSectionFailed,
} from "./section-status.js";
import { overviewState } from "./overview-state.js";
import {
  countSpan,
  totalValueClass,
  appendDeltaLine,
  wireSortableTable,
  updateSortHeaders,
  renderGenreFilterTabs,
  renderPostGenres,
  fillDemoRanking,
  numCell,
} from "./render-common.js";
import { tileOneLineLabel } from "./render-treemap.js";
import {
  renderRanking,
  renderBlogDaily,
  renderBlogGenres,
  renderBlogTranslationStatus,
  renderLangPref,
} from "./render-blog.js";
import { createInstagramRenderer } from "./render-instagram.js";
import { createYoutubeRenderer } from "./render-youtube.js";
import { createThreadsRenderer } from "./render-threads.js";
import {
  buildXReactionDetail,
  renderXRecentFollows,
  renderXUnattributed,
  renderXApiCredit,
} from "./render-x.js";

if (isStagingBuild()) {
  showStagingBanner();
}

const loadingEl = document.getElementById("boot-loading");
const gateEl = document.getElementById("gate");
const dashboardEl = document.getElementById("dashboard");
const dataAsOfEl = document.getElementById("data-asof");
const expiredEl = document.getElementById("share-expired");
const accountEl = document.getElementById("account");
const logoutBtn = document.getElementById("logout");
const themeBtn = document.getElementById("theme-toggle");
const privacyBtn = document.getElementById("privacy-toggle");
const gateErrorEl = document.getElementById("gate-error");
const shareCardEl = document.getElementById("share-card");
const shareIssuedEl = document.getElementById("share-issued");
const shareIssueRowEl = document.getElementById("share-issue-row");
const shareIssueBtn = document.getElementById("share-issue");
const shareReissueBtn = document.getElementById("share-reissue");
const shareRevokeBtn = document.getElementById("share-revoke");
const shareCopyBtn = document.getElementById("share-copy");
const shareUrlEl = document.getElementById("share-url");
const shareRemainingEl = document.getElementById("share-remaining");
const shareExpiresEl = document.getElementById("share-expires");
const shareStatusEl = document.getElementById("share-status");

let sessionToken = null;
// Set when the page was opened via a temporary access link (#share=…).
let shareToken = null;
let shareExpiresAt = null;

let theme = resolveTheme(localStorage.getItem(THEME_KEY));
applyTheme(document.documentElement, themeBtn, theme);

themeBtn.addEventListener("click", () => {
  theme = nextTheme(theme);
  localStorage.setItem(THEME_KEY, theme);
  applyTheme(document.documentElement, themeBtn, theme);
});

// --- Privacy masking (raw counts blur out for screenshots) ---
// Same arrangement as the asset / health apps: the stored
// preference lives in local storage (default off), the toggle
// flips data-private on <html>, and while a temporary share
// link is being viewed the masking is suspended and the toggle
// hidden — a share viewer always sees the numbers, and the
// stored preference itself is never rewritten by a visit.
let privacy = resolvePrivacy(localStorage.getItem(PRIVACY_KEY));

// Whether the entry session's kind is settled yet. Until boot
// lands on one of the gate / expired / dashboard screens, the
// toggle stays hidden (it starts hidden in the markup too):
// a share link's session is only known once validation comes
// back, and showing the button during loading — then taking
// it away — flashed it on screen for share viewers.
let sessionSettled = false;

// Whether masking is in effect right now: the preference is on
// and no share session is suspending it.
const maskingOn = () => privacy && !shareToken;

// Treemap tiles repeat their figures in the native title
// tooltip, which CSS cannot blur; while masking is on the tile
// renderers leave the title off, and this sweep handles the
// tiles already on screen when the toggle flips.
function suspendTileTitles(on) {
  for (const el of document.querySelectorAll(".treemap-tile")) {
    if (on) {
      if (el.title) {
        el.dataset.privacyTitle = el.title;
        el.removeAttribute("title");
      }
    } else if (el.dataset.privacyTitle) {
      el.title = el.dataset.privacyTitle;
      delete el.dataset.privacyTitle;
    }
  }
}

function renderPrivacy() {
  applyPrivacy(
    document.documentElement,
    privacyBtn,
    privacy,
    Boolean(shareToken),
  );
  privacyBtn.hidden = !sessionSettled || Boolean(shareToken);
  suspendTileTitles(maskingOn());
}

privacyBtn.addEventListener("click", () => {
  privacy = !privacy;
  localStorage.setItem(PRIVACY_KEY, privacy ? "on" : "off");
  renderPrivacy();
});
renderPrivacy();

const auth = () => ({ sessionToken, shareToken });

// --- Dashboard tabs ---
// The selected tab lives in the URL path ("/social/instagram").
// APP_BASE is the Vite build's base: "/social/" in production,
// "/social/staging/" in the staging build. Deep links arrive via
// the 404.html rewrite and the index.html restore (see tabs.js).
// Links issued before the path form carry the tab in the hash
// ("#tab=…"); those still open the named tab and are rewritten
// into the path form. Switching tabs uses replaceState (no extra
// history entries, no scroll jump).

const APP_BASE = import.meta.env.BASE_URL;

const tabButtons = [...document.querySelectorAll("#tabs .tab-button")];
const tabPanels = {
  overview: document.getElementById("tab-overview"),
  instagram: document.getElementById("tab-instagram"),
  blog: document.getElementById("tab-blog"),
  youtube: document.getElementById("tab-youtube"),
  threads: document.getElementById("tab-threads"),
  x: document.getElementById("tab-x"),
};

// The tab currently on screen. A channel tab opened before the
// SNS snapshot lands still needs its full section fetched once
// the overview scope settles, so the loaders consult this too.
let activeTabId = "overview";

function activateTab(tabId, updateUrl = true) {
  activeTabId = tabId;
  for (const btn of tabButtons) {
    const active = btn.dataset.tab === tabId;
    btn.classList.toggle("active", active);
    btn.setAttribute("aria-selected", String(active));
  }
  for (const [id, panel] of Object.entries(tabPanels)) {
    panel.hidden = id !== tabId;
  }
  // A channel tab's full section is fetched the first time the
  // tab is opened (the initial load only carries the overview's
  // preview of it); the fetch is a no-op until the snapshot has
  // settled, and once the section is loaded it never refetches.
  if (SNS_DETAIL_PLATFORMS.includes(tabId)) {
    void ensurePlatformScope(tabId);
  }
  if (updateUrl) {
    // The tab moves into the path; the hash keeps only what it
    // still owns (the share token). The query string is passed
    // through untouched.
    const next =
      pathForTab(APP_BASE, tabId) +
      window.location.search +
      hashWithoutTab(window.location.hash);
    const current =
      window.location.pathname + window.location.search + window.location.hash;
    if (next !== current) {
      window.history.replaceState(null, "", next);
    }
  }
}

// The path is the canonical tab address; the legacy hash form is
// consulted only when the path is the app root itself.
function initialTab() {
  return (
    tabFromPath(window.location.pathname, APP_BASE) ??
    tabFromHash(window.location.hash)
  );
}

for (const btn of tabButtons) {
  btn.addEventListener("click", () => activateTab(btn.dataset.tab));
}
window.addEventListener("hashchange", () => {
  // Only a legacy "tab=" part arriving via the hash needs a
  // reaction: activate the named tab, which also rewrites the
  // URL into the path form. Hash changes without a tab part
  // (share-token bookkeeping) leave the selection alone.
  if (hasTabPart(window.location.hash)) {
    activateTab(tabFromHash(window.location.hash));
  }
});
activateTab(initialTab());

// Boot starts on the loading screen, not the sign-in gate: while
// the saved session is being restored or the anonymous probe is
// in flight, showing the Google button would read as "not signed
// in yet". The gate appears only once sign-in is truly required —
// every transition below therefore starts from showLoading and
// lands on exactly one of gate / expired / dashboard.
function showLoading() {
  loadingEl.hidden = false;
  gateEl.hidden = true;
  dashboardEl.hidden = true;
  expiredEl.hidden = true;
  shareCardEl.hidden = true;
  logoutBtn.hidden = true;
}

function showGate() {
  loadingEl.hidden = true;
  gateEl.hidden = false;
  dashboardEl.hidden = true;
  expiredEl.hidden = true;
  shareCardEl.hidden = true;
  logoutBtn.hidden = true;
  // The session kind is settled (signed out): the privacy
  // toggle may appear now.
  sessionSettled = true;
  renderPrivacy();
}

function showExpired() {
  loadingEl.hidden = true;
  gateEl.hidden = true;
  dashboardEl.hidden = true;
  expiredEl.hidden = false;
  shareCardEl.hidden = true;
  logoutBtn.hidden = true;
  sessionSettled = true;
  renderPrivacy();
}

// The dashboard's bridge load: the totals payload (awaited —
// it doubles as the auth verdict) plus the other seven
// sections as promises in exactly the shapes the loaders
// consume, so loadDashboard cannot tell past this point
// whether the sections rode one request or eight.
//
// The one request is action=bootstrap: the bridge answers with
// every section at once, each exactly what its own request
// returns (see fetchBootstrap in api.js). Its sections land as
// already-settled promises with their per-section ok flags
// intact, so a section that failed renders its failure exactly
// as a failed fetch does today. Two outcomes are NOT an
// unavailable bootstrap and never fall back:
//   - an auth failure ({ ok: false, status: 401 | 403, error })
//     is the verdict itself, handed back as the totals so
//     loadDashboard lands on the same expired/gate outcome the
//     totals request produces today — the individual requests
//     would only fail the same way, eight times over;
//   - a totals section that arrived but is not ok is likewise
//     the verdict (the gate shows its error), with no sections
//     to hand out.
// Anything else — a bridge too old for the action (it answers
// with a plain report payload, which the shape check rejects),
// a network failure, a malformed body — falls back to the
// eight individual requests, fired in parallel exactly as
// before bootstrap existed.
async function fetchDashboardLoad() {
  let boot = null;
  try {
    boot = await fetchBootstrap(CONFIG.GAS_ENDPOINT, auth());
  } catch {
    boot = null;
  }
  if (isAuthFailureResponse(boot)) {
    return { totals: boot };
  }
  if (isBootstrapResponse(boot)) {
    if (!boot.totals.ok) {
      return { totals: boot.totals };
    }
    const settled = (section) => Promise.resolve(section);
    return {
      totals: boot.totals,
      dailyPromise: settled(boot.daily),
      pagesPromise: settled(boot.pages),
      sourcesPromise: settled(boot.sources),
      speedPromise: settled(boot.speed),
      scrollPromise: settled(boot.scroll),
      detailPromise: settled(boot.detail),
      historyPromise: settled(boot.history),
    };
  }
  const totalsPromise = fetchReport(CONFIG.GAS_ENDPOINT, auth(), {
    dimensions: "",
  });
  const dailyPromise = fetchReport(CONFIG.GAS_ENDPOINT, auth(), {
    dimensions: "date",
    metrics: "screenPageViews",
    limit: 40,
  });
  // Fetch well past the top 10: the same article can be split
  // across two page paths, and the rows are merged before ranking.
  const pagesPromise = fetchReport(CONFIG.GAS_ENDPOINT, auth(), {
    limit: 250,
  });
  // Per-article display times (the article_render metric pair,
  // plus the bridge's slow-count metric: how many of the
  // article's displays took ten seconds or more, so an average
  // inflated by one stall reads as such). Served from the
  // history sheet's blog_speed tab; until the first displays
  // are recorded the report answers with no rows and the
  // article table's speed columns stay empty, so a rejection
  // here must never break the blog tab — the catch is
  // attached up front.
  const speedPromise = fetchReport(CONFIG.GAS_ENDPOINT, auth(), {
    dimensions: "pagePath",
    metrics: "customEvent:render_ms,eventCount,customEvent:render_slow_count",
    limit: 250,
  });
  speedPromise.catch(() => {});
  // Per-article scroll-depth reach counts (the percent_scrolled
  // event's 25/50/75/100 milestones) for the 記事ごと table's
  // depth columns. Served by the bridge from GA like the other
  // reports; until social-gas collects the dimension the report
  // answers with no rows and the columns stay "—", so a
  // rejection here must never break the blog tab either — the
  // catch is attached up front, like the speed report's.
  const scrollPromise = fetchReport(CONFIG.GAS_ENDPOINT, auth(), {
    dimensions: "pagePath,customEvent:percent_scrolled",
    metrics: "eventCount",
    limit: 250,
  });
  scrollPromise.catch(() => {});
  const sourcesPromise = fetchReport(CONFIG.GAS_ENDPOINT, auth(), {
    dimensions: "sessionDefaultChannelGroup",
    limit: 8,
  });
  // The SNS snapshot and history start now too, alongside the GA
  // reports; their loaders are only invoked once the totals check
  // in loadDashboard has passed, so a dead session never renders
  // into a dashboard that stays hidden. The no-op catches keep a
  // rejection from surfacing as unhandled when that check fails
  // first and the loaders never run; a loader's own catch still
  // sees the rejection when it does run.
  // The snapshot starts scoped to the overview (see the scoped
  // detail section below): the full per-channel sections follow
  // one at a time as their tabs are first opened.
  const detailPromise = fetchSnsDetail(
    CONFIG.GAS_ENDPOINT,
    auth(),
    undefined,
    "overview",
  );
  detailPromise.catch(() => {});
  const historyPromise = fetchSnsHistory(CONFIG.GAS_ENDPOINT, auth());
  historyPromise.catch(() => {});
  const totals = await totalsPromise;
  return {
    totals,
    dailyPromise,
    pagesPromise,
    sourcesPromise,
    speedPromise,
    scrollPromise,
    detailPromise,
    historyPromise,
  };
}

async function loadDashboard() {
  // The session kind is settled by the time the dashboard loads:
  // restate the privacy masking for it (a share session suspends
  // masking and hides the toggle).
  renderPrivacy();
  // Article titles come from the blog RSS feed; fetched in parallel
  // and never allowed to block (or break) the numbers.
  const titlesPromise = fetchArticleTitles(CONFIG.BLOG_RSS_URL);
  // The article tag map comes from the blog API's titles payload;
  // same treatment: parallel, tolerant, display-only.
  const metaPromise = fetchBlogMeta(CONFIG.BLOG_TITLES_URL);
  // The blog's translation status rides along too: public
  // blog-gas metadata like the RSS feed and the titles payload,
  // so no auth travels with it, and it settles on its own line
  // whatever happens (fetchTranslationStatus resolves to null
  // on any failure; the no-op catch only guards the case where
  // the totals check fails first and the loader never runs).
  const translationPromise = fetchTranslationStatus(
    CONFIG.BLOG_TRANSLATION_STATUS_URL,
  );
  translationPromise.catch(() => {});
  // The bridge sections (the GA reports, the SNS snapshot, the
  // SNS history) ride the bootstrap request when the bridge
  // offers it, the eight individual requests otherwise. What a
  // section waits for is only its own data either way: the
  // dashboard itself is revealed as soon as the GA totals land
  // (that payload doubles as the auth verdict), and the other
  // sections fill in as their own responses arrive.
  const load = await fetchDashboardLoad();
  const totals = load.totals;
  if (!totals.ok) {
    if (shareToken) {
      showExpired();
    } else {
      gateErrorEl.textContent = totals.error || "データを取得できませんでした";
      showGate();
    }
    return false;
  }
  const t = totalsOf(totals);
  overviewState.gaTotals = t;
  renderOverview();
  document.getElementById("total-views").textContent = t.views.toLocaleString();
  document.getElementById("total-users").textContent = t.users.toLocaleString();
  document.getElementById("total-sessions").textContent =
    t.sessions.toLocaleString();
  // The totals are in, so the session is good: reveal the
  // dashboard now and let the remaining sections fill in as
  // their responses land, instead of holding the loading screen
  // until the slowest request finishes.
  loadingEl.hidden = true;
  gateEl.hidden = true;
  expiredEl.hidden = true;
  dashboardEl.hidden = false;
  logoutBtn.hidden = !sessionToken;
  shareCardEl.hidden = !sessionToken;
  // The dashboard is up, so the session kind is settled: the
  // privacy toggle may appear (unless this is a share session,
  // where renderPrivacy keeps it hidden).
  sessionSettled = true;
  renderPrivacy();
  // The SNS section loads on its own: a failure there must not take
  // the GA dashboard down with it.
  loadSns(load.detailPromise);
  loadSnsHistory(load.historyPromise);
  loadBlogSections(
    load.dailyPromise,
    load.pagesPromise,
    load.sourcesPromise,
    titlesPromise,
    metaPromise,
    load.speedPromise,
    load.scrollPromise,
    translationPromise,
  );
  // The dashboard is up: keep its SNS data current while the
  // page stays open (see the auto-refresh section below).
  // start() is a no-op when the schedule is already running,
  // so a later sign-in needs no guard here.
  snsAutoRefresher.start();
  return true;
}

// The blog tab's sections, filled in as their responses land.
// Each chain renders only its own sections, so a slow (or failed)
// response holds up nothing else. Until a section's response
// lands it carries the loading line; a failed one ends on the
// failure line — neither can be mistaken for a section that
// simply has no data.
function loadBlogSections(
  dailyPromise,
  pagesPromise,
  sourcesPromise,
  titlesPromise,
  metaPromise,
  speedPromise,
  scrollPromise,
  translationPromise,
) {
  const dailyChartEl = document.getElementById("daily-chart");
  const sourcesEl = document.getElementById("top-sources");
  const translationEl = document.getElementById("blog-translation-status");
  setSectionLoading(dailyChartEl);
  setSectionLoading(sourcesEl);
  // The translation status reads every article's snapshots on
  // the blog-gas side with no cache behind it, so a cold read
  // can take a couple of minutes: the loading line says so, and
  // the fetch itself carries no timeout that could cut it off.
  setSectionLoading(
    translationEl,
    "読み込み中…（全記事の翻訳状態を確認するため、少し時間がかかります）",
  );
  setSectionLoading(document.getElementById("blog-genres"));
  setSectionLoading(document.getElementById("blog-article-body"));
  // The language-preference section is local storage state, not
  // a fetch: it renders immediately.
  renderLangPref();
  // The translation status is a single public payload off
  // blog-gas: it renders when it lands and ends on the failure
  // line when it does not, independently of the GA-fed sections.
  translationPromise
    .then((status) => {
      if (!status) {
        setSectionFailed(translationEl);
        return;
      }
      renderBlogTranslationStatus(status);
    })
    .catch(() => setSectionFailed(translationEl));
  // The two KPI boxes the page rows feed (the article count and
  // the per-article average) wait on the same load: they show
  // the loading wording, without the masking class — the
  // wording is not a figure — until fillBlogPages settles them.
  for (const id of ["total-articles", "total-per-article"]) {
    const el = document.getElementById(id);
    el.textContent = SECTION_LOADING_TEXT;
    el.classList.add("section-pending");
    el.classList.remove("amount-value");
  }
  // The daily chart carries the published-article overlay, so
  // it settles only when both of its inputs have: the daily
  // report and the article titles (merged from the same two
  // sources the page sections use). Until then the section
  // keeps its loading line; a failed daily report ends it on
  // the failure line. The title fetches resolve to empty maps
  // on failure by design, so an empty merge simply renders the
  // chart without markers rather than failing the section.
  let dailyOutcome = null;
  let dailyTitles = null;
  const renderDailyChart = () => {
    if (!dailyOutcome || !dailyTitles) {
      return;
    }
    if (!dailyOutcome.ok) {
      setSectionFailed(dailyChartEl);
      return;
    }
    renderBlogDaily(dailyOutcome.series, dailyTitles);
    wireChartTooltip();
  };
  dailyPromise
    .then((daily) => {
      dailyOutcome =
        daily && daily.ok !== false
          ? { ok: true, series: dailySeries(daily) }
          : { ok: false };
      renderDailyChart();
    })
    .catch(() => {
      dailyOutcome = { ok: false };
      renderDailyChart();
    });
  Promise.all([titlesPromise, metaPromise])
    .then(([rssTitles, meta]) => {
      dailyTitles = mergeBlogTitles(meta ? meta.titles : null, rssTitles);
      renderDailyChart();
    })
    .catch(() => {
      dailyTitles = new Map();
      renderDailyChart();
    });
  sourcesPromise
    .then((sources) => {
      if (!sources || sources.ok === false) {
        setSectionFailed(sourcesEl);
        return;
      }
      renderRanking("top-sources", sources, 8);
    })
    .catch(() => setSectionFailed(sourcesEl));
  fillBlogPages(pagesPromise, titlesPromise, metaPromise, speedPromise, scrollPromise);
}

// The page rows could not be read: every section they feed
// ends on the failure line (the two KPI boxes keep the pending
// size and take the failure colour), and the overview's blog
// top list settles the same way.
function settleBlogPagesFailed() {
  overviewState.blogSettled = true;
  overviewState.blogFailed = true;
  setSectionFailed(document.getElementById("blog-genres"));
  setSectionFailed(document.getElementById("blog-article-body"));
  for (const id of ["total-articles", "total-per-article"]) {
    const el = document.getElementById(id);
    el.textContent = SECTION_FAILED_TEXT;
    el.classList.add("section-failed");
  }
  renderTopPosts();
}

// The page rows and everything joined to them: the overview's
// blog top-3 rows, the per-genre rollup and the per-article
// table. They share one input set — the GA page rows plus the
// two title sources — so they land together, when the slowest
// of the three arrives.
async function fillBlogPages(pagesPromise, titlesPromise, metaPromise, speedPromise, scrollPromise) {
  let pages;
  let rssTitles;
  let meta;
  try {
    [pages, rssTitles, meta] = await Promise.all([
      pagesPromise,
      titlesPromise,
      metaPromise,
    ]);
  } catch {
    settleBlogPagesFailed();
    return;
  }
  if (!pages || pages.ok === false) {
    settleBlogPagesFailed();
    return;
  }
  // Page rows show the article title and link to the page itself,
  // opening in a new tab. Split article paths are merged into a
  // single row by pageRanking. The titles are the merged map of
  // both blog title sources (RSS + the titles payload): the
  // overview ranking used to read the RSS alone, so one failed
  // RSS fetch silently dropped every article back to its raw
  // path even though the payload copy had arrived fine.
  const titles = mergeBlogTitles(meta ? meta.titles : null, rssTitles);
  // The page ranking, top 3 only, feeds the overview's blog
  // section in the per-channel top lists.
  overviewState.blogTop = pageRanking(pages, titles, CONFIG.SITE_ORIGIN, 3);
  overviewState.blogSettled = true;
  renderTopPosts();
  // The per-genre rollup joins the page rows with the tag map. It
  // renders only when the map actually arrived; blogGenreStats
  // returns nothing without one and the section says why instead.
  renderBlogGenres(pages, meta, titles);
  // The scroll-depth map rides its own report, awaited only
  // here, where the per-article table is built: it has been in
  // flight since loadDashboard started it, and any failure
  // (the promise carries an up-front catch) simply leaves the
  // depth columns empty rather than failing the page sections.
  let scrollMap = new Map();
  if (scrollPromise) {
    try {
      scrollMap = blogScrollMap(await scrollPromise);
    } catch {
      scrollMap = new Map();
    }
  }
  // The display-time columns join from the speed report (no
  // second fetch): the promise has been in flight since
  // loadDashboard and carries an up-front catch, so a failure
  // simply leaves the two columns empty. Its window is one
  // finished day, not the table's 28 days — the caption under
  // the table says so.
  let speedMap = new Map();
  if (speedPromise) {
    try {
      speedMap = blogSpeedMap(await speedPromise);
    } catch {
      speedMap = new Map();
    }
  }
  renderBlogArticles(pages, meta, titles, scrollMap, speedMap);
  // The blog KPI row gains the article count and the per-article
  // average over the same article list the 記事ごと table shows;
  // the boxes leave their pending state (the masking class comes
  // back with the real figures).
  const articleStats = articleViewStats(blogArticles);
  const articlesEl = document.getElementById("total-articles");
  articlesEl.textContent = articleStats.count
    ? formatCount(articleStats.count)
    : "-";
  articlesEl.classList.remove("section-pending");
  articlesEl.classList.add("amount-value");
  const perArticleEl = document.getElementById("total-per-article");
  perArticleEl.textContent = formatCount(articleStats.perArticle);
  perArticleEl.classList.remove("section-pending");
  perArticleEl.classList.add("amount-value");
}

// --- Blog per-article table (blog tab) ---
// The blog counterpart of the Instagram tab's 投稿ごと: every
// article that drew views in the GA window, with its tags shown
// as genres, the shared genre filter buttons and sortable
// columns. The differences from the media table follow the
// data, not the design: the GA rows cover a fixed last-28-days
// window, so there is no period selector to link or ignore —
// and an article can carry several tags, so it appears under
// each of its genres' filters (the genre rollup counts it the
// same way). A fresh dashboard load resets the filter to
// すべて, exactly like the media table.

let blogArticles = [];
let blogArticleSort = { key: "views", dir: "desc", wired: false };
// The per-article table's genre filter: null shows every
// article (the すべて button).
let blogArticleGenreFilter = null;

function renderBlogArticleGenreTabs() {
  renderGenreFilterTabs(document.getElementById("blog-article-genre-tabs"), {
    total: blogArticles.length,
    options: articleGenreOptions(blogArticles),
    active: blogArticleGenreFilter,
    onSelect: (genre) => {
      blogArticleGenreFilter = genre;
      renderBlogArticleGenreTabs();
      renderBlogArticleTable();
    },
  });
}

function renderBlogArticleTable() {
  const tbody = document.getElementById("blog-article-body");
  tbody.innerHTML = "";
  const rows = sortMedia(
    filterArticlesByGenre(blogArticles, blogArticleGenreFilter),
    blogArticleSort.key,
    blogArticleSort.dir,
  );
  if (!rows.length) {
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = 11;
    td.textContent = "データがありません";
    tr.appendChild(td);
    tbody.appendChild(tr);
    return;
  }
  // A numeric cell of the speed / depth columns. Like the
  // view count beside it, every figure here is a GA number no
  // public page prints, so the cell masks the same way; a
  // figure the collection does not have shows "—".
  const depthCell = (value, format) => {
    const td = document.createElement("td");
    td.className = "num amount-value";
    td.textContent = format(value);
    return td;
  };
  for (const article of rows) {
    const tr = document.createElement("tr");
    const publishedTd = document.createElement("td");
    publishedTd.className = "nowrap";
    publishedTd.textContent = article.published ?? "—";
    tr.appendChild(publishedTd);
    const titleTd = document.createElement("td");
    const link = document.createElement("a");
    link.href = article.href;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = article.title;
    titleTd.appendChild(link);
    tr.appendChild(titleTd);
    const genreTd = document.createElement("td");
    genreTd.className = "nowrap";
    genreTd.textContent = article.tags.length
      ? article.tags.join("、")
      : "—";
    tr.appendChild(genreTd);
    const viewsTd = document.createElement("td");
    // Per-article view counts here are last-28-days GA figures,
    // not a number any public page prints: masked.
    viewsTd.className = "num amount-value";
    viewsTd.textContent = formatCount(article.views);
    tr.appendChild(viewsTd);
    // The display-time pair: the day's average in seconds (one
    // decimal) and how many of the day's
    // displays took ten seconds or more. Both are blog figures
    // like the view count, so they mask through the same cell
    // helper as the depth columns.
    tr.appendChild(
      depthCell(article.avgSpeedSec, (value) =>
        value === null || value === undefined ? "—" : value.toFixed(1),
      ),
    );
    tr.appendChild(depthCell(article.slowCount, formatCount));
    tr.appendChild(depthCell(article.scroll25, formatCount));
    tr.appendChild(depthCell(article.scroll50, formatCount));
    tr.appendChild(depthCell(article.scroll75, formatCount));
    tr.appendChild(depthCell(article.scroll100, formatCount));
    // The completion rate is a percentage, and percentages
    // are not privacy-masked (the same call as the Instagram
    // watch rate), so this cell skips the amount-value class
    // the count cells beside it carry.
    const completionTd = document.createElement("td");
    completionTd.className = "num";
    completionTd.textContent =
      article.completion === null || article.completion === undefined
        ? "—"
        : `${article.completion.toFixed(1)}%`;
    tr.appendChild(completionTd);
    tbody.appendChild(tr);
  }
  updateSortHeaders("blog-article-table", blogArticleSort);
}

function renderBlogArticles(pagesResponse, meta, rssTitles, scrollMap, speedMap) {
  // The RSS titles win; the titles payload fills any gap — the
  // same merge the genre rollup makes.
  const titles = mergeBlogTitles(meta ? meta.titles : null, rssTitles);
  blogArticles = blogArticleList(
    pagesResponse,
    meta ? meta.tags : null,
    titles,
    CONFIG.SITE_ORIGIN,
    scrollMap,
    speedMap,
  );
  const articleRangeEl = document.getElementById("blog-article-range");
  articleRangeEl.textContent = "";
  if (blogArticles.length) {
    articleRangeEl.append(
      "対象：直近28日間に表示された記事（全",
      countSpan(blogArticles.length, true),
      "件）",
    );
  }
  // A fresh load resets the per-article genre filter to すべて.
  blogArticleGenreFilter = null;
  renderBlogArticleGenreTabs();
  wireSortableTable(
    "blog-article-table",
    blogArticleSort,
    renderBlogArticleTable,
  );
  renderBlogArticleTable();
}

// --- Overview tab ---
// Puts a not-yet-filled container into its load state — the
// loading line while the load behind it is in flight, the
// failure line once it has failed — and reports whether it did:
// false means the load has landed and the caller renders for
// real. One helper per load, so every section filled by the
// same response settles the same way.
function fillDetailPending(el) {
  if (!overviewState.detailSettled) {
    setSectionLoading(el);
    return true;
  }
  if (overviewState.detailFailed) {
    setSectionFailed(el);
    return true;
  }
  return false;
}

function fillHistoryPending(el) {
  if (!overviewState.historySettled) {
    setSectionLoading(el);
    return true;
  }
  if (overviewState.historyFailed) {
    setSectionFailed(el);
    return true;
  }
  return false;
}

// The scope counterpart of fillDetailPending, for a section fed
// by one channel's full detail section: while that section has
// not been fetched (the detail holds only the overview's trimmed
// preview of the channel) the section carries the loading line,
// or the failure line once its fetch has failed; false means the
// full section is loaded and the caller renders for real. Only
// consulted once the snapshot itself has settled — the callers
// run fillDetailPending first, which owns the snapshot's own
// in-flight and failed states.
function fillScopePending(el, platform) {
  if (overviewState.detailScopes[platform]) {
    return false;
  }
  if (overviewState.detailScopeFailed[platform]) {
    setSectionFailed(el);
    return true;
  }
  setSectionLoading(el);
  return true;
}

function fillKpiBoxes(items) {
  const wrap = document.getElementById("kpi-cards");
  wrap.innerHTML = "";
  for (const item of items) {
    const box = document.createElement("div");
    box.className = "total-box";
    const label = document.createElement("div");
    label.className = "total-label";
    label.textContent = item.label;
    const value = document.createElement("div");
    // A card still waiting on its load shows the load-state
    // wording instead of a figure: it takes no .amount-value,
    // so privacy masking (which blurs figures) leaves the
    // wording itself readable.
    value.className = item.pending
      ? "total-value section-pending"
      : totalValueClass(item);
    value.textContent = item.value;
    box.appendChild(label);
    box.appendChild(value);
    appendDeltaLine(box, item);
    wrap.appendChild(box);
  }
}

// The empty-row wording for one of the overview's top lists:
// the load state of the load behind the channel (the SNS
// snapshot, or the GA page rows for the blog) until it settles,
// then the plain "—" of a channel with genuinely nothing to
// list.
function topPostsPendingText(channel) {
  if (channel === "ブログ") {
    if (!overviewState.blogSettled) {
      return SECTION_LOADING_TEXT;
    }
    return overviewState.blogFailed ? SECTION_FAILED_TEXT : "—";
  }
  if (!overviewState.detailSettled) {
    return SECTION_LOADING_TEXT;
  }
  return overviewState.detailFailed ? SECTION_FAILED_TEXT : "—";
}

// The overview's top lists, one per channel: each channel's
// three most-viewed items under a heading that names the
// channel and the metric it reports (再生回数 for Instagram and
// YouTube, 表示回数 for Threads, X and the blog). The sections
// come from topPostsByChannel; a channel with nothing collected
// yet keeps its heading and a "—" row. The blog's rows land
// with the GA report (overviewState.blogTop), the rest with the
// SNS snapshot, and renderOverview re-runs as each arrives.
function renderTopPosts() {
  const wrap = document.getElementById("top-posts");
  wrap.innerHTML = "";
  const sections = topPostsByChannel(
    overviewState.detail,
    overviewState.blogTop,
    3,
  );
  for (const section of sections) {
    const head = document.createElement("h3");
    head.className = "subsection-title";
    head.textContent = `${section.channel}（${section.metric}）`;
    wrap.appendChild(head);
    const list = document.createElement("ol");
    list.className = "ranking";
    if (!section.items.length) {
      const li = document.createElement("li");
      // No rows yet: while the load behind this channel is
      // still in flight the row carries its load state, so an
      // empty list cannot be mistaken for a channel with no
      // posts; only a settled load keeps the bare "—".
      li.textContent = topPostsPendingText(section.channel);
      list.appendChild(li);
    }
    for (const item of section.items) {
      const li = document.createElement("li");
      if (item.href) {
        const link = document.createElement("a");
        link.href = item.href;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.textContent = item.label;
        li.appendChild(link);
      } else {
        li.textContent = item.label;
      }
      const span = document.createElement("span");
      span.className =
        "rank-value amount-value" + (item.public ? " is-public" : "");
      span.textContent = formatCount(item.value);
      li.appendChild(span);
      list.appendChild(li);
    }
    wrap.appendChild(list);
  }
}

// The channel sizes at the top of the overview, as a treemap:
// tile area = the channel's size figure (followers, or
// subscribers for YouTube; the blog's 28-day user count, named
// as 利用者 on its tile), tile colour = the blue heat scale the
// genre tiles use, scaled by the figure. Each tile draws the
// lines its size can hold (see tileLabelLevel): the channel
// name and the count ride on every tile, down to micro type,
// and the roomiest tiles add a sub line with the day-over-day
// change (coloured green / red by direction)
// and the channel's share of the combined SNS followers. The
// legend under the map lists every channel's exact figures,
// so a channel still awaiting collection reads there too.
function renderChannelTreemap() {
  const mapEl = document.getElementById("channel-treemap");
  const legendEl = document.getElementById("channel-legend");
  const { tiles, legend } = channelTreemap(
    overviewState.detail,
    overviewState.gaTotals,
    overviewState.historyRows,
  );
  mapEl.innerHTML = "";
  if (!tiles.length) {
    const p = document.createElement("p");
    p.className = "meta";
    p.textContent = "—";
    mapEl.appendChild(p);
  }
  for (const tile of tiles) {
    const div = document.createElement("div");
    div.className = "treemap-tile";
    div.style.left = `${tile.x}%`;
    div.style.top = `${tile.y}%`;
    div.style.width = `${tile.w}%`;
    div.style.height = `${tile.h}%`;
    if (tile.heat) {
      div.style.background = tile.heat;
    }
    // The title repeats the figures as a hover tooltip, which
    // CSS cannot blur; while masking is on it is left off (the
    // legend below the map carries the same figures, masked).
    if (!maskingOn()) {
      div.title =
        `${tile.name}：${tile.metricLabel} ${tile.valueLabel}` +
        (tile.shareLabel ? `（${tile.shareLabel}）` : "") +
        (tile.deltaLabel ? ` 前日比 ${tile.deltaLabel}` : "");
    }
    const level = tile.labelLevel ?? (tile.labelRoom ? "full" : "none");
    div.classList.add(`level-${level}`);
    if (level === "micro-v" || level === "micro-h") {
      // The SNS channels' figures are the top page's published
      // follower counts and stay exempt from masking; the blog's
      // figure is a 28-day GA user count no public page prints,
      // so its tile masks (the 前日比 sub line below stays
      // masked for every channel).
      div.appendChild(
        tileOneLineLabel(level, tile.name, tile.valueText, tile.id !== "blog"),
      );
      mapEl.appendChild(div);
      continue;
    }
    if (level !== "none") {
      const name = document.createElement("div");
      name.className = "treemap-tile-name";
      name.textContent = tile.name;
      div.appendChild(name);
      const value = document.createElement("div");
      value.className =
        "treemap-tile-value amount-value" +
        (tile.id !== "blog" ? " is-public" : "");
      value.textContent = tile.valueText;
      div.appendChild(value);
    }
    if (level === "full") {
      const sub = document.createElement("div");
      sub.className = "treemap-tile-sub";
      if (tile.deltaLabel) {
        const delta = document.createElement("span");
        delta.className =
          "treemap-tile-delta amount-value" +
          (tile.tone !== "neutral" ? ` ${tile.tone}` : "");
        delta.textContent = `前日比 ${tile.deltaLabel}`;
        sub.appendChild(delta);
      }
      if (tile.shareLabel) {
        if (tile.deltaLabel) {
          sub.appendChild(document.createTextNode("・"));
        }
        const share = document.createElement("span");
        share.textContent = tile.shareLabel;
        sub.appendChild(share);
      }
      div.appendChild(sub);
    }
    mapEl.appendChild(div);
  }
  legendEl.innerHTML = "";
  for (const entry of legend) {
    const li = document.createElement("li");
    const name = document.createElement("span");
    name.className = "channel-legend-name";
    name.textContent = entry.name;
    li.appendChild(name);
    const metric = document.createElement("span");
    metric.className = "channel-legend-metric";
    metric.textContent = entry.metricLabel;
    li.appendChild(metric);
    if (entry.note) {
      const note = document.createElement("span");
      note.className = "channel-legend-note";
      note.textContent = entry.note;
      li.appendChild(note);
    } else {
      const value = document.createElement("span");
      // Same line as the tiles: SNS follower counts are
      // published and exempt; the blog's user count is not.
      value.className =
        "channel-legend-value amount-value" +
        (entry.id !== "blog" ? " is-public" : "");
      value.textContent = entry.valueLabel;
      li.appendChild(value);
      if (entry.shareLabel) {
        const share = document.createElement("span");
        share.className = "channel-legend-note";
        share.textContent = entry.shareLabel;
        li.appendChild(share);
      }
      if (entry.deltaLabel) {
        const delta = document.createElement("span");
        delta.className =
          "kpi-delta amount-value" +
          (entry.delta > 0 ? " up" : entry.delta < 0 ? " down" : "");
        delta.textContent = `前日比 ${entry.deltaLabel}`;
        li.appendChild(delta);
      }
    }
    legendEl.appendChild(li);
  }
}


// A KPI card whose figure rides on the SNS snapshot, while
// that load is still in flight (or has failed): the bare "—"
// the card would otherwise sit on reads as "no data", so the
// card shows the load state instead, without a change line.
// The blog cards ride on the GA totals, which gate the reveal
// itself, so their "—" never passes through here.
function kpiLoadState(item) {
  if (overviewState.detail || item.value !== "—") {
    return item;
  }
  if (!overviewState.detailSettled) {
    return { ...item, value: SECTION_LOADING_TEXT, delta: null, pending: true };
  }
  if (overviewState.detailFailed) {
    return { ...item, value: SECTION_FAILED_TEXT, delta: null, pending: true };
  }
  return item;
}

function renderOverview() {
  renderChannelTreemap();
  fillKpiBoxes(
    overviewKpis(
      overviewState.detail,
      overviewState.gaTotals,
      overviewState.historyRows,
    ).map(kpiLoadState),
  );
  renderTopPosts();
}

// --- SNS section ---

const snsStatusEl = document.getElementById("sns-status");
const snsBodyEl = document.getElementById("sns-body");

function fillTotalBoxes(elId, items) {
  const wrap = document.getElementById(elId);
  wrap.innerHTML = "";
  for (const item of items) {
    const box = document.createElement("div");
    box.className = "total-box";
    const label = document.createElement("div");
    label.className = "total-label";
    label.textContent = item.label;
    const value = document.createElement("div");
    value.className = totalValueClass(item);
    value.textContent = item.value;
    box.appendChild(label);
    box.appendChild(value);
    // The same change line as the overview KPI cards.
    appendDeltaLine(box, item);
    if (item.window) {
      // The trailing-window change line of a merged follower
      // card （過去◯日間 +2): the same styling and masking as
      // the 前日比 line above it, under the normal colour rule
      // (an increase is green, a decrease red — follower counts
      // carry no invert cards).
      const win = document.createElement("div");
      const sign = item.window.startsWith("+")
        ? 1
        : item.window.startsWith("-")
          ? -1
          : 0;
      win.className =
        "kpi-delta amount-value" + (sign > 0 ? " up" : sign < 0 ? " down" : "");
      win.textContent = `${item.windowLabel} ${item.window}`;
      box.appendChild(win);
    }
    wrap.appendChild(box);
  }
}

// The tab renderers that live in their own modules, wired
// with the overview helpers they share with the sections that
// stayed here (the total-box filler and the two load-state
// gates). Their view state (the fetched rows, sort orders,
// genre filters) lives inside the modules.
const instagramView = createInstagramRenderer({
  fillTotalBoxes,
  fillHistoryPending,
});
const youtubeView = createYoutubeRenderer({
  fillTotalBoxes,
  fillDetailPending,
  fillScopePending: (el) => fillScopePending(el, "youtube"),
});
const threadsView = createThreadsRenderer();

// The head line and line chart of a single-series trend,
// shared by the YouTube / Threads / X tabs' trend sections:
// the latest value (one of the published follower figures, so
// exempt from masking) with the collected range, then the
// chart itself.
function appendTrendChart(wrap, item) {
  const head = document.createElement("p");
  head.className = "meta";
  head.append(
    `${item.label}：最新 `,
    countSpan(item.latest, true),
    `（${formatJstDateTime(item.firstAt)} 〜 ${formatJstDateTime(item.lastAt)}）`,
  );
  const chart = document.createElement("div");
  chart.className = "chart-wrap";
  chart.innerHTML = buildLineChartSvg(item.points, { label: item.label });
  wrap.appendChild(head);
  wrap.appendChild(chart);
}

// The YouTube tab's subscriber trend, drawn from the same
// history rows as the other channel tabs' trends (X and Threads
// render theirs inside renderX / renderThreads). renderSns and
// loadSnsHistory both call it, so whichever load lands second
// completes the picture; until a row carries a subscriber count
// the section shows its empty state.
function renderYoutubeHistory() {
  const wrap = document.getElementById("youtube-history");
  // Until the history load settles, the wrap carries its load
  // state rather than the "no history yet" line.
  if (fillHistoryPending(wrap)) {
    return;
  }
  wrap.innerHTML = "";
  const series = youtubeHistorySeries(overviewState.historyRows);
  if (!series.length) {
    const p = document.createElement("p");
    p.className = "meta";
    p.textContent = "履歴はまだありません（取得のたびに貯まっていきます）";
    wrap.appendChild(p);
    return;
  }
  appendTrendChart(wrap, series[0]);
}

// --- Threads tab ---
// The Threads tab reads the same two loads as the overview: the
// follower count, the last-30-days account totals and the recent
// posts from the SNS snapshot (sns_detail's threads section),
// and the follower trend from the history rows. renderSns and
// loadSnsHistory both call renderThreads, so whichever load
// lands second completes the picture; data that has not arrived
// yet shows as "—" and the chart area keeps its empty-state
// line. Threads history only starts on 2026-11-09, so for a
// while the chart holds a handful of points (or just one).

function renderThreads() {
  fillTotalBoxes(
    "sns-threads-totals",
    threadsTotals(overviewState.detail, overviewState.historyRows),
  );
  fillTotalBoxes(
    "sns-threads-interactions",
    threadsInteractions(overviewState.detail),
  );
  // The post rows only land once the channel's full section has
  // been fetched: until then the tab holds the overview's
  // trimmed preview, which the per-post sections must never
  // render as if it were the full list.
  threadsView.syncThreadsPosts(
    overviewState.detailScopes.threads ? overviewState.detail : null,
  );
  // Until the snapshot settles, the genre section and the
  // per-post table carry the load state instead of their empty
  // states (the totals boxes above show "—" under the tab's
  // status line, like the Instagram tab's sections do). The
  // same holds while only the overview's preview of the channel
  // is on hand: the sections wait for the full section behind
  // their scope state instead.
  if (fillDetailPending(document.getElementById("threads-genres"))) {
    fillDetailPending(document.getElementById("threads-posts-body"));
    document.getElementById("threads-posts-genre-tabs").innerHTML = "";
    document.getElementById("threads-posts-range").textContent = "";
  } else if (!overviewState.detailScopes.threads) {
    fillScopePending(document.getElementById("threads-genres"), "threads");
    fillScopePending(document.getElementById("threads-posts-body"), "threads");
    document.getElementById("threads-posts-genre-tabs").innerHTML = "";
    document.getElementById("threads-posts-range").textContent = "";
  } else {
    threadsView.renderThreadsGenres();
    threadsView.renderThreadsPostsGenreTabs();
    threadsView.renderThreadsPosts();
  }
  const notes = document.getElementById("threads-notes");
  notes.innerHTML = "";
  for (const note of threadsErrorNotes(overviewState.detail)) {
    const p = document.createElement("p");
    p.className = "meta sns-note";
    p.textContent = `※ ${note}`;
    notes.appendChild(p);
  }
  const wrap = document.getElementById("threads-history");
  if (fillHistoryPending(wrap)) {
    return;
  }
  wrap.innerHTML = "";
  const series = threadsHistorySeries(overviewState.historyRows);
  if (!series.length) {
    const p = document.createElement("p");
    p.className = "meta";
    p.textContent = "履歴はまだありません（取得のたびに貯まっていきます）";
    wrap.appendChild(p);
    return;
  }
  appendTrendChart(wrap, series[0]);
}

// --- X tab ---
// The X tab reads the same two loads as the Threads tab: the
// follower count and the recent posts from sns_detail's x
// section (collected by social-gas from tweet-gas), and the
// follower trend from the history rows. renderSns and
// loadSnsHistory both call renderX, so whichever load lands
// second completes the picture; data that has not arrived yet
// shows as "—". Like the Threads tab, the posts are classified
// by the shared genre rules over their text, with the same
// ジャンル別 section and genre filter over the per-post table.

let xPostRows = [];
// The posts table starts sorted by views, most-viewed first,
// like the other per-post tables.
let xSort = { key: "views", dir: "desc", wired: false };
// The per-post table's genre filter: null shows every post
// (the すべて button). The classification is the shared one
// (classifyCaption over the post text), so the buttons, the
// genre section above and the filter always agree.
let xGenreFilter = null;
// The posts whose reaction detail is expanded under the
// per-post table. Kept across re-renders (genre filter, sort,
// the ten-minute auto-refresh) like the other view state.
const xExpandedPostIds = new Set();
// The genre table's sort, mirroring the other genre tables.
let xGenreSort = { key: "totalViews", dir: "desc" };

// The X tab's genre section: the shared builder over the X
// rollup and the tab's own sort state.
function renderXGenres() {
  renderPostGenres(
    document.getElementById("x-genres"),
    genreStatsForX(xPostRows),
    xGenreSort,
    renderXGenres,
  );
}

// The buttons above the X per-post table, rendered with the
// shared genre filter renderer like the other tabs. The
// counts come from the same rollup the genre section shows,
// so a button's count is exactly the number of rows its
// filter keeps.
function renderXPostsGenreTabs() {
  renderGenreFilterTabs(document.getElementById("x-posts-genre-tabs"), {
    total: xPostRows.length,
    options: xGenreOptions(xPostRows),
    active: xGenreFilter,
    onSelect: (genre) => {
      xGenreFilter = genre;
      renderXPostsGenreTabs();
      renderXPosts();
    },
  });
}

function renderXPosts() {
  const tbody = document.getElementById("x-posts-body");
  tbody.innerHTML = "";
  const xRangeEl = document.getElementById("x-posts-range");
  xRangeEl.textContent = "";
  if (xPostRows.length) {
    xRangeEl.append(
      "対象：直近の投稿（全",
      countSpan(xPostRows.length),
      "件）",
    );
  }
  const rows = sortMedia(
    filterXByGenre(xPostRows, xGenreFilter),
    xSort.key,
    xSort.dir,
  );
  if (!rows.length) {
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = 8;
    td.textContent = "データがありません";
    tr.appendChild(td);
    tbody.appendChild(tr);
  } else {
    const reactionsByPost = xReactions(overviewState.detail);
    for (const post of rows) {
      const tr = document.createElement("tr");
      const dateTd = document.createElement("td");
      dateTd.className = "nowrap";
      dateTd.textContent = formatJstDateTime(post.posted_at);
      tr.appendChild(dateTd);
      const textTd = document.createElement("td");
      textTd.className = "caption-cell";
      const head = captionHead(post.text) || "投稿";
      if (post.url) {
        const link = document.createElement("a");
        link.href = post.url;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.textContent = head;
        textTd.appendChild(link);
      } else {
        textTd.textContent = head;
      }
      tr.appendChild(textTd);
      // The genre X's own classifier assigns, shown per post
      // like the Instagram table's genre column; the filter
      // above and the rollup use the same judgement.
      const genreTd = document.createElement("td");
      genreTd.className = "nowrap";
      genreTd.textContent = classifyXText(post.text);
      tr.appendChild(genreTd);
      tr.appendChild(numCell(post.views));
      tr.appendChild(numCell(post.likes));
      tr.appendChild(numCell(post.replies));
      tr.appendChild(numCell(post.reposts));
      // The reaction detail toggle: only posts the notify
      // collection has facts for get one; the rest show the
      // dash, so the column never promises detail that is not
      // there.
      const facts = reactionsByPost[post.id] || [];
      const detailTd = document.createElement("td");
      if (facts.length) {
        const toggle = document.createElement("button");
        toggle.type = "button";
        toggle.className = "reaction-toggle";
        toggle.textContent = `詳細（${facts.length}件）`;
        toggle.setAttribute(
          "aria-expanded",
          xExpandedPostIds.has(post.id) ? "true" : "false",
        );
        toggle.addEventListener("click", () => {
          if (xExpandedPostIds.has(post.id)) {
            xExpandedPostIds.delete(post.id);
          } else {
            xExpandedPostIds.add(post.id);
          }
          renderXPosts();
        });
        detailTd.appendChild(toggle);
      } else {
        detailTd.textContent = "—";
      }
      tr.appendChild(detailTd);
      tbody.appendChild(tr);
      if (facts.length && xExpandedPostIds.has(post.id)) {
        const detailTr = document.createElement("tr");
        const detailCell = document.createElement("td");
        detailCell.colSpan = 8;
        detailCell.appendChild(buildXReactionDetail(facts));
        detailTr.appendChild(detailCell);
        tbody.appendChild(detailTr);
      }
    }
  }
  updateSortHeaders("x-posts-table", xSort);
}

// Tick labels for the daily spend chart: dollars with the
// trailing zeros trimmed ("$0", "$0.2", "$0.25").
function formatUsdTick(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) {
    return "";
  }
  return `$${Number.isInteger(num) ? String(num) : String(Math.round(num * 100) / 100)}`;
}

// The daily usage charts under the credit card: the day's
// credit spend (USD, derived from the balance's decrease) and
// the day's post consumption, over the same days, so the effect
// of a change in how the account is read shows up in both. The
// figures are private like the balance itself — the charts'
// tick labels hide under masking, the credit card's convention.
function renderXDailyUsage() {
  const wrap = document.getElementById("x-daily-usage");
  if (!wrap) {
    return;
  }
  if (fillHistoryPending(wrap)) {
    return;
  }
  wrap.innerHTML = "";
  const days = xDailyUsage(overviewState.historyRows, overviewState.detail);
  if (!days.length) {
    const p = document.createElement("p");
    p.className = "meta";
    p.textContent = "消費の履歴はまだありません（取得のたびに貯まっていきます）";
    wrap.appendChild(p);
    return;
  }
  const blocks = [
    {
      title: "消費額（USD）",
      days: days.map((day) => ({ date: day.date, value: day.spendUsd })),
      options: {
        label: "X APIクレジット消費額（日ごと）",
        formatValue: formatUsdTick,
      },
    },
    {
      title: "ポスト消費（件）",
      days: days.map((day) => ({ date: day.date, value: day.tweetsConsumed })),
      options: { label: "X APIポスト消費（日ごと）" },
    },
  ];
  for (const block of blocks) {
    const head = document.createElement("p");
    head.className = "meta";
    head.textContent = block.title;
    const chart = document.createElement("div");
    chart.className = "chart-wrap";
    chart.innerHTML = buildBarChartSvg(block.days, block.options);
    wrap.appendChild(head);
    wrap.appendChild(chart);
  }
  const note = document.createElement("p");
  note.className = "meta";
  note.textContent =
    "消費額は残高の減りから計算しています。2026年11月16日に投稿データの読み取り方法を変更したため、それ以降は本来の利用分だけが消費されます。";
  wrap.appendChild(note);
}

function renderX() {
  fillTotalBoxes("sns-x-totals", xTotals(overviewState.detail, overviewState.historyRows));
  renderXApiCredit();
  renderXDailyUsage();
  // Like the Threads tab's rows, the post rows wait for the
  // channel's full section: the overview's preview items lack
  // the counts and timestamps the table renders. (The follows
  // line and the unattributed list below read sections the
  // overview carries empty, so they simply render nothing
  // until the full section lands.)
  xPostRows = overviewState.detailScopes.x ? xPosts(overviewState.detail) : [];
  renderXRecentFollows();
  renderXUnattributed();
  wireSortableTable("x-posts-table", xSort, renderXPosts);
  // Until the snapshot settles, the genre section and the
  // per-post table carry the load state instead of their empty
  // states, like the Threads tab's — and likewise while only
  // the overview's preview of the channel is on hand.
  if (fillDetailPending(document.getElementById("x-genres"))) {
    fillDetailPending(document.getElementById("x-posts-body"));
    document.getElementById("x-posts-genre-tabs").innerHTML = "";
    document.getElementById("x-posts-range").textContent = "";
  } else if (!overviewState.detailScopes.x) {
    fillScopePending(document.getElementById("x-genres"), "x");
    fillScopePending(document.getElementById("x-posts-body"), "x");
    document.getElementById("x-posts-genre-tabs").innerHTML = "";
    document.getElementById("x-posts-range").textContent = "";
  } else {
    renderXGenres();
    renderXPostsGenreTabs();
    renderXPosts();
  }
  const notes = document.getElementById("x-notes");
  notes.innerHTML = "";
  for (const note of xErrorNotes(overviewState.detail)) {
    const p = document.createElement("p");
    p.className = "meta sns-note";
    p.textContent = `※ ${note}`;
    notes.appendChild(p);
  }
  const wrap = document.getElementById("x-history");
  if (fillHistoryPending(wrap)) {
    return;
  }
  wrap.innerHTML = "";
  const series = xHistorySeries(overviewState.historyRows);
  if (!series.length) {
    const p = document.createElement("p");
    p.className = "meta";
    p.textContent = "履歴はまだありません（取得のたびに貯まっていきます）";
    wrap.appendChild(p);
    return;
  }
  appendTrendChart(wrap, series[0]);
}

function renderSns(detail) {
  overviewState.detail = detail;
  overviewState.detailSettled = true;
  overviewState.detailFailed = false;
  renderOverview();
  // The collection timestamp behind every tab, shown once above
  // the tab bar (the blog numbers come from the same collection).
  dataAsOfEl.textContent = dataAsOfText(detail?.collected_at);
  snsStatusEl.textContent = detail.collected_at
    ? `取得時刻: ${formatJstDateTime(detail.collected_at)}`
    : "";
  document.getElementById("youtube-status").textContent = detail.collected_at
    ? `取得時刻: ${formatJstDateTime(detail.collected_at)}`
    : "";
  document.getElementById("threads-status").textContent = detail.collected_at
    ? `取得時刻: ${formatJstDateTime(detail.collected_at)}`
    : "";
  document.getElementById("x-status").textContent = detail.collected_at
    ? `取得時刻: ${formatJstDateTime(detail.collected_at)}`
    : "";
  instagramView.renderInstagramTotals();
  instagramView.renderInstagramTrend();
  fillTotalBoxes("sns-interactions", snsInteractions(detail));
  const bars = document.getElementById("sns-age-gender");
  bars.innerHTML = "";
  const pyramid = demographicsPyramid(detail);
  if (!pyramid.bands.length && !pyramid.unknown.length) {
    const p = document.createElement("p");
    p.className = "meta";
    p.textContent = "—";
    bars.appendChild(p);
  }
  if (pyramid.bands.length) {
    const head = document.createElement("div");
    head.className = "pyramid-row pyramid-head";
    for (const text of ["", "男性", "", "女性", ""]) {
      const span = document.createElement("span");
      span.textContent = text;
      head.appendChild(span);
    }
    bars.appendChild(head);
  }
  for (const band of pyramid.bands) {
    const div = document.createElement("div");
    div.className = "pyramid-row";
    const maleValue = document.createElement("span");
    maleValue.className = "pyramid-value pyramid-value-left amount-value";
    maleValue.textContent = formatCount(band.male.value);
    const maleTrack = document.createElement("div");
    maleTrack.className = "pyramid-track pyramid-track-left";
    const maleFill = document.createElement("div");
    maleFill.className = "pyramid-fill";
    maleFill.style.width = `${band.male.pct}%`;
    maleTrack.appendChild(maleFill);
    const age = document.createElement("span");
    age.className = "pyramid-age";
    age.textContent = band.ageLabel;
    const unknown = document.createElement("span");
    unknown.className = "pyramid-unknown";
    unknown.append("不明 ", countSpan(band.unknown));
    age.appendChild(unknown);
    const femaleTrack = document.createElement("div");
    femaleTrack.className = "pyramid-track pyramid-track-right";
    const femaleFill = document.createElement("div");
    femaleFill.className = "pyramid-fill";
    femaleFill.style.width = `${band.female.pct}%`;
    femaleTrack.appendChild(femaleFill);
    const femaleValue = document.createElement("span");
    femaleValue.className = "pyramid-value pyramid-value-right amount-value";
    femaleValue.textContent = formatCount(band.female.value);
    div.appendChild(maleValue);
    div.appendChild(maleTrack);
    div.appendChild(age);
    div.appendChild(femaleTrack);
    div.appendChild(femaleValue);
    bars.appendChild(div);
  }
  for (const row of pyramid.unknown) {
    const div = document.createElement("div");
    div.className = "demo-bar";
    const label = document.createElement("span");
    label.className = "demo-bar-label";
    label.textContent = row.label;
    const track = document.createElement("div");
    track.className = "demo-bar-track";
    const fill = document.createElement("div");
    fill.className = "demo-bar-fill";
    fill.style.width = `${row.pct}%`;
    track.appendChild(fill);
    const value = document.createElement("span");
    value.className = "demo-bar-value amount-value";
    value.textContent = formatCount(row.value);
    div.appendChild(label);
    div.appendChild(track);
    div.appendChild(value);
    bars.appendChild(div);
  }
  const demo = detail?.instagram?.demographics ?? {};
  fillDemoRanking("sns-cities", topDemographics(demo.top_cities));
  fillDemoRanking("sns-countries", topDemographics(demo.top_countries));
  // The follow chart's day entries and the media sections are
  // built from the full recent-media list; while the detail
  // holds only the overview's trimmed preview of Instagram they
  // carry the scope's load state instead of rendering the
  // preview items as the full list.
  if (overviewState.detailScopes.instagram) {
    instagramView.renderFollowChart(detail);
    instagramView.renderSnsMedia(detail);
  } else {
    renderInstagramMediaPending();
  }
  youtubeView.renderYoutube(detail);
  renderYoutubeHistory();
  renderThreads();
  renderX();
  const notes = document.getElementById("sns-notes");
  notes.innerHTML = "";
  for (const note of snsErrorNotes(detail)) {
    const p = document.createElement("p");
    p.className = "meta sns-note";
    p.textContent = `※ ${note}`;
    notes.appendChild(p);
  }
  snsBodyEl.hidden = false;
}

// --- Scoped SNS detail ---
// The snapshot is fetched in scopes (see fetchSnsDetail): the
// overview scope at load, then one full section per channel the
// first time its tab is opened. Every response lands through
// applyDetailResponse, which merges it over the detail already
// on hand (mergeSnsDetail) and records which channels are
// present in full; the renderers gate each channel's list
// sections on those flags, so the overview's trimmed top-3
// preview is never mistaken for a channel's full list.

function applyDetailResponse(response) {
  const merged = mergeSnsDetail(
    overviewState.detail,
    response,
    overviewState.detailScopes,
  );
  overviewState.detail = merged.detail;
  overviewState.detailScopes = merged.loadedScopes;
  return merged.detail;
}

// renderSns with the Instagram per-post genre filter kept
// across it, the auto-refresh's arrangement: a fresh snapshot
// resets the filter by design, so a re-render that is not a
// fresh full snapshot (a channel section landing, a scoped
// refresh) saves and restores it instead.
function renderSnsKeepingGenreFilter(detail) {
  const keepGenreFilter = instagramView.mediaGenreFilter();
  renderSns(detail);
  instagramView.restoreMediaGenreFilter(keepGenreFilter);
}

// Fetches one channel's full section the first time it is
// needed (its tab's first visit, or the landing tab's section
// once the overview settles). A no-op until the snapshot itself
// has settled, while a fetch is already in flight, and forever
// after the section has loaded; a failed fetch ends the tab's
// gated sections on their failure line and the next visit
// retries.
async function ensurePlatformScope(platform) {
  if (!overviewState.detailSettled || overviewState.detailFailed) {
    return;
  }
  if (
    overviewState.detailScopes[platform] ||
    overviewState.detailScopeLoading[platform]
  ) {
    return;
  }
  overviewState.detailScopeLoading[platform] = true;
  overviewState.detailScopeFailed[platform] = false;
  // A retry after a failure first lifts the gated sections back
  // to their loading line.
  renderSnsKeepingGenreFilter(overviewState.detail);
  try {
    const response = await fetchSnsDetail(
      CONFIG.GAS_ENDPOINT,
      auth(),
      undefined,
      platform,
    );
    if (!response || !response.ok) {
      throw new Error("SNSデータを取得できませんでした");
    }
    const merged = applyDetailResponse(response);
    overviewState.detailScopeLoading[platform] = false;
    renderSnsKeepingGenreFilter(merged);
  } catch {
    overviewState.detailScopeLoading[platform] = false;
    overviewState.detailScopeFailed[platform] = true;
    renderSnsKeepingGenreFilter(overviewState.detail);
  }
}

// The Instagram sections the full recent-media list feeds (the
// follow chart, the genre rollup, the per-post table) while
// Instagram's full section has not been fetched: each carries
// the scope's load state, and the range lines and filter
// buttons stay empty, like the other tabs' gated sections.
function renderInstagramMediaPending() {
  fillScopePending(document.getElementById("sns-follow-chart"), "instagram");
  document.getElementById("sns-genre-range").textContent = "";
  document.getElementById("sns-genre-treemap").innerHTML = "";
  document.getElementById("sns-genre-legend").innerHTML = "";
  fillScopePending(document.getElementById("sns-genre-body"), "instagram");
  document.getElementById("sns-media-range").textContent = "";
  document.getElementById("sns-media-genre-tabs").innerHTML = "";
  fillScopePending(document.getElementById("sns-media-body"), "instagram");
}

async function loadSns(detailPromise) {
  snsStatusEl.textContent = "読み込み中…";
  snsBodyEl.hidden = true;
  const youtubeStatusEl = document.getElementById("youtube-status");
  youtubeStatusEl.textContent = "読み込み中…";
  const threadsStatusEl = document.getElementById("threads-status");
  threadsStatusEl.textContent = "読み込み中…";
  const xStatusEl = document.getElementById("x-status");
  xStatusEl.textContent = "読み込み中…";
  youtubeView.renderYoutube(null);
  renderThreads();
  renderX();
  try {
    const detail = await (detailPromise ??
      fetchSnsDetail(CONFIG.GAS_ENDPOINT, auth(), undefined, "overview"));
    if (!detail || !detail.ok) {
      const message =
        (detail && detail.error) || "SNSデータを取得できませんでした";
      snsStatusEl.textContent = message;
      youtubeStatusEl.textContent = message;
      threadsStatusEl.textContent = message;
      xStatusEl.textContent = message;
      settleSnsFailed();
      return;
    }
    renderSns(applyDetailResponse(detail));
    // A deep link can land on a channel tab: its full section is
    // due now that the snapshot has settled (a tab opened later
    // fetches its own on activation).
    if (SNS_DETAIL_PLATFORMS.includes(activeTabId)) {
      void ensurePlatformScope(activeTabId);
    }
  } catch {
    snsStatusEl.textContent = "SNSデータを取得できませんでした";
    youtubeStatusEl.textContent = "SNSデータを取得できませんでした";
    threadsStatusEl.textContent = "SNSデータを取得できませんでした";
    xStatusEl.textContent = "SNSデータを取得できませんでした";
    settleSnsFailed();
  }
}

// The SNS snapshot could not be read: the sections it feeds end
// on their failure state instead of sitting on the loading line
// (the per-tab status lines above carry the error message).
function settleSnsFailed() {
  overviewState.detailSettled = true;
  overviewState.detailFailed = true;
  renderOverview();
  youtubeView.renderYoutube(null);
  renderThreads();
  renderX();
}

// --- SNS trend charts (overview tab) ---

function renderSnsHistory(response) {
  const wrap = document.getElementById("sns-history");
  wrap.innerHTML = "";
  const series = snsHistorySeries(snsHistoryRows(response));
  if (!series.length) {
    const p = document.createElement("p");
    p.className = "meta";
    p.textContent = "履歴はまだありません（取得のたびに貯まっていきます）";
    wrap.appendChild(p);
    return;
  }
  for (const item of series) {
    const head = document.createElement("p");
    head.className = "meta";
    head.append(
      `${item.label}：最新 `,
      // The combined follower total is a published figure
      // (the top page's hero); the other series stay masked.
      countSpan(item.latest, item.key === "total_followers"),
      `（${formatJstDateTime(item.firstAt)} 〜 ${formatJstDateTime(item.lastAt)}）`,
    );
    const chart = document.createElement("div");
    chart.className = "chart-wrap";
    // The combined follower total carries the same y axis as
    // the Instagram engagement trend: it is the overview's
    // headline trend, and its day-to-day movement (a few dozen
    // followers on a four-thousand base) disappears on a
    // zero-based scale. The axis follows the Instagram
    // treatment exactly — data-following domain, round ticks,
    // tick labels masked like the other raw counts (the head
    // line's latest value above stays the published, exempt
    // figure).
    chart.innerHTML = buildLineChartSvg(item.points, {
      label: item.label,
      yAxis: item.key === "total_followers",
    });
    wrap.appendChild(head);
    wrap.appendChild(chart);
  }
}

// The history has its own load: it never touches the rest of
// the SNS section, and its rows also feed the overview KPI
// deltas. While it is in flight the trend sections carry the
// loading line; a failed load ends them on the failure line,
// distinct from a history that is genuinely still empty.
async function loadSnsHistory(historyPromise) {
  const historyEl = document.getElementById("sns-history");
  setSectionLoading(historyEl);
  let response = null;
  let failed = false;
  try {
    response = await (historyPromise ??
      fetchSnsHistory(CONFIG.GAS_ENDPOINT, auth()));
    if (!response || !response.ok) {
      failed = true;
    }
  } catch {
    failed = true;
  }
  if (!failed) {
    applySnsHistory(response);
    return;
  }
  overviewState.historyRows = snsHistoryRows(null);
  overviewState.historySettled = true;
  overviewState.historyFailed = failed;
  setSectionFailed(historyEl);
  renderOverview();
  youtubeView.renderYoutube(overviewState.detail);
  instagramView.renderInstagramTotals();
  instagramView.renderInstagramTrend();
  renderYoutubeHistory();
  renderThreads();
  renderX();
}

// Lands a fetched history response on the shared state and
// re-renders everything the rows feed: the overview trend and
// KPI deltas, and the channel totals that read the history
// (the YouTube subscriber change card among them). Shared by
// the initial load above and the auto-refresh below, so the two
// paths can never drift apart.
function applySnsHistory(response) {
  overviewState.historyRows = snsHistoryRows(response);
  overviewState.historySettled = true;
  overviewState.historyFailed = false;
  renderSnsHistory(response);
  renderOverview();
  // The YouTube totals now read the history too (the subscriber
  // change card), so they re-render with the other channel tabs
  // when the history settles.
  youtubeView.renderYoutube(overviewState.detail);
  instagramView.renderInstagramTotals();
  instagramView.renderInstagramTrend();
  renderYoutubeHistory();
  renderThreads();
  renderX();
}

// --- Auto-refresh ---
// While the dashboard stays open, the SNS snapshot and history
// are re-fetched every ten minutes (see auto-refresh.js), so a
// new hourly collection appears without a manual reload. Only
// the SNS data is re-fetched: it is what the hourly collection
// updates, and the GA/blog sections keep the figures they
// loaded with. A refresh that fails — or answers without ok —
// leaves the current display exactly as it is and simply lets
// the next cycle try again; the loading and failure states of
// the initial loads never reappear here.
//
// The tab selection lives in the URL and the renderers rebuild
// in place, so the open tab and the scroll position survive a
// refresh. Selections held in module state — the Instagram
// trend's metric and period chips, the genre sections' period
// and sort, the Threads / X genre filters, every table's sort —
// are read back by the renderers and survive as well. The one
// exception is the Instagram per-post genre filter: renderSns
// resets it on every fresh snapshot by design, so it is saved
// and restored around the render (and dropped when the new
// snapshot no longer carries that genre).

async function refreshSnsData() {
  const historyPromise = fetchSnsHistory(CONFIG.GAS_ENDPOINT, auth());
  historyPromise.catch(() => {});
  // The detail refresh follows the scopes the page already
  // holds: the overview scope plus the full section of every
  // channel whose tab has been opened — a channel never opened
  // is never fetched. Once every channel is loaded the four
  // scoped reads would reassemble exactly the full snapshot, so
  // a single unscoped fetch refreshes it instead (the pre-scope
  // behaviour). Responses land through applyDetailResponse one
  // by one, so an overview refresh never overwrites a loaded
  // channel's full section with its preview, and a scope that
  // fails simply leaves that channel's current figures standing.
  const loadedPlatforms = SNS_DETAIL_PLATFORMS.filter(
    (platform) => overviewState.detailScopes[platform],
  );
  let merged = null;
  if (loadedPlatforms.length === SNS_DETAIL_PLATFORMS.length) {
    let detail = null;
    try {
      detail = await fetchSnsDetail(CONFIG.GAS_ENDPOINT, auth());
    } catch {
      detail = null;
    }
    if (detail && detail.ok) {
      merged = applyDetailResponse(detail);
    }
  } else {
    const responses = await Promise.all(
      ["overview", ...loadedPlatforms].map((scope) =>
        fetchSnsDetail(CONFIG.GAS_ENDPOINT, auth(), undefined, scope).catch(
          () => null,
        ),
      ),
    );
    for (const response of responses) {
      if (response && response.ok) {
        merged = applyDetailResponse(response);
      }
    }
  }
  if (merged) {
    renderSnsKeepingGenreFilter(merged);
  }
  let history = null;
  try {
    history = await historyPromise;
  } catch {
    history = null;
  }
  if (history && history.ok) {
    applySnsHistory(history);
  }
}

const snsAutoRefresher = createAutoRefresher({
  onRefresh: refreshSnsData,
});

// --- Daily chart tooltip (hover on PC, tap on touch) ---

const chartTooltipEl = document.getElementById("chart-tooltip");

function showChartTooltip(pointEl) {
  // The date stays readable; the view count rides in a
  // .privacy-mask span, which is why the wording is composed
  // here instead of as one plain-text string. This tooltip
  // serves the blog's daily chart, whose figures are
  // unpublished 28-day rollups, so the count masks like any
  // raw count.
  chartTooltipEl.textContent = "";
  chartTooltipEl.append(`${formatDateFull(pointEl.dataset.date)} · `);
  const count = document.createElement("span");
  count.className = "privacy-mask";
  count.textContent = `${Number(pointEl.dataset.views).toLocaleString()}回`;
  chartTooltipEl.appendChild(count);
  const rect = pointEl.getBoundingClientRect();
  chartTooltipEl.style.left = `${rect.left + rect.width / 2}px`;
  chartTooltipEl.style.top = `${rect.top}px`;
  chartTooltipEl.hidden = false;
}

function hideChartTooltip() {
  chartTooltipEl.hidden = true;
}

let chartTooltipWired = false;

function wireChartTooltip() {
  if (chartTooltipWired) {
    return;
  }
  chartTooltipWired = true;
  const chart = document.getElementById("daily-chart");
  const onPoint = (event) => {
    const pointEl = event.target.closest(".chart-point");
    if (pointEl) {
      showChartTooltip(pointEl);
    } else if (event.type === "pointerdown") {
      hideChartTooltip();
    }
  };
  chart.addEventListener("pointermove", onPoint);
  chart.addEventListener("pointerdown", onPoint);
  chart.addEventListener("pointerleave", hideChartTooltip);
}

function showAccountEmail(credential) {
  try {
    const payload = decodeJwtPayload(credential);
    accountEl.textContent = payload.email ? `${payload.email} でログイン中` : "";
  } catch {
    accountEl.textContent = "";
  }
}

async function onSignedIn(credential) {
  showAccountEmail(credential);
  // Exchange the (1-hour) Google ID token for a 30-day owner session
  // and save that, so later visits restore the session instead of
  // starting at the gate — the same arrangement as the asset app.
  let result = null;
  try {
    result = await exchangeSession(CONFIG.GAS_ENDPOINT, credential);
  } catch {
    result = null;
  }
  if (!result || !result.ok || !result.session_token) {
    gateErrorEl.textContent = "ログインに失敗しました。もう一度お試しください。";
    accountEl.textContent = "";
    showGate();
    initGoogleSignIn();
    return;
  }
  sessionToken = result.session_token;
  saveSessionToken(sessionToken);
  // Sign-in just succeeded, so the gate (and its button) must not
  // stay on screen while the dashboard loads.
  showLoading();
  loadDashboard();
}

// The GIS client script arrives async; poll for it briefly. If
// it never shows up — an ad blocker can swallow it — the gate
// says so after a few seconds instead of leaving the sign-in
// area silently empty forever.
const SIGNIN_SCRIPT_ERROR_TEXT =
  "Googleログインスクリプトの読み込みに失敗しました。広告ブロック等を解除して再読み込みしてください。";
let signInScriptWaitMs = 0;

function initGoogleSignIn() {
  if (!window.google || !window.google.accounts) {
    if (signInScriptWaitMs >= 3000) {
      gateErrorEl.textContent = SIGNIN_SCRIPT_ERROR_TEXT;
      return;
    }
    signInScriptWaitMs += 300;
    setTimeout(initGoogleSignIn, 300);
    return;
  }
  signInScriptWaitMs = 0;
  if (gateErrorEl.textContent === SIGNIN_SCRIPT_ERROR_TEXT) {
    gateErrorEl.textContent = "";
  }
  window.google.accounts.id.initialize({
    client_id: CONFIG.GOOGLE_CLIENT_ID,
    callback: (response) => onSignedIn(response.credential),
  });
  window.google.accounts.id.renderButton(document.getElementById("signin"), {
    theme: "outline",
    size: "large",
    text: "signin_with",
    shape: "pill",
  });
}

logoutBtn.addEventListener("click", () => {
  const endingSession = sessionToken;
  snsAutoRefresher.stop();
  sessionToken = null;
  shareToken = null;
  renderPrivacy();
  if (endingSession) {
    // Revoke the owner session server-side; local logout proceeds
    // regardless of the outcome.
    revokeSession(CONFIG.GAS_ENDPOINT, endingSession).catch(() => {});
  }
  clearSavedSessionToken();
  clearSavedIdToken();
  clearSavedShareToken();
  if (window.google && window.google.accounts) {
    window.google.accounts.id.disableAutoSelect();
  }
  accountEl.textContent = "";
  showGate();
});

// --- Temporary share link card (owner only, same as the other apps) ---

function showIssuedShare(url, expiresAt) {
  shareUrlEl.value = url;
  shareExpiresEl.textContent = formatShareExpiry(expiresAt);
  shareRemainingEl.textContent = formatShareRemaining(
    shareSecondsLeft(expiresAt, Date.now()),
  );
  shareIssuedEl.hidden = false;
  shareIssueRowEl.hidden = true;
}

async function issueShare() {
  shareStatusEl.textContent = "発行しています…";
  try {
    const result = await shareAction(CONFIG.GAS_ENDPOINT, auth(), "issue_share");
    if (!result.ok) {
      shareStatusEl.textContent = result.error || "発行できませんでした";
      return;
    }
    // Issued links always name the app root, not the tab the
    // issuer happens to be on (the pathname varies with the tab
    // now that tabs live in the path).
    const base = window.location.origin + APP_BASE;
    showIssuedShare(buildShareUrl(base, result.share_token), result.expires_at);
    shareStatusEl.textContent = "";
  } catch {
    shareStatusEl.textContent = "発行できませんでした";
  }
}

shareIssueBtn.addEventListener("click", issueShare);
shareReissueBtn.addEventListener("click", issueShare);
shareRevokeBtn.addEventListener("click", async () => {
  try {
    await shareAction(CONFIG.GAS_ENDPOINT, auth(), "revoke_share");
  } catch {
    // Even if the call fails, hide the issued URL; the status line says so.
  }
  shareIssuedEl.hidden = true;
  shareIssueRowEl.hidden = false;
  shareStatusEl.textContent = "無効化しました";
});
shareCopyBtn.addEventListener("click", async () => {
  shareUrlEl.select();
  try {
    await navigator.clipboard.writeText(shareUrlEl.value);
    shareStatusEl.textContent = "コピーしました";
  } catch {
    document.execCommand("copy");
  }
});

// Shown on the gate when a saved owner session turned out to be
// dead and the visitor is asked to sign in again.
const SESSION_EXPIRED_TEXT =
  "ログインの有効期限が切れました。再度ログインしてください。";

// Entry point. A share link skips sign-in entirely; without one, a
// session saved by an earlier visit is restored before falling back
// to the sign-in gate — the same arrangement as the asset app.
async function enterWithShareToken(token, fromHash) {
  // Validation takes a network round-trip; stay on the loading
  // screen until it lands on the dashboard, the expired screen,
  // or (for a stale saved copy) the sign-in gate.
  showLoading();
  shareToken = token;
  if (fromHash) {
    // Keep a copy so reopening the app without the fragment (or a
    // restored tab) can resume this session.
    saveShareToken(token);
  }
  let result = null;
  try {
    result = await validateShareToken(CONFIG.GAS_ENDPOINT, token);
  } catch {
    result = null;
  }
  if (result && result.ok) {
    shareExpiresAt = result._share ? result._share.expires_at : null;
    loadDashboard();
    return;
  }
  shareToken = null;
  renderPrivacy();
  // A dead token must not linger in storage: it would shadow the
  // sign-in restore on every later visit.
  clearSavedShareToken();
  if (fromHash) {
    // The link itself is dead (revoked, expired, or unreachable).
    showExpired();
  } else {
    // The saved copy went stale. The visitor did not open a link
    // just now, so the "expired link" screen would mislead; show
    // the sign-in gate instead.
    gateErrorEl.textContent = "";
    showGate();
    initGoogleSignIn();
  }
}

function probeAnonymous() {
  // Probe the bridge once on load, like the other apps do. A 401 just
  // means "sign in"; if the bridge ever answers anonymously, go
  // straight to the dashboard.
  fetchReport(CONFIG.GAS_ENDPOINT, {}, { dimensions: "" })
    .then((result) => {
      if (result.ok) {
        loadDashboard();
      } else {
        showGate();
        initGoogleSignIn();
      }
    })
    .catch(() => {
      showGate();
      initGoogleSignIn();
    });
}

async function boot() {
  // The markup already opens on the loading screen; restate it so
  // the state machine starts from a known place.
  showLoading();
  // Drop any legacy saved Google ID token left by the old scheme.
  clearSavedIdToken();
  const entry = bootEntry({
    hashToken: parseShareToken(window.location.hash),
    savedSessionToken: loadSavedSessionToken(),
    savedShareToken: loadSavedShareToken(),
  });
  if (entry.kind === "share") {
    await enterWithShareToken(entry.token, entry.fromHash);
    return;
  }
  if (entry.kind === "session") {
    sessionToken = entry.token;
    if (await loadDashboard()) {
      return;
    }
    // The saved session expired or was rejected: drop it and fall
    // back to a saved share session, then to the gate.
    clearSavedSessionToken();
    sessionToken = null;
    accountEl.textContent = "";
    const savedShare = loadSavedShareToken();
    if (savedShare) {
      await enterWithShareToken(savedShare, false);
      return;
    }
    // The visitor came back to a dead owner session: say why
    // the gate is back instead of showing it without a word.
    gateErrorEl.textContent = SESSION_EXPIRED_TEXT;
    showGate();
    initGoogleSignIn();
    return;
  }
  probeAnonymous();
}

boot();
