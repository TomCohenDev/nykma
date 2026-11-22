// bun run claims <slug>   Checks the pitch's claims against its brand kit before anyone builds it. One cheap model call
// (.claude/agents/claims-checker.md, or the brand's own version), text only. Writes queue/<date>-<brand>-<slug>/claims.md and
// exits 1 when something is unsupported. Staging (an invented way of showing something real) is fine and is listed, so
// the pitch can say it's invented. Spends a few cents of tokens.
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { claimsCheckerText } from "./lib/agents.ts";
import { askClaude, promptParts } from "./lib/claude.ts";
import { field, queueFolder, readIf } from "./lib/queue.ts";

const ROOT = resolve(import.meta.dirname, "..");
const KINDS = ["capability", "fact", "number", "price", "person", "quote", "staging"] as const;
const STATUSES = ["backed", "source", "staged", "unsupported"] as const;
type Claim = { claim: string; where: string; kind: (typeof KINDS)[number]; status: (typeof STATUSES)[number]; evidence: string; note: string };

const SCHEMA = {
  type: "object",
  required: ["claims"],
  additionalProperties: false,
  properties: {
    claims: {
      type: "array",
      items: {
        type: "object",
        required: ["claim", "where", "kind", "status", "evidence", "note"],
        additionalProperties: false,
        properties: {
          claim: { type: "string" },
          where: { type: "string" },
          kind: { type: "string", enum: [...KINDS] },
          status: { type: "string", enum: [...STATUSES] },
          evidence: { type: "string" },
          note: { type: "string" },
        },
      },
    },
  },
};

const slug = process.argv[2];
if (!slug || slug.startsWith("-")) throw new Error("Usage: bun run claims <slug>");
const folder = queueFolder(slug);
const pitch = folder ? readIf(join(folder, "pitch.md")) : undefined;
if (!folder || !pitch) throw new Error(`No queue/<date>-<brand>-${slug}/pitch.md to check.`);
const brand = field(pitch, "brand");
const kit = brand ? readIf(join(ROOT, "brands", brand, "brand.md")) : undefined;
if (!brand || !kit) throw new Error(`The pitch names no brand with a brands/<brand>/brand.md${brand ? ` (it says "${brand}")` : ""}.`);

const { model, system } = promptParts(claimsCheckerText(brand), "claims-checker.md");
const ask = `<brand_kit brand="${brand}">\n${kit}\n</brand_kit>\n\n<pitch>\n${pitch}\n</pitch>`;
const args = [
  "-p",
  "--safe-mode", // No CLAUDE.md, memory, hooks or MCP: it knows only the pitch and the kit.
  "--model", model,
  "--system-prompt", system,
  "--tools", "Read",
  "--permission-mode", "dontAsk",
  "--no-session-persistence",
  "--output-format", "json",
  "--json-schema", JSON.stringify(SCHEMA),
];

const scratch = join(ROOT, "out", slug, "claims");
mkdirSync(scratch, { recursive: true });
const started = Date.now();
const raw = await askClaude(args, ask, scratch);
let reply: { is_error?: boolean; result?: string; structured_output?: { claims?: Claim[] }; total_cost_usd?: number };
try {
  reply = JSON.parse(raw);
} catch {
  throw new Error(`claude's reply wasn't JSON: ${raw.slice(0, 300)}`);
}
if (reply.is_error || !reply.structured_output?.claims) throw new Error(`The claims check didn't run: ${(reply.result ?? raw).slice(0, 300)}`);

const claims = reply.structured_output.claims;
const count = (status: Claim["status"]) => claims.filter((claim) => claim.status === status).length;
const cell = (text: string) => text.replace(/\|/g, "\\|").replace(/\s*\n\s*/g, " ").trim();
const verdict = count("unsupported") ? `${count("unsupported")} unsupported: fix them before the user sees the pitch` : "Nothing unsupported";
const lines = [
  `# Claims: ${slug}`,
  "",
  `**${verdict}.** ${count("backed")} backed by brand.md, ${count("source")} resting on a source the build has to check, ${count("staged")} staged (invented ways of showing something real, which the pitch should say are invented). Checked against brands/${brand}/brand.md by ${model}, $${(reply.total_cost_usd ?? 0).toFixed(3)}, ${Math.round((Date.now() - started) / 1000)} s.`,
  "",
  "| Where | Claim | Kind | Status | Evidence | Note |",
  "|---|---|---|---|---|---|",
  ...claims.map((claim) => `| ${cell(claim.where)} | ${cell(claim.claim)} | ${claim.kind} | ${claim.status} | ${cell(claim.evidence)} | ${cell(claim.note)} |`),
  "",
];
const path = join(folder, "claims.md");
writeFileSync(path, lines.join("\n"));
for (const claim of claims) if (claim.status !== "backed") console.log(`${claim.status.padEnd(11)} ${claim.where.padEnd(12)} ${claim.claim}${claim.note ? `: ${claim.note}` : ""}`);
console.log(`${verdict}\n${path}`);
process.exit(count("unsupported") ? 1 : 0);
