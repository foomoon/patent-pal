const results = [
  { publicationNumber: "US 11,602,175 B2", publicationDate: "2023", assignee: "Airbus", relevance: 92, title: "Thermal management arrangement for an electric propulsion system", abstract: "A cooling circuit routes dielectric fluid through a battery enclosure and a heat exchanger in response to pack temperature and flight phase." },
  { publicationNumber: "US 10,968,762 B2", publicationDate: "2021", assignee: "Honeywell", relevance: 84, title: "Cooling architecture for high-voltage energy storage", abstract: "A modular liquid-cooling plate and control logic balances thermal load between battery modules during high-power operation." },
  { publicationNumber: "US 2021/0191781 A1", publicationDate: "2021", assignee: "Safran", relevance: 77, title: "Electric aircraft battery temperature control device", abstract: "A dedicated thermal loop exchanges heat between an aircraft battery and an environmental control system under operating constraints." }
];

export class MockPatentProvider {
  name = "mock";
  async search(query) { return { provider: this.name, query, summary: `Demo mode expanded “${query}” across US battery thermal management, aviation propulsion, and cooling-control concepts.`, results }; }
}
