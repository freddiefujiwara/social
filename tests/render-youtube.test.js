// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { overviewState } from "../src/overview-state.js";
import { createYoutubeRenderer } from "../src/render-youtube.js";

afterEach(() => {
  overviewState.detailScopes.youtube = false;
  document.body.replaceChildren();
});

it("labels the recent rows separately from the channel's video total", () => {
  document.body.innerHTML =
    '<p id="youtube-videos-range"></p><table id="sns-youtube-table"><tbody id="sns-youtube-body"></tbody></table>';
  overviewState.detailScopes.youtube = true;
  const fillTotalBoxes = vi.fn();
  const { renderYoutube } = createYoutubeRenderer({ fillTotalBoxes });
  renderYoutube({
    youtube: {
      video_count: 42,
      recent_videos: [{ id: "a", title: "Newest" }, { id: "b", title: "Prior" }],
    },
  });

  const range = document.getElementById("youtube-videos-range");
  expect(range.textContent).toBe("対象：最近の動画（表示：2件）");
  expect(range.querySelector(".amount-value").textContent).toBe("2");
  expect(document.querySelectorAll("#sns-youtube-body tr")).toHaveLength(2);
});
