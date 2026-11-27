// Shared building blocks for the tab renderers: the small DOM
// pieces several tabs compose the same way — masking-ready
// count spans and total-box values, the 前日比 line, numeric /
// rate table cells, post-list thumbnails, the sortable-table
// wiring, the genre filter buttons and the shared post-genre
// section (Threads / X) — so the tabs cannot drift apart.
import { formatCount, isPlaceholderThumbnail, thumbnailOrientation } from "./api.js";
import { sortGenreRows, formatRate } from "./genres.js";
import { genreTreemap } from "./treemap.js";
import { buildGenreTreemap } from "./render-treemap.js";

// A raw count as a masking-ready span: figures the renderers
// splice into a line of text ride in one of these, so the
// privacy CSS (which blurs .amount-value) reaches them too.
// A figure the owner already publishes elsewhere (the top
// page's follower counts) passes isPublic and also takes
// .is-public, so masking leaves it readable like the
// percentages.
export function countSpan(value, isPublic = false) {
  const span = document.createElement("span");
  span.className = "amount-value" + (isPublic ? " is-public" : "");
  span.textContent = formatCount(value);
  return span;
}

// The total-box value classes: every value is a raw count and
// takes .amount-value, except a percentage （割合） and the
// items flagged public (figures already published on the top
// page), which also take .is-public so they stay readable
// while masking — the asset / health exemption.
export function totalValueClass(item) {
  const isPercent =
    typeof item.value === "string" && item.value.trim().endsWith("%");
  const isPublic = isPercent || item.public === true;
  return "total-value amount-value" + (isPublic ? " is-public" : "");
}

// The 前日比 line under a card's value, shared by the overview
// KPI cards and any total box that carries a change (the
// Instagram tab's フォロー / フォロー解除 cards mirror the
// overview's): an increase is green and a decrease red —
// except on the cards flagged invert (フォロー解除）, where
// an increase is the bad direction and takes the red instead.
// The line is one of this page's own analysis figures, so it
// takes .amount-value and stays masked like the other numbers
// (never .is-public). Cards without a delta get no line.
export function appendDeltaLine(box, item) {
  if (!item.delta) {
    return;
  }
  const delta = document.createElement("div");
  const sign = item.delta.startsWith("+")
    ? 1
    : item.delta.startsWith("-")
      ? -1
      : 0;
  const good = item.invert ? sign < 0 : sign > 0;
  const bad = item.invert ? sign > 0 : sign < 0;
  delta.className =
    "kpi-delta amount-value" + (good ? " up" : bad ? " down" : "");
  delta.textContent = `前日比 ${item.delta}`;
  box.appendChild(delta);
}

// A numeric table cell: the figure is a raw count, so the
// cell takes .amount-value and masks like the counts beside
// it. `format` renders the value (plain counts by default;
// the blog table's speed / depth columns pass their own).
export function numCell(value, format = formatCount) {
  const td = document.createElement("td");
  td.className = "num amount-value";
  td.textContent = format(value);
  return td;
}

// A rate cell (保存率・いいね率などの割合): ratios stay
// readable while masking, so the cell takes no .amount-value.
export function rateCell(text) {
  const td = document.createElement("td");
  td.className = "num";
  td.textContent = text;
  return td;
}

// Representative post for the genre tables. The count remains maskable.
export function genreTopPostCell(top) {
  const td = document.createElement("td");
  if (!top) {
    td.textContent = "—";
    return td;
  }

  if (top.permalink) {
    const link = document.createElement("a");
    link.href = top.permalink;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = top.title;
    td.appendChild(link);
  } else {
    td.textContent = top.title;
  }

  const count = document.createElement("span");
  count.className = "rank-value amount-value";
  count.textContent = formatCount(top.views);
  td.appendChild(count);
  return td;
}

