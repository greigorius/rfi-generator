// Netlify function — saves edits to an RFI that is still at "Raise".
// POST { notionId, rfiNumber, rfiTitle, description, status, tbcBy, dateRaised,
//        relatedItemId, additionalNotes, stopsWork, responseDue, attachments[] }
//
// Editing is allowed up to the point the RFI is issued: the page is re-read first and the
// save is refused (409) unless its status in Notion is still "Raise". The save itself may
// move it to "Open" — that is how an edited RFI gets issued — but never further.
//
// Properties are patched in place. In the page body only the blocks this app writes are
// touched (Question paragraph, Additional Notes quote, 📎 attachment callout, 🏗️ project
// callout); anything typed into the page by hand is left alone.
//
// Optional env var NOTION_DB_ACTIVITY_LOG — Raise → Open posts a #query "issued" entry.

const { json, notion, richText, rfiTitle, listChildren, headingIs, calloutEmoji } = require("../lib/rfi-common");
const { createActivityLogEntry, rfiLabel } = require("./_activity-log");

const EDITABLE_TO = ["Raise", "Open"];

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return json(204, "");
  if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });
  const token = process.env.NOTION_TOKEN;
  if (!token) return json(500, { error: "Missing NOTION_TOKEN" });

  let rfi;
  try { rfi = JSON.parse(event.body); } catch { return json(400, { error: "Invalid JSON body" }); }
  if (!rfi?.notionId) return json(400, { error: "notionId required" });
  if (rfi.status && !EDITABLE_TO.includes(rfi.status)) return json(400, { error: `Status can only be set to ${EDITABLE_TO.join(" or ")} from here.` });

  try {
    const current = await notion(token, `pages/${rfi.notionId}`);
    const was = current.properties?.["RFI Status"]?.select?.name || "";
    if (was !== "Raise") {
      return json(409, { error: `This RFI is already ${was || "past Raise"} in Notion, so it can no longer be edited.` });
    }

    // ─── Properties ───────────────────────────────────────────────────────────
    const props = {
      "RFI Description": { title: [{ text: { content: rfiTitle(rfi.rfiNumber, rfi.rfiTitle).slice(0, 1990) } }] },
      "Question": { rich_text: richText(String(rfi.description || "").slice(0, 2000)) },
      "RFI Number": { number: rfi.rfiNumber !== "" && rfi.rfiNumber != null ? Number(rfi.rfiNumber) : null },
      "RFI Status": { select: { name: rfi.status || "Raise" } },
      "TBC by": rfi.tbcBy ? { select: { name: rfi.tbcBy } } : { select: null },
      "Date Raised": rfi.dateRaised ? { date: { start: rfi.dateRaised } } : { date: null },
    };
    if (typeof rfi.stopsWork === "boolean") props["Stops Work"] = { checkbox: rfi.stopsWork };
    if ("responseDue" in rfi) props["Response Due"] = rfi.responseDue ? { date: { start: rfi.responseDue } } : { date: null };
    // Only touch the item link when the form actually has one, so an RFI linked in Notion
    // to an item the form couldn't load (e.g. a PCSA item) isn't silently unlinked.
    if (rfi.relatedItemId) props["Related Item(s)"] = { relation: [{ id: rfi.relatedItemId }] };

    const page = await notion(token, `pages/${rfi.notionId}`, { method: "PATCH", body: { properties: props } });

    // ─── Body ─────────────────────────────────────────────────────────────────
    const warnings = [];
    try {
      const blocks = await listChildren(token, rfi.notionId);
      const append = [];
      const setText = (block, text) => notion(token, `blocks/${block.id}`, { method: "PATCH", body: { [block.type]: { rich_text: richText(text) } } });
      const remove = (block) => notion(token, `blocks/${block.id}`, { method: "DELETE" });

      // Project callout — only refreshed if it is already there (it can't be moved to the top)
      const projCallout = blocks.find((b) => calloutEmoji(b) === "🏗️");
      if (projCallout && rfi.project) await setText(projCallout, `Project: ${rfi.project}`);

      // Question — paragraph after the "Question" heading
      const qi = blocks.findIndex((b) => headingIs(b, "Question"));
      if (qi >= 0 && blocks[qi + 1]?.type === "paragraph") {
        await setText(blocks[qi + 1], rfi.description || "");
      } else if (rfi.description) {
        append.push({ type: "heading_3", heading_3: { rich_text: richText("Question") } });
        append.push({ type: "paragraph", paragraph: { rich_text: richText(rfi.description) } });
      }

      // Additional Notes — quote after the "Additional Notes" heading
      const ni = blocks.findIndex((b) => headingIs(b, "Additional Notes"));
      const noteBlock = ni >= 0 && blocks[ni + 1]?.type === "quote" ? blocks[ni + 1] : null;
      if (rfi.additionalNotes) {
        if (noteBlock) await setText(noteBlock, rfi.additionalNotes);
        else {
          append.push({ type: "heading_3", heading_3: { rich_text: richText("Additional Notes") } });
          append.push({ type: "quote", quote: { rich_text: richText(rfi.additionalNotes) } });
        }
      } else if (noteBlock) {
        await remove(noteBlock);
        await remove(blocks[ni]);
      }

      // Attachment list — refreshed only when the form has attachments (the files themselves
      // only ever live in the browser, so an empty list means "not loaded", not "removed")
      const atts = Array.isArray(rfi.attachments) ? rfi.attachments : [];
      if (atts.length) {
        const summary = atts.length === 1
          ? `Attachment: ${atts[0].name}${atts[0].caption ? ` — ${atts[0].caption}` : ""}`
          : `${atts.length} attachments:\n` + atts.map((a, i) => `${i + 1}. ${a.name}${a.caption ? ` — ${a.caption}` : ""}`).join("\n");
        const rich = [
          ...richText(summary),
          { type: "text", text: { content: "\n— upload to Snippets field manually" }, annotations: { italic: true, color: "gray" } },
        ];
        const attCallout = blocks.find((b) => calloutEmoji(b) === "📎");
        if (attCallout) await notion(token, `blocks/${attCallout.id}`, { method: "PATCH", body: { callout: { rich_text: rich } } });
        else append.push({ type: "callout", callout: { rich_text: rich, icon: { emoji: "📎" }, color: "gray_background" } });
      }

      if (append.length) await notion(token, `blocks/${rfi.notionId}/children`, { method: "PATCH", body: { children: append } });
    } catch (err) {
      // Properties are saved; a body hiccup shouldn't read as a failed save
      warnings.push(`Properties saved, but the page body couldn't be updated: ${err.message}`);
    }

    // ─── Activity log — only when this save issues the RFI ───────────────────────
    if (rfi.status === "Open") {
      await createActivityLogEntry(token, {
        taskId: page.properties?.["Related Item(s)"]?.relation?.[0]?.id || null,
        source: "RFI",
        tag:    "#query",
        author: "DM",
        entry:  `${rfiLabel(rfi.rfiNumber, rfi.rfiTitle || rfi.description)} issued.` + (rfi.tbcBy ? ` TBC by ${rfi.tbcBy}.` : ""),
        detail: rfi.description || "",
        link:   page.url,
      });
    }

    return json(200, { success: true, url: page.url, status: rfi.status || "Raise", warnings });
  } catch (err) {
    return json(err.status || 500, { error: err.message || "Failed to reach Notion API" });
  }
};
