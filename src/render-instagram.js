// The Instagram tab's renderers: the KPI row, the engagement
// trend, the daily follow / unfollow chart, the per-post media
// table and the genre rollup. The tab's view state (the fetched
// rows, sort orders, the genre filter and period, the trend's
// metric and period chips) lives in the factory closure; the
// two overview helpers the sections share with the rest of the
// dashboard are injected from main.js.
import {
  snsOverview,
  instagramTrendSeries,
  INSTAGRAM_TREND_PERIODS,
  INSTAGRAM_TREND_DEFAULT_DAYS,
  followChartDays,
  instagramDailyFollowsError,
  sortMedia,
  formatCount,
  formatSeconds,
  formatWatchRate,
  withWatchRate,
  formatJstDateTime,
  formatJstDate,
  instagramThumbnailUrl,
  mediaThumbnailShape,
  captionHead,
  mediaTypeLabel,
} from "./api.js";
import {
  buildLineChartSvg,
  buildFollowChartSvg,
  formatDateLabel,
} from "./chart.js";
import {
  mediaGenreOptions,
  filterMediaByGenre,
  classifyCaption,
  filterMediaByPeriod,
  genreStatsForMedia,
  mediaDateRange,
  sortGenreRows,
  formatRate,
} from "./genres.js";
import { genreTreemap } from "./treemap.js";
import { renderGenreTreemap } from "./render-treemap.js";
import { overviewState } from "./overview-state.js";
import {
  countSpan,
  numCell,
  rateCell,
  thumbnailCell,
  wireSortableTable,
  updateSortHeaders,
  renderGenreFilterTabs,
} from "./render-common.js";

