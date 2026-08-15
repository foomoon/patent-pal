const patentsTable = "patents-public-data.google_patents_research.publications";

export class BigQueryPatentProvider {
  name = "bigquery";

  constructor({ projectId, maximumBytesBilled } = {}) {
    this.projectId = projectId;
    this.maximumBytesBilled = Number(maximumBytesBilled || 1_073_741_824);
  }

  async search(query) {
    const { BigQuery } = await import("@google-cloud/bigquery");
    const client = new BigQuery({ projectId: this.projectId });
    const pattern = `%${query.toLowerCase().replace(/[%_\\]/g, "\\$&")}%`;
    const [rows] = await client.query({
      query: `SELECT publication_number, title, abstract, filing_date, publication_date FROM \`${patentsTable}\` WHERE country = 'US' AND (LOWER(title) LIKE @pattern OR LOWER(abstract) LIKE @pattern) ORDER BY publication_date DESC LIMIT @limit`,
      location: "US",
      params: { pattern, limit: 10 },
      maximumBytesBilled: this.maximumBytesBilled
    });
    return {
      provider: this.name,
      query,
      summary: `Google Patents Public Datasets returned ${rows.length} US publications matching title or abstract terms.`,
      results: rows.map((row, index) => ({
        publicationNumber: row.publication_number,
        publicationDate: formatDate(row.publication_date || row.filing_date),
        assignee: "Google Patents Public Data",
        relevance: Math.max(55, 94 - index * 6),
        title: row.title || "Untitled publication",
        abstract: row.abstract || "No abstract available in the selected record."
      }))
    };
  }
}

function formatDate(value) { return value?.value || (value ? String(value).slice(0, 10) : "Date unavailable"); }
