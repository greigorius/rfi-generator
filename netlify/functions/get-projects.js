const NOTION_VERSION = "2022-06-28";
const HEADERS = { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" };

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: HEADERS, body: "" };
  const token = process.env.NOTION_TOKEN;
  const dbId  = process.env.NOTION_DB_PROJECTS;
  if (!token || !dbId) return { statusCode: 500, headers: HEADERS, body: JSON.stringify({ error: "Missing env vars" }) };

  try {
    const res = await fetch(`https://api.notion.com/v1/databases/${dbId}/query`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Notion-Version": NOTION_VERSION, "Content-Type": "application/json" },
      body: JSON.stringify({
        filter: { property: "Status", status: { does_not_equal: "Done" } },
        sorts: [{ property: "Project Name", direction: "ascending" }],
      }),
    });
    const data = await res.json();
    if (!res.ok) return { statusCode: res.status, headers: HEADERS, body: JSON.stringify({ error: data.message }) };

    const projects = data.results
      .map(p => ({ id: p.id, name: p.properties["Project Name"]?.title?.[0]?.plain_text || "" }))
      .filter(p => p.name);
    return { statusCode: 200, headers: HEADERS, body: JSON.stringify({ projects }) };
  } catch (err) {
    return { statusCode: 500, headers: HEADERS, body: JSON.stringify({ error: "Failed to reach Notion API" }) };
  }
};
