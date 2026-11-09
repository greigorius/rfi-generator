// Shared helpers for the RFI read / edit / numbering functions.
// Talks to the Notion REST API directly, like the other functions in this folder.

const NOTION_VERSION = "2022-06-28";

const HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Content-Type": "application/json",
};

const json = (statusCode, body) => ({ statusCode, headers: HEADERS, body: JSON.stringify(body) });

const notion = async (token, path, { method = "GET", body } = {}) => {
  const res = await fetch(`https://api.notion.com/v1/${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, "Notion-Version": NOTION_VERSION, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.message || `Notion HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return data;
};

const plain = (arr) => (arr || []).map((t) => t?.plain_text || "").join("");

/** Rich text array from a string. Notion caps one text object at 2000 chars, so split. */
const richText = (text) => {
  const s = String(text || "");
  if (!s) return [];
  const out = [];
  for (let i = 0; i < s.length && out.length < 95; i += 1900) out.push({ type: "text", text: { content: s.slice(i, i + 1900) } });
  return out;
};

/** "RFI-042 — Subject" — the title convention save-to-notion.js uses. */
const rfiTitle = (number, subject) => {
  const ref = number !== "" && number != null ? `RFI-${String(number).padStart(3, "0")}` : "";
  return ref && subject ? `${ref} — ${subject}` : ref || subject || "Untitled RFI";
};

/** Every block directly under a page (follows pagination). */
async function listChildren(token, blockId) {
  let out = [], cursor;
  do {
    const data = await notion(token, `blocks/${blockId}/children?page_size=100${cursor ? `&start_cursor=${cursor}` : ""}`);
    out = out.concat(data.results || []);
    cursor = data.has_more ? data.next_cursor : null;
  } while (cursor);
  return out;
}

const blockText = (b) => plain(b?.[b.type]?.rich_text);
const headingIs = (b, label) => /^heading_[123]$/.test(b?.type) && blockText(b).trim().toLowerCase() === label.toLowerCase();
const calloutEmoji = (b) => b?.type === "callout" ? b.callout?.icon?.emoji || "" : "";

/** Every RFI page in the database (there are only ~100, so a full read is fine). */
async function allRfis(token, dbId) {
  let out = [], cursor;
  do {
    const data = await notion(token, `databases/${dbId}/query`, { method: "POST", body: { page_size: 100, ...(cursor ? { start_cursor: cursor } : {}) } });
    out = out.concat(data.results || []);
    cursor = data.has_more ? data.next_cursor : null;
  } while (cursor);
  return out;
}

/** Ids of every Tasks DB item under a project. */
async function projectItemIds(token, tasksDb, projectId) {
  let ids = [], cursor;
  do {
    const data = await notion(token, `databases/${tasksDb}/query`, {
      method: "POST",
      body: { filter: { property: "Projects", relation: { contains: projectId } }, page_size: 100, ...(cursor ? { start_cursor: cursor } : {}) },
    });
    ids = ids.concat((data.results || []).map((p) => p.id));
    cursor = data.has_more ? data.next_cursor : null;
  } while (cursor);
  return ids;
}

module.exports = { NOTION_VERSION, HEADERS, json, notion, plain, richText, rfiTitle, listChildren, blockText, headingIs, calloutEmoji, allRfis, projectItemIds };
