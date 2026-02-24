import fs from "node:fs/promises";
import path from "node:path";
import zlib from "node:zlib";

import QRCode from "qrcode";

const projectRoot = process.cwd();
const DEFAULT_FORM_URL = "http://localhost:3000/";

const qrTxtPath = path.join(projectRoot, "public", "qr", "waiver-form-url.txt");
const qrPngPath = path.join(projectRoot, "public", "qr", "waiver-form-qr.png");
const qrDocPath = path.join(projectRoot, "docs", "QR_CODE.md");
const signagePdfPath = path.join(projectRoot, "assets", "termo-de-consentimento-qr.pdf");
const logoPath = path.join(projectRoot, "public", "branding", "logo-icon.png");

const PAGE_WIDTH = 595;
const PAGE_HEIGHT = 842;
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function parseDotEnv(raw) {
  const env = {};

  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separator = trimmed.indexOf("=");
    if (separator <= 0) {
      continue;
    }

    const key = trimmed.slice(0, separator).trim();
    let value = trimmed.slice(separator + 1).trim();

    if (!key) {
      continue;
    }

    const quote = value[0];
    if ((quote === '"' || quote === "'") && value.endsWith(quote) && value.length >= 2) {
      value = value.slice(1, -1);
    } else {
      const commentIndex = value.indexOf(" #");
      if (commentIndex >= 0) {
        value = value.slice(0, commentIndex).trim();
      }
    }

    env[key] = value;
  }

  return env;
}

async function loadEnvFile(filePath) {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return parseDotEnv(raw);
  } catch {
    return {};
  }
}

async function resolveFormUrl() {
  if (process.env.NEXT_PUBLIC_FORM_URL && process.env.NEXT_PUBLIC_FORM_URL.trim()) {
    return process.env.NEXT_PUBLIC_FORM_URL.trim();
  }

  const localEnv = await loadEnvFile(path.join(projectRoot, ".env.local"));
  if (localEnv.NEXT_PUBLIC_FORM_URL && localEnv.NEXT_PUBLIC_FORM_URL.trim()) {
    return localEnv.NEXT_PUBLIC_FORM_URL.trim();
  }

  const baseEnv = await loadEnvFile(path.join(projectRoot, ".env"));
  if (baseEnv.NEXT_PUBLIC_FORM_URL && baseEnv.NEXT_PUBLIC_FORM_URL.trim()) {
    return baseEnv.NEXT_PUBLIC_FORM_URL.trim();
  }

  return DEFAULT_FORM_URL;
}

function formatPdfNumber(value) {
  const fixed = value.toFixed(2);
  return fixed.endsWith(".00") ? fixed.slice(0, -3) : fixed;
}

function escapePdfString(input) {
  let output = "";

  for (const char of input) {
    const code = char.charCodeAt(0);
    if (char === "\\" || char === "(" || char === ")") {
      output += `\\${char}`;
      continue;
    }

    if (code < 32 || code > 126) {
      if (code <= 255) {
        output += `\\${code.toString(8).padStart(3, "0")}`;
      } else {
        output += "?";
      }
      continue;
    }

    output += char;
  }

  return output;
}

function textWidthApprox(text, size) {
  return text.length * size * 0.52;
}

function pdfTextOp({ font, size, x, y, text }) {
  return [
    "BT",
    `/${font} ${formatPdfNumber(size)} Tf`,
    `1 0 0 1 ${formatPdfNumber(x)} ${formatPdfNumber(y)} Tm`,
    `(${escapePdfString(text)}) Tj`,
    "ET",
  ].join("\n");
}

function centerX(text, size) {
  return (PAGE_WIDTH - textWidthApprox(text, size)) / 2;
}

function wrapLine(text, maxChars) {
  const normalized = text.trim();
  if (!normalized) {
    return [""];
  }

  const words = normalized.split(/\s+/);
  const lines = [];
  let current = "";

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length <= maxChars) {
      current = candidate;
      continue;
    }

    if (current) {
      lines.push(current);
      current = "";
    }

    if (word.length <= maxChars) {
      current = word;
      continue;
    }

    for (let start = 0; start < word.length; start += maxChars) {
      const chunk = word.slice(start, start + maxChars);
      if (chunk.length === maxChars) {
        lines.push(chunk);
      } else {
        current = chunk;
      }
    }
  }

  if (current) {
    lines.push(current);
  }

  return lines;
}

