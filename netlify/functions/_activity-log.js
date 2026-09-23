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

/** Pull the Related Item relation off an already-fetched Notion page object. */
const relatedTaskId = (page) =>
  page?.properties?.["Related Item(s)"]?.relation?.[0]?.id || null;

/** Pull the RFI Description rich_text off an already-fetched Notion page object. */
const rfiDescription = (page) =>
  (page?.properties?.["RFI Description"]?.rich_text || [])
    .map((t) => t?.plain_text || "")
    .join("")
    .trim();

/**
 * Read the Task (Related Item) and the RFI Description off an RFI page in ONE call, so the
 * feed entry both lands on the right item and can name the RFI. Returns
 * { taskId: null, description: "" } on any failure — an entry without them is still worth
 * writing, and a logging lookup must never break the RFI write that triggered it.
 *
 * Callers that already hold the page object (a POST/PATCH response is the full page) should
 * use relatedTaskId()/rfiDescription() directly instead and skip the round-trip.
 */
async function getRfiContext(token, rfiPageId) {
  try {
    const res = await fetch(`https://api.notion.com/v1/pages/${rfiPageId}`, {
      headers: { Authorization: `Bearer ${token}`, "Notion-Version": NOTION_VERSION },
    });
    if (!res.ok) return { taskId: null, description: "" };
    const page = await res.json();
    return { taskId: relatedTaskId(page), description: rfiDescription(page) };
  } catch {
    return { taskId: null, description: "" };
  }
}

/** Back-compat wrapper. Prefer getRfiContext — it returns the description too. */
async function getRelatedTaskId(token, rfiPageId) {
  return (await getRfiContext(token, rfiPageId)).taskId;
}

/**
 * The Log's Projects relation is DERIVED from the Item — never entered by hand — so a feed
 * filtered by project cannot disagree with one filtered by item. Returns null on any
 * failure; an entry without a project is still worth writing.
 */
const projectIdCache = new Map();
async function projectIdForTask(token, taskId) {
  if (!taskId) return null;
  if (projectIdCache.has(taskId)) return projectIdCache.get(taskId);
  let id = null;
  try {
    const res = await fetch(`https://api.notion.com/v1/pages/${taskId}`, {
      headers: { Authorization: `Bearer ${token}`, "Notion-Version": NOTION_VERSION },
    });
    if (res.ok) {
      const page = await res.json();
      id = page.properties?.["Projects"]?.relation?.[0]?.id || null;
    }
  } catch {
    /* leave null */
  }
  projectIdCache.set(taskId, id);
  return id;
}

/**
 * Write one Item Activity Log entry. Resolves to true when written, false otherwise.
 * `projectId` is optional: omit it and it is derived from taskId.
 */
async function createActivityLogEntry(token, { taskId, projectId, source, tag, author, entry, detail, link }) {
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
    const projId = projectId !== undefined ? projectId : await projectIdForTask(token, taskId);
    if (projId) properties["Projects"] = { relation: [{ id: projId }] };
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

// Some RFI descriptions already open with their own reference — "RFI-048 — Door B2-058-01
// - Acoustic requirements". 11 of the 94 RFIs on file do, all in the 2026 series. Strip it
// so rfiLabel() doesn't print the number twice.
const stripLeadingRef = (s) =>
  String(s || "").replace(/^\s*RFI[\s\-_]*\d+\s*[—–\-:.]*\s*/i, "").trim();

/**
 * "RFI-048 — Door B2-058-01 - Acoustic requirements", or plain "RFI-048" when the RFI has
 * no description. Every RFI entry opens with this label, so the raised / responded / closed
 * entries for one RFI read as a single thread in the feed instead of three bare numbers.
 */
function rfiLabel(n, description) {
  const body = stripLeadingRef(description);
  return body ? `${rfiRef(n)} — ${body}` : rfiRef(n);
}

module.exports = {
  createActivityLogEntry,
  projectIdForTask,
  getRfiContext,
  getRelatedTaskId,
  relatedTaskId,
  rfiDescription,
  truncateForNotion,
  rfiRef,
  rfiLabel,
  stripLeadingRef,
};
