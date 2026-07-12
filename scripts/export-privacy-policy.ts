import { writeFileSync } from "fs";
import {
  PRIVACY_POLICY_DOCUMENT,
  PRIVACY_DEVELOPER_JURIST_NOTE,
  type PrivacyBlock,
} from "../src/constants/privacyPolicyContent";

function blockToMd(block: PrivacyBlock): string {
  switch (block.type) {
    case "paragraph":
      return `${block.text}\n\n`;
    case "bullets":
      return `${block.items.map((i) => `- ${i}`).join("\n")}\n\n`;
    case "numbered":
      return `${block.items.map((i, idx) => `${idx + 1}. ${i}`).join("\n")}\n\n`;
    case "notice":
      return `**${block.title}:** ${block.body}\n\n`;
    case "subsection":
      return (
        `### ${block.title}\n\n` +
        block.paragraphs.map((p) => `${p}\n\n`).join("") +
        (block.bullets ? `${block.bullets.map((i) => `- ${i}`).join("\n")}\n\n` : "")
      );
    default:
      return "";
  }
}

let md = `# ${PRIVACY_POLICY_DOCUMENT.title}\n\n`;
md += `${PRIVACY_POLICY_DOCUMENT.subtitle}\n\n`;
md += `**Versie:** ${PRIVACY_POLICY_DOCUMENT.version}  \n`;
md += `**Laatst bijgewerkt:** ${PRIVACY_POLICY_DOCUMENT.effectiveDate}\n\n`;
md += `## Samenvatting\n\n`;
md += `${PRIVACY_POLICY_DOCUMENT.summary.map((s) => `- ${s}`).join("\n")}\n\n`;
md += `---\n\n`;

for (const chapter of PRIVACY_POLICY_DOCUMENT.chapters) {
  md += `## ${chapter.number}. ${chapter.title}\n\n`;
  for (const block of chapter.blocks) {
    md += blockToMd(block);
  }
}

md += `## Bewaartermijnen\n\n`;
md += `| Categorie | Termijn | Toelichting |\n`;
md += `| --- | --- | --- |\n`;
for (const row of PRIVACY_POLICY_DOCUMENT.retentionRows) {
  const esc = (s: string) => s.replace(/\|/g, "\\|");
  md += `| ${esc(row.category)} | ${esc(row.period)} | ${esc(row.note)} |\n`;
}
md += `\n---\n\n`;
md += `${PRIVACY_DEVELOPER_JURIST_NOTE}\n`;

writeFileSync("privacy-policy.md", md, "utf8");
console.log(`Written privacy-policy.md (${md.split("\n").length} lines)`);