// One post-list thumbnail: a fixed-size frame the row height
// never depends on, with the image cover-cropped into it. `shape`
// names the frame's aspect — "vertical" (reels), "square"
// (photos) or "horizontal" (wide videos). `candidates` are image
// URLs in order of preference: one that fails to load falls
// through to the next, and when none is left the frame simply
// stays empty, so a missing or expired image never breaks the
// row. With `autoShape` (YouTube, whose URL shape serves both
// orientations) a candidate that loads as YouTube's 120x90
// placeholder also falls through, and the frame adopts the
// loaded image's own aspect once it arrives.
export function thumbnailCell({ candidates = [], shape = "square", autoShape = false }) {
  const td = document.createElement("td");
  td.className = "thumb-cell";
  const frame = document.createElement("span");
  frame.className = `thumb-frame thumb-${shape}`;
  const urls = candidates.filter(
    (url) => typeof url === "string" && url.length > 0,
  );
  if (urls.length) {
    const img = document.createElement("img");
    img.className = "thumb-img";
    img.alt = "";
    img.loading = "lazy";
    let index = 0;
    const advance = () => {
      index += 1;
      if (index < urls.length) {
        img.src = urls[index];
      } else {
        img.remove();
      }
    };
    img.addEventListener("error", advance);
    img.addEventListener("load", () => {
      if (
        autoShape &&
        isPlaceholderThumbnail(img.naturalWidth, img.naturalHeight)
      ) {
        advance();
        return;
      }
      if (autoShape) {
        const orientation = thumbnailOrientation(
          img.naturalWidth,
          img.naturalHeight,
        );
        if (orientation) {
          frame.className = `thumb-frame thumb-${orientation}`;
        }
      }
    });
    img.src = urls[0];
    frame.appendChild(img);
  }
  td.appendChild(frame);
  return td;
}

// Column-header sorting shared by the per-item tables (the
// Instagram tab's 投稿ごと, the blog tab's 記事ごと and the
// per-post / per-video tables of Threads, X and YouTube): the
// first click on a header sorts descending by that column,
// clicking the same header again flips the direction, and the
// active header carries a ↓ / ↑ mark. `sortState` is the
// table's own { key, dir, wired } object; render redraws the
// table body (and calls updateSortHeaders) after a click.
export function wireSortableTable(tableId, sortState, render) {
  if (sortState.wired) {
    return;
  }
  sortState.wired = true;
  document.querySelectorAll(`#${tableId} th.sortable`).forEach((th) => {
    th.dataset.label = th.textContent;
    th.addEventListener("click", () => {
      const key = th.dataset.sortKey;
      if (sortState.key === key) {
        sortState.dir = sortState.dir === "desc" ? "asc" : "desc";
      } else {
        sortState.key = key;
        sortState.dir = "desc";
      }
      render();
    });
  });
}

export function updateSortHeaders(tableId, sortState) {
  document.querySelectorAll(`#${tableId} th.sortable`).forEach((th) => {
    const active = th.dataset.sortKey === sortState.key;
    th.textContent =
      th.dataset.label + (active ? (sortState.dir === "desc" ? " ↓" : " ↑") : "");
  });
}

// The genre filter buttons above a per-item table (the
// Instagram tab's 投稿ごと and the blog tab's 記事ごと share
// this renderer, so the two tables feel the same): すべて plus
// one button per genre that has items, each labelled with its
// item count. `total` is the count on the すべて button — the
// caller computes it, since a blog article with several tags
// counts once per tag in the options but is still one article.
// Clicking a button reports the genre (null for すべて) through
// onSelect; the caller owns the filter state and re-renders.
export function renderGenreFilterTabs(
  wrap,
  { total, options, active, onSelect },
) {
  wrap.innerHTML = "";
  const buttons = [{ genre: null, name: "すべて", count: total }];
  for (const option of options) {
    buttons.push({
      genre: option.genre,
      name: option.genre,
      count: option.count,
    });
  }
  for (const entry of buttons) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "tab-button genre-filter-button";
    const isActive = active === entry.genre;
    btn.classList.toggle("active", isActive);
    btn.setAttribute("role", "tab");
    btn.setAttribute("aria-selected", String(isActive));
    // The item count is a raw count: it rides in a masking span
    // inside the button's label.
    btn.append(`${entry.name}（`, countSpan(entry.count), "）");
    btn.addEventListener("click", () => onSelect(entry.genre));
    wrap.appendChild(btn);
  }
}

