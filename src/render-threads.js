// The Threads tab's genre section, genre filter buttons and
// per-post table. The tab's view state (the fetched rows, the
// sort order, the genre filter, the genre table's sort) lives
// in the factory closure; main.js's renderThreads owns the
// tab's totals, notes and trend and calls in here for these
// sections.
import {
  threadsPosts,
  sortMedia,
  captionHead,
  formatCount,
  formatJstDateTime,
} from "./api.js";
import {
  genreStatsForThreads,
  threadsGenreOptions,
  filterThreadsByGenre,
  classifyCaption,
} from "./genres.js";
import {
  countSpan,
  numCell,
  wireSortableTable,
  updateSortHeaders,
  renderGenreFilterTabs,
  renderPostGenres,
} from "./render-common.js";

export function createThreadsRenderer() {
  let threadsPostRows = [];
  // The posts table starts sorted by views, most-viewed first,
  // like the Instagram tab's media table.
  let threadsSort = { key: "views", dir: "desc", wired: false };
  // The per-post table's genre filter: null shows every post
  // (the すべて button). The classification is the shared one
  // (classifyCaption over the post text), so the buttons, the
  // genre section above and the filter always agree.
  let threadsGenreFilter = null;
  // The genre table's sort, mirroring the Instagram genre table.
  let threadsGenreSort = { key: "totalViews", dir: "desc" };

  // The Threads tab's genre section: the shared builder over
  // the Threads rollup and the tab's own sort state.
  function renderThreadsGenres() {
    renderPostGenres(
      document.getElementById("threads-genres"),
      genreStatsForThreads(threadsPostRows),
      threadsGenreSort,
      renderThreadsGenres,
    );
  }
  
  // The buttons above the Threads per-post table, rendered with
  // the shared genre filter renderer like the other two tabs.
  // The counts come from the same rollup the genre section
  // shows, so a button's count is exactly the number of rows its
  // filter keeps.
  function renderThreadsPostsGenreTabs() {
    renderGenreFilterTabs(document.getElementById("threads-posts-genre-tabs"), {
      total: threadsPostRows.length,
      options: threadsGenreOptions(threadsPostRows),
      active: threadsGenreFilter,
      onSelect: (genre) => {
        threadsGenreFilter = genre;
        renderThreadsPostsGenreTabs();
        renderThreadsPosts();
      },
    });
  }
  
  // Per-post table of the Threads tab, the counterpart of the
  // Instagram tab's 投稿ごと: one row per recent post, the text
  // shortened and linked to the post itself, the shared genre
  // filter buttons above it and the shared header-click sorting.
  // Values that could not be collected show "—", and a partial
  // failure (posts_error) never hides the posts that did arrive.
  function renderThreadsPosts() {
    const tbody = document.getElementById("threads-posts-body");
    tbody.innerHTML = "";
    const threadsRangeEl = document.getElementById("threads-posts-range");
    threadsRangeEl.textContent = "";
    if (threadsPostRows.length) {
      threadsRangeEl.append(
        "対象：直近の投稿（全",
        countSpan(threadsPostRows.length),
        "件）",
      );
    }
    const rows = sortMedia(
      filterThreadsByGenre(threadsPostRows, threadsGenreFilter),
      threadsSort.key,
      threadsSort.dir,
    );
    if (!rows.length) {
      const tr = document.createElement("tr");
      const td = document.createElement("td");
      td.colSpan = 8;
      td.textContent = "データがありません";
      tr.appendChild(td);
      tbody.appendChild(tr);
    } else {
      for (const post of rows) {
        const tr = document.createElement("tr");
        const dateTd = document.createElement("td");
        dateTd.className = "nowrap";
        dateTd.textContent = formatJstDateTime(post.posted_at);
        tr.appendChild(dateTd);
        const textTd = document.createElement("td");
        textTd.className = "caption-cell";
        const head = captionHead(post.text) || "投稿";
        if (post.permalink) {
          const link = document.createElement("a");
          link.href = post.permalink;
          link.target = "_blank";
          link.rel = "noopener noreferrer";
          link.textContent = head;
          textTd.appendChild(link);
        } else {
          textTd.textContent = head;
        }
        tr.appendChild(textTd);
        // The genre the shared classifier assigns, shown per
        // post like the Instagram table's genre column; the
        // filter above and the rollup use the same judgement.
        const genreTd = document.createElement("td");
        genreTd.className = "nowrap";
        genreTd.textContent = classifyCaption(post.text);
        tr.appendChild(genreTd);
        tr.appendChild(numCell(post.views));
        tr.appendChild(numCell(post.likes));
        tr.appendChild(numCell(post.replies));
        tr.appendChild(numCell(post.reposts));
        tr.appendChild(numCell(post.quotes));
        tbody.appendChild(tr);
      }
    }
    updateSortHeaders("threads-posts-table", threadsSort);
  }

  // Lands the snapshot's posts on the tab and wires the
  // table's header sorting (renderThreads calls this on every
  // render, like the other tabs' row stores).
  function syncThreadsPosts(detail) {
    threadsPostRows = threadsPosts(detail);
    wireSortableTable("threads-posts-table", threadsSort, renderThreadsPosts);
  }

  return {
    syncThreadsPosts,
    renderThreadsGenres,
    renderThreadsPostsGenreTabs,
    renderThreadsPosts,
  };
}
