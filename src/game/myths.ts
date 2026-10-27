/**
 * Myth catalogue for the Sovereign Cloud Debunker game.
 *
 * Verdicts and rationale follow the session plan "Sovereign Cloud Mythbusters —
 * Ignite Session Plan" (updated Oct 20, 2026) and the public Microsoft sources it
 * cites. Statuses (GA / preview) are as of Microsoft Ignite 2026.
 *
 * To add a myth, append an entry to MYTHS. Ids must be unique; the number is
 * only used for display.
 */

export type Verdict = "busted" | "plausible" | "confirmed";

export type RiskArea = "data" | "keys" | "operations" | "law";

export interface SourceLink {
  label: string;
  url: string;
}

export interface Myth {
  id: string;
  number: number;
  claim: string;
  verdict: Verdict;
  /** Optional qualifier shown next to the stamp, e.g. "with an asterisk". */
  qualifier?: string;
  /** Risk areas this myth tests, from the session's four-risk model. */
  areas: RiskArea[];
  /** One-line verdict summary shown under the stamp. */
  summary: string;
  /** Short paragraphs explaining the verdict. */
  rationale: string[];
  tradeoff: string;
  sources: SourceLink[];
}

export const VERDICTS: { id: Verdict; label: string; letter: string }[] = [
  { id: "busted", label: "Busted", letter: "A" },
  { id: "plausible", label: "Plausible", letter: "B" },
  { id: "confirmed", label: "Confirmed", letter: "C" },
];

export const RISK_AREAS: { id: RiskArea; label: string; question: string }[] = [
  { id: "data", label: "Data location", question: "Where does the data live?" },
  { id: "keys", label: "Key control", question: "Who controls the keys?" },
  { id: "operations", label: "Operations", question: "Who operates the systems?" },
  { id: "law", label: "Law & dependencies", question: "Which laws and dependencies apply?" },
];

const LEARN_CONTROLS: SourceLink = {
  label: "Controls and principles in Sovereign Public Cloud (Microsoft Learn)",
  url: "https://learn.microsoft.com/en-us/azure/azure-sovereign-clouds/public/overview-controls-principles",
};

