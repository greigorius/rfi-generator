import { useState, useRef, useEffect } from "react";

const NOTION_DB_URL = "https://www.notion.so/22d210e4582e80189f63f2cee93be4b3";

const TBC_OPTIONS = ["Structural Engineer", "Design Consultant", "Main Contractor", "M&E", "Architect"];
const STATUS_OPTIONS = ["Raise", "Open", "Close Out", "Closed"];
const SOURCE_OPTIONS = ["Meeting Minutes", "Drawing Comment", "Site Observation", "Manual Input", "Sketch"];
const URGENCY_OPTIONS = ["Low", "Medium", "High", "Critical"];
const URGENCY_COLORS = { Low: "#4ade80", Medium: "#facc15", High: "#fb923c", Critical: "#f87171" };
const CATEGORY_OPTIONS = [
  "Design Intent Queries", "Structural Query", "M&E Query",
  "Site Coordination", "Specification Clarification", "Drawing Query", "Procurement Query",
];

// Fallback project list used before Notion Projects DB responds
const FALLBACK_PROJECTS = [
  { id: null, name: "24-334 - Peterborough Court" },
  { id: null, name: "24-354 - EIT Auditorium" },
  { id: null, name: "24-367 - EIT Observation Hall" },
];

const makeInitialForm = () => ({
  rfiNumber: "",
  rfiTitle: "",
  dateRaised: new Date().toISOString().split("T")[0],
  status: "Raise",
  project: "",
  relatedItemId: "",
  relatedItemName: "",
  category: "",
  description: "",
  tbcBy: "",
  source: "",
  urgency: "Medium",
  additionalNotes: "",
  attachment: null,
});

const formatDateShort = (dateStr) => {
  if (!dateStr) return "";
  const [y, m, d] = dateStr.split("-");
  return `${d}.${m}.${String(y).slice(2)}`;
};

const TMJ_LOGO_SVG = `<svg width="120" height="90" viewBox="0 0 120 90" xmlns="http://www.w3.org/2000/svg">
  <rect x="4" y="4" width="30" height="6" fill="#1565C0"/>
  <rect x="16" y="4" width="6" height="46" fill="#1565C0"/>
  <polygon points="40,4 46,4 60,30 74,4 80,4 80,50 74,50 74,22 60,48 46,22 46,50 40,50" fill="#1565C0"/>
  <rect x="88" y="4" width="8" height="40" fill="#1565C0"/>
  <path d="M88,44 Q88,56 78,56 Q70,56 70,48" stroke="#1565C0" stroke-width="8" fill="none" stroke-linecap="round"/>
  <text x="60" y="76" font-family="Arial,sans-serif" font-size="9" font-weight="300" fill="#666" letter-spacing="4" text-anchor="middle">INTERIORS</text>
</svg>`;

function completionScore(form) {
  const required = ["rfiNumber", "rfiTitle", "project", "description", "tbcBy", "source", "urgency"];
  const optional = ["additionalNotes", "category"];
  let score = 0;
  required.forEach(k => { if (form[k]) score += 14; });
  optional.forEach(k => { if (form[k]) score += 5; });
  if (form.attachment) score += 8;
  return Math.min(score, 100);
}

function Badge({ color, children }) {
  return (
    <span style={{
      background: color + "22", color, border: `1px solid ${color}55`,
      borderRadius: 3, padding: "2px 8px", fontSize: 11, fontFamily: "monospace",
      letterSpacing: 1, fontWeight: 700, textTransform: "uppercase",
    }}>{children}</span>
  );
}

function Field({ label, required, hint, children }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <label style={{
        display: "flex", alignItems: "center", gap: 6, fontSize: 11, fontWeight: 700,
        letterSpacing: 1.5, textTransform: "uppercase", color: "#8a9bb0", marginBottom: 6, fontFamily: "monospace"
      }}>
        {label}
        {required && <span style={{ color: "#f87171" }}>*</span>}
        {hint && <span style={{ color: "#4a5568", fontWeight: 400, letterSpacing: 0, textTransform: "none", fontSize: 10 }}>— {hint}</span>}
      </label>
      {children}
    </div>
  );
}

const inputStyle = {
  width: "100%", boxSizing: "border-box", background: "#0d1117", border: "1px solid #21303f",
  color: "#e2eaf3", borderRadius: 4, padding: "9px 12px", fontSize: 13,
  fontFamily: "'IBM Plex Mono', monospace", outline: "none", transition: "border-color 0.15s",
};
const selectStyle = { ...inputStyle, cursor: "pointer", appearance: "none" };

function SelectField({ value, onChange, options, placeholder, disabled }) {
  return (
    <div style={{ position: "relative" }}>
      <select value={value} onChange={e => onChange(e.target.value)} disabled={disabled}
        style={{ ...selectStyle, paddingRight: 32, opacity: disabled ? 0.5 : 1 }}>
        <option value="">{placeholder || "Select..."}</option>
        {options.map(o => {
          const val = typeof o === "string" ? o : o.name;
          const key = typeof o === "string" ? o : (o.id || o.name);
          return <option key={key} value={val}>{val}</option>;
        })}
      </select>
      <span style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", color: "#4a5568", pointerEvents: "none", fontSize: 10 }}>&#9660;</span>
    </div>
  );
}

function ScoreBar({ score }) {
  const color = score < 40 ? "#f87171" : score < 70 ? "#facc15" : "#4ade80";
  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
        <span style={{ fontSize: 10, fontFamily: "monospace", color: "#4a5568", letterSpacing: 1.5, textTransform: "uppercase" }}>Form Completeness</span>
        <span style={{ fontSize: 12, fontFamily: "monospace", color, fontWeight: 700 }}>{score}%</span>
      </div>
      <div style={{ height: 3, background: "#0d1117", borderRadius: 2, border: "1px solid #21303f" }}>
        <div style={{ height: "100%", width: `${score}%`, background: color, borderRadius: 2, transition: "width 0.4s ease, background 0.3s" }} />
      </div>
    </div>
  );
}

