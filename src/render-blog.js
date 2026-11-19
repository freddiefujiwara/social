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
} from "./api.js";
import { buildLineChartSvg, formatDateLabel } from "./chart.js";
import { sortGenreRows } from "./genres.js";
import { genreTreemap } from "./treemap.js";
import { buildGenreTreemap } from "./render-treemap.js";

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