export function createInstagramRenderer({ fillTotalBoxes, fillHistoryPending }) {
  let snsMediaRows = [];
  // The media table starts sorted by views, most-watched first.
  let snsSort = { key: "views", dir: "desc", wired: false };
  // The per-post table's genre filter: null shows every post (the
  // すべて button). Independent of the genre section's period
  // selector — the filter always covers the full fetched list.
  let snsGenreFilter = null;

  // The buttons are rebuilt from the current media list on every
  // SNS render, so they always match the genres the classifier
  // produces. Clicking one narrows the table below to that genre;
  // the sort order is kept.
  function renderMediaGenreTabs() {
    const wrap = document.getElementById("sns-media-genre-tabs");
    const options = mediaGenreOptions(snsMediaRows);
    const total = options.reduce((sum, option) => sum + option.count, 0);
    renderGenreFilterTabs(wrap, {
      total,
      options,
      active: snsGenreFilter,
      onSelect: (genre) => {
        snsGenreFilter = genre;
        renderMediaGenreTabs();
        renderMediaTable();
      },
    });
  }
  
  function renderMediaTable() {
    const tbody = document.getElementById("sns-media-body");
    tbody.innerHTML = "";
    const rows = sortMedia(
      filterMediaByGenre(snsMediaRows, snsGenreFilter),
      snsSort.key,
      snsSort.dir,
    );
    if (!rows.length) {
      const tr = document.createElement("tr");
      const td = document.createElement("td");
      td.colSpan = 13;
      td.textContent = "データがありません";
      tr.appendChild(td);
      tbody.appendChild(tr);
      return;
    }
    for (const media of rows) {
      const tr = document.createElement("tr");
      tr.appendChild(
        thumbnailCell({
          candidates: [instagramThumbnailUrl(media)],
          shape: mediaThumbnailShape(media),
        }),
      );
      const dateTd = document.createElement("td");
      dateTd.className = "nowrap";
      dateTd.textContent = formatJstDateTime(media.posted_at);
      tr.appendChild(dateTd);
      const captionTd = document.createElement("td");
      captionTd.className = "caption-cell";
      // The caption itself is the link to the post, the same
      // shape as the Threads and X tables (whose body text links
      // out); without a permalink it stays plain text.
      const head = captionHead(media.caption);
      if (media.permalink) {
        const link = document.createElement("a");
        link.href = media.permalink;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.textContent = head;
        captionTd.appendChild(link);
      } else {
        captionTd.textContent = head;
      }
      tr.appendChild(captionTd);
      // The genre the same classifier assigns for the genre
      // rollup and the filter buttons above, shown per post so a
      // row explains itself without switching the filter. A genre
      // name is a label, not a number, so it is never masked.
      const genreTd = document.createElement("td");
      genreTd.className = "nowrap";
      genreTd.textContent = classifyCaption(media.caption);
      tr.appendChild(genreTd);
      const typeTd = document.createElement("td");
      typeTd.className = "nowrap";
      typeTd.textContent = mediaTypeLabel(media.type);
      tr.appendChild(typeTd);
      tr.appendChild(numCell(media.views));
      tr.appendChild(numCell(media.reach));
      tr.appendChild(numCell(media.likes));
      tr.appendChild(numCell(media.comments));
      tr.appendChild(numCell(media.shares));
      tr.appendChild(numCell(media.saves));
      tr.appendChild(numCell(media.avg_watch_sec, formatSeconds));
      // The watch rate is a percentage, and percentages are not
      // privacy-masked, so this cell skips the amount-value class
      // the count cells carry.
      const rateTd = document.createElement("td");
      rateTd.className = "num";
      rateTd.textContent = formatWatchRate(media.watch_rate);
      tr.appendChild(rateTd);
      tbody.appendChild(tr);
    }
    updateSortHeaders("sns-media-table", snsSort);
  }

  function wireMediaSort() {
    wireSortableTable("sns-media-table", snsSort, renderMediaTable);
  }

  // --- Instagram genre rollup ---
  // The genre stats are computed over a period window of the
  // fetched posts (all of them, or the last 30 / 7 days), chosen
  // with the period selector; the section header states the exact
  // dates the current window covers. Column headers sort the rows,
  // and the tiles / average bars follow the same rows.
  
  let snsDetail = null;
  let genreSort = { key: "totalViews", dir: "desc" };
  let genrePeriod = "all";
  let genreControlsWired = false;
  
  function updateGenreHeaders() {
    document.querySelectorAll("#sns-genre-table th.sortable").forEach((th) => {
      const active = th.dataset.sortKey === genreSort.key;
      th.textContent =
        th.dataset.label + (active ? (genreSort.dir === "desc" ? " ↓" : " ↑") : "");
    });
  }
  
  function wireGenreControls() {
    if (genreControlsWired) {
      return;
    }
    genreControlsWired = true;
    document.querySelectorAll("#sns-genre-table th.sortable").forEach((th) => {
      th.dataset.label = th.textContent;
      th.addEventListener("click", () => {
        const key = th.dataset.sortKey;
        if (genreSort.key === key) {
          genreSort = { key, dir: genreSort.dir === "desc" ? "asc" : "desc" };
        } else {
          genreSort = { key, dir: "desc" };
        }
        renderGenreTable(snsDetail);
      });
    });
    const select = document.getElementById("sns-genre-period");
    select.addEventListener("change", () => {
      genrePeriod = select.value;
      renderGenreTable(snsDetail);
    });
  }
  
  // Per-genre rollup of the posts in the selected period window:
  // one row per genre that has at least one post. The top post
  // links out to Instagram.
  function renderGenreTable(detail) {
    const media = filterMediaByPeriod(snsMediaRows, genrePeriod);
    const rows = sortGenreRows(
      genreStatsForMedia(media),
      genreSort.key,
      genreSort.dir,
    );
    const rangeEl = document.getElementById("sns-genre-range");
    const range = mediaDateRange(media);
    rangeEl.textContent = "";
    if (!media.length) {
      rangeEl.textContent = "この期間の投稿はありません";
    } else if (range) {
      rangeEl.append(
        `対象：${formatJstDate(range.from)}〜${formatJstDate(range.to)}の投稿（全`,
        countSpan(media.length),
        "件）",
      );
    }
    renderGenreTreemap(
      document.getElementById("sns-genre-treemap"),
      document.getElementById("sns-genre-legend"),
      genreTreemap(rows, (row) => ({
        name: row.genre,
        avg: row.avgViews,
        avgText: `平均再生 ${formatCount(row.avgViews)}`,
        totalText: `合計 ${formatCount(row.totalViews)}`,
      })),
    );
    updateGenreHeaders();
    const tbody = document.getElementById("sns-genre-body");
    tbody.innerHTML = "";
    if (!rows.length) {
      const tr = document.createElement("tr");
      const td = document.createElement("td");
      td.colSpan = 7;
      td.textContent = "データがありません";
      tr.appendChild(td);
      tbody.appendChild(tr);
      return;
    }
    for (const row of rows) {
      const tr = document.createElement("tr");
      const genreTd = document.createElement("td");
      genreTd.className = "nowrap";
      genreTd.textContent = row.genre;
      tr.appendChild(genreTd);
      tr.appendChild(numCell(row.count));
      tr.appendChild(numCell(row.totalViews));
      tr.appendChild(numCell(row.avgViews));
      tr.appendChild(rateCell(formatRate(row.saveRate)));
      tr.appendChild(rateCell(formatRate(row.likeRate)));
      const topTd = document.createElement("td");
      if (row.top) {
        if (row.top.permalink) {
          const link = document.createElement("a");
          link.href = row.top.permalink;
          link.target = "_blank";
          link.rel = "noopener noreferrer";
          link.textContent = row.top.title;
          topTd.appendChild(link);
        } else {
          topTd.textContent = row.top.title;
        }
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
  }

  // --- Instagram daily follows (フォロー・フォロー解除（日ごと）) ---
  // Daily follow / unfollow bars with the day's posts mapped onto
  // them. Meta only reports follows as an account-wide daily
  // number, so the overlay is by calendar day: it shows what was
  // posted on the days follows moved, never that a post caused the
  // move — the note under the chart says exactly that. The series
  // arrives with sns_detail (instagram.daily_follows); until
  // social-gas collects it, the section shows its empty state.
  //
  // Tapping a posted day's column in the chart (the ▼ marker or
  // anywhere on the column — buildFollowChartSvg gives those days
  // a full-column hit rect) scrolls to that day's entry in the
  // list below and highlights both the entry and the column until
  // another day is picked.
  
  function jumpToFollowDay(wrap, date) {
    for (const el of wrap.querySelectorAll(".follow-day-hit.selected")) {
      el.classList.remove("selected");
    }
    for (const el of wrap.querySelectorAll(".follow-day-entry.highlight")) {
      el.classList.remove("highlight");
    }
    const hit = wrap.querySelector(`.follow-day-hit[data-date="${date}"]`);
    if (hit) {
      hit.classList.add("selected");
    }
    const entry = wrap.querySelector(`.follow-day-entry[data-date="${date}"]`);
    if (entry) {
      entry.classList.add("highlight");
      entry.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }
  
  function renderFollowChart(detail) {
    const wrap = document.getElementById("sns-follow-chart");
    wrap.innerHTML = "";
    const days = followChartDays(detail);
    if (!days.length) {
      const p = document.createElement("p");
      p.className = "meta";
      p.textContent = "データがありません";
      wrap.appendChild(p);
    } else {
      const chart = document.createElement("div");
      chart.className = "chart-wrap";
      chart.innerHTML = buildFollowChartSvg(days);
      chart.addEventListener("click", (event) => {
        const hit = event.target.closest?.("[data-date]");
        if (hit) {
          jumpToFollowDay(wrap, hit.dataset.date);
        }
      });
      wrap.appendChild(chart);
      const legend = document.createElement("p");
      legend.className = "meta";
      legend.textContent =
        "青い棒がフォロー、赤い棒がフォロー解除です。▼は投稿があった日です。▼や棒を押すと、その日の投稿に飛びます。";
      wrap.appendChild(legend);
      const postedDays = days.filter((day) => day.posts.length);
      if (postedDays.length) {
        const head = document.createElement("h4");
        head.className = "demo-list-title";
        head.textContent = "投稿があった日";
        wrap.appendChild(head);
        for (const day of [...postedDays].reverse()) {
          const entry = document.createElement("div");
          entry.className = "follow-day-entry";
          entry.dataset.date = day.date;
          const dayLine = document.createElement("p");
          dayLine.className = "meta";
          dayLine.append(`${formatDateLabel(day.date)}：フォロー `);
          const followsCount = document.createElement("span");
          followsCount.className = "follow-count-up amount-value";
          followsCount.textContent = formatCount(day.follows);
          dayLine.append(followsCount, " · フォロー解除 ");
          const unfollowsCount = document.createElement("span");
          unfollowsCount.className = "follow-count-down amount-value";
          unfollowsCount.textContent = formatCount(day.unfollows);
          dayLine.append(unfollowsCount);
          entry.appendChild(dayLine);
          const list = document.createElement("ul");
          list.className = "ranking";
          for (const media of day.posts) {
            const li = document.createElement("li");
            const label =
              captionHead(media.caption) || mediaTypeLabel(media.type) || "投稿";
            if (media.permalink) {
              const link = document.createElement("a");
              link.href = media.permalink;
              link.target = "_blank";
              link.rel = "noopener noreferrer";
              link.textContent = label;
              li.appendChild(link);
            } else {
              li.textContent = label;
            }
            const span = document.createElement("span");
            span.className = "rank-value amount-value";
            span.textContent = formatCount(media.views);
            li.appendChild(span);
            list.appendChild(li);
          }
          entry.appendChild(list);
          wrap.appendChild(entry);
        }
      }
      const note = document.createElement("p");
      note.className = "meta";
      note.textContent =
        "フォロー数はアカウント全体の数字です。投稿との対応は日付による重ね合わせで、どの投稿がきっかけかまでは分かりません。";
      wrap.appendChild(note);
    }
    const error = instagramDailyFollowsError(detail);
    if (error) {
      const p = document.createElement("p");
      p.className = "meta sns-note";
      p.textContent = `※ ${error}`;
      wrap.appendChild(p);
    }
  }

  // --- Instagram engagement trend （推移） ---
  // The last-30-days account metrics (views, reach, the
  // interaction total and its breakdown) as daily line charts,
  // one metric at a time behind the chips, over a period the
  // second chip row picks (30日 / 90日 / 180日 / 全期間, 90日
  // by default). The series come from the history rows, so —
  // like the YouTube trend — renderSns and loadSnsHistory both
  // call this, and whichever load lands second completes the
  // section. The metrics are Meta's rolling 30-day totals, so
  // the points are the days' latest values plotted as-is. The
  // chart carries a y axis whose domain follows the data (a
  // zero baseline would flatten these large totals' movement);
  // its tick labels are raw counts, so — like the latest value
  // here — they hide under masking through the shared CSS.
  // Only days the history actually holds are plotted: a period
  // longer than the history shows the days there are.
  
  let instagramTrendKey = "views_30d";
  let instagramTrendDays = INSTAGRAM_TREND_DEFAULT_DAYS;
  
  function renderInstagramTrend() {
    const wrap = document.getElementById("instagram-trend");
    // Until the history load settles, the wrap carries its load
    // state rather than the "no history yet" line.
    if (fillHistoryPending(wrap)) {
      return;
    }
    wrap.innerHTML = "";
    const series = instagramTrendSeries(
      overviewState.historyRows,
      instagramTrendDays,
    );
    if (!series.length) {
      const p = document.createElement("p");
      p.className = "meta";
      p.textContent = "履歴はまだありません（取得のたびに貯まっていきます）";
      wrap.appendChild(p);
      return;
    }
    const item =
      series.find((entry) => entry.key === instagramTrendKey) ?? series[0];
    instagramTrendKey = item.key;
    const chips = document.createElement("div");
    chips.className = "tabs genre-filter";
    chips.setAttribute("role", "tablist");
    chips.setAttribute("aria-label", "推移の指標");
    for (const entry of series) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "tab-button genre-filter-button";
      const isActive = entry.key === instagramTrendKey;
      btn.classList.toggle("active", isActive);
      btn.setAttribute("role", "tab");
      btn.setAttribute("aria-selected", String(isActive));
      btn.textContent = entry.label;
      btn.addEventListener("click", () => {
        instagramTrendKey = entry.key;
        renderInstagramTrend();
      });
      chips.appendChild(btn);
    }
    wrap.appendChild(chips);
    const periodChips = document.createElement("div");
    periodChips.className = "tabs genre-filter";
    periodChips.setAttribute("role", "tablist");
    periodChips.setAttribute("aria-label", "推移の期間");
    for (const period of INSTAGRAM_TREND_PERIODS) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "tab-button genre-filter-button";
      const isActive = period.days === instagramTrendDays;
      btn.classList.toggle("active", isActive);
      btn.setAttribute("role", "tab");
      btn.setAttribute("aria-selected", String(isActive));
      btn.textContent = period.label;
      btn.addEventListener("click", () => {
        instagramTrendDays = period.days;
        renderInstagramTrend();
      });
      periodChips.appendChild(btn);
    }
    wrap.appendChild(periodChips);
    const head = document.createElement("p");
    head.className = "meta";
    head.append(
      `${item.label}（過去30日）：最新 `,
      countSpan(item.latest),
      `（${formatJstDateTime(item.firstAt)} 〜 ${formatJstDateTime(item.lastAt)}）`,
    );
    const chart = document.createElement("div");
    chart.className = "chart-wrap";
    chart.innerHTML = buildLineChartSvg(item.points, {
      label: item.label,
      yAxis: true,
    });
    wrap.appendChild(head);
    wrap.appendChild(chart);
  }

  // The Instagram tab's KPI row. The フォロー / フォロー解除
  // cards carry a 前日比 taken from the history rows, so the row
  // renders from the shared state and loadSnsHistory re-renders
  // it when the history lands, like the other channel tabs'
  // totals: whichever of the snapshot and the history arrives
  // second completes the row.
  function renderInstagramTotals() {
    fillTotalBoxes(
      "sns-overview",
      snsOverview(overviewState.detail, overviewState.historyRows),
    );
  }


  // The media sections of renderSns: store the snapshot's
  // media rows (with their watch rates joined), state the
  // exact range they cover, and render the per-post table and
  // the genre rollup. A fresh snapshot resets the per-post
  // genre filter to すべて.
  function renderSnsMedia(detail) {
    snsMediaRows = Array.isArray(detail?.instagram?.recent_media)
      ? detail.instagram.recent_media.map(withWatchRate)
      : [];
    snsDetail = detail;
    const mediaRange = mediaDateRange(snsMediaRows);
    const mediaRangeEl = document.getElementById("sns-media-range");
    mediaRangeEl.textContent = "";
    if (mediaRange) {
      mediaRangeEl.append(
        `対象：${formatJstDate(mediaRange.from)}〜${formatJstDate(mediaRange.to)}の投稿（全`,
        countSpan(snsMediaRows.length),
        "件）",
      );
    }
    snsGenreFilter = null;
    renderMediaGenreTabs();
    wireMediaSort();
    renderMediaTable();
    wireGenreControls();
    renderGenreTable(detail);
  }

  // The per-post genre filter as the auto-refresh keeps it:
  // read before a refresh re-renders, restored after — and
  // dropped when the new snapshot no longer carries the genre.
  function mediaGenreFilter() {
    return snsGenreFilter;
  }

  function restoreMediaGenreFilter(keep) {
    if (
      keep !== null &&
      mediaGenreOptions(snsMediaRows).some((option) => option.genre === keep)
    ) {
      snsGenreFilter = keep;
      renderMediaGenreTabs();
      renderMediaTable();
    }
  }

  return {
    renderInstagramTotals,
    renderInstagramTrend,
    renderFollowChart,
    renderSnsMedia,
    mediaGenreFilter,
    restoreMediaGenreFilter,
  };
}
