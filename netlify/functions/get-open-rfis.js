const NOTION_VERSION = "2022-06-28";
const HEADERS = { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" };

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: HEADERS, body: "" };
  const token = process.env.NOTION_TOKEN;
  const dbId  = process.env.NOTION_DB_RFIS;
  if (!token || !dbId) return { statusCode: 500, headers: HEADERS, body: JSON.stringify({ error: "Missing env vars" }) };

  try {
    const res = await fetch(`https://api.notion.com/v1/databases/${dbId}/query`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Notion-Version": NOTION_VERSION, "Content-Type": "application/json" },
      body: JSON.stringify({
        filter: {
          property: "RFI Status",
          select: { does_not_equal: "Closed" },
        },
        sorts: [{ property: "RFI Number", direction: "ascending" }],
      }),
    });
    const data = await res.json();
    if (!res.ok) return { statusCode: res.status, headers: HEADERS, body: JSON.stringify({ error: data.message }) };

    const rfis = data.results.map(p => {
      // Project is a rollup — read the rolled-up title/rich_text array
      const rollupArr = p.properties["Project"]?.rollup?.array || [];
      const project = rollupArr[0]?.title?.[0]?.plain_text
        || rollupArr[0]?.rich_text?.[0]?.plain_text
        || "";
      return {
        notionId:  p.id,
        notionUrl: p.url,
        rfiNumber: p.properties["RFI Number"]?.number ?? "",
        rfiTitle:  p.properties["RFI Description"]?.title?.[0]?.plain_text || "",
        status:    p.properties["RFI Status"]?.select?.name || "",
        tbcBy:     p.properties["TBC by"]?.select?.name || "",
        dateRaised: p.properties["Date Raised"]?.date?.start || "",
        project,
      };
    });
    return { statusCode: 200, headers: HEADERS, body: JSON.stringify({ rfis }) };
  } catch (err) {
    return { statusCode: 500, headers: HEADERS, body: JSON.stringify({ error: "Failed to reach Notion API" }) };
  }
};
