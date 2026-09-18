const NOTION_VERSION = "2022-06-28";
const HEADERS = { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" };
// Optional env var NOTION_DB_ACTIVITY_LOG — closing an RFI posts a #decision entry
const { createActivityLogEntry, getRelatedTaskId, rfiRef } = require("./_activity-log");

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: HEADERS, body: "" };
  if (event.httpMethod !== "POST") return { statusCode: 405, headers: HEADERS, body: JSON.stringify({ error: "Method not allowed" }) };

  const token = process.env.NOTION_TOKEN;
  if (!token) return { statusCode: 500, headers: HEADERS, body: JSON.stringify({ error: "Missing NOTION_TOKEN" }) };

  let notionId, rfiNumber;
  try { ({ notionId, rfiNumber } = JSON.parse(event.body)); } catch { return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ error: "Invalid body" }) }; }
  if (!notionId) return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ error: "notionId required" }) };

  const today = new Date().toISOString().split("T")[0];

  try {
    const res = await fetch(`https://api.notion.com/v1/pages/${notionId}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Notion-Version": NOTION_VERSION, "Content-Type": "application/json" },
      body: JSON.stringify({
        properties: {
          "RFI Status": { select: { name: "Closed" } },
          "Date Closed": { date: { start: today } },
        },
      }),
    });
    const data = await res.json();
    if (!res.ok) return { statusCode: res.status, headers: HEADERS, body: JSON.stringify({ error: data.message }) };

    // Post to the Item Activity Log. Awaited deliberately — see the note in _activity-log.js.
    await createActivityLogEntry(token, {
      taskId: await getRelatedTaskId(token, notionId),
      source: "RFI",
      tag:    "#decision",
      author: "DM",
      entry:  `${rfiRef(rfiNumber)} closed out.`,
      link:   data.url,
    });

    return { statusCode: 200, headers: HEADERS, body: JSON.stringify({ success: true, url: data.url }) };
  } catch (err) {
    return { statusCode: 500, headers: HEADERS, body: JSON.stringify({ error: "Failed to reach Notion API" }) };
  }
};
