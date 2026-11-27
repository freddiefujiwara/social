// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { genreTopPostCell } from "../src/render-common.js";

describe("genreTopPostCell", () => {
  it("keeps the representative post link and its maskable view count", () => {
    const title = "<代表投稿>";
    const permalink = "https://example.com/post";
    const cell = genreTopPostCell({ title, permalink, views: 1234 });
    const link = cell.querySelector("a");
    expect(link.href).toBe(permalink);
    expect(link.target).toBe("_blank");
    expect(link.rel).toBe("noopener noreferrer");
    expect(link.textContent).toBe(title);
    expect(link.children).toHaveLength(0);
    expect(cell.querySelector(".rank-value.amount-value").textContent).toBe("1,234");
  });

  it("renders a plain title without a permalink and preserves a zero count", () => {
    const cell = genreTopPostCell({ title: "代表投稿", views: 0 });
    expect(cell.querySelector("a")).toBeNull();
    expect(cell.firstChild.textContent).toBe("代表投稿");
    expect(cell.querySelector(".rank-value.amount-value").textContent).toBe("0");
  });

  it("renders a dash when there is no representative post", () => {
    const cell = genreTopPostCell(undefined);
    expect(cell.tagName).toBe("TD");
    expect(cell.textContent).toBe("—");
    expect(cell.children).toHaveLength(0);
  });
});