export const MYTHS: Myth[] = [
  {
    id: "local-provider",
    number: 1,
    claim: "Digital sovereignty requires a local cloud provider.",
    verdict: "busted",
    qualifier: "with an asterisk",
    areas: ["law", "operations"],
    summary: "Sovereignty is about who controls data, keys, operations and dependencies, not the logo on the datacenter.",
    rationale: [
      "Microsoft offers three complementary approaches: Sovereign Public Cloud (existing regions with added controls), Sovereign Private Cloud (Azure Local on hardware you own) and the Sovereign Partner Ecosystem. They are not mutually exclusive, and Sovereign Public Cloud is enough for most customers without a migration.",
      "The asterisk: some mandates, such as France's SecNumCloud, do require an independently owned operator. That is why the National Partner Clouds exist: Bleu (Orange and Capgemini) in France and Delos Cloud (an SAP subsidiary) in Germany, where Microsoft has no standing admin rights.",
    ],
    tradeoff: "A small local provider may solve jurisdiction but cost you AI services, regional redundancy and security tooling at hyperscale.",
    sources: [
      {
        label: "Announcing comprehensive sovereign solutions (Official Microsoft Blog)",
        url: "https://blogs.microsoft.com/blog/2025/06/16/announcing-comprehensive-sovereign-solutions-empowering-european-organizations/",
      },
      { label: "Microsoft Sovereign Cloud", url: "https://www.microsoft.com/sovereignty" },
    ],
  },
  {
    id: "residency",
    number: 2,
    claim: "Data residency alone addresses sovereignty.",
    verdict: "busted",
    areas: ["data", "keys"],
    summary: "Residency is Level 1 of three. It doesn't answer who can decrypt the data.",
    rationale: [
      "Microsoft's controls model treats residency as Level 1 only. Level 2 adds customer-managed keys (Key Vault Managed HSM, or External Key Management with the root key in an HSM you own, now generally available for supported Azure services). Level 3 adds encryption in use with confidential computing and attestation-gated Secure Key Release.",
      "And a region pin isn't a residency guarantee for every service: some services are non-regional by design, such as Azure Front Door, Traffic Manager, Azure DNS and Azure Policy.",
      "Example: a bank keeps everything in-region but uses platform-managed keys. Its regulator asks who could decrypt the data. Residency didn't answer the question.",
    ],
    tradeoff: "Each level adds operating effort, and not every service supports customer-held keys.",
    sources: [
      LEARN_CONTROLS,
      {
        label: "EU Data Boundary (Microsoft Trust Center)",
        url: "https://www.microsoft.com/trust-center/privacy/european-data-boundary-eudb",
      },
    ],
  },
  {
    id: "disconnected",
    number: 3,
    claim: "Disconnected is always more secure.",
    verdict: "busted",
    areas: ["operations"],
    summary: "Disconnection removes one attack path and adds others. It's a control and continuity choice, not an automatic security upgrade.",
    rationale: [
      "Going disconnected means slower patching, no cloud-scale threat intelligence, removable-media update paths and a heavier insider-risk burden.",
      "It's a real option when you need it: Azure Local disconnected operations and Microsoft 365 Local became available worldwide in February 2026, with policy, RBAC, auditing and compliance running locally. Connected Azure Local instances also keep running through connectivity outages of up to 30 days.",
      "Example: a defence contractor air-gaps a cluster, then finds its patch cadence slipped from weekly to quarterly. Which risk did it actually reduce?",
    ],
    tradeoff: "You become your own cloud operator: updates, disaster recovery and monitoring are yours.",
    sources: [
      {
        label: "Sovereign Cloud offerings, even when completely disconnected (Source EMEA)",
        url: "https://news.microsoft.com/source/emea/2026/02/new-enhancements-to-microsofts-sovereign-cloud-offerings-even-when-completely-disconnected/",
      },
    ],
  },
  {
    id: "ai",
    number: 4,
    claim: "Sovereign means giving up modern AI.",
    verdict: "plausible",
    qualifier: "and shrinking fast",
    areas: ["data", "law"],
    summary: "The gap is real but closing quickly. Frontier models still land in the public cloud first.",
    rationale: [
      "The EU Data Boundary now covers AI data processing, and in-country processing for Microsoft 365 Copilot is rolling out country by country. Foundry Local on Azure Local is generally available, with local inferencing and agentic retrieval in connected and disconnected environments, running the open-source and bring-your-own models you choose.",
      "Why not Busted: the newest frontier models still arrive in the public cloud first. Disconnected environments run the models you bring on the GPUs you buy.",
    ],
    tradeoff: "Model choice and freshness versus control. Governance (logging, content safety, access) has to travel with the model.",
    sources: [
      {
        label: "Sovereign Private Cloud: more choice and control for AI (Azure Arc Blog)",
        url: "https://techcommunity.microsoft.com/blog/azurearcblog/sovereign-private-cloud-bringing-more-choice-and-control-to-ai-and-cloud-infrast/4565953",
      },
      {
        label: "EU Data Boundary (Microsoft Trust Center)",
        url: "https://www.microsoft.com/trust-center/privacy/european-data-boundary-eudb",
      },
    ],
  },
  {
    id: "operator-access",
    number: 5,
    claim: "The provider's engineers can access my data whenever they like.",
    verdict: "busted",
    areas: ["operations", "keys"],
    summary: "Access requires approval, is logged, and is useless without your keys.",
    rationale: [
      "Customer Lockbox requires your approval before engineers can access customer data, for supported services and support scenarios. Just-in-time access keeps engineer access time-bound.",
      "In Europe, Data Guardian adds approval and monitoring of remote access by EU-resident personnel, recorded in the Production Touch Ledger, a tamper-evident record of the access and the actions performed. These are Microsoft internal controls, rolling out in EU and EFTA regions.",
      "Customer-held keys make access useless without the key. The same rules should apply to AI operations agents: run them under your RBAC, approvals and audit trail, like a human engineer.",
    ],
    tradeoff: "Approval workflows slow down support. Decide in advance who approves at 2 a.m.",
    sources: [
      {
        label: "What is Data Guardian? (Microsoft Learn)",
        url: "https://learn.microsoft.com/en-us/azure/azure-sovereign-clouds/public/data-guardian",
      },
    ],
  },
  {
    id: "jurisdiction",
    number: 6,
    claim: "If my provider is headquartered abroad, its home government can get my data.",
    verdict: "plausible",
    areas: ["law", "keys"],
    summary: "The exposure depends on who operates the service and who holds the keys. Saying \"never\" would be wrong.",
    rationale: [
      "Contractual: Microsoft commits to challenge government data requests for EU public-sector and commercial customers where there is a lawful basis to do so, and in Canada has a contractual commitment to challenge demands for Canadian government or commercial customer data where there is a legal basis.",
      "Operational and technical: Customer Lockbox and Data Guardian control and record access; customer-held keys (External Key Management) keep data at rest unreadable without them, and confidential computing protects data in use.",
      "Structural: where a mandate requires an independently owned operator, National Partner Clouds such as Bleu and Delos Cloud apply.",
    ],
    tradeoff: "The strongest legal separation (partner cloud, customer-held keys) costs service breadth, feature timing and operating effort.",
    sources: [
      {
        label: "Microsoft deepens its commitment to Canada (Microsoft On the Issues)",
        url: "https://blogs.microsoft.com/on-the-issues/2025/12/09/microsoft-deepens-its-commitment-to-canada-with-landmark-19b-ai-investment/",
      },
      {
        label: "Announcing comprehensive sovereign solutions (Official Microsoft Blog)",
        url: "https://blogs.microsoft.com/blog/2025/06/16/announcing-comprehensive-sovereign-solutions-empowering-european-organizations/",
      },
    ],
  },
];

export const VERDICT_LABEL: Record<Verdict, string> = {
  busted: "Busted",
  plausible: "Plausible",
  confirmed: "Confirmed",
};
