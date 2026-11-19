// The blog tab's chart and genre sections: the daily views
// chart with its published-article overlay, the sources
// ranking list, and the per-genre (tag) rollup. The per-article
// table stays with the dashboard loader in main.js, which
// shares the same page-row load.
import { CONFIG } from "./config.js";
import {
  dimensionRanking,
  blogArticlesByDate,
  mergeBlogTitles,
  blogGenreStats,
  formatCount,
  formatJstDateTime,
  TRANSLATION_LANGS,
  translationAttention,
} from "./api.js";
import { buildLineChartSvg, formatDateLabel } from "./chart.js";
import { sortGenreRows } from "./genres.js";
import { genreTreemap } from "./treemap.js";
import { buildGenreTreemap } from "./render-treemap.js";
import { clearLangPref, langPrefLabel, readLangPref } from "./lang-pref.js";

export function renderRanking(elId, response, limit) {
  const list = document.getElementById(elId);
  list.innerHTML = "";
  for (const item of dimensionRanking(response, limit)) {
    const li = document.createElement("li");
    li.textContent = item.name;
    const span = document.createElement("span");
    // Blog-tab figures are unpublished GA rollups: masked
    // like every other raw count.
    span.className = "rank-value amount-value";
    span.textContent = item.views.toLocaleString();
    li.appendChild(span);
    list.appendChild(li);
  }
}

// --- Blog daily chart (日ごとの表示回数と公開した記事) ---
// The blog counterpart of the Instagram follow chart's overlay:
// days that carry a published article get a ▼ marker (with the
// article count beside it when the day has more than one), and
// tapping a marked day's column — or the marker — scrolls to
// that day's entry in the list below and highlights both, the
// same operation as the follow chart's posted days. Article
// dates come from the titles' leading "YYYY-MM-DD" (see
// blogArticlesByDate); articles whose day falls outside the
// chart's range cannot be placed on it and stay out of the list.
// The day entries' view counts are the blog's daily GA figures,
// so they mask like every other blog number.

