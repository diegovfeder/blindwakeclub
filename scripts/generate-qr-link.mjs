import fs from "node:fs/promises";
import path from "node:path";

const projectRoot = process.cwd();
const formUrl = process.env.NEXT_PUBLIC_FORM_URL || "http://localhost:3000/waiver";
const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=512x512&data=${encodeURIComponent(formUrl)}`;

const qrTxtPath = path.join(projectRoot, "public", "qr", "waiver-form-url.txt");
const qrDocPath = path.join(projectRoot, "docs", "QR_CODE.md");

await fs.mkdir(path.dirname(qrTxtPath), { recursive: true });
await fs.mkdir(path.dirname(qrDocPath), { recursive: true });

await fs.writeFile(qrTxtPath, `${qrUrl}\n`, "utf8");

const markdown = `# Waiver QR Code\n\n- Form URL: ${formUrl}\n- QR image URL (online generator): ${qrUrl}\n\n![Waiver QR Code](${qrUrl})\n\n## Regenerate\n\nRun:\n\n\`\`\`bash\nnpm run qr:generate\n\`\`\`\n`;

await fs.writeFile(qrDocPath, markdown, "utf8");

console.log(`QR documentation written to ${qrDocPath}`);
console.log(`QR URL written to ${qrTxtPath}`);