// --- Post genre sections (Threads / X) ---
// The same construction as the Instagram tab's ジャンル別 —
// treemap (tile area = the genre's average views, heat colour
// on the same average), legend, then the table (its 平均表示
// column carries the average as a number) —
// over the fetched posts, classified by the shared rules over
// each post's text. Threads and X numbers are lifetime counts,
// so there is no period selector; the section rebuilds on
// every render (the blog genre section's pattern), which also
// keeps the sort headers in step. Neither channel's posts
// carry saves, so the table carries いいね率 but no 保存率.
// The builder takes the channel's rollup rows and sort state;
// each tab's own renderer is a thin wrapper over it, so the
// two sections can never drift apart.

const POST_GENRE_COLUMNS = [
  { key: "genre", label: "ジャンル", numeric: false },
  { key: "count", label: "投稿数", numeric: true },
  { key: "totalViews", label: "表示合計", numeric: true },
  { key: "avgViews", label: "平均表示", numeric: true },
  { key: "likeRate", label: "いいね率", numeric: true },
  { key: "top", label: "表示トップ", numeric: false },
];

export function renderPostGenres(wrap, stats, sortState, rerender) {
  wrap.innerHTML = "";
  const rows = sortGenreRows(stats, sortState.key, sortState.dir);
  if (!rows.length) {
    const p = document.createElement("p");
    p.className = "meta";
    p.textContent = "—";
    wrap.appendChild(p);
    return;
  }
  wrap.appendChild(
    buildGenreTreemap(
      genreTreemap(rows, (row) => ({
        name: row.genre,
        avg: row.avgViews,
        avgText: `平均表示 ${formatCount(row.avgViews)}`,
        totalText: `合計 ${formatCount(row.totalViews)}`,
      })),
      "タイルの面積は平均表示回数の大きさです。色が青いほど平均表示回数が多いです。",
    ),
  );
  const table = document.createElement("table");
  table.className = "data-table";
  const thead = document.createElement("thead");
  const headRow = document.createElement("tr");
  for (const column of POST_GENRE_COLUMNS) {
    const th = document.createElement("th");
    th.className = (column.numeric ? "num " : "") + "sortable";
    const active = sortState.key === column.key;
    th.textContent =
      column.label +
      (active ? (sortState.dir === "desc" ? " ↓" : " ↑") : "");
    th.addEventListener("click", () => {
      if (sortState.key === column.key) {
        sortState.dir = sortState.dir === "desc" ? "asc" : "desc";
      } else {
        sortState.key = column.key;
        sortState.dir = "desc";
      }
      rerender();
    });
    headRow.appendChild(th);
  }
  thead.appendChild(headRow);
  table.appendChild(thead);
  const tbody = document.createElement("tbody");
  for (const row of rows) {
    const tr = document.createElement("tr");
    const genreTd = document.createElement("td");
    genreTd.className = "nowrap";
    genreTd.textContent = row.genre;
    tr.appendChild(genreTd);
    tr.appendChild(numCell(row.count));
    tr.appendChild(numCell(row.totalViews));
    tr.appendChild(numCell(row.avgViews));
    tr.appendChild(rateCell(formatRate(row.likeRate)));
    tr.appendChild(genreTopPostCell(row.top));
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  const scroll = document.createElement("div");
  scroll.className = "table-scroll";
  scroll.appendChild(table);
  wrap.appendChild(scroll);
  const note = document.createElement("p");
  note.className = "meta";
  note.textContent =
    "ジャンルは本文のキーワードで振り分けています（Instagram と同じルール）。いいね率は、投稿ごとの率（いいね÷表示）の平均です。";
  wrap.appendChild(note);
  const scope = document.createElement("p");
  scope.className = "meta";
  scope.textContent =
    "集計は取得済みの投稿だけが対象です（すべての投稿ではありません）。";
  wrap.appendChild(scope);
}

export function fillDemoRanking(elId, items) {
  const list = document.getElementById(elId);
  list.innerHTML = "";
  if (!items.length) {
    const li = document.createElement("li");
    li.textContent = "—";
    list.appendChild(li);
    return;
  }
  for (const item of items) {
    const li = document.createElement("li");
    li.textContent = item.name;
    const span = document.createElement("span");
    span.className = "rank-value amount-value";
    span.textContent = formatCount(item.value);
    li.appendChild(span);
    list.appendChild(li);
  }
}