function NotionRfiItem({ rfi, closeState, onCloseOut }) {
  const state = closeState || "idle";
  const closed = state === "closed";
  const closing = state === "loading";
  return (
    <div style={{
      background: "#0d1117",
      border: `1px solid ${closed ? "#16a34a44" : "#21303f"}`,
      borderRadius: 4, padding: "10px 14px", marginBottom: 8,
      display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
      opacity: closed ? 0.55 : 1, transition: "opacity 0.5s",
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
          <span style={{ fontFamily: "monospace", fontSize: 11, color: "#38bdf8", fontWeight: 700 }}>
            RFI-{String(rfi.rfiNumber || "?").padStart(3, "0")}
          </span>
          <Badge color="#94a3b8">{rfi.status}</Badge>
          {rfi.tbcBy && <Badge color="#818cf8">{rfi.tbcBy}</Badge>}
          {closed && <Badge color="#4ade80">✓ Closed</Badge>}
        </div>
        <div style={{ fontSize: 12, color: "#e2eaf3", fontFamily: "monospace", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {rfi.rfiTitle || "Untitled"}
        </div>
        <div style={{ fontSize: 10, color: "#374151", fontFamily: "monospace", marginTop: 2 }}>
          {rfi.project && <span style={{ color: "#60a5fa" }}>{rfi.project} · </span>}
          Raised: {rfi.dateRaised || "—"} · TBC: {rfi.tbcBy || "—"}
        </div>
        {state === "error" && (
          <div style={{ fontSize: 10, color: "#f87171", fontFamily: "monospace", marginTop: 3 }}>✕ Failed to close — check integration</div>
        )}
      </div>
      <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
        <button onClick={() => window.open(rfi.notionUrl, "_blank")} style={{
          background: "#1e3a5f", border: "1px solid #2563eb", color: "#60a5fa",
          borderRadius: 3, padding: "5px 10px", fontSize: 10, fontWeight: 700,
          fontFamily: "monospace", cursor: "pointer", letterSpacing: 1, textTransform: "uppercase"
        }}>View ↗</button>
        <button onClick={() => !closing && !closed && onCloseOut(rfi)} disabled={closing || closed} style={{
          background: closed ? "#1a2e1a" : "#1a0a0a",
          border: `1px solid ${closed ? "#16a34a" : "#dc262655"}`,
          color: closed ? "#4ade80" : closing ? "#4a5568" : "#f8717188",
          borderRadius: 3, padding: "5px 10px", fontSize: 10, fontWeight: 700,
          fontFamily: "monospace", cursor: closing || closed ? "default" : "pointer",
          letterSpacing: 1, textTransform: "uppercase", minWidth: 80, textAlign: "center",
        }}>
          {closed ? "✓ Closed" : closing ? "Closing…" : "Close Out"}
        </button>
      </div>
    </div>
  );
}

function DraftQueueItem({ rfi, onRemove, onExport, onEdit, notionStatus, onFileToNotion }) {
  const ns = notionStatus || { state: "idle" };
  const filed = ns.state === "success";
  const filing = ns.state === "loading";
  return (
    <div style={{
      background: "#0d1117", border: `1px solid ${filed ? "#16a34a44" : "#21303f"}`,
      borderRadius: 4, padding: "12px 14px", marginBottom: 8,
      display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
          <span style={{ fontFamily: "monospace", fontSize: 11, color: "#38bdf8", fontWeight: 700 }}>
            RFI-{String(rfi.rfiNumber).padStart(3, "0")}
          </span>
          <Badge color={URGENCY_COLORS[rfi.urgency]}>{rfi.urgency}</Badge>
          <Badge color="#94a3b8">{rfi.status}</Badge>
          {rfi.category && <Badge color="#818cf8">{rfi.category}</Badge>}
          {filed && <Badge color="#4ade80">✓ Filed</Badge>}
        </div>
        <div style={{ fontSize: 12, color: "#e2eaf3", fontFamily: "monospace", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", marginBottom: 2 }}>
          {rfi.rfiTitle || rfi.description || "No title"}
        </div>
        <div style={{ fontSize: 10, color: "#374151", fontFamily: "monospace", marginTop: 3 }}>
          {rfi.project && <span style={{ color: "#60a5fa" }}>{rfi.project} · </span>}
          TBC: {rfi.tbcBy || "—"} · {rfi.dateRaised}
          {rfi.relatedItemName && <span style={{ color: "#818cf8" }}> · {rfi.relatedItemName}</span>}
          {rfi.attachment && <span style={{ color: "#4a5568" }}> · 📎 {rfi.attachment.name}</span>}
        </div>
        {ns.state === "error" && (
          <div style={{ fontSize: 10, color: "#f87171", fontFamily: "monospace", marginTop: 4 }}>
            ✕ {ns.message || "Failed to file — check Notion integration setup"}
          </div>
        )}
      </div>
      <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
        <button onClick={() => onEdit(rfi)} style={{
          background: "#1a1a2e", border: "1px solid #6366f1", color: "#818cf8",
          borderRadius: 3, padding: "5px 10px", fontSize: 10, fontWeight: 700,
          fontFamily: "monospace", cursor: "pointer", letterSpacing: 1, textTransform: "uppercase"
        }}>Edit</button>
        <button onClick={() => onExport(rfi)} style={{
          background: "#1e3a5f", border: "1px solid #2563eb", color: "#60a5fa",
          borderRadius: 3, padding: "5px 10px", fontSize: 10, fontWeight: 700,
          fontFamily: "monospace", cursor: "pointer", letterSpacing: 1, textTransform: "uppercase"
        }}>Export</button>
        <button onClick={() => filed ? window.open(ns.url, "_blank") : onFileToNotion(rfi)} disabled={filing} style={{
          background: filed ? "#1a2e1a" : filing ? "#111" : "#1a2e1a",
          border: `1px solid ${filed ? "#16a34a" : filing ? "#374151" : "#16a34a55"}`,
          color: filed ? "#4ade80" : filing ? "#4a5568" : "#4ade8088",
          borderRadius: 3, padding: "5px 10px", fontSize: 10, fontWeight: 700,
          fontFamily: "monospace", cursor: filing ? "default" : "pointer",
          letterSpacing: 1, textTransform: "uppercase", transition: "all 0.2s", minWidth: 70, textAlign: "center",
        }}>
          {filed ? "↗ Open" : filing ? "Filing…" : "→ Notion"}
        </button>
        <button onClick={() => onRemove(rfi.id)} style={{
          background: "transparent", border: "1px solid #374151", color: "#6b7280",
          borderRadius: 3, padding: "5px 10px", fontSize: 10, fontWeight: 700,
          fontFamily: "monospace", cursor: "pointer"
        }}>✕</button>
      </div>
    </div>
  );
}

function PrintView({ rfi, onClose, logoDataUrl }) {
  const rfiNum = String(rfi.rfiNumber).padStart(3, "0");
  const logoSrc = logoDataUrl || ("data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(TMJ_LOGO_SVG))));
  const isImage = rfi.attachment && rfi.attachment.type && rfi.attachment.type.startsWith("image/");
  const attachmentHtml = rfi.attachment
    ? isImage
      ? `<img src="${rfi.attachment.dataUrl}" alt="Attachment" style="max-width:100%;max-height:400px;object-fit:contain;display:block;"/>`
      : `<div style="display:flex;align-items:center;gap:12px;padding:20px;font-family:Arial,sans-serif;"><span style="font-size:32px;">📎</span><div><div style="font-size:13px;font-weight:600;color:#333;">${rfi.attachment.name}</div><div style="font-size:10px;color:#999;margin-top:2px;text-transform:uppercase;letter-spacing:1px;">${rfi.attachment.type || "File"}</div></div></div>`
    : `<span style="font-size:10px;letter-spacing:2px;text-transform:uppercase;color:#ccc;">Image / Attachment Area</span>`;

  const handleExportPDF = () => {
    const w = window.open("", "_blank");
    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8"/>
  <title>RFI-${rfiNum}</title>
  <style>
    *,*::before,*::after{margin:0;padding:0;box-sizing:border-box;}
    @page{size:A4;margin:15mm 18mm;}
    html{background:#f0f0f0;}
    body{font-family:Arial,Helvetica,sans-serif;background:white;color:#111;width:210mm;min-height:297mm;margin:0 auto;padding:18mm 18mm 15mm;}
    .rfi-number{font-size:58px;font-weight:900;letter-spacing:-2px;line-height:1;color:#111;margin-bottom:6px;}
    .rfi-subject{font-size:15px;color:#333;font-weight:400;margin-bottom:22px;line-height:1.4;}
    .header-bar{display:flex;align-items:center;border-top:1.5px solid #bbb;border-bottom:1.5px solid #bbb;padding:10px 0;margin-bottom:26px;}
    .logo-wrap{display:flex;align-items:center;padding-right:16px;flex-shrink:0;}
    .logo-wrap img{width:70px;height:auto;}
    .bar-divider{width:1px;height:46px;background:#bbb;margin-right:16px;flex-shrink:0;}
    .bar-category{flex:1;font-size:14px;font-weight:700;text-decoration:underline;color:#111;}
    .bar-date{font-size:13px;color:#444;white-space:nowrap;margin-left:12px;}
    .meta-row{display:flex;margin-bottom:22px;border:1px solid #e0e0e0;}
    .meta-item{flex:1;padding:8px 12px;border-right:1px solid #e0e0e0;}
    .meta-item:last-child{border-right:none;}
    .meta-label{font-size:8.5px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#999;margin-bottom:3px;}
    .meta-value{font-size:12px;font-weight:600;color:#111;}
    .section-label{font-size:8.5px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#999;margin-bottom:7px;}
    .description{font-size:13px;line-height:1.75;color:#222;margin-bottom:26px;padding-bottom:22px;border-bottom:1px solid #eee;}
    .notes-box{font-size:12px;line-height:1.65;color:#444;background:#f9f9f9;border:1px solid #e8e8e8;padding:12px 14px;margin-bottom:24px;}
    .image-area{width:100%;min-height:240px;border:1px solid #ddd;display:flex;align-items:center;justify-content:center;margin-bottom:20px;overflow:hidden;}
    .footer{display:flex;justify-content:space-between;font-size:9px;color:#aaa;border-top:1px solid #ddd;padding-top:10px;}
    .print-btn{position:fixed;top:16px;right:16px;}
    @media print{html{background:white;}body{margin:0;padding:0;width:auto;min-height:0;}.print-btn{display:none;}}
  </style>
</head>
<body>
  <div class="print-btn"><button onclick="window.print()" style="background:#111;color:white;border:none;padding:9px 22px;font-size:12px;cursor:pointer;border-radius:3px;font-family:Arial,sans-serif;font-weight:600;">Print / Save as PDF</button></div>
  <div class="rfi-number">RFI#${rfi.rfiNumber}</div>
  <div class="rfi-subject">${rfi.rfiTitle || rfi.description || ""}</div>
  <div class="header-bar">
    <div class="logo-wrap"><img src="${logoSrc}" alt="TMJ Interiors"/></div>
    <div class="bar-divider"></div>
    <div class="bar-category">${rfi.category || rfi.source || "RFI Query"}</div>
    <div class="bar-date">${formatDateShort(rfi.dateRaised)}</div>
  </div>
  <div class="meta-row">
    <div class="meta-item" style="flex:2"><div class="meta-label">Project</div><div class="meta-value">${rfi.project || "—"}</div></div>
    <div class="meta-item"><div class="meta-label">TBC By</div><div class="meta-value">${rfi.tbcBy || "—"}</div></div>
    <div class="meta-item"><div class="meta-label">Urgency</div><div class="meta-value">${rfi.urgency}</div></div>
    <div class="meta-item"><div class="meta-label">Source</div><div class="meta-value">${rfi.source || "—"}</div></div>
    <div class="meta-item"><div class="meta-label">Date Raised</div><div class="meta-value">${formatDateShort(rfi.dateRaised)}</div></div>
  </div>
  <div class="section-label">Description</div>
  <div class="description">${rfi.description || "—"}</div>
  ${rfi.additionalNotes ? `<div class="section-label">Additional Notes</div><div class="notes-box">${rfi.additionalNotes}</div>` : ""}
  <div class="image-area">${attachmentHtml}</div>
  <div class="footer">
    <span>Generated ${new Date().toLocaleDateString("en-GB")}</span>
    <span>RFI-${rfiNum} · TMJ Interiors · DRAFT — NOT FOR CONSTRUCTION</span>
  </div>
</body>
</html>`;
    w.document.write(html);
    w.document.close();
    w.focus();
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "#000000cc", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div style={{ background: "#111827", border: "1px solid #21303f", borderRadius: 6, width: "100%", maxWidth: 620, maxHeight: "92vh", overflow: "auto" }}>
        <div style={{ padding: "14px 20px", borderBottom: "1px solid #21303f", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontFamily: "monospace", fontWeight: 700, color: "#e2eaf3", fontSize: 13, letterSpacing: 1 }}>EXPORT — RFI-{rfiNum}</span>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "#4a5568", cursor: "pointer", fontSize: 18 }}>✕</button>
        </div>
        <div style={{ padding: 20 }}>
          <div style={{ background: "white", borderRadius: 3, padding: "24px 24px 20px", marginBottom: 20, boxShadow: "0 4px 24px #00000060", color: "#111", fontFamily: "Arial,Helvetica,sans-serif" }}>
            <div style={{ fontSize: 36, fontWeight: 900, letterSpacing: -1, lineHeight: 1, marginBottom: 5, color: "#111" }}>RFI#{rfi.rfiNumber || "—"}</div>
            <div style={{ fontSize: 12, color: "#333", marginBottom: 16, lineHeight: 1.4 }}>
              {rfi.rfiTitle || <span style={{ color: "#bbb", fontStyle: "italic" }}>No subject entered</span>}
            </div>
            <div style={{ display: "flex", alignItems: "center", borderTop: "1.5px solid #ccc", borderBottom: "1.5px solid #ccc", padding: "8px 0", marginBottom: 16 }}>
              <div style={{ paddingRight: 12, flexShrink: 0 }}>
                <img src={logoSrc} alt="TMJ" style={{ height: 44, width: "auto", display: "block" }} />
              </div>
              <div style={{ width: 1, height: 34, background: "#ccc", marginRight: 12, flexShrink: 0 }} />
              <div style={{ flex: 1, fontSize: 12, fontWeight: 700, textDecoration: "underline", color: "#111" }}>{rfi.category || rfi.source || "RFI Query"}</div>
              <div style={{ fontSize: 11, color: "#444", marginLeft: 10, flexShrink: 0 }}>{formatDateShort(rfi.dateRaised)}</div>
            </div>
            <div style={{ display: "flex", border: "1px solid #e0e0e0", marginBottom: 14 }}>
              {[["Project", rfi.project], ["TBC By", rfi.tbcBy], ["Urgency", rfi.urgency], ["Source", rfi.source], ["Date", formatDateShort(rfi.dateRaised)]].map(([l, v]) => (
                <div key={l} style={{ flex: 1, padding: "5px 8px", borderRight: "1px solid #e0e0e0" }}>
                  <div style={{ fontSize: 7, fontWeight: 700, letterSpacing: 1.5, textTransform: "uppercase", color: "#999", marginBottom: 2 }}>{l}</div>
                  <div style={{ fontSize: 10, fontWeight: 600, color: "#111" }}>{v || "—"}</div>
                </div>
              ))}
            </div>
            <div style={{ fontSize: 7, fontWeight: 700, letterSpacing: 1.5, textTransform: "uppercase", color: "#999", marginBottom: 5 }}>Description</div>
            <div style={{ fontSize: 11, lineHeight: 1.7, color: "#222", marginBottom: 14, paddingBottom: 12, borderBottom: "1px solid #eee" }}>
              {rfi.description || <span style={{ color: "#bbb", fontStyle: "italic" }}>No description</span>}
            </div>
            {rfi.additionalNotes && (
              <>
                <div style={{ fontSize: 7, fontWeight: 700, letterSpacing: 1.5, textTransform: "uppercase", color: "#999", marginBottom: 5 }}>Additional Notes</div>
                <div style={{ fontSize: 10, lineHeight: 1.6, color: "#444", background: "#f9f9f9", border: "1px solid #eee", padding: "7px 10px", marginBottom: 12 }}>{rfi.additionalNotes}</div>
              </>
            )}
            <div style={{ width: "100%", minHeight: 80, border: "1px solid #ddd", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", marginBottom: 12 }}>
              {rfi.attachment
                ? isImage
                  ? <img src={rfi.attachment.dataUrl} alt="attachment" style={{ maxWidth: "100%", maxHeight: 140, objectFit: "contain" }} />
                  : <div style={{ display: "flex", alignItems: "center", gap: 10, padding: 12 }}>
                      <span style={{ fontSize: 24 }}>📎</span>
                      <div>
                        <div style={{ fontSize: 11, fontWeight: 600, color: "#333" }}>{rfi.attachment.name}</div>
                        <div style={{ fontSize: 9, color: "#999", marginTop: 2, textTransform: "uppercase", letterSpacing: 1 }}>{rfi.attachment.type || "File"}</div>
                      </div>
                    </div>
                : <span style={{ fontSize: 9, letterSpacing: 2, textTransform: "uppercase", color: "#ccc" }}>Image / Attachment Area</span>
              }
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 8, color: "#bbb", borderTop: "1px solid #eee", paddingTop: 7 }}>
              <span>Generated {new Date().toLocaleDateString("en-GB")}</span>
              <span>RFI-{rfiNum} · TMJ Interiors · DRAFT</span>
            </div>
          </div>
          <button onClick={handleExportPDF} style={{
            width: "100%", background: "#1e1b4b", border: "1px solid #4f46e5", color: "#a78bfa",
            borderRadius: 4, padding: "14px", fontSize: 12, fontWeight: 700,
            fontFamily: "monospace", cursor: "pointer", letterSpacing: 1, textTransform: "uppercase"
          }}>Open A4 Export — Print or Save as PDF</button>
          <div style={{ marginTop: 10, padding: "8px 12px", background: "#0d1117", border: "1px solid #21303f", borderRadius: 4 }}>
            <div style={{ fontSize: 10, color: "#374151" }}>
              In the export window use <span style={{ color: "#60a5fa" }}>Print</span> (Cmd+P / Ctrl+P) → <span style={{ color: "#60a5fa" }}>Save as PDF</span> · Paper: A4 · Margins: None
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function RFIGenerator() {
  const [form, setForm] = useState(makeInitialForm());
  const [notionState, setNotionState] = useState({});
  const [queue, setQueue] = useState(() => {
    try { const s = localStorage.getItem("rfi-queue"); return s ? JSON.parse(s) : []; } catch { return []; }
  });
  const [tab, setTab] = useState("form");
  const [exportRfi, setExportRfi] = useState(null);
  const [saved, setSaved] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [logoDataUrl, setLogoDataUrl] = useState(null);
  const fileInputRef = useRef();

  // Dynamic projects from Notion — falls back to FALLBACK_PROJECTS
  const [projects, setProjects] = useState(FALLBACK_PROJECTS);
  // Related items for selected project (excludes PCSA items)
  const [relatedItems, setRelatedItems] = useState([]);
  const [relatedItemsLoading, setRelatedItemsLoading] = useState(false);
  // Open RFIs fetched from Notion
  const [notionRfis, setNotionRfis] = useState([]);
  const [notionRfisLoading, setNotionRfisLoading] = useState(false);
  const [closeOutState, setCloseOutState] = useState({});
  const [queueProjectFilter, setQueueProjectFilter] = useState("");

  // Persist queue to localStorage
  useEffect(() => {
    try { localStorage.setItem("rfi-queue", JSON.stringify(queue)); } catch {}
  }, [queue]);

  // Load TMJ logo and strip black background
  useEffect(() => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0);
      try {
        const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const d = imgData.data;
        for (let i = 0; i < d.length; i += 4) {
          if (d[i] < 40 && d[i + 1] < 40 && d[i + 2] < 40) d[i + 3] = 0;
        }
        ctx.putImageData(imgData, 0, 0);
        setLogoDataUrl(canvas.toDataURL("image/png"));
      } catch { setLogoDataUrl("/TMJ-Logo.png"); }
    };
    img.onerror = () => setLogoDataUrl(null);
    img.src = "/TMJ-Logo.png";
  }, []);

  // Fetch active projects from Notion on mount
  useEffect(() => {
    fetch("/.netlify/functions/get-projects")
      .then(r => r.json())
      .then(data => { if (data.projects?.length) setProjects(data.projects); })
      .catch(() => {});
  }, []);

  // Fetch related items when project changes
  useEffect(() => {
    const selectedProject = projects.find(p => p.name === form.project);
    if (!selectedProject?.id) { setRelatedItems([]); return; }
    setRelatedItemsLoading(true);
    setRelatedItems([]);
    setForm(f => ({ ...f, relatedItemId: "", relatedItemName: "" }));
    fetch("/.netlify/functions/get-project-items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId: selectedProject.id }),
    })
      .then(r => r.json())
      .then(data => { setRelatedItems(data.items || []); setRelatedItemsLoading(false); })
      .catch(() => setRelatedItemsLoading(false));
  }, [form.project]);

  // Fetch open RFIs from Notion when queue tab is active
  useEffect(() => {
    if (tab !== "queue") return;
    setNotionRfisLoading(true);
    fetch("/.netlify/functions/get-open-rfis")
      .then(r => r.json())
      .then(data => { setNotionRfis(data.rfis || []); setNotionRfisLoading(false); })
      .catch(() => setNotionRfisLoading(false));
  }, [tab]);

  const set = (key, val) => setForm(f => ({ ...f, [key]: val }));
  const score = completionScore(form);

  const handleAddToDraft = () => {
    if (!form.rfiNumber || !form.rfiTitle || !form.project || !form.description || !form.tbcBy) {
      alert("Please fill in RFI Number, Project, Subject, Description, and TBC By before saving.");
      return;
    }
    if (editingId) {
      setQueue(q => [{ ...form, id: editingId }, ...q]);
      setEditingId(null);
    } else {
      setQueue(q => [{ ...form, id: Date.now() }, ...q]);
    }
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
    setForm(makeInitialForm());
    setTab("queue");
  };

  const handleEdit = (rfi) => {
    setForm({ ...rfi });
    setEditingId(rfi.id);
    setQueue(q => q.filter(r => r.id !== rfi.id));
    setTab("form");
  };

  const handleRemove = (id) => setQueue(q => q.filter(r => r.id !== id));

  const handleFileToNotion = async (rfi) => {
    setNotionState(s => ({ ...s, [rfi.id]: { state: "loading" } }));
    try {
      const payload = { ...rfi, attachment: rfi.attachment ? { name: rfi.attachment.name, type: rfi.attachment.type } : null };
      const res = await fetch("/.netlify/functions/save-to-notion", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) setNotionState(s => ({ ...s, [rfi.id]: { state: "error", message: data.error } }));
      else setNotionState(s => ({ ...s, [rfi.id]: { state: "success", url: data.url } }));
    } catch {
      setNotionState(s => ({ ...s, [rfi.id]: { state: "error", message: "Network error — is the app deployed?" } }));
    }
  };

  const handleCloseOut = async (notionRfi) => {
    setCloseOutState(s => ({ ...s, [notionRfi.notionId]: "loading" }));
    try {
      const res = await fetch("/.netlify/functions/update-rfi", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notionId: notionRfi.notionId }),
      });
      if (res.ok) {
        setCloseOutState(s => ({ ...s, [notionRfi.notionId]: "closed" }));
        setTimeout(() => setNotionRfis(rfis => rfis.filter(r => r.notionId !== notionRfi.notionId)), 1800);
      } else {
        setCloseOutState(s => ({ ...s, [notionRfi.notionId]: "error" }));
      }
    } catch {
      setCloseOutState(s => ({ ...s, [notionRfi.notionId]: "error" }));
    }
  };

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => set("attachment", { name: file.name, type: file.type, dataUrl: ev.target.result });
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const handleScreenCapture = async () => {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
      const video = document.createElement("video");
      video.srcObject = stream;
      await video.play();
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth; canvas.height = video.videoHeight;
      canvas.getContext("2d").drawImage(video, 0, 0);
      stream.getTracks().forEach(t => t.stop());
      set("attachment", { name: "screenshot.png", type: "image/png", dataUrl: canvas.toDataURL("image/png") });
    } catch {
      alert("Screen capture requires browser permission. Try file upload instead.");
    }
  };

  const isAttachmentImage = form.attachment && form.attachment.type && form.attachment.type.startsWith("image/");
  const selectedProject = projects.find(p => p.name === form.project);
  const canLoadItems = !!selectedProject?.id;

  // Queue filter helpers
  const queueProjects = [...new Set([
    ...notionRfis.map(r => r.project).filter(Boolean),
    ...queue.map(r => r.project).filter(Boolean),
  ])].sort();
  const filteredNotionRfis = queueProjectFilter ? notionRfis.filter(r => r.project === queueProjectFilter) : notionRfis;
  const filteredQueue = queueProjectFilter ? queue.filter(r => r.project === queueProjectFilter) : queue;

  return (
    <div style={{ minHeight: "100vh", background: "#070c12", fontFamily: "'IBM Plex Mono', 'Courier New', monospace", color: "#e2eaf3" }}>
      <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;700&display=swap" rel="stylesheet" />

      {/* Header */}
      <div style={{ borderBottom: "1px solid #21303f", padding: "0 24px", display: "flex", alignItems: "stretch", justifyContent: "space-between", background: "#0d1117" }}>
        <div style={{ padding: "16px 0" }}>
          <div style={{ fontSize: 11, color: "#38bdf8", letterSpacing: 3, textTransform: "uppercase", fontWeight: 700 }}>◈ RFI GENERATOR</div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 2 }}>
            <span style={{ fontSize: 10, color: "#374151", letterSpacing: 1 }}>Notion-linked · Draft Queue System</span>
            <button onClick={() => {
              fetch("/.netlify/functions/get-projects")
                .then(r => r.json())
                .then(data => { if (data.projects?.length) setProjects(data.projects); })
                .catch(() => {});
              if (tab === "queue") {
                setNotionRfisLoading(true);
                fetch("/.netlify/functions/get-open-rfis")
                  .then(r => r.json())
                  .then(data => { setNotionRfis(data.rfis || []); setNotionRfisLoading(false); })
                  .catch(() => setNotionRfisLoading(false));
              }
            }} title="Refresh Notion connection" style={{
              background: "transparent", border: "1px solid #21303f", color: "#4a5568",
              borderRadius: 3, padding: "2px 7px", fontSize: 9, fontFamily: "monospace",
              cursor: "pointer", letterSpacing: 1, textTransform: "uppercase"
            }}>↺ Refresh</button>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          {["form", "queue"].map(t => (
            <button key={t} onClick={() => setTab(t)} style={{
              background: tab === t ? "#0d1f33" : "transparent",
              border: "none", borderBottom: tab === t ? "2px solid #38bdf8" : "2px solid transparent",
              color: tab === t ? "#38bdf8" : "#4a5568",
              padding: "18px 16px 16px", fontSize: 11, fontWeight: 700,
              cursor: "pointer", letterSpacing: 1.5, textTransform: "uppercase",
              fontFamily: "monospace", transition: "all 0.15s"
            }}>
              {t === "queue" ? `Queue${queue.length > 0 ? ` [${queue.length}]` : ""}` : "New RFI"}
            </button>
          ))}
        </div>
      </div>

      {saved && (
        <div style={{ background: "#16a34a22", borderBottom: "1px solid #16a34a55", color: "#4ade80", padding: "10px 24px", fontSize: 11, fontFamily: "monospace", letterSpacing: 1 }}>
          ✓ {editingId ? "RFI updated" : "RFI saved to draft queue"} — switch to Queue tab to file or export
        </div>
      )}
      {editingId && (
        <div style={{ background: "#6366f122", borderBottom: "1px solid #6366f155", color: "#818cf8", padding: "8px 24px", fontSize: 11, fontFamily: "monospace", letterSpacing: 1 }}>
          ✎ Editing RFI-{String(form.rfiNumber).padStart(3, "0")} — make your changes and save back to queue
        </div>
      )}

      <div style={{ maxWidth: 720, margin: "0 auto", padding: "28px 20px" }}>
        {tab === "form" && (
          <>
            <ScoreBar score={score} />

            {/* Section 1: Identity */}
            <div style={{ marginBottom: 32 }}>
              <SectionDivider n="01" label="IDENTITY" />
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14 }}>
                <Field label="RFI Number" required>
                  <input type="number" value={form.rfiNumber} onChange={e => set("rfiNumber", e.target.value)} placeholder="e.g. 042" style={inputStyle} />
                </Field>
                <Field label="Date Raised">
                  <input type="date" value={form.dateRaised} onChange={e => set("dateRaised", e.target.value)} style={inputStyle} />
                </Field>
                <Field label="RFI Status">
                  <SelectField value={form.status} onChange={v => set("status", v)} options={STATUS_OPTIONS} />
                </Field>
              </div>
              <Field label="Project" required hint="Select from active Notion projects">
                <SelectField value={form.project} onChange={v => set("project", v)} options={projects} placeholder="Select project..." />
              </Field>
              {/* Related Item — appears after project is selected; fetched from Notion Tasks DB */}
              {form.project && (
                <Field label="Related Item" hint="Links project in Notion via Related Item(s) — excludes PCSA items">
                  <div style={{ position: "relative" }}>
                    <select
                      value={form.relatedItemId}
                      onChange={e => {
                        const item = relatedItems.find(i => i.id === e.target.value);
                        setForm(f => ({ ...f, relatedItemId: e.target.value, relatedItemName: item?.name || "" }));
                      }}
                      disabled={relatedItemsLoading || (!canLoadItems && !relatedItemsLoading)}
                      style={{ ...selectStyle, paddingRight: 32, opacity: relatedItemsLoading ? 0.6 : 1 }}
                    >
                      <option value="">
                        {relatedItemsLoading ? "Loading items…" : !canLoadItems ? "Deploy app to load items" : relatedItems.length === 0 ? "No items found for this project" : "Select item…"}
                      </option>
                      {relatedItems.map(item => (
                        <option key={item.id} value={item.id}>{item.name}</option>
                      ))}
                    </select>
                    <span style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", color: "#4a5568", pointerEvents: "none", fontSize: 10 }}>&#9660;</span>
                  </div>
                </Field>
              )}
              <Field label="RFI Subject" required hint="Short title shown on export">
                <input type="text" value={form.rfiTitle} onChange={e => set("rfiTitle", e.target.value)}
                  placeholder="e.g. LIN-814 recessed metal trim vs door interface" style={inputStyle} />
              </Field>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                <Field label="Category" hint="RFI type for export header">
                  <SelectField value={form.category} onChange={v => set("category", v)} options={CATEGORY_OPTIONS} placeholder="Select category..." />
                </Field>
                <Field label="Source of RFI" required>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {SOURCE_OPTIONS.map(opt => (
                      <button key={opt} onClick={() => set("source", opt)} style={{
                        padding: "7px 10px", borderRadius: 3, border: "1px solid",
                        cursor: "pointer", fontSize: 10, fontWeight: 700,
                        fontFamily: "monospace", letterSpacing: 0.5, transition: "all 0.15s",
                        background: form.source === opt ? "#0d1f33" : "#0d1117",
                        borderColor: form.source === opt ? "#38bdf8" : "#21303f",
                        color: form.source === opt ? "#38bdf8" : "#4a5568",
                      }}>{opt}</button>
                    ))}
                  </div>
                </Field>
              </div>
            </div>

            {/* Section 2: The Request */}
            <div style={{ marginBottom: 32 }}>
              <SectionDivider n="02" label="THE REQUEST" />
              <Field label="RFI Description" required hint="Full detail of the issue or query">
                <textarea value={form.description} onChange={e => set("description", e.target.value)}
                  placeholder="Describe the information required, the issue, or the ambiguity to be resolved..."
                  rows={6} style={{ ...inputStyle, resize: "vertical", lineHeight: 1.6 }} />
              </Field>
              <Field label="TBC By" required hint="Who must respond?">
                <SelectField value={form.tbcBy} onChange={v => set("tbcBy", v)} options={TBC_OPTIONS} placeholder="Select responsible party..." />
              </Field>
              <Field label="Urgency">
                <div style={{ display: "flex", gap: 6 }}>
                  {URGENCY_OPTIONS.map(opt => (
                    <button key={opt} onClick={() => set("urgency", opt)} style={{
                      flex: 1, padding: "9px 0", borderRadius: 3, border: "1px solid",
                      cursor: "pointer", fontSize: 11, fontWeight: 700,
                      fontFamily: "monospace", textTransform: "uppercase", letterSpacing: 0.5,
                      transition: "all 0.15s",
                      background: form.urgency === opt ? URGENCY_COLORS[opt] + "22" : "#0d1117",
                      borderColor: form.urgency === opt ? URGENCY_COLORS[opt] : "#21303f",
                      color: form.urgency === opt ? URGENCY_COLORS[opt] : "#4a5568",
                    }}>{opt}</button>
                  ))}
                </div>
              </Field>
            </div>

            {/* Section 3: Attachments */}
            <div style={{ marginBottom: 32 }}>
              <SectionDivider n="03" label="ATTACHMENTS" />
              <Field label="Additional Notes">
                <textarea value={form.additionalNotes} onChange={e => set("additionalNotes", e.target.value)}
                  placeholder="Any additional context, constraints, or commentary..."
                  rows={3} style={{ ...inputStyle, resize: "vertical", lineHeight: 1.6 }} />
              </Field>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
                <button onClick={handleScreenCapture} style={{
                  background: "#0d1117", border: "1px dashed #374151", color: "#6b7280",
                  borderRadius: 4, padding: "16px", fontSize: 11, fontWeight: 700,
                  fontFamily: "monospace", cursor: "pointer", letterSpacing: 1, textTransform: "uppercase"
                }}>⊞ Screen Capture</button>
                <button onClick={() => fileInputRef.current.click()} style={{
                  background: "#0d1117", border: "1px dashed #374151", color: "#6b7280",
                  borderRadius: 4, padding: "16px", fontSize: 11, fontWeight: 700,
                  fontFamily: "monospace", cursor: "pointer", letterSpacing: 1, textTransform: "uppercase"
                }}>⊕ Upload File / Image</button>
              </div>
              <input ref={fileInputRef} type="file" accept="*/*" style={{ display: "none" }} onChange={handleFileUpload} />
              {form.attachment && (
                <div style={{ position: "relative", border: "1px solid #21303f", borderRadius: 4, overflow: "hidden" }}>
                  {isAttachmentImage
                    ? <img src={form.attachment.dataUrl} alt="attachment" style={{ width: "100%", display: "block" }} />
                    : <div style={{ padding: "16px 20px", display: "flex", alignItems: "center", gap: 12, background: "#0d1117" }}>
                        <span style={{ fontSize: 28 }}>📎</span>
                        <div>
                          <div style={{ fontSize: 12, color: "#e2eaf3", fontFamily: "monospace", fontWeight: 700 }}>{form.attachment.name}</div>
                          <div style={{ fontSize: 10, color: "#4a5568", fontFamily: "monospace", marginTop: 2, textTransform: "uppercase", letterSpacing: 1 }}>{form.attachment.type || "File"}</div>
                        </div>
                      </div>
                  }
                  <button onClick={() => set("attachment", null)} style={{
                    position: "absolute", top: 8, right: 8, background: "#0d1117cc",
                    border: "1px solid #374151", color: "#f87171", borderRadius: 3,
                    padding: "4px 8px", fontSize: 11, cursor: "pointer", fontFamily: "monospace", fontWeight: 700
                  }}>✕ Remove</button>
                </div>
              )}
            </div>

            {/* Actions */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, paddingTop: 8, borderTop: "1px solid #21303f" }}>
              <button onClick={handleAddToDraft} style={{
                background: editingId ? "#1a1a2e" : "#0d1f33",
                border: `1px solid ${editingId ? "#6366f1" : "#38bdf8"}`,
                color: editingId ? "#818cf8" : "#38bdf8",
                borderRadius: 4, padding: "14px", fontSize: 12, fontWeight: 700,
                fontFamily: "monospace", cursor: "pointer", letterSpacing: 1.5, textTransform: "uppercase"
              }}>{editingId ? "✎ Update Draft" : "→ Save to Draft Queue"}</button>
              <button onClick={() => {
                if (!form.rfiNumber || !form.rfiTitle || !form.project || !form.description || !form.tbcBy) {
                  alert("Complete required fields (RFI Number, Project, Subject, Description, TBC By) first.");
                  return;
                }
                setExportRfi({ ...form, id: editingId || Date.now() });
              }} style={{
                background: "#0d1117", border: "1px solid #374151", color: "#6b7280",
                borderRadius: 4, padding: "14px", fontSize: 12, fontWeight: 700,
                fontFamily: "monospace", cursor: "pointer", letterSpacing: 1.5, textTransform: "uppercase"
              }}>Preview and Export</button>
            </div>
            <div style={{ marginTop: 10, padding: "9px 12px", background: "#0d1117", border: "1px solid #21303f", borderRadius: 4 }}>
              <div style={{ fontSize: 10, color: "#374151" }}>
                Required: RFI Number, Project, Subject, Description, TBC By · Drafts persist across page refreshes
              </div>
            </div>
          </>
        )}

        {tab === "queue" && (
          <>
            {/* Project Filter */}
            {queueProjects.length > 0 && (
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
                <span style={{ fontSize: 10, color: "#4a5568", fontFamily: "monospace", letterSpacing: 1, textTransform: "uppercase", flexShrink: 0 }}>Filter:</span>
                <button onClick={() => setQueueProjectFilter("")} style={{
                  background: !queueProjectFilter ? "#0d1f33" : "transparent",
                  border: `1px solid ${!queueProjectFilter ? "#38bdf8" : "#374151"}`,
                  color: !queueProjectFilter ? "#38bdf8" : "#4a5568",
                  borderRadius: 3, padding: "4px 10px", fontSize: 10, fontFamily: "monospace", cursor: "pointer",
                }}>All</button>
                {queueProjects.map(p => (
                  <button key={p} onClick={() => setQueueProjectFilter(p === queueProjectFilter ? "" : p)} style={{
                    background: queueProjectFilter === p ? "#0d1f33" : "transparent",
                    border: `1px solid ${queueProjectFilter === p ? "#38bdf8" : "#374151"}`,
                    color: queueProjectFilter === p ? "#38bdf8" : "#4a5568",
                    borderRadius: 3, padding: "4px 10px", fontSize: 10, fontFamily: "monospace", cursor: "pointer",
                    maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}>{p}</button>
                ))}
              </div>
            )}

            {/* Notion Open RFIs - grouped by status */}
            <div style={{ marginBottom: 28 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#e2eaf3", letterSpacing: 1 }}>OPEN IN NOTION</div>
                  <div style={{ fontSize: 10, color: "#4a5568", marginTop: 2 }}>
                    {notionRfisLoading ? "Fetching from Notion…" : filteredNotionRfis.length === 0 ? "No open RFIs" : `${filteredNotionRfis.length} RFI${filteredNotionRfis.length > 1 ? "s" : ""} — not closed`}
                  </div>
                </div>
                <button onClick={() => {
                  setNotionRfisLoading(true);
                  fetch("/.netlify/functions/get-open-rfis")
                    .then(r => r.json())
                    .then(data => { setNotionRfis(data.rfis || []); setNotionRfisLoading(false); })
                    .catch(() => setNotionRfisLoading(false));
                }} style={{
                  background: "transparent", border: "1px solid #374151", color: "#6b7280",
                  borderRadius: 3, padding: "7px 12px", fontSize: 10, fontWeight: 700,
                  fontFamily: "monospace", cursor: "pointer", letterSpacing: 1, textTransform: "uppercase"
                }}>↺ Refresh</button>
              </div>
              {notionRfisLoading ? (
                <div style={{ padding: "20px 0", textAlign: "center", fontSize: 10, color: "#374151", fontFamily: "monospace", letterSpacing: 2 }}>LOADING…</div>
              ) : filteredNotionRfis.length === 0 ? (
                <div style={{ border: "1px dashed #21303f", borderRadius: 4, padding: "20px 24px", textAlign: "center", color: "#374151", fontSize: 10, fontFamily: "monospace", letterSpacing: 1 }}>
                  {notionRfis.length > 0 ? "No RFIs match the current filter" : "All clear — no open RFIs in Notion"}
                </div>
              ) : (
                (() => {
                  const knownOrder = ["Raise", "Open", "Close Out"];
                  const extra = [...new Set(filteredNotionRfis.map(r => r.status).filter(s => !knownOrder.includes(s)))];
                  const statusColors = { Raise: "#38bdf8", Open: "#4ade80", "Close Out": "#facc15" };
                  return [...knownOrder, ...extra]
                    .filter(status => filteredNotionRfis.some(r => r.status === status))
                    .map(status => {
                      const group = filteredNotionRfis.filter(r => r.status === status);
                      const sc = statusColors[status] || "#94a3b8";
                      return (
                        <div key={status} style={{ marginBottom: 18 }}>
                          <div style={{ fontSize: 9, letterSpacing: 2, textTransform: "uppercase", fontFamily: "monospace", marginBottom: 8, display: "flex", alignItems: "center", gap: 8 }}>
                            <span style={{ color: "#21303f" }}>──</span>
                            <span style={{ color: sc, fontWeight: 700 }}>{status}</span>
                            <span style={{ color: "#374151" }}>({group.length})</span>
                            <span style={{ color: "#21303f", flex: 1 }}>{"─".repeat(30)}</span>
                          </div>
                          {group.map(rfi => (
                            <NotionRfiItem key={rfi.notionId} rfi={rfi} closeState={closeOutState[rfi.notionId]} onCloseOut={handleCloseOut} />
                          ))}
                        </div>
                      );
                    });
                })()
              )}
            </div>

            {/* Draft Queue */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#e2eaf3", letterSpacing: 1 }}>DRAFT QUEUE</div>
                <div style={{ fontSize: 10, color: "#4a5568", marginTop: 2 }}>
                  {filteredQueue.length === 0 ? "No drafts" : `${filteredQueue.length} RFI${filteredQueue.length > 1 ? "s" : ""} ready to file or export`}
                </div>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                {queue.length > 0 && (
                  <button onClick={() => { if (window.confirm("Clear all drafts from local cache?")) setQueue([]); }} style={{
                    background: "transparent", border: "1px solid #374151", color: "#6b7280",
                    borderRadius: 3, padding: "7px 12px", fontSize: 10, fontWeight: 700,
                    fontFamily: "monospace", cursor: "pointer", letterSpacing: 1, textTransform: "uppercase"
                  }}>Clear Cache</button>
                )}
                <button onClick={() => window.open(NOTION_DB_URL, "_blank")} style={{
                  background: "transparent", border: "1px solid #374151", color: "#6b7280",
                  borderRadius: 3, padding: "7px 12px", fontSize: 10, fontWeight: 700,
                  fontFamily: "monospace", cursor: "pointer", letterSpacing: 1, textTransform: "uppercase"
                }}>Open Notion DB</button>
              </div>
            </div>
            {filteredQueue.length === 0 ? (
              <div style={{ border: "1px dashed #21303f", borderRadius: 4, padding: "40px 24px", textAlign: "center", color: "#374151" }}>
                <div style={{ fontSize: 36, marginBottom: 12 }}>◫</div>
                <div style={{ fontSize: 11, letterSpacing: 2, textTransform: "uppercase" }}>{queue.length === 0 ? "Queue is empty" : "No drafts match filter"}</div>
                <div style={{ fontSize: 10, marginTop: 6 }}>{queue.length === 0 ? "Fill in the New RFI form and save to draft queue" : "Try a different project filter"}</div>
              </div>
            ) : (
              filteredQueue.map(rfi => (
                <DraftQueueItem key={rfi.id} rfi={rfi} onRemove={handleRemove} onExport={setExportRfi}
                  onEdit={handleEdit} notionStatus={notionState[rfi.id]} onFileToNotion={handleFileToNotion} />
              ))
            )}
            {filteredQueue.length > 0 && (
              <div style={{ marginTop: 14, padding: "9px 12px", background: "#0d1117", border: "1px solid #21303f", borderRadius: 4 }}>
                <div style={{ fontSize: 10, color: "#374151" }}>
                  <span style={{ color: "#818cf8" }}>Edit</span> to revise · <span style={{ color: "#60a5fa" }}>Export</span> for A4 PDF · <span style={{ color: "#4ade80" }}>→ Notion</span> files to database · <span style={{ color: "#4ade80" }}>↗ Open</span> jumps to filed page
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {exportRfi && <PrintView rfi={exportRfi} onClose={() => setExportRfi(null)} logoDataUrl={logoDataUrl} />}
    </div>
  );
}

function SectionDivider({ n, label }) {
  return (
    <div style={{ fontSize: 9, color: "#374151", letterSpacing: 3, textTransform: "uppercase", marginBottom: 16, display: "flex", alignItems: "center", gap: 10 }}>
      <span style={{ color: "#21303f", flex: "0 0 auto" }}>──────</span>
      <span style={{ color: "#4a5568", flex: "0 0 auto" }}>{n} {label}</span>
      <span style={{ color: "#21303f", flex: 1, overflow: "hidden" }}>{"─".repeat(40)}</span>
    </div>
  );
}
