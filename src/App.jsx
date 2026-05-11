import { useState, useRef } from "react";

const NOTION_DB_URL = "https://www.notion.so/22d210e4582e80189f63f2cee93be4b3";

const TBC_OPTIONS = ["Structural Engineer", "Design Consultant", "Main Contractor", "M&E", "Architect"];
const STATUS_OPTIONS = ["Raise", "Open", "Close Out", "Closed"];
const SOURCE_OPTIONS = ["Meeting Minutes", "Drawing Comment", "Site Observation", "Manual Input", "Sketch"];
const URGENCY_OPTIONS = ["Low", "Medium", "High", "Critical"];
const URGENCY_COLORS = { Low: "#4ade80", Medium: "#facc15", High: "#fb923c", Critical: "#f87171" };

const initialForm = {
  rfiNumber: "",
  dateRaised: new Date().toISOString().split("T")[0],
  status: "Raise",
  description: "",
  tbcBy: "",
  source: "",
  urgency: "Medium",
  additionalNotes: "",
  screenCapture: null,
};

function completionScore(form) {
  const required = ["rfiNumber", "description", "tbcBy", "source", "urgency"];
  const optional = ["additionalNotes"];
  let score = 0;
  required.forEach(k => { if (form[k]) score += 18; });
  optional.forEach(k => { if (form[k]) score += 5; });
  if (form.screenCapture) score += 5;
  return Math.min(score, 100);
}

function Badge({ color, children }) {
  return (
    <span style={{
      background: color + "22", color,
      border: `1px solid ${color}55`,
      borderRadius: 3, padding: "2px 8px",
      fontSize: 11, fontFamily: "monospace",
      letterSpacing: 1, fontWeight: 700, textTransform: "uppercase",
    }}>{children}</span>
  );
}

