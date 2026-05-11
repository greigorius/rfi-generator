// Netlify serverless function — writes an RFI to the Notion RFI database
// Required env vars (set in Netlify dashboard → Site settings → Environment variables):
//   NOTION_TOKEN      — your Notion integration secret (starts with "secret_...")
//   NOTION_DB_RFIS    — the RFI database ID: 22d210e4582e80189f63f2cee93be4b3

const NOTION_VERSION = "2022-06-28";

exports.handler = async (event) => {
  // CORS headers so the browser can call this from any origin during local dev
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json",
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers, body: "" };
  }

  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers, body: JSON.stringify({ error: "Method Not Allowed" }) };
  }

  const token = process.env.NOTION_TOKEN;
  const dbId  = process.env.NOTION_DB_RFIS;

  if (!token || !dbId) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: "Server not configured — NOTION_TOKEN or NOTION_DB_RFIS missing." }),
    };
  }

  let rfi;
  try {
    rfi = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, headers, body: JSON.stringify({ error: "Invalid JSON body" }) };
  }

  // ─── Build Notion page properties ────────────────────────────────────────
  // "RFI Description" (title) ← app "RFI Subject" (rfiTitle) — the page name shown in DB views
  // "Question"        (text)  ← app "RFI Description" (description) — the full query detail
  const titleText = rfi.rfiTitle
    ? `RFI-${String(rfi.rfiNumber).padStart(3, "0")} — ${rfi.rfiTitle}`
    : `RFI-${String(rfi.rfiNumber).padStart(3, "0")}`;

  const properties = {
    "RFI Description": {
      title: [{ text: { content: titleText } }],
    },
    // Notion rich_text properties have a 2000-char limit; description also goes in the page body
    "Question": rfi.description
      ? { rich_text: [{ text: { content: rfi.description.slice(0, 2000) } }] }
      : undefined,
    "RFI Number": {
      number: rfi.rfiNumber ? Number(rfi.rfiNumber) : null,
    },
    "RFI Status": rfi.status
      ? { select: { name: rfi.status } }
      : undefined,
    // Notion property is "TBC by" (lowercase b) — must match exactly
    "TBC by": rfi.tbcBy
      ? { select: { name: rfi.tbcBy } }
      : undefined,
    "Date Raised": rfi.dateRaised
      ? { date: { start: rfi.dateRaised } }
      : undefined,
    // Relation — links to the Tasks DB entry, which auto-populates the Project rollup
    "Related Item(s)": rfi.relatedItemId
      ? { relation: [{ id: rfi.relatedItemId }] }
      : undefined,
  };

  // Remove undefined values (Notion API rejects them)
  Object.keys(properties).forEach((k) => {
    if (properties[k] === undefined) delete properties[k];
  });

  // ─── Build page body blocks ───────────────────────────────────────────────
  const children = [];

  // Project info (rollup — can't be written as a property, so add as a callout)
  if (rfi.project) {
    children.push({
      type: "callout",
      callout: {
        rich_text: [{ type: "text", text: { content: `Project: ${rfi.project}` } }],
        icon: { emoji: "🏗️" },
        color: "blue_background",
      },
    });
  }

  // Question / description — also written to the page body for full readability
  // (the "Question" property is capped at 2000 chars; body block has no limit)
  if (rfi.description) {
    children.push({
      type: "heading_3",
      heading_3: {
        rich_text: [{ type: "text", text: { content: "Question" } }],
      },
    });
    children.push({
      type: "paragraph",
      paragraph: {
        rich_text: [{ type: "text", text: { content: rfi.description } }],
      },
    });
  }

  // Additional notes
  if (rfi.additionalNotes) {
    children.push({
      type: "heading_3",
      heading_3: {
        rich_text: [{ type: "text", text: { content: "Additional Notes" } }],
      },
    });
    children.push({
      type: "quote",
      quote: {
        rich_text: [{ type: "text", text: { content: rfi.additionalNotes } }],
      },
    });
  }

  // Attachment reference (Notion file property requires hosted URLs, not data URIs;
  // we note the filename so the team knows to upload manually if needed)
  if (rfi.attachment) {
    children.push({
      type: "callout",
      callout: {
        rich_text: [
          {
            type: "text",
            text: { content: `Attachment: ${rfi.attachment.name}` },
          },
          {
            type: "text",
            text: { content: " — upload to Snippets field manually" },
            annotations: { italic: true, color: "gray" },
          },
        ],
        icon: { emoji: "📎" },
        color: "gray_background",
      },
    });
  }

  // ─── Call Notion API ──────────────────────────────────────────────────────
  try {
    const response = await fetch("https://api.notion.com/v1/pages", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Notion-Version": NOTION_VERSION,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        parent: { database_id: dbId },
        properties,
        children,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("Notion API error:", data);
      return {
        statusCode: response.status,
        headers,
        body: JSON.stringify({ error: data.message || "Notion API error" }),
      };
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ url: data.url, id: data.id }),
    };
  } catch (err) {
    console.error("Network error:", err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: "Failed to reach Notion API" }),
    };
  }
};