export function jumpToBlogDay(wrap, date) {
  for (const el of wrap.querySelectorAll(".blog-day-hit.selected")) {
    el.classList.remove("selected");
  }
  for (const el of wrap.querySelectorAll(".blog-day-entry.highlight")) {
    el.classList.remove("highlight");
  }
  const hit = wrap.querySelector(`.blog-day-hit[data-date="${date}"]`);
  if (hit) {
    hit.classList.add("selected");
  }
  const entry = wrap.querySelector(`.blog-day-entry[data-date="${date}"]`);
  if (entry) {
    entry.classList.add("highlight");
    entry.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

export function renderBlogDaily(points, titles) {
  const wrap = document.getElementById("daily-chart");
  wrap.innerHTML = "";
  const articlesByDate = new Map(
    blogArticlesByDate(titles, CONFIG.SITE_ORIGIN).map((day) => [
      day.date,
      day.articles,
    ]),
  );
  const markedDays = new Map();
  const viewsByDate = new Map();
  for (const point of points) {
    viewsByDate.set(point.date, point.views);
    const articles = articlesByDate.get(point.date);
    if (articles && articles.length) {
      markedDays.set(point.date, articles.length);
    }
  }
  // The blog's daily figures are 28-day GA rollups that no
  // public page prints, so the chart's max label masks like
  // the other charts'.
  const chart = document.createElement("div");
  chart.innerHTML = buildLineChartSvg(points, { markedDays });
  chart.addEventListener("click", (event) => {
    const hit = event.target.closest?.("[data-date]");
    if (hit && articlesByDate.has(hit.dataset.date)) {
      jumpToBlogDay(wrap, hit.dataset.date);
    }
  });
  wrap.appendChild(chart);
  if (!markedDays.size) {
    return;
  }
  const legend = document.createElement("p");
  legend.className = "meta";
  legend.textContent =
    "▼は記事を公開した日です。▼や列を押すと、その日の記事に飛びます。";
  wrap.appendChild(legend);
  const head = document.createElement("h4");
  head.className = "demo-list-title";
  head.textContent = "記事を公開した日";
  wrap.appendChild(head);
  const postedDays = [...markedDays.keys()].sort().reverse();
  for (const date of postedDays) {
    const articles = articlesByDate.get(date);
    const entry = document.createElement("div");
    entry.className = "blog-day-entry";
    entry.dataset.date = date;
    const dayLine = document.createElement("p");
    dayLine.className = "meta";
    dayLine.append(`${formatDateLabel(date)}：表示回数 `);
    const views = document.createElement("span");
    views.className = "amount-value";
    views.textContent = formatCount(viewsByDate.get(date) ?? 0);
    dayLine.append(views, "回");
    if (articles.length > 1) {
      dayLine.append(` · 記事${articles.length}件`);
    }
    entry.appendChild(dayLine);
    const list = document.createElement("ul");
    list.className = "ranking";
    for (const article of articles) {
      const li = document.createElement("li");
      const link = document.createElement("a");
      link.href = article.href;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = article.title;
      li.appendChild(link);
      list.appendChild(li);
    }
    entry.appendChild(list);
    wrap.appendChild(entry);
  }
  const note = document.createElement("p");
  note.className = "meta";
  note.textContent =
    "表示回数はブログ全体の日次です。記事との対応は公開日による重ね合わせで、どの記事がきっかけかまでは分かりません。";
  wrap.appendChild(note);
}

// --- Blog genre rollup (blog tab) ---
// Joins the GA page rows with the blog's article tag map. Without
// the map there is nothing honest to group by: the section then
// carries a short note instead of a table. Column headers sort
// the rows, like the Instagram tables; the last render's inputs
// are kept so a header click can re-render in the new order.

let blogGenreSort = { key: "totalViews", dir: "desc" };
let blogGenreContext = null;

const BLOG_GENRE_COLUMNS = [
  { key: "tag", label: "タグ", numeric: false },
  { key: "count", label: "記事数", numeric: true },
  { key: "totalViews", label: "表示回数 合計", numeric: true },
  { key: "perArticle", label: "1記事あたり", numeric: true },
  { key: "top", label: "最も読まれた記事", numeric: false },
];

export function renderBlogGenres(pagesResponse, meta, rssTitles) {
  blogGenreContext = { pagesResponse, meta, rssTitles };
  const wrap = document.getElementById("blog-genres");
  wrap.innerHTML = "";
  if (!meta || !meta.tags || meta.tags.size === 0) {
    const p = document.createElement("p");
    p.className = "meta";
    p.textContent =
      "記事のタグ情報を取得できなかったため、ジャンル別は表示していません。";
    wrap.appendChild(p);
    return;
  }
  // The RSS titles win; the titles payload fills any gap.
  const titles = mergeBlogTitles(meta.titles, rssTitles);
  const rows = sortGenreRows(
    blogGenreStats(pagesResponse, meta.tags, titles, CONFIG.SITE_ORIGIN),
    blogGenreSort.key,
    blogGenreSort.dir,
  );
  if (!rows.length) {
    const p = document.createElement("p");
    p.className = "meta";
    p.textContent = "—";
    wrap.appendChild(p);
    return;
  }
  // The tiles (area = views per article) summarise the same
  // rows the table below lists in full. Every figure here is a
  // last-28-days GA rollup that no public page prints, so the
  // whole section masks like the SNS genre sections.
  wrap.appendChild(
    buildGenreTreemap(
      genreTreemap(rows, (row) => ({
        name: row.tag,
        avg: row.perArticle,
        avgText: `1記事あたり ${formatCount(row.perArticle)}`,
        totalText: `合計 ${formatCount(row.totalViews)}`,
      })),
      "タイルの面積は1記事あたり表示回数の大きさです。色が青いほど1記事あたり表示回数が多いです。",
    ),
  );
  const table = document.createElement("table");
  table.className = "data-table";
  const thead = document.createElement("thead");
  const headRow = document.createElement("tr");
  for (const column of BLOG_GENRE_COLUMNS) {
    const th = document.createElement("th");
    th.className = (column.numeric ? "num " : "") + "sortable";
    const active = blogGenreSort.key === column.key;
    th.textContent =
      column.label +
      (active ? (blogGenreSort.dir === "desc" ? " ↓" : " ↑") : "");
    th.addEventListener("click", () => {
      if (blogGenreSort.key === column.key) {
        blogGenreSort = {
          key: column.key,
          dir: blogGenreSort.dir === "desc" ? "asc" : "desc",
        };
      } else {
        blogGenreSort = { key: column.key, dir: "desc" };
      }
      if (blogGenreContext) {
        renderBlogGenres(
          blogGenreContext.pagesResponse,
          blogGenreContext.meta,
          blogGenreContext.rssTitles,
        );
      }
    });
    headRow.appendChild(th);
  }
  thead.appendChild(headRow);
  table.appendChild(thead);
  const tbody = document.createElement("tbody");
  for (const row of rows) {
    const tr = document.createElement("tr");
    const tagTd = document.createElement("td");
    tagTd.textContent = row.tag;
    tr.appendChild(tagTd);
    for (const value of [row.count, row.totalViews, row.perArticle]) {
      const td = document.createElement("td");
      td.className = "num amount-value";
      td.textContent = formatCount(value);
      tr.appendChild(td);
    }
    const topTd = document.createElement("td");
    if (row.top) {
      const link = document.createElement("a");
      link.href = row.top.href;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = row.top.title;
      topTd.appendChild(link);
      const span = document.createElement("span");
      span.className = "rank-value amount-value";
      span.textContent = formatCount(row.top.views);
      topTd.appendChild(span);
    } else {
      topTd.textContent = "—";
    }
    tr.appendChild(topTd);
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  const scroll = document.createElement("div");
  scroll.className = "table-scroll";
  scroll.appendChild(table);
  wrap.appendChild(scroll);
}

// --- Blog translation status (blog tab) ---
// The per-language freshness of the blog's English / Chinese
// translations, as blog-gas judges them against its own
// snapshots (see parseTranslationStatus in api.js): one summary
// box per language — how many of all articles are translated
// and current, with the stale / untranslated counts spelled out
// while any exist — then the articles that need attention, and
// nothing but an all-clear line when none do. The counts are
// article counts of public articles, so the boxes mark their
// values public like the article count on the 記事ごと section;
// the figures are blog-gas's operational state, not GA numbers.

const TRANSLATION_STATUS_LABELS = { stale: "古い", missing: "未翻訳" };

export function renderBlogTranslationStatus(status) {
  const wrap = document.getElementById("blog-translation-status");
  wrap.innerHTML = "";
  if (status.generatedAt) {
    const asOf = document.createElement("p");
    asOf.className = "meta";
    asOf.textContent = `${formatJstDateTime(status.generatedAt)} 時点の状態です`;
    wrap.appendChild(asOf);
  }
  const row = document.createElement("div");
  row.className = "totals-row";
  for (const { key, label } of TRANSLATION_LANGS) {
    const counts = status.languages[key];
    const box = document.createElement("div");
    box.className = "total-box";
    const labelEl = document.createElement("div");
    labelEl.className = "total-label";
    labelEl.textContent = label;
    const valueEl = document.createElement("div");
    valueEl.className = "total-value amount-value is-public";
    valueEl.textContent = `${counts.fresh}/${status.total}`;
    box.append(labelEl, valueEl);
    const problems = [
      counts.stale ? `古い ${counts.stale}件` : "",
      counts.missing ? `未翻訳 ${counts.missing}件` : "",
    ].filter(Boolean);
    if (problems.length) {
      const detail = document.createElement("div");
      detail.className = "kpi-delta";
      detail.textContent = problems.join(" · ");
      box.appendChild(detail);
    }
    row.appendChild(box);
  }
  wrap.appendChild(row);
  const attention = translationAttention(status);
  if (!attention.length) {
    const p = document.createElement("p");
    p.className = "meta";
    p.textContent = "すべての記事の翻訳が最新です。";
    wrap.appendChild(p);
    return;
  }
  const head = document.createElement("h3");
  head.className = "subsection-title";
  head.textContent = "対応が必要な記事";
  wrap.appendChild(head);
  const list = document.createElement("ul");
  list.className = "ranking";
  for (const article of attention) {
    const li = document.createElement("li");
    const link = document.createElement("a");
    link.href = `${CONFIG.SITE_ORIGIN}/blog/${article.id}`;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = article.title;
    li.appendChild(link);
    const span = document.createElement("span");
    span.className = "rank-value";
    span.textContent = article.problems
      .map(
        (problem) =>
          `${problem.label}：${TRANSLATION_STATUS_LABELS[problem.status]}`,
      )
      .join("／");
    li.appendChild(span);
    list.appendChild(li);
  }
  wrap.appendChild(list);
}

// The language-preference section: shows what the shared top/blog
// language key currently holds (same origin, so plain local
// storage) and offers the reset. Purely local state — it renders
// synchronously, independent of the dashboard fetches.
export function renderLangPref(resetDone = false) {
  const wrap = document.getElementById("blog-lang-pref");
  wrap.innerHTML = "";
  const { shared, legacy } = readLangPref();
  const current = document.createElement("p");
  current.className = "meta";
  current.textContent = shared
    ? `現在の保存：${langPrefLabel(shared)}`
    : "現在の保存：未保存";
  wrap.appendChild(current);
  if (legacy) {
    const legacyNote = document.createElement("p");
    legacyNote.className = "meta";
    legacyNote.textContent = `移行前の旧キーにも「${langPrefLabel(legacy)}」が残っています。共有キーが無いときはブログがこちらを使います。`;
    wrap.appendChild(legacyNote);
  }
  const button = document.createElement("button");
  button.type = "button";
  button.className = "theme-toggle";
  button.textContent = "保存をリセット";
  button.disabled = !shared && !legacy;
  button.addEventListener("click", () => {
    clearLangPref();
    renderLangPref(true);
  });
  wrap.appendChild(button);
  if (resetDone) {
    const done = document.createElement("p");
    done.className = "meta";
    done.textContent =
      "リセットしました。次にトップページを開くか、ブログのフッターで言語を切り替えて新しい保存ができるまでは、ブログはブラウザの言語にしたがいます。";
    wrap.appendChild(done);
  }
}
