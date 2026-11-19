// Genre treemap visuals shared by the genre sections (blog,
// Instagram, Threads / X) and — through tileOneLineLabel — the
// overview's channel treemap: tiles whose area is the genre's
// per-item average, on the shared blue heat scale, with the
// legend directly under the tiles.

// Whether privacy masking is in effect, read off the state
// privacy.js keeps on <html>: applyPrivacy sets
// data-private="on" exactly while masking applies (the stored
// preference on, no share session suspending it), and the
// toggle reapplies it on every flip, so the attribute is
// current whenever a renderer runs. While masking is on, the
// tiles leave off their native title tooltip, which CSS
// cannot blur (the legend carries the same figures, masked).
const maskingOn = () =>
  document.documentElement.getAttribute("data-private") === "on";

// --- Genre visuals (Instagram / blog genre sections) ---
// Both genre sections lead with the visuals, in the same order:
// a treemap whose tile area is the genre's per-item average and
// the legend directly under the tiles; the full table follows
// below (its 平均 column carries the same average as a number,
// so no separate bar list repeats it). Each tile
// draws the text lines its size can hold (see tileLabelLevel):
// the name and the figure ride on every tile, down to micro
// type on the smallest ones, and the legend under the map
// lists every genre's exact average and total.
// Tile colour is a heat scale on the same average (see
// genreHeatBackground): the biggest average on show is the
// bluest, the smallest keeps the plain tile colour.

// One-line micro label for the tiles too small for the stacked
// lines: "micro-v" runs the line vertically down a tall narrow
// tile, "micro-h" keeps it horizontal on a wide flat one. The
// name and the figure share the single line.
export function tileOneLineLabel(level, name, valueText, isPublic = false) {
  const el = document.createElement("div");
  el.className =
    level === "micro-v" ? "treemap-tile-vlabel" : "treemap-tile-hlabel";
  // The name stays readable; only the figure is a raw count and
  // rides in a masking-ready span — unless the figure is one of
  // the published ones, which takes .is-public instead.
  el.append(`${name} `);
  const value = document.createElement("span");
  value.className = "amount-value" + (isPublic ? " is-public" : "");
  value.textContent = valueText;
  el.appendChild(value);
  return el;
}

// Draws a genre (or, for the blog, tag) treemap and its legend.
// With options.isPublic every figure also takes .is-public;
// no current caller passes it — the blog genre section's figures
// are unpublished 28-day rollups and mask like the SNS genre
// sections' — but the renderer keeps the switch the channel
// map's per-figure flags use elsewhere.
export function renderGenreTreemap(mapEl, legendEl, map, options = {}) {
  const valueClass = (base) =>
    base + " amount-value" + (options.isPublic ? " is-public" : "");
  mapEl.innerHTML = "";
  if (!map.tiles.length) {
    const p = document.createElement("p");
    p.className = "meta";
    p.textContent = "—";
    mapEl.appendChild(p);
  }
  for (const tile of map.tiles) {
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
      div.title = `${tile.name}：${tile.avgText}、${tile.totalText}`;
    }
    // Draw the lines this tile's level allows: the name and
    // the figure always ride, in type sized to the tile; the
    // total line joins only on the roomiest tiles.
    const level = tile.labelLevel ?? (tile.labelRoom ? "full" : "none");
    div.classList.add(`level-${level}`);
    if (level === "micro-v" || level === "micro-h") {
      div.appendChild(
        tileOneLineLabel(level, tile.name, tile.avgLabel, options.isPublic),
      );
    } else if (level !== "none") {
      const name = document.createElement("div");
      name.className = "treemap-tile-name";
      name.textContent = tile.name;
      div.appendChild(name);
      const value = document.createElement("div");
      value.className = valueClass("treemap-tile-value");
      value.textContent = tile.avgLabel;
      div.appendChild(value);
      if (level === "full") {
        const total = document.createElement("div");
        total.className = valueClass("treemap-tile-sub");
        total.textContent = tile.totalText;
        div.appendChild(total);
      }
    }
    mapEl.appendChild(div);
  }
  legendEl.innerHTML = "";
  for (const entry of map.legend) {
    const li = document.createElement("li");
    const name = document.createElement("span");
    name.className = "channel-legend-name";
    name.textContent = entry.name;
    li.appendChild(name);
    const value = document.createElement("span");
    value.className = valueClass("channel-legend-value");
    value.textContent = entry.avgText;
    li.appendChild(value);
    const total = document.createElement("span");
    total.className = valueClass("channel-legend-note");
    total.textContent = entry.totalText;
    li.appendChild(total);
    legendEl.appendChild(li);
  }
}

export function buildGenreTreemap(map, noteText, options = {}) {
  const frag = document.createDocumentFragment();
  const mapEl = document.createElement("div");
  mapEl.className = "treemap";
  const legendEl = document.createElement("ul");
  legendEl.className = "channel-legend";
  renderGenreTreemap(mapEl, legendEl, map, options);
  frag.appendChild(mapEl);
  frag.appendChild(legendEl);
  if (noteText) {
    const note = document.createElement("p");
    note.className = "meta";
    note.textContent = noteText;
    frag.appendChild(note);
  }
  return frag;
}
