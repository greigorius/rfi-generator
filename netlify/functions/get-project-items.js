const NOTION_VERSION = "2022-06-28";
const HEADERS = { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" };

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: HEADERS, body: "" };
  if (event.httpMethod !== "POST") return { statusCode: 405, headers: HEADERS, body: JSON.stringify({ error: "Method not allowed" }) };

  const token = process.env.NOTION_TOKEN;
  const dbId  = process.env.NOTION_DB_TASKS;
  if (!token || !dbId) return { statusCode: 500, headers: HEADERS, body: JSON.stringify({ error: "Missing env vars" }) };

  let projectId;
  try { ({ projectId } = JSON.parse(event.body)); } catch { return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ error: "Invalid body" }) }; }
  if (!projectId) return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ error: "projectId required" }) };

  try {
    // Paginate to get all items for the project
    let allResults = [];
    let cursor = undefined;
    do {
      const body = {
        filter: { property: "Projects", relation: { contains: projectId } },
        sorts: [{ property: "Item Name", direction: "ascending" }],
        page_size: 100,
      };
      if (cursor) body.start_cursor = cursor;
      const res = await fetch(`https://api.notion.com/v1/databases/${dbId}/query`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Notion-Version": NOTION_VERSION, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) return { statusCode: res.status, headers: HEADERS, body: JSON.stringify({ error: data.message }) };
      allResults = allResults.concat(data.results);
      cursor = data.has_more ? data.next_cursor : undefined;
    } while (cursor);

    const items = allResults
      .map(p => ({ id: p.id, name: p.properties["Item Name"]?.title?.[0]?.plain_text || "" }))
      .filter(item => item.name && !item.name.toUpperCase().includes("PCSA"));

    return { statusCode: 200, headers: HEADERS, body: JSON.stringify({ items }) };
  } catch (err) {
    return { statusCode: 500, headers: HEADERS, body: JSON.stringify({ error: "Failed to reach Notion API" }) };
  }
};