function Field({ label, required, hint, children }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <label style={{
        display: "flex", alignItems: "center", gap: 6,
        fontSize: 11, fontWeight: 700, letterSpacing: 1.5,
        textTransform: "uppercase", color: "#8a9bb0", marginBottom: 6,
        fontFamily: "monospace"
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
  width: "100%", boxSizing: "border-box",
  background: "#0d1117", border: "1px solid #21303f",
  color: "#e2eaf3", borderRadius: 4, padding: "9px 12px",
  fontSize: 13, fontFamily: "'IBM Plex Mono', monospace",
  outline: "none", transition: "border-color 0.15s",
};

const selectStyle = { ...inputStyle, cursor: "pointer", appearance: "none" };

function SelectField({ value, onChange, options, placeholder }) {
  return (
    <div style={{ position: "relative" }}>
      <select value={value} onChange={e => onChange(e.target.value)}
        style={{ ...selectStyle, paddingRight: 32 }}>
        <option value="">{placeholder || "Select..."}</option>
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
      <span style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", color: "#4a5568", pointerEvents: "none", fontSize: 10 }}>▼</span>
    </div>
  );
}

function ScoreBar({ score }) {
  const color = score < 40 ? "#f87171" : score < 70 ? "#facc15" : "#4ade80";
  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
        <span style={{ fontSize: 10, fontFamily: "monospace", color: "#4a5568", letterSpacing: 1.5, textTransform: "uppercase" }}>
          Form Completeness
        </span>
        <span style={{ fontSize: 12, fontFamily: "monospace", color, fontWeight: 700 }}>{score}%</span>
      </div>
      <div style={{ height: 3, background: "#0d1117", borderRadius: 2, border: "1px solid #21303f" }}>
        <div style={{ height: "100%", width: `${score}%`, background: color, borderRadius: 2, transition: "width 0.4s ease, background 0.3s" }} />
      </div>
    </div>
  );
}

function DraftQueueItem({ rfi, onRemove, onExport }) {
  return (
    <div style={{
      background: "#0d1117", border: "1px solid #21303f", borderRadius: 4,
      padding: "12px 14px", marginBottom: 8,
      display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
          <span style={{ fontFamily: "monospace", fontSize: 11, color: "#38bdf8", fontWeight: 700 }}>
            RFI-{String(rfi.rfiNumber).padStart(3, "0")}
          </span>
          <Badge color={URGENCY_COLORS[rfi.urgency]}>{rfi.urgency}</Badge>
          <Badge color="#94a3b8">{rfi.status}</Badge>
        </div>
        <div style={{ fontSize: 12, color: "#8a9bb0", fontFamily: "monospace", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {rfi.description || "No description"}
        </div>
        <div style={{ fontSize: 10, color: "#374151", fontFamily: "monospace", marginTop: 3 }}>
          TBC: {rfi.tbcBy || "—"} · {rfi.dateRaised}
        </div>
      </div>
      <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
        <button onClick={() => onExport(rfi)} style={{
          background: "#1e3a5f", border: "1px solid #2563eb", color: "#60a5fa",
          borderRadius: 3, padding: "5px 10px", fontSize: 10, fontWeight: 700,
          fontFamily: "monospace", cursor: "pointer", letterSpacing: 1, textTransform: "uppercase"
        }}>Export</button>
        <button onClick={() => window.open(NOTION_DB_URL, "_blank")} style={{
          background: "#1a2e1a", border: "1px solid #16a34a", color: "#4ade80",
          borderRadius: 3, padding: "5px 10px", fontSize: 10, fontWeight: 700,
          fontFamily: "monospace", cursor: "pointer", letterSpacing: 1, textTransform: "uppercase"
        }}>File ↗</button>
        <button onClick={() => onRemove(rfi.id)} style={{
          background: "transparent", border: "1px solid #374151", color: "#6b7280",
          borderRadius: 3, padding: "5px 10px", fontSize: 10, fontWeight: 700,
          fontFamily: "monospace", cursor: "pointer"
        }}>✕</button>
      </div>
    </div>
  );
}

function PrintView({ rfi, onClose }) {
  const handleExportPDF = () => {
    const w = window.open("", "_blank");
    w.document.write(`
      <html><head><title>RFI-${String(rfi.rfiNumber).padStart(3,"0")}</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Courier New', monospace; background: #fff; color: #111; padding: 40px; }
        .header { border-bottom: 3px solid #111; padding-bottom: 16px; margin-bottom: 24px; display: flex; justify-content: space-between; align-items: flex-end; }
        .title { font-size: 26px; font-weight: 900; letter-spacing: -1px; }
        .rfi-num { font-size: 13px; color: #555; margin-top: 4px; }
        .urgency-badge { display: inline-block; border: 2px solid #111; padding: 3px 12px; font-size: 11px; font-weight: 900; letter-spacing: 2px; text-transform: uppercase; }
        .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 24px; }
        .field { border: 1px solid #ddd; padding: 10px 12px; }
        .label { font-size: 9px; font-weight: 700; letter-spacing: 2px; text-transform: uppercase; color: #888; margin-bottom: 4px; }
        .value { font-size: 13px; font-weight: 600; }
        .desc { border: 1px solid #ddd; padding: 16px; margin-bottom: 24px; min-height: 100px; font-size: 13px; line-height: 1.7; }
        .notes { border: 1px solid #eee; padding: 14px; background: #fafafa; font-size: 12px; line-height: 1.6; color: #444; margin-bottom: 24px; }
        img { max-width: 100%; margin-top: 10px; border: 1px solid #ddd; }
        .footer { border-top: 2px solid #111; padding-top: 16px; margin-top: 40px; font-size: 10px; color: #999; display: flex; justify-content: space-between; }
        @media print { button { display: none; } }
      </style></head><body>
      <div class="header">
        <div>
          <div class="title">REQUEST FOR INFORMATION</div>
          <div class="rfi-num">RFI No. ${String(rfi.rfiNumber).padStart(3,"0")} &nbsp;·&nbsp; ${rfi.source || "Manual Input"} &nbsp;·&nbsp; ${rfi.dateRaised}</div>
        </div>
        <div style="text-align:right">
          <div class="urgency-badge">${rfi.urgency}</div>
          <div style="font-size:11px;margin-top:6px;color:#888;letter-spacing:1px;text-transform:uppercase">${rfi.status}</div>
        </div>
      </div>
      <div class="grid">
        <div class="field"><div class="label">Date Raised</div><div class="value">${rfi.dateRaised}</div></div>
        <div class="field"><div class="label">TBC By</div><div class="value">${rfi.tbcBy || "—"}</div></div>
        <div class="field"><div class="label">Source</div><div class="value">${rfi.source || "—"}</div></div>
        <div class="field"><div class="label">Status</div><div class="value">${rfi.status}</div></div>
      </div>
      <div class="label" style="margin-bottom:8px">RFI Description</div>
      <div class="desc">${rfi.description}</div>
      ${rfi.additionalNotes ? `<div class="label" style="margin-bottom:8px">Additional Notes</div><div class="notes">${rfi.additionalNotes}</div>` : ""}
      ${rfi.screenCapture ? `<div class="label" style="margin-bottom:8px">Attachment</div><img src="${rfi.screenCapture}" />` : ""}
      <div class="footer">
        <span>Generated ${new Date().toLocaleString()}</span>
        <span>RFI-${String(rfi.rfiNumber).padStart(3,"0")} · DRAFT — NOT FOR CONSTRUCTION</span>
      </div>
      </body></html>
    `);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 500);
  };

  const handleExportPNG = () => {
    const canvas = document.createElement("canvas");
    canvas.width = 900;
    canvas.height = 700;
    const ctx = canvas.getContext("2d");

    // Background
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Header bar
    ctx.fillStyle = "#111111";
    ctx.fillRect(0, 0, canvas.width, 6);

    // Title
    ctx.font = "bold 24px 'Courier New'";
    ctx.fillStyle = "#111111";
    ctx.fillText("REQUEST FOR INFORMATION", 44, 54);

    ctx.font = "12px 'Courier New'";
    ctx.fillStyle = "#666666";
    ctx.fillText(`RFI-${String(rfi.rfiNumber).padStart(3,"0")}  ·  ${rfi.source || "Manual"}  ·  ${rfi.dateRaised}`, 44, 74);

    // Urgency badge
    ctx.strokeStyle = "#111";
    ctx.lineWidth = 2;
    ctx.strokeRect(740, 32, 120, 28);
    ctx.font = "bold 11px 'Courier New'";
    ctx.fillStyle = "#111";
    ctx.textAlign = "center";
    ctx.fillText(rfi.urgency.toUpperCase(), 800, 51);
    ctx.textAlign = "left";

    // Divider
    ctx.strokeStyle = "#111";
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(44, 90); ctx.lineTo(856, 90); ctx.stroke();

    // Info grid
    const fields = [
      ["Date Raised", rfi.dateRaised, 44, 130],
      ["TBC By", rfi.tbcBy || "—", 280, 130],
      ["Source", rfi.source || "—", 520, 130],
      ["Status", rfi.status, 760, 130],
    ];
    fields.forEach(([label, val, x, y]) => {
      ctx.font = "bold 9px 'Courier New'";
      ctx.fillStyle = "#999999";
      ctx.fillText(label.toUpperCase(), x, y - 14);
      ctx.strokeStyle = "#eeeeee";
      ctx.lineWidth = 1;
      ctx.strokeRect(x - 4, y - 28, 210, 36);
      ctx.font = "bold 13px 'Courier New'";
      ctx.fillStyle = "#111111";
      ctx.fillText(val, x, y);
    });

    // Description
    ctx.font = "bold 9px 'Courier New'";
    ctx.fillStyle = "#999999";
    ctx.fillText("RFI DESCRIPTION", 44, 196);
    ctx.strokeStyle = "#dddddd";
    ctx.lineWidth = 1;
    ctx.strokeRect(44, 204, 812, 120);

    ctx.font = "13px 'Courier New'";
    ctx.fillStyle = "#111111";
    const words = (rfi.description || "").split(" ");
    let line = "", ly = 226;
    words.forEach(w => {
      const test = line + w + " ";
      if (ctx.measureText(test).width > 780 && line) {
        ctx.fillText(line.trim(), 58, ly); ly += 20; line = w + " ";
      } else line = test;
    });
    if (line) ctx.fillText(line.trim(), 58, ly);

    // Notes
    if (rfi.additionalNotes) {
      ctx.font = "bold 9px 'Courier New'";
      ctx.fillStyle = "#999999";
      ctx.fillText("ADDITIONAL NOTES", 44, 350);
      ctx.strokeStyle = "#eeeeee";
      ctx.lineWidth = 1;
      ctx.strokeRect(44, 358, 812, 60);
      ctx.font = "12px 'Courier New'";
      ctx.fillStyle = "#444444";
      ctx.fillText(rfi.additionalNotes.substring(0, 110), 58, 382);
    }

    // Footer
    ctx.strokeStyle = "#111";
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(44, 640); ctx.lineTo(856, 640); ctx.stroke();
    ctx.font = "10px 'Courier New'";
    ctx.fillStyle = "#aaaaaa";
    ctx.fillText(`Generated ${new Date().toLocaleString()}`, 44, 660);
    ctx.textAlign = "right";
    ctx.fillText(`RFI-${String(rfi.rfiNumber).padStart(3,"0")} · DRAFT — NOT FOR CONSTRUCTION`, 856, 660);

    const link = document.createElement("a");
    link.download = `RFI-${String(rfi.rfiNumber).padStart(3,"0")}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
  };

  return (
    <div style={{
      position: "fixed", inset: 0, background: "#000000cc", zIndex: 1000,
      display: "flex", alignItems: "center", justifyContent: "center", padding: 20
    }}>
      <div style={{
        background: "#111827", border: "1px solid #21303f", borderRadius: 6,
        width: "100%", maxWidth: 580, maxHeight: "90vh", overflow: "auto"
      }}>
        <div style={{ padding: "16px 20px", borderBottom: "1px solid #21303f", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontFamily: "monospace", fontWeight: 700, color: "#e2eaf3", fontSize: 13, letterSpacing: 1 }}>
            EXPORT — RFI-{String(rfi.rfiNumber).padStart(3, "0")}
          </span>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "#4a5568", cursor: "pointer", fontSize: 18 }}>✕</button>
        </div>
        <div style={{ padding: 20 }}>
          {/* Preview */}
          <div style={{ background: "#0d1117", border: "1px solid #21303f", borderRadius: 4, padding: 20, marginBottom: 20 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
              <div>
                <div style={{ fontFamily: "monospace", fontSize: 18, fontWeight: 900, color: "#e2eaf3", letterSpacing: -0.5 }}>
                  REQUEST FOR INFORMATION
                </div>
                <div style={{ fontFamily: "monospace", fontSize: 10, color: "#4a5568", marginTop: 3 }}>
                  RFI-{String(rfi.rfiNumber).padStart(3, "0")} · {rfi.source || "Manual"} · {rfi.dateRaised}
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <Badge color={URGENCY_COLORS[rfi.urgency]}>{rfi.urgency}</Badge>
                <div style={{ marginTop: 5 }}><Badge color="#94a3b8">{rfi.status}</Badge></div>
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
              {[["TBC By", rfi.tbcBy], ["Source", rfi.source], ["Date Raised", rfi.dateRaised], ["Status", rfi.status]].map(([l, v]) => (
                <div key={l} style={{ background: "#111827", border: "1px solid #21303f", padding: 8, borderRadius: 3 }}>
                  <div style={{ fontFamily: "monospace", fontSize: 9, color: "#4a5568", letterSpacing: 2, textTransform: "uppercase", marginBottom: 3 }}>{l}</div>
                  <div style={{ fontFamily: "monospace", fontSize: 12, color: "#e2eaf3", fontWeight: 600 }}>{v || "—"}</div>
                </div>
              ))}
            </div>
            <div style={{ background: "#111827", border: "1px solid #21303f", padding: 12, borderRadius: 3, marginBottom: rfi.additionalNotes || rfi.screenCapture ? 12 : 0 }}>
              <div style={{ fontFamily: "monospace", fontSize: 9, color: "#4a5568", letterSpacing: 2, textTransform: "uppercase", marginBottom: 6 }}>Description</div>
              <div style={{ fontFamily: "monospace", fontSize: 12, color: "#e2eaf3", lineHeight: 1.6 }}>{rfi.description}</div>
            </div>
            {rfi.additionalNotes && (
              <div style={{ background: "#111827", border: "1px solid #21303f", padding: 12, borderRadius: 3, marginBottom: rfi.screenCapture ? 12 : 0 }}>
                <div style={{ fontFamily: "monospace", fontSize: 9, color: "#4a5568", letterSpacing: 2, textTransform: "uppercase", marginBottom: 6 }}>Notes</div>
                <div style={{ fontFamily: "monospace", fontSize: 11, color: "#8a9bb0", lineHeight: 1.6 }}>{rfi.additionalNotes}</div>
              </div>
            )}
            {rfi.screenCapture && (
              <div>
                <div style={{ fontFamily: "monospace", fontSize: 9, color: "#4a5568", letterSpacing: 2, textTransform: "uppercase", marginBottom: 6 }}>Attachment</div>
                <img src={rfi.screenCapture} alt="capture" style={{ width: "100%", borderRadius: 3, border: "1px solid #21303f" }} />
              </div>
            )}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <button onClick={handleExportPDF} style={{
              background: "#1e1b4b", border: "1px solid #4f46e5", color: "#a78bfa",
              borderRadius: 4, padding: "13px", fontSize: 12, fontWeight: 700,
              fontFamily: "monospace", cursor: "pointer", letterSpacing: 1, textTransform: "uppercase"
            }}>⬇ Export PDF</button>
            <button onClick={handleExportPNG} style={{
              background: "#1a2e1a", border: "1px solid #16a34a", color: "#4ade80",
              borderRadius: 4, padding: "13px", fontSize: 12, fontWeight: 700,
              fontFamily: "monospace", cursor: "pointer", letterSpacing: 1, textTransform: "uppercase"
            }}>⬇ Export PNG</button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function RFIGenerator() {
  const [form, setForm] = useState(initialForm);
  const [queue, setQueue] = useState([]);
  const [tab, setTab] = useState("form");
  const [exportRfi, setExportRfi] = useState(null);
  const [saved, setSaved] = useState(false);
  const fileInputRef = useRef();

  const set = (key, val) => setForm(f => ({ ...f, [key]: val }));
  const score = completionScore(form);

  const handleAddToDraft = () => {
    if (!form.rfiNumber || !form.description || !form.tbcBy) {
      alert("Please fill in RFI Number, Description, and TBC By before saving.");
      return;
    }
    setQueue(q => [{ ...form, id: Date.now() }, ...q]);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
    setForm({ ...initialForm });
    setTab("queue");
  };

  const handleRemove = (id) => setQueue(q => q.filter(r => r.id !== id));

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => set("screenCapture", ev.target.result);
    reader.readAsDataURL(file);
  };

  const handleScreenCapture = async () => {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
      const video = document.createElement("video");
      video.srcObject = stream;
      await video.play();
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      canvas.getContext("2d").drawImage(video, 0, 0);
      stream.getTracks().forEach(t => t.stop());
      set("screenCapture", canvas.toDataURL("image/png"));
    } catch {
      alert("Screen capture requires browser permission. Try image upload instead.");
    }
  };

  return (
    <div style={{ minHeight: "100vh", background: "#070c12", fontFamily: "'IBM Plex Mono', 'Courier New', monospace", color: "#e2eaf3" }}>
      <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;700&display=swap" rel="stylesheet" />

      {/* Header */}
      <div style={{ borderBottom: "1px solid #21303f", padding: "0 24px", display: "flex", alignItems: "stretch", justifyContent: "space-between", background: "#0d1117" }}>
        <div style={{ padding: "16px 0" }}>
          <div style={{ fontSize: 11, color: "#38bdf8", letterSpacing: 3, textTransform: "uppercase", fontWeight: 700 }}>◈ RFI GENERATOR</div>
          <div style={{ fontSize: 10, color: "#374151", marginTop: 2, letterSpacing: 1 }}>Notion-linked · Draft Queue System</div>
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
          ✓ RFI saved to draft queue — switch to Queue tab to file or export
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
                  <input type="number" value={form.rfiNumber} onChange={e => set("rfiNumber", e.target.value)}
                    placeholder="e.g. 042" style={inputStyle} />
                </Field>
                <Field label="Date Raised">
                  <input type="date" value={form.dateRaised} onChange={e => set("dateRaised", e.target.value)} style={inputStyle} />
                </Field>
                <Field label="RFI Status">
                  <SelectField value={form.status} onChange={v => set("status", v)} options={STATUS_OPTIONS} />
                </Field>
              </div>
              <Field label="Source of RFI" required>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {SOURCE_OPTIONS.map(opt => (
                    <button key={opt} onClick={() => set("source", opt)} style={{
                      padding: "7px 12px", borderRadius: 3, border: "1px solid",
                      cursor: "pointer", fontSize: 11, fontWeight: 700,
                      fontFamily: "monospace", letterSpacing: 0.5, transition: "all 0.15s",
                      background: form.source === opt ? "#0d1f33" : "#0d1117",
                      borderColor: form.source === opt ? "#38bdf8" : "#21303f",
                      color: form.source === opt ? "#38bdf8" : "#4a5568",
                    }}>{opt}</button>
                  ))}
                </div>
              </Field>
            </div>

            {/* Section 2: The Request */}
            <div style={{ marginBottom: 32 }}>
              <SectionDivider n="02" label="THE REQUEST" />
              <Field label="RFI Description" required hint="What needs clarification?">
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
                  fontFamily: "monospace", cursor: "pointer", letterSpacing: 1,
                  textTransform: "uppercase", transition: "all 0.15s"
                }}>⊞ Screen Capture</button>
                <button onClick={() => fileInputRef.current.click()} style={{
                  background: "#0d1117", border: "1px dashed #374151", color: "#6b7280",
                  borderRadius: 4, padding: "16px", fontSize: 11, fontWeight: 700,
                  fontFamily: "monospace", cursor: "pointer", letterSpacing: 1,
                  textTransform: "uppercase", transition: "all 0.15s"
                }}>⊕ Upload Image / Sketch</button>
              </div>
              <input ref={fileInputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handleImageUpload} />
              {form.screenCapture && (
                <div style={{ position: "relative" }}>
                  <img src={form.screenCapture} alt="attachment" style={{ width: "100%", borderRadius: 4, border: "1px solid #21303f", display: "block" }} />
                  <button onClick={() => set("screenCapture", null)} style={{
                    position: "absolute", top: 8, right: 8,
                    background: "#0d1117cc", border: "1px solid #374151", color: "#f87171",
                    borderRadius: 3, padding: "4px 8px", fontSize: 11, cursor: "pointer",
                    fontFamily: "monospace", fontWeight: 700
                  }}>✕ Remove</button>
                </div>
              )}
            </div>

            {/* Actions */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, paddingTop: 8, borderTop: "1px solid #21303f" }}>
              <button onClick={handleAddToDraft} style={{
                background: "#0d1f33", border: "1px solid #38bdf8", color: "#38bdf8",
                borderRadius: 4, padding: "14px", fontSize: 12, fontWeight: 700,
                fontFamily: "monospace", cursor: "pointer", letterSpacing: 1.5, textTransform: "uppercase"
              }}>→ Save to Draft Queue</button>
              <button onClick={() => {
                if (!form.rfiNumber || !form.description || !form.tbcBy) {
                  alert("Complete required fields (RFI Number, Description, TBC By) first.");
                  return;
                }
                setExportRfi({ ...form, id: Date.now() });
              }} style={{
                background: "#0d1117", border: "1px solid #374151", color: "#6b7280",
                borderRadius: 4, padding: "14px", fontSize: 12, fontWeight: 700,
                fontFamily: "monospace", cursor: "pointer", letterSpacing: 1.5, textTransform: "uppercase"
              }}>⬡ Preview & Export</button>
            </div>
            <div style={{ marginTop: 10, padding: "9px 12px", background: "#0d1117", border: "1px solid #21303f", borderRadius: 4 }}>
              <div style={{ fontSize: 10, color: "#374151", letterSpacing: 0.5 }}>
                <span style={{ color: "#f87171" }}>*</span> Required: RFI Number, Description, TBC By &nbsp;·&nbsp; Drafts are stored locally in this session
              </div>
            </div>
          </>
        )}

        {tab === "queue" && (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#e2eaf3", letterSpacing: 1 }}>DRAFT QUEUE</div>
                <div style={{ fontSize: 10, color: "#4a5568", marginTop: 2 }}>
                  {queue.length === 0 ? "No drafts — create an RFI first" : `${queue.length} RFI${queue.length > 1 ? "s" : ""} ready to file or export`}
                </div>
              </div>
              {queue.length > 0 && (
                <button onClick={() => window.open(NOTION_DB_URL, "_blank")} style={{
                  background: "transparent", border: "1px solid #374151", color: "#6b7280",
                  borderRadius: 3, padding: "7px 12px", fontSize: 10, fontWeight: 700,
                  fontFamily: "monospace", cursor: "pointer", letterSpacing: 1, textTransform: "uppercase"
                }}>↗ Open Notion DB</button>
              )}
            </div>
            {queue.length === 0 ? (
              <div style={{ border: "1px dashed #21303f", borderRadius: 4, padding: "52px 24px", textAlign: "center", color: "#374151" }}>
                <div style={{ fontSize: 36, marginBottom: 12 }}>◫</div>
                <div style={{ fontSize: 11, letterSpacing: 2, textTransform: "uppercase" }}>Queue is empty</div>
                <div style={{ fontSize: 10, marginTop: 6 }}>Fill in the New RFI form and save to draft queue</div>
              </div>
            ) : (
              queue.map(rfi => (
                <DraftQueueItem key={rfi.id} rfi={rfi} onRemove={handleRemove} onExport={setExportRfi} />
              ))
            )}
            {queue.length > 0 && (
              <div style={{ marginTop: 14, padding: "9px 12px", background: "#0d1117", border: "1px solid #21303f", borderRadius: 4 }}>
                <div style={{ fontSize: 10, color: "#374151" }}>
                  <span style={{ color: "#60a5fa" }}>Export</span> to generate PDF/PNG &nbsp;·&nbsp;
                  <span style={{ color: "#4ade80" }}>File ↗</span> opens Notion to log manually &nbsp;·&nbsp;
                  Drafts persist for this session only
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {exportRfi && <PrintView rfi={exportRfi} onClose={() => setExportRfi(null)} />}
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
