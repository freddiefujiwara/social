// The YouTube tab's totals and per-video table. The view
// state (the fetched rows, the sort order) lives in the
// factory closure; the shared overview helpers are injected
// from main.js. The subscriber trend stays in main.js with
// the other tabs' trend sections.
import {
  youtubeTotals,
  youtubeVideos,
  youtubeThumbnailUrls,
  sortMedia,
  formatCount,
  formatJstDateTime,
  formatClockDuration,
  isShortVideo,
} from "./api.js";
import { overviewState } from "./overview-state.js";
import {
  countSpan,
  thumbnailCell,
  wireSortableTable,
  updateSortHeaders,
} from "./render-common.js";

export function createYoutubeRenderer({ fillTotalBoxes, fillDetailPending }) {
  let youtubeVideoRows = [];
  // The video table starts sorted by views, most-watched first,
  // like the Instagram tab's media table.
  let youtubeSort = { key: "views", dir: "desc", wired: false };
  
  function renderYoutube(detail) {
    fillTotalBoxes(
      "sns-youtube-totals",
      youtubeTotals(detail, overviewState.historyRows),
    );
    youtubeVideoRows = youtubeVideos(detail);
    wireSortableTable("sns-youtube-table", youtubeSort, renderYoutubeVideos);
    renderYoutubeVideos();
  }
  
  // Per-video table of the YouTube tab, the counterpart of the
  // other tabs' per-post tables: one row per recent video, with
  // the shared header-click sorting. Until the snapshot lands the
  // table carries the load state instead of its empty state.
  function renderYoutubeVideos() {
    const tbody = document.getElementById("sns-youtube-body");
    tbody.innerHTML = "";
    const youtubeRangeEl = document.getElementById("youtube-videos-range");
    youtubeRangeEl.textContent = "";
    if (youtubeVideoRows.length) {
      youtubeRangeEl.append(
        "対象：全ての動画（全",
        countSpan(youtubeVideoRows.length),
        "件）",
      );
    }
    const videos = sortMedia(
      youtubeVideoRows,
      youtubeSort.key,
      youtubeSort.dir,
    );
    if (!videos.length) {
      // No snapshot behind this render yet (the loader's initial
      // call, or its failure): the table carries the load state,
      // not the empty-table line.
      if (fillDetailPending(tbody)) {
        return;
      }
      const tr = document.createElement("tr");
      const td = document.createElement("td");
      td.colSpan = 7;
      td.textContent = "データがありません";
      tr.appendChild(td);
      tbody.appendChild(tr);
      updateSortHeaders("sns-youtube-table", youtubeSort);
      return;
    }
    for (const video of videos) {
      const tr = document.createElement("tr");
      tr.appendChild(
        thumbnailCell({
          candidates: youtubeThumbnailUrls(video),
          shape: "horizontal",
          autoShape: true,
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
      if (isShortVideo(video)) {
        const badge = document.createElement("span");
        badge.className = "shorts-badge";
        badge.textContent = "Shorts";
        titleTd.appendChild(badge);
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
      for (const value of [video.views, video.likes, video.comments]) {
        const td = document.createElement("td");
        td.className = "num amount-value";
        td.textContent = formatCount(value);
        tr.appendChild(td);
      }
      tbody.appendChild(tr);
    }
    updateSortHeaders("sns-youtube-table", youtubeSort);
  }

  return { renderYoutube, renderYoutubeVideos };
}