function paethPredictor(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);

  if (pa <= pb && pa <= pc) {
    return a;
  }
  if (pb <= pc) {
    return b;
  }
  return c;
}

function unfilterScanline(filterType, filtered, previousRow, output, bytesPerPixel) {
  for (let i = 0; i < filtered.length; i += 1) {
    const left = i >= bytesPerPixel ? output[i - bytesPerPixel] : 0;
    const up = previousRow[i] || 0;
    const upLeft = i >= bytesPerPixel ? previousRow[i - bytesPerPixel] || 0 : 0;

    let value = filtered[i];
    if (filterType === 1) {
      value = (value + left) & 0xff;
    } else if (filterType === 2) {
      value = (value + up) & 0xff;
    } else if (filterType === 3) {
      value = (value + Math.floor((left + up) / 2)) & 0xff;
    } else if (filterType === 4) {
      value = (value + paethPredictor(left, up, upLeft)) & 0xff;
    }

    output[i] = value;
  }
}

function decodePngToRgb(pngBuffer) {
  if (pngBuffer.length < 8 || !pngBuffer.subarray(0, 8).equals(PNG_SIGNATURE)) {
    throw new Error("Invalid PNG signature");
  }

  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  let compressionMethod = 0;
  let filterMethod = 0;
  let interlaceMethod = 0;
  const idatChunks = [];

  let offset = 8;
  while (offset + 8 <= pngBuffer.length) {
    const length = pngBuffer.readUInt32BE(offset);
    offset += 4;

    const type = pngBuffer.toString("ascii", offset, offset + 4);
    offset += 4;

    if (offset + length + 4 > pngBuffer.length) {
      throw new Error("Invalid PNG chunk length");
    }

    const data = pngBuffer.subarray(offset, offset + length);
    offset += length;
    offset += 4;

    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
      compressionMethod = data[10];
      filterMethod = data[11];
      interlaceMethod = data[12];
    } else if (type === "IDAT") {
      idatChunks.push(Buffer.from(data));
    } else if (type === "IEND") {
      break;
    }
  }

  if (!width || !height || idatChunks.length === 0) {
    throw new Error("PNG missing image data");
  }

  if (bitDepth !== 8) {
    throw new Error("Only 8-bit PNG is supported");
  }

  if (compressionMethod !== 0 || filterMethod !== 0 || interlaceMethod !== 0) {
    throw new Error("Unsupported PNG compression/filter/interlace mode");
  }

  const bytesPerPixel = colorType === 6 ? 4 : colorType === 2 ? 3 : colorType === 0 ? 1 : 0;
  if (!bytesPerPixel) {
    throw new Error("Unsupported PNG color type");
  }

  const inflated = zlib.inflateSync(Buffer.concat(idatChunks));
  const rowByteLength = width * bytesPerPixel;
  const expectedLength = (rowByteLength + 1) * height;
  if (inflated.length < expectedLength) {
    throw new Error("Truncated PNG data stream");
  }

  const previousRow = Buffer.alloc(rowByteLength);
  const currentRow = Buffer.alloc(rowByteLength);
  const rgbData = Buffer.alloc(width * height * 3);

  for (let row = 0; row < height; row += 1) {
    const rowOffset = row * (rowByteLength + 1);
    const filterType = inflated[rowOffset];
    const filtered = inflated.subarray(rowOffset + 1, rowOffset + 1 + rowByteLength);

    if (filterType > 4) {
      throw new Error("Unsupported PNG filter type");
    }

    unfilterScanline(filterType, filtered, previousRow, currentRow, bytesPerPixel);

    const rgbRowOffset = row * width * 3;
    if (colorType === 6) {
      for (let x = 0; x < width; x += 1) {
        const source = x * 4;
        const target = rgbRowOffset + x * 3;
        const r = currentRow[source];
        const g = currentRow[source + 1];
        const b = currentRow[source + 2];
        const a = currentRow[source + 3];

        rgbData[target] = Math.floor((r * a + 255 * (255 - a) + 127) / 255);
        rgbData[target + 1] = Math.floor((g * a + 255 * (255 - a) + 127) / 255);
        rgbData[target + 2] = Math.floor((b * a + 255 * (255 - a) + 127) / 255);
      }
    } else if (colorType === 2) {
      for (let x = 0; x < width; x += 1) {
        const source = x * 3;
        const target = rgbRowOffset + x * 3;
        rgbData[target] = currentRow[source];
        rgbData[target + 1] = currentRow[source + 1];
        rgbData[target + 2] = currentRow[source + 2];
      }
    } else {
      for (let x = 0; x < width; x += 1) {
        const value = currentRow[x];
        const target = rgbRowOffset + x * 3;
        rgbData[target] = value;
        rgbData[target + 1] = value;
        rgbData[target + 2] = value;
      }
    }

    currentRow.copy(previousRow);
  }

  return {
    width,
    height,
    rgbData,
  };
}

