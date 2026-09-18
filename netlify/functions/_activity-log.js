// Shared helper — writes one entry to the Item Activity Log DB.
//
// Mirrors createActivityLogEntry() in axiom-drawing-flow/drawing-flow.js so RFI entries
// read the same as Drawing Flow's. That project uses the @notionhq/client SDK; this one
// talks to the REST API directly, so the call is rewritten but the contract is identical:
//
//   • Never throws. A logging failure must never break the RFI write that triggered it.
//   • Always awaited by the caller. Netlify freezes the Lambda the instant res.json() is
//     sent, so a fire-and-forget call here gets cut off mid-write and silently drops.
//   • Entry/Detail/Author truncated to 1900 chars — Notion 400s the whole request over
//     2000, and the catch below would swallow that with no visible error anywhere.
//
// Requires env var NOTION_DB_ACTIVITY_LOG. The Notion integration must be shared with
// that database, same as it is for the RFI database.

const NOTION_VERSION = "2022-06-28";
const ACTIVITY_LOG_DB = process.env.NOTION_DB_ACTIVITY_LOG;

const truncateForNotion = (str, max = 1900) =>
  !str ? str : (str.length > max ? str.slice(0, max) + "… (truncated)" : str);

/**
 * Look up the Task (Related Item) a given RFI page points at, so the feed entry lands on
 * the right item. Returns null when the RFI has no related item, or on any failure — an
 * entry without a Task relation is still worth writing.
 */
async function getRelatedTaskId(token, rfiPageId) {
  try {
    const res = await fetch(`https://api.notion.com/v1/pages/${rfiPageId}`, {
      headers: { Authorization: `Bearer ${token}`, "Notion-Version": NOTION_VERSION },
    });
    if (!res.ok) return null;
    const page = await res.json();
    return page.properties?.["Related Item(s)"]?.relation?.[0]?.id || null;
  } catch {
    return null;
  }
}

/**
 * Write one Item Activity Log entry. Resolves to true when written, false otherwise.
 */
async function createActivityLogEntry(token, { taskId, source, tag, author, entry, detail, link }) {
  if (!ACTIVITY_LOG_DB) {
    console.warn("[activity-log] NOTION_DB_ACTIVITY_LOG not configured — skipping entry:", entry);
    return false;
  }
  try {
    const properties = {
      "Entry":  { title: [{ text: { content: truncateForNotion(entry) } }] },
      "Source": { select: { name: source } },
      "Tag":    { select: { name: tag } },
      "Author": { rich_text: [{ text: { content: truncateForNotion(author || "System") } }] },
    };
    if (taskId) properties["Task"]   = { relation: [{ id: taskId }] };
    if (detail) properties["Detail"] = { rich_text: [{ text: { content: truncateForNotion(detail) } }] };
    if (link)   properties["Link"]   = { url: link };

    const res = await fetch("https://api.notion.com/v1/pages", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Notion-Version": NOTION_VERSION,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ parent: { database_id: ACTIVITY_LOG_DB }, properties }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      console.warn("[activity-log] write failed:", data.message || `HTTP ${res.status}`);
      return false;
    }
    return true;
  } catch (err) {
    console.warn("[activity-log] write failed:", err.message);
    return false;
  }
}

/** "RFI-007" — matches how RFIs are referred to elsewhere in the app. */
const rfiRef = (n) =>
  (n === null || n === undefined || n === "") ? "RFI-?" : `RFI-${String(n).padStart(3, "0")}`;

module.exports = { createActivityLogEntry, getRelatedTaskId, truncateForNotion, rfiRef };
