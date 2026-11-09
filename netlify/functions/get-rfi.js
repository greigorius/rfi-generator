// Netlify function — reads one RFI back out of Notion so it can be edited in the form.
// POST { notionId } → { rfi: { ...form fields }, editable }
//
// Only RFIs still at "Raise" are editable; anything Open or later is returned with
// editable:false and the app refuses to load it into the form.

const { json, notion, plain, listChildren, blockText, headingIs, calloutEmoji } = require("../lib/rfi-common");
const { stripLeadingRef } = require("./_activity-log");

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return json(204, "");
  if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });
  const token = process.env.NOTION_TOKEN;
  if (!token) return json(500, { error: "Missing NOTION_TOKEN" });

  let notionId;
  try { ({ notionId } = JSON.parse(event.body)); } catch { return json(400, { error: "Invalid body" }); }
  if (!notionId) return json(400, { error: "notionId required" });

  try {
    const page = await notion(token, `pages/${notionId}`);
    const p = page.properties || {};
    const status = p["RFI Status"]?.select?.name || "";
    const relatedItemId = p["Related Item(s)"]?.relation?.[0]?.id || "";

    // Project: Related Item → its Projects relation → the project's name
    let project = "", projectId = "", relatedItemName = "";
    if (relatedItemId) {
      try {
        const item = await notion(token, `pages/${relatedItemId}`);
        relatedItemName = plain(item.properties?.["Item Name"]?.title);
        projectId = item.properties?.Projects?.relation?.[0]?.id || "";
        if (projectId) {
          const proj = await notion(token, `pages/${projectId}`);
          project = plain(proj.properties?.["Project Name"]?.title);
        }
      } catch { /* the item or project may not be shared with the integration — leave blank */ }
    }

    // Body: pick up what save-to-notion.js wrote (Question paragraph, Additional Notes quote,
    // 📎 attachment list) and the Drawing Review Studio's "Raised from client comments" line.
    const blocks = await listChildren(token, notionId);
    let bodyQuestion = "", additionalNotes = "", attachmentNote = "", fromStudio = "";
    blocks.forEach((b, i) => {
      if (headingIs(b, "Question") && blocks[i + 1]?.type === "paragraph") bodyQuestion = blockText(blocks[i + 1]);
      if (headingIs(b, "Additional Notes") && blocks[i + 1]?.type === "quote") additionalNotes = blockText(blocks[i + 1]);
      if (calloutEmoji(b) === "📎") attachmentNote = blockText(b).replace(/\n?— upload to Snippets field manually\s*$/, "").trim();
      if (b.type === "paragraph" && /Raised from client comments/i.test(blockText(b))) fromStudio = blockText(b);
    });

    const rfi = {
      notionId: page.id,
      notionUrl: page.url,
      rfiNumber: p["RFI Number"]?.number ?? "",
      rfiTitle: stripLeadingRef(plain(p["RFI Description"]?.title)),
      status,
      dateRaised: p["Date Raised"]?.date?.start || "",
      tbcBy: p["TBC by"]?.select?.name || "",
      // The property is capped at 2000 chars; the body copy is the full text when it exists
      description: bodyQuestion.length > plain(p.Question?.rich_text).length ? bodyQuestion : plain(p.Question?.rich_text),
      additionalNotes,
      attachmentNote,
      fromStudio,
      stopsWork: !!p["Stops Work"]?.checkbox,
      responseDue: p["Response Due"]?.date?.start || "",
      relatedItemId,
      relatedItemName,
      project,
      projectId,
    };
    return json(200, { rfi, editable: status === "Raise" });
  } catch (err) {
    return json(err.status || 500, { error: err.message || "Failed to reach Notion API" });
  }
};