function buildObject(id, data) {
  return {
    id,
    data: Buffer.isBuffer(data) ? data : Buffer.from(data, "binary"),
  };
}

function buildImageObject(id, image) {
  const compressed = zlib.deflateSync(image.rgbData);
  const header = Buffer.from(
    `<< /Type /XObject /Subtype /Image /Width ${image.width} /Height ${image.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode /Length ${compressed.length} >>\nstream\n`,
    "binary",
  );
  const footer = Buffer.from("\nendstream", "binary");
  return buildObject(id, Buffer.concat([header, compressed, footer]));
}

function buildPdfBinary(objects) {
  const buffers = [Buffer.from("%PDF-1.4\n%\xFF\xFF\xFF\xFF\n", "binary")];
  const offsets = [0];
  let cursor = buffers[0].length;

  for (const object of objects) {
    offsets[object.id] = cursor;

    const header = Buffer.from(`${object.id} 0 obj\n`, "binary");
    const footer = Buffer.from("\nendobj\n", "binary");
    buffers.push(header, object.data, footer);
    cursor += header.length + object.data.length + footer.length;
  }

  const xrefStart = cursor;
  const maxId = Math.max(...objects.map((item) => item.id));
  const xrefLines = ["xref", `0 ${maxId + 1}`, "0000000000 65535 f "];

  for (let id = 1; id <= maxId; id += 1) {
    const offset = offsets[id] || 0;
    xrefLines.push(`${offset.toString().padStart(10, "0")} 00000 n `);
  }

  const trailer = [
    ...xrefLines,
    "trailer",
    `<< /Size ${maxId + 1} /Root 1 0 R >>`,
    "startxref",
    `${xrefStart}`,
    "%%EOF",
    "",
  ].join("\n");

  buffers.push(Buffer.from(trailer, "binary"));
  return Buffer.concat(buffers);
}

function buildSignageContent({ formUrl, generatedAt, logoImage, qrImage }) {
  const ops = [];

  const qrDrawSize = 315;
  const qrX = (PAGE_WIDTH - qrDrawSize) / 2;
  const qrY = 220;

  ops.push("q");
  ops.push("0.95 0.95 0.95 rg");
  ops.push(`0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT} re f`);
  ops.push("Q");

  ops.push("q");
  ops.push("1 1 1 rg");
  ops.push(`32 32 ${PAGE_WIDTH - 64} ${PAGE_HEIGHT - 64} re f`);
  ops.push("Q");

  if (logoImage) {
    const maxWidth = 130;
    const maxHeight = 130;
    const ratio = Math.min(maxWidth / logoImage.width, maxHeight / logoImage.height, 1);
    const logoW = logoImage.width * ratio;
    const logoH = logoImage.height * ratio;
    const logoX = (PAGE_WIDTH - logoW) / 2;
    const logoY = PAGE_HEIGHT - 180;

    ops.push("q");
    ops.push(`${formatPdfNumber(logoW)} 0 0 ${formatPdfNumber(logoH)} ${formatPdfNumber(logoX)} ${formatPdfNumber(logoY)} cm`);
    ops.push("/Logo Do");
    ops.push("Q");
  }

  const title = "TERMO DE CONSENTIMENTO";
  const subtitle = "Blind Wake Club";
  const instructionLines = [
    "Escaneie o QR code para preencher e assinar o termo digital.",
    "Use a camera do celular ou um app leitor de QR.",
  ];

  ops.push(pdfTextOp({ font: "F2", size: 28, x: centerX(title, 28), y: 610, text: title }));
  ops.push(pdfTextOp({ font: "F2", size: 16, x: centerX(subtitle, 16), y: 585, text: subtitle }));

  let instructionY = 572;
  for (const line of instructionLines) {
    ops.push(pdfTextOp({ font: "F1", size: 12, x: centerX(line, 12), y: instructionY, text: line }));
    instructionY -= 17;
  }

  ops.push("q");
  ops.push("0.9 0.9 0.9 rg");
  ops.push(`${formatPdfNumber(qrX - 14)} ${formatPdfNumber(qrY - 14)} ${formatPdfNumber(qrDrawSize + 28)} ${formatPdfNumber(qrDrawSize + 28)} re f`);
  ops.push("Q");

  ops.push("q");
  ops.push(`${formatPdfNumber(qrDrawSize)} 0 0 ${formatPdfNumber(qrDrawSize)} ${formatPdfNumber(qrX)} ${formatPdfNumber(qrY)} cm`);
  ops.push("/QR Do");
  ops.push("Q");

  ops.push(pdfTextOp({ font: "F2", size: 14, x: centerX("Aponte a camera para o QR code", 14), y: 182, text: "Aponte a camera para o QR code" }));

  const urlLines = wrapLine(formUrl, 56);
  let urlY = 156;
  for (const line of urlLines) {
    ops.push(pdfTextOp({ font: "F1", size: 10.5, x: centerX(line, 10.5), y: urlY, text: line }));
    urlY -= 13;
  }

  ops.push(pdfTextOp({ font: "F1", size: 9, x: centerX(`Gerado em ${generatedAt}`, 9), y: 66, text: `Gerado em ${generatedAt}` }));

  return Buffer.from(`${ops.join("\n")}\n`, "binary");
}

