// The X tab's reaction renderers: the per-post reaction
// detail, the recent-follows line, the unattributed replies /
// quotes list and the API credit card. The posts table itself
// stays in main.js with the tab's totals and trend.
import {
  xReactionGroups,
  xRecentFollows,
  xUnattributedReactions,
  xApiCreditSummary,
  formatJstDateTime,
} from "./api.js";
import { overviewState } from "./overview-state.js";

// One reaction actor as display text: the name with the
// handle in parentheses, falling back to whichever half the
// stored fact carries.
function xActorText(fact) {
  const name = (fact && fact.actor_name) || "";
  const username = (fact && fact.actor_username) || "";
  if (name && username) {
    return `${name}（@${username}）`;
  }
  if (username) {
    return `@${username}`;
  }
  return name || "（名前なし）";
}

// The expanded reaction detail under one post row: who liked
// and reposted it (name lists linked to their profiles), and
// the replies and quotes with their bodies (linked to the
// reaction post itself). The closing note states the data's
// limits where the reader meets them: the facts come from the
// notify window the hourly collection reads, so they cover
// only what arrived after the collection started, and an
// aggregated like notification does not name everyone.
export function buildXReactionDetail(facts) {
  const groups = xReactionGroups(facts);
  const wrap = document.createElement("div");
  wrap.className = "reaction-detail";
  const nameList = (label, list) => {
    if (!list.length) {
      return;
    }
    const p = document.createElement("p");
    p.append(`${label}：`);
    list.forEach((fact, index) => {
      if (index) {
        p.append("、");
      }
      const username = fact.actor_username || "";
      if (username) {
        const link = document.createElement("a");
        link.href = `https://x.com/${username}`;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.textContent = xActorText(fact);
        p.appendChild(link);
      } else {
        p.append(xActorText(fact));
      }
    });
    wrap.appendChild(p);
  };
  nameList("いいね", groups.like);
  nameList("リポスト", groups.retweet);
  const bodyList = (label, list) => {
    if (!list.length) {
      return;
    }
    const head = document.createElement("p");
    head.textContent = `${label}：`;
    wrap.appendChild(head);
    for (const fact of list) {
      const item = document.createElement("div");
      item.className = "reaction-item";
      const meta = document.createElement("p");
      meta.className = "meta";
      const when = fact.acted_at || fact.collected_at;
      const actorLabel = when
        ? `${xActorText(fact)}（${formatJstDateTime(when)}）`
        : xActorText(fact);
      if (fact.reaction_tweet_id) {
        const link = document.createElement("a");
        link.href = `https://x.com/i/web/status/${fact.reaction_tweet_id}`;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.textContent = actorLabel;
        meta.appendChild(link);
      } else {
        meta.textContent = actorLabel;
      }
      const body = document.createElement("p");
      body.className = "reaction-body";
      body.textContent = fact.text || "";
      item.append(meta, body);
      wrap.appendChild(item);
    }
  };
  bodyList("返信", groups.reply);
  bodyList("引用", groups.quote);
  const note = document.createElement("p");
  note.className = "meta";
  note.textContent =
    "通知から取り込めた反応だけを表示しています（取り込み開始以降に届いた分）。いいねは集約された通知で届くため、全員分が載らないことがあります。";
  wrap.appendChild(note);
  return wrap;
}

// The newest follows the notify collection stored, as one
// compact line above the per-post table: a follow is an
// account-level fact, so it belongs to no post's detail.
// Nothing renders while none are stored.
export function renderXRecentFollows() {
  const wrap = document.getElementById("x-recent-follows");
  if (!wrap) {
    return;
  }
  wrap.innerHTML = "";
  const follows = xRecentFollows(overviewState.detail);
  if (!follows.length) {
    return;
  }
  const p = document.createElement("p");
  p.className = "meta";
  p.append("最近のフォロー：");
  follows.forEach((fact, index) => {
    if (index) {
      p.append("、");
    }
    p.append(xActorText(fact));
  });
  wrap.appendChild(p);
}

