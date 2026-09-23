// Netlify serverless function — records a consultant's response against an existing RFI.
//
// Responses often arrive as plain email text rather than a PDF, so the text itself is the
// primary payload; supporting documents are optional. Writes:
//   Response            (rich_text)  — first ~1900 chars, so it is readable in table views
//   Response Attachments(files)      — real uploads via Notion's File Upload API
//   Date Responded      (date)
//   Responded By        (select)
//   RFI Status          (select)     — moved to "Close Out"
// The full, untruncated response text is also appended to the page body.
//
// Required env vars: NOTION_TOKEN
// Optional:          NOTION_FILE_API_VERSION (pin the version used for file uploads)
//                    NOTION_DB_ACTIVITY_LOG  (saving a response posts a #response entry)

const NOTION_VERSION = "2022-06-28";
const { createActivityLogEntry, getRfiContext, rfiLabel } = require("./_activity-log");

// Notion's File Upload API arrived after 2022-06-28. It is expected to work on that
// version, but rather than guess we try the app's version first and fall back to a newer
// one if Notion rejects it. Whichever succeeds is reused for the rest of the upload.
const FILE_API_VERSIONS = process.env.NOTION_FILE_API_VERSION
  ? [process.env.NOTION_FILE_API_VERSION]
  : [NOTION_VERSION, "2025-09-03"];

const HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Content-Type": "application/json",
};

const PROP_MAX = 1900;   // Notion caps a rich_text property value at 2000 characters
const BLOCK_MAX = 1900;  // ...and a single rich_text object inside a block at 2000
const MAX_BLOCKS = 95;   // Notion accepts at most 100 children per append request

const json = (statusCode, body) => ({ statusCode, headers: HEADERS, body: JSON.stringify(body) });

const notionHeaders = (token, version) => ({
  Authorization: `Bearer ${token}`,
  "Notion-Version": version,
  "Content-Type": "application/json",
});

/** Split text into chunks no longer than `size`, breaking on newlines where possible. */
function chunk(text, size) {
  const out = [];
  let rest = String(text);
  while (rest.length > size) {
    let cut = rest.lastIndexOf("\n", size);
    if (cut < size * 0.5) cut = size;      // no sensible break point — hard split
    out.push(rest.slice(0, cut));
    rest = rest.slice(cut).replace(/^\n/, "");
  }
  if (rest.length) out.push(rest);
  return out;
}

/** Decode a browser data URL into a Buffer plus its declared MIME type. */
function decodeDataUrl(dataUrl) {
  const m = /^data:([^;,]*)(;base64)?,(.*)$/s.exec(dataUrl || "");
  if (!m) return null;
  const [, mime, isB64, payload] = m;
  return {
    buffer: isB64 ? Buffer.from(payload, "base64") : Buffer.from(decodeURIComponent(payload), "utf8"),
    contentType: mime || "application/octet-stream",
  };
}

/**
 * Push one file through Notion's three-step upload: create → send → (caller attaches).
 * Returns { id, name } on success. Throws with a readable message on failure.
 */
async function uploadFile(token, version, name, buffer, contentType) {
  const createRes = await fetch("https://api.notion.com/v1/file_uploads", {
    method: "POST",
    headers: notionHeaders(token, version),
    body: JSON.stringify({ filename: name, content_type: contentType }),
  });
  const created = await createRes.json().catch(() => ({}));
  if (!createRes.ok) {
    const err = new Error(created.message || `Could not start upload (HTTP ${createRes.status})`);
    err.status = createRes.status;
    throw err;
  }

  const form = new FormData();
  form.append("file", new Blob([buffer], { type: contentType }), name);

  // Content-Type is deliberately omitted so fetch sets the multipart boundary itself.
  const sendRes = await fetch(
    created.upload_url || `https://api.notion.com/v1/file_uploads/${created.id}/send`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Notion-Version": version },
      body: form,
    }
  );
  const sent = await sendRes.json().catch(() => ({}));
  if (!sendRes.ok) throw new Error(sent.message || `Upload failed (HTTP ${sendRes.status})`);

  return { id: created.id, name };
}

/**
 * Upload every attachment, negotiating the API version on the first one.
 * Never throws — returns what succeeded plus per-file errors, so a failed upload
 * can't cost the user the response text they just pasted.
 */