function buildSignagePdf({ formUrl, generatedAt, logoImage, qrImage }) {
  const content = buildSignageContent({ formUrl, generatedAt, logoImage, qrImage });

  const objects = [
    buildObject(1, "<< /Type /Catalog /Pages 2 0 R >>"),
    buildObject(2, "<< /Type /Pages /Kids [3 0 R] /Count 1 >>"),
    buildObject(
      3,
      "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R /F2 6 0 R >> /XObject << /QR 7 0 R /Logo 8 0 R >> >> /Contents 4 0 R >>",
    ),
    buildObject(
      4,
      Buffer.concat([
        Buffer.from(`<< /Length ${content.length} >>\nstream\n`, "binary"),
        content,
        Buffer.from("endstream", "binary"),
      ]),
    ),
    buildObject(5, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>"),
    buildObject(6, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>"),
    buildImageObject(7, qrImage),
    buildImageObject(8, logoImage),
  ];

  return buildPdfBinary(objects);
}

async function loadLogoImage() {
  try {
    const buffer = await fs.readFile(logoPath);
    return decodePngToRgb(buffer);
  } catch {
    return null;
  }
}

async function main() {
  const formUrl = await resolveFormUrl();
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=512x512&data=${encodeURIComponent(formUrl)}`;

  await fs.mkdir(path.dirname(qrTxtPath), { recursive: true });
  await fs.mkdir(path.dirname(qrDocPath), { recursive: true });
  await fs.mkdir(path.dirname(signagePdfPath), { recursive: true });

  const qrPng = await QRCode.toBuffer(formUrl, {
    errorCorrectionLevel: "H",
    margin: 1,
    type: "png",
    width: 1024,
    color: {
      dark: "#000000",
      light: "#FFFFFF",
    },
  });

  const qrImage = decodePngToRgb(qrPng);
  const logoImage = await loadLogoImage();

  if (!logoImage) {
    throw new Error(`Logo file not found or invalid PNG: ${logoPath}`);
  }

  const generatedAt = new Date().toLocaleString("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  });

  const signagePdf = buildSignagePdf({
    formUrl,
    generatedAt,
    logoImage,
    qrImage,
  });

  await fs.writeFile(qrTxtPath, `${qrUrl}\n`, "utf8");
  await fs.writeFile(qrPngPath, qrPng);
  await fs.writeFile(signagePdfPath, signagePdf);

  const markdown = `# Waiver QR Code\n\n- Form URL: ${formUrl}\n- Local QR PNG: public/qr/waiver-form-qr.png\n- Printable PDF (PT-BR): assets/termo-de-consentimento-qr.pdf\n- QR image URL (online generator fallback): ${qrUrl}\n\n![Waiver QR Code](../public/qr/waiver-form-qr.png)\n\n## Regenerate\n\nRun:\n\n\`\`\`bash\nnpm run qr:generate\n\`\`\`\n`;

  await fs.writeFile(qrDocPath, markdown, "utf8");

  console.log(`QR URL written to ${qrTxtPath}`);
  console.log(`QR PNG written to ${qrPngPath}`);
  console.log(`Printable PDF written to ${signagePdfPath}`);
  console.log(`QR documentation written to ${qrDocPath}`);
}

await main();
