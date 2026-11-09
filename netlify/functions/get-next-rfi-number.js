// Netlify function — suggests the next RFI number for a project.
// POST { projectId } → { next, highest, count }
//
// RFI numbers run per project (both live projects have their own 44–58 range), so this
// takes the highest RFI Number among RFIs whose Related Item(s) belongs to the project and
// adds one. The Drawing Review Studio allocates numbers with the same rule.

const { json, allRfis, projectItemIds } = require("../lib/rfi-common");

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return json(204, "");
  if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });
  const token = process.env.NOTION_TOKEN, rfiDb = process.env.NOTION_DB_RFIS, tasksDb = process.env.NOTION_DB_TASKS;
  if (!token || !rfiDb || !tasksDb) return json(500, { error: "Missing env vars" });

  let projectId;
  try { ({ projectId } = JSON.parse(event.body)); } catch { return json(400, { error: "Invalid body" }); }
  if (!projectId) return json(400, { error: "projectId required" });

  try {
    const [itemIds, rfis] = await Promise.all([projectItemIds(token, tasksDb, projectId), allRfis(token, rfiDb)]);
    const items = new Set(itemIds.map((id) => id.replace(/-/g, "")));
    const nums = rfis
      .filter((r) => (r.properties?.["Related Item(s)"]?.relation || []).some((rel) => items.has(rel.id.replace(/-/g, ""))))
      .map((r) => r.properties?.["RFI Number"]?.number)
      .filter((n) => typeof n === "number");
    const highest = nums.length ? Math.max(...nums) : 0;
    return json(200, { next: highest + 1, highest, count: nums.length });
  } catch (err) {
    return json(err.status || 500, { error: err.message || "Failed to reach Notion API" });
  }
};