async function uploadAll(token, attachments) {
  const uploaded = [];
  const failures = [];
  let version = null;

  for (const att of attachments) {
    const decoded = decodeDataUrl(att.dataUrl);
    if (!decoded) {
      failures.push(`${att.name}: unreadable file data`);
      continue;
    }
    const type = att.type || decoded.contentType;

    if (!version) {
      // First file also settles which API version to use for the rest.
      let lastErr = null;
      for (const v of FILE_API_VERSIONS) {
        try {
          uploaded.push(await uploadFile(token, v, att.name, decoded.buffer, type));
          version = v;
          lastErr = null;
          break;
        } catch (err) {
          lastErr = err;
        }
      }
      if (lastErr) failures.push(`${att.name}: ${lastErr.message}`);
    } else {
      try {
        uploaded.push(await uploadFile(token, version, att.name, decoded.buffer, type));
      } catch (err) {
        failures.push(`${att.name}: ${err.message}`);
      }
    }
  }
  return { uploaded, failures, version: version || FILE_API_VERSIONS[0] };
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: HEADERS, body: "" };
  if (event.httpMethod !== "POST") return json(405, { error: "Method Not Allowed" });

  const token = process.env.NOTION_TOKEN;
  if (!token) return json(500, { error: "Server not configured — NOTION_TOKEN missing." });

  let body;
  try { body = JSON.parse(event.body); } catch { return json(400, { error: "Invalid JSON body" }); }

  const { notionId, response, respondedBy, dateResponded, attachments, rfiNumber } = body || {};
  if (!notionId) return json(400, { error: "notionId required" });

  const text = String(response || "").trim();
  const files = Array.isArray(attachments) ? attachments : [];
  if (!text && !files.length) return json(400, { error: "Add response text or at least one document." });

  const when = dateResponded || new Date().toISOString().split("T")[0];

  // ── 1. Write the response itself, on the version the rest of the app uses ──────
  const properties = {
    "RFI Status": { select: { name: "Close Out" } },
    "Date Responded": { date: { start: when } },
  };
  if (text) {
    const truncated = text.length > PROP_MAX;
    properties["Response"] = {
      rich_text: [{
        type: "text",
        text: { content: truncated ? text.slice(0, PROP_MAX) + "… (full text on page)" : text },
      }],
    };
  }
  if (respondedBy) properties["Responded By"] = { select: { name: respondedBy } };

  let pageUrl = "";
  try {
    const res = await fetch(`https://api.notion.com/v1/pages/${notionId}`, {
      method: "PATCH",
      headers: notionHeaders(token, NOTION_VERSION),
      body: JSON.stringify({ properties }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return json(res.status, { error: data.message || "Notion rejected the update" });
    pageUrl = data.url;
  } catch {
    return json(500, { error: "Failed to reach Notion API" });
  }

  const warnings = [];

  // ── 2. Append the full response text to the page body ─────────────────────────
  if (text) {
    const children = [{
      object: "block",
      type: "heading_3",
      heading_3: { rich_text: [{ type: "text", text: { content: `Response — ${when}` } }] },
    }];
    for (const part of chunk(text, BLOCK_MAX).slice(0, MAX_BLOCKS)) {
      children.push({
        object: "block",
        type: "paragraph",
        paragraph: { rich_text: [{ type: "text", text: { content: part } }] },
      });
    }
    try {
      const res = await fetch(`https://api.notion.com/v1/blocks/${notionId}/children`, {
        method: "PATCH",
        headers: notionHeaders(token, NOTION_VERSION),
        body: JSON.stringify({ children }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        warnings.push(`Response saved to the property, but the page body update failed: ${d.message || res.status}`);
      }
    } catch {
      warnings.push("Response saved to the property, but the page body update failed.");
    }
  }

  // ── 3. Upload documents and attach them ───────────────────────────────────────
  let attached = 0;
  if (files.length) {
    const { uploaded, failures, version } = await uploadAll(token, files);
    failures.forEach(f => warnings.push(`Attachment not uploaded — ${f}`));

    if (uploaded.length) {
      try {
        const res = await fetch(`https://api.notion.com/v1/pages/${notionId}`, {
          method: "PATCH",
          headers: notionHeaders(token, version),
          body: JSON.stringify({
            properties: {
              "Response Attachments": {
                type: "files",
                files: uploaded.map(u => ({
                  type: "file_upload",
                  file_upload: { id: u.id },
                  name: u.name,
                })),
              },
            },
          }),
        });
        if (res.ok) {
          attached = uploaded.length;
        } else {
          const d = await res.json().catch(() => ({}));
          warnings.push(`Files uploaded but could not be attached: ${d.message || res.status}`);
        }
      } catch {
        warnings.push("Files uploaded but could not be attached to the page.");
      }
    }
  }

  // ── 4. Post to the Item Activity Log ──────────────────────────────────────────
  // The related item isn't in the request, so read it off the RFI page to land the
  // entry on the right feed. Awaited deliberately — see the note in _activity-log.js.
  const who = respondedBy || "the consultant";
  const { taskId, description } = await getRfiContext(token, notionId);
  await createActivityLogEntry(token, {
    taskId,
    source: "RFI",
    tag:    "#response",
    author: "DM",
    entry:  `${rfiLabel(rfiNumber, description)} — response received from ${who}.`
            + (attached ? ` ${attached} document${attached > 1 ? "s" : ""} attached.` : ""),
    detail: text,
    link:   pageUrl,
  });

  return json(200, { success: true, url: pageUrl, attached, warnings });
};