// Replies and quotes the notify collection stored but no
// notify data can attribute to a post: the feed names the
// reaction itself, never the post it answers. They render as
// their own reading list under the per-post table — kind,
// actor, moment and body, linked to the reaction post —
// instead of being dropped or guessed onto a post. Nothing
// renders while none are stored.
export function renderXUnattributed() {
  const wrap = document.getElementById("x-unattributed");
  if (!wrap) {
    return;
  }
  wrap.innerHTML = "";
  wrap.className = "";
  const list = xUnattributedReactions(overviewState.detail);
  if (!list.length) {
    return;
  }
  wrap.className = "reaction-detail";
  const title = document.createElement("h3");
  title.className = "subsection-title";
  title.textContent = "返信・引用（対象の投稿を特定できないもの）";
  wrap.appendChild(title);
  const note = document.createElement("p");
  note.className = "meta";
  note.textContent =
    "返信・引用は、通知のデータに対象の投稿が含まれないため、投稿ごとの詳細には付けられませんでした。";
  wrap.appendChild(note);
  for (const fact of list) {
    const item = document.createElement("div");
    item.className = "reaction-item";
    const meta = document.createElement("p");
    meta.className = "meta";
    const kindLabel = fact.kind === "quote" ? "引用" : "返信";
    const when = fact.acted_at || fact.collected_at;
    const label = when
      ? `${kindLabel}：${xActorText(fact)}（${formatJstDateTime(when)}）`
      : `${kindLabel}：${xActorText(fact)}`;
    if (fact.reaction_tweet_id) {
      const link = document.createElement("a");
      link.href = `https://x.com/i/web/status/${fact.reaction_tweet_id}`;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = label;
      meta.appendChild(link);
    } else {
      meta.textContent = label;
    }
    const body = document.createElement("p");
    body.className = "reaction-body";
    body.textContent = fact.text || "";
    item.append(meta, body);
    wrap.appendChild(item);
  }
}

// The X API credit card, under the totals row: the current
// credit balance (USD) collected through tweet-gas, the runway
// estimate derived from the stored balance series, and the
// link to the X Developer Portal where the balance is managed.
// The balance and the runway are this page's private figures —
// never published — so both carry .amount-value without
// .is-public and mask like the other private amounts; the
// portal link itself is not a figure and stays visible. Until
// tweet-gas reports a balance the card shows the dash and a
// note that collection runs through tweet-gas, so the portal
// link is already in place.
export function renderXApiCredit() {
  const wrap = document.getElementById("x-api-credit");
  if (!wrap) {
    return;
  }
  wrap.innerHTML = "";
  const summary = xApiCreditSummary(
    overviewState.detail,
    overviewState.historyRows,
  );
  const box = document.createElement("div");
  box.className = "total-box";
  const label = document.createElement("div");
  label.className = "total-label";
  label.textContent = "X APIクレジット残高";
  const value = document.createElement("div");
  value.className = "total-value amount-value";
  value.textContent = summary.balanceText;
  box.appendChild(label);
  box.appendChild(value);
  if (summary.runwayText) {
    const runway = document.createElement("div");
    runway.className = "kpi-delta amount-value";
    runway.textContent = summary.runwayText;
    box.appendChild(runway);
    // How the estimate was made, in plain words: it projects
    // the balance's own recorded decrease, not a unit-price
    // conversion of the post count.
    const method = document.createElement("div");
    method.className = "meta";
    method.textContent = "目安は履歴に残った残高の減り方からの試算です";
    box.appendChild(method);
  }
  if (summary.paceText) {
    const pace = document.createElement("div");
    pace.className = "meta amount-value";
    pace.textContent = summary.paceText;
    box.appendChild(pace);
  }
  if (summary.balance === null) {
    const note = document.createElement("div");
    note.className = "meta";
    note.textContent = "残高は tweet-gas 経由で収集中です";
    box.appendChild(note);
  }
  const linkLine = document.createElement("div");
  linkLine.className = "meta";
  const link = document.createElement("a");
  link.href = "https://developer.x.com";
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.textContent = "X Developer Portal";
  linkLine.appendChild(link);
  box.appendChild(linkLine);
  wrap.appendChild(box);
}
