// The TikTok tab's totals and per-video table, the counterpart
// of the YouTube tab's (render-youtube.js): same factory shape,
// same load-state gates, same sortable table, thumbnails
// included — the covers are vertical stills, so each row's frame
// is the vertical one the Instagram reels use. One difference
// the data forces: TikTok reports a share count per video,
// which gets a column of its own. Until the account is
// authorized the section's figures are all null — the totals
// read "—" and the table its empty state, exactly as a channel
// with nothing collected yet.
import {
  tiktokTotals,
  tiktokVideos,
  sortMedia,
  formatCount,
  formatJstDateTime,
  formatClockDuration,
} from "./api.js";
import { overviewState } from "./overview-state.js";
import {
  countSpan,
  thumbnailCell,
  wireSortableTable,
  updateSortHeaders,
} from "./render-common.js";

export function createTiktokRenderer({
  fillTotalBoxes,
  fillDetailPending,
  fillScopePending,
}) {
  let tiktokVideoRows = [];
  // The video table starts sorted by views, most-watched first,
  // like the YouTube tab's video table.
  let tiktokSort = { key: "views", dir: "desc", wired: false };

  function renderTiktok(detail) {
    fillTotalBoxes("sns-tiktok-totals", tiktokTotals(detail));
    // The video rows wait for the channel's full section: until
    // it lands the detail holds only the overview's trimmed
    // preview (top 3, without the dates and counts the table
    // renders), which must not pose as the full list.
    tiktokVideoRows = overviewState.detailScopes.tiktok
      ? tiktokVideos(detail)
      : [];
    wireSortableTable("sns-tiktok-table", tiktokSort, renderTiktokVideos);
    renderTiktokVideos();
  }

  // Per-video table of the TikTok tab: one row per recent video,
  // with the shared header-click sorting. Until the snapshot
  // lands the table carries the load state instead of its empty
  // state.
  function renderTiktokVideos() {
    const tbody = document.getElementById("sns-tiktok-body");
    tbody.innerHTML = "";
    const tiktokRangeEl = document.getElementById("tiktok-videos-range");
    tiktokRangeEl.textContent = "";
    if (tiktokVideoRows.length) {
      tiktokRangeEl.append(
        "対象：最近の動画（表示：",
        countSpan(tiktokVideoRows.length),
        "件）",
      );
    }
    const videos = sortMedia(
      tiktokVideoRows,
      tiktokSort.key,
      tiktokSort.dir,
    );
    if (!videos.length) {
      // No snapshot behind this render yet (the loader's initial
      // call, or its failure): the table carries the load state,
      // not the empty-table line. The same while the channel's
      // full section is still on its way (the scope state).
      if (fillDetailPending(tbody)) {
        return;
      }
      if (fillScopePending(tbody)) {
        return;
      }
      const tr = document.createElement("tr");
      const td = document.createElement("td");
      td.colSpan = 8;
      td.textContent = "データがありません";
      tr.appendChild(td);
      tbody.appendChild(tr);
      updateSortHeaders("sns-tiktok-table", tiktokSort);
      return;
    }
    for (const video of videos) {
      const tr = document.createElement("tr");
      tr.appendChild(
        thumbnailCell({
          candidates: [video.cover_url],
          shape: "vertical",
        }),
      );
      const titleTd = document.createElement("td");
      if (video.url) {
        const link = document.createElement("a");
        link.href = video.url;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.textContent = video.title || "—";
        titleTd.appendChild(link);
      } else {
        titleTd.textContent = video.title || "—";
      }
      tr.appendChild(titleTd);
      const dateTd = document.createElement("td");
      dateTd.className = "nowrap";
      dateTd.textContent = formatJstDateTime(video.published_at);
      tr.appendChild(dateTd);
      const durationTd = document.createElement("td");
      durationTd.className = "num amount-value";
      durationTd.textContent = formatClockDuration(video.duration_sec);
      tr.appendChild(durationTd);
      for (const value of [video.views, video.likes, video.comments, video.shares]) {
        const td = document.createElement("td");
        td.className = "num amount-value";
        td.textContent = formatCount(value);
        tr.appendChild(td);
      }
      tbody.appendChild(tr);
    }
    updateSortHeaders("sns-tiktok-table", tiktokSort);
  }

  return { renderTiktok, renderTiktokVideos };
}
