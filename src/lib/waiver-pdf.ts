import zlib from "node:zlib";

import type { SubmissionRecord } from "@/lib/types";
import { WAIVER_LEGAL_TEXT_PT_BR } from "@/lib/waiver";

const PAGE_WIDTH = 595;
const PAGE_HEIGHT = 842;
const MARGIN = 48;
const LEGAL_FONT_SIZE = 10.5;
const LEGAL_LINE_HEIGHT = 14;
const APPROX_CHAR_WIDTH = LEGAL_FONT_SIZE * 0.52;

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

interface PdfObject {
  id: number;
  data: Buffer;
}

interface DecodedPngImage {
  width: number;
  height: number;
  rgbData: Buffer;
}

function formatPdfNumber(value: number): string {
  const fixed = value.toFixed(2);
  return fixed.endsWith(".00") ? fixed.slice(0, -3) : fixed;
}

function wrapLine(text: string, maxChars: number): string[] {
  const normalized = text.trim();
  if (!normalized) {
    return [""];
  }

  const words = normalized.split(/\s+/);
  const lines: string[] = [];
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

function escapePdfString(input: string): string {
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

function pdfTextOp(options: {
  font: "F1" | "F2";
  size: number;
  x: number;
  y: number;
  text: string;
}): string {
  return [
    "BT",
    `/${options.font} ${formatPdfNumber(options.size)} Tf`,
    `1 0 0 1 ${formatPdfNumber(options.x)} ${formatPdfNumber(options.y)} Tm`,
    `(${escapePdfString(options.text)}) Tj`,
    "ET",
  ].join("\n");
}

function buildObject(id: number, data: Buffer | string): PdfObject {
  return {
    id,
    data: Buffer.isBuffer(data) ? data : Buffer.from(data, "binary"),
  };
}

function buildPdfBinary(objects: PdfObject[]): Buffer {
  const buffers: Buffer[] = [Buffer.from("%PDF-1.4\n%\xFF\xFF\xFF\xFF\n", "binary")];
  const offsets: number[] = [0];
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
  const xrefLines: string[] = ["xref", `0 ${maxId + 1}`, "0000000000 65535 f "];

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

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString("pt-BR");
}

function formatBoolean(value: boolean): string {
  return value ? "sim" : "nao";
}

function buildSummaryPageContent(record: SubmissionRecord, includeSignatureImage: boolean): Buffer {
  const ops: string[] = [];
  const contentWidth = PAGE_WIDTH - MARGIN * 2;
  let y = PAGE_HEIGHT - MARGIN;

  const pushWrapped = (text: string, options: { font: "F1" | "F2"; size: number; lineHeight: number }) => {
    const maxChars = Math.max(12, Math.floor(contentWidth / (options.size * 0.52)));
    const lines = wrapLine(text, maxChars);
    for (const line of lines) {
      ops.push(
        pdfTextOp({
          font: options.font,
          size: options.size,
          x: MARGIN,
          y,
          text: line,
        }),
      );
      y -= options.lineHeight;
    }
  };

  pushWrapped("BLIND WAKE CLUB", { font: "F2", size: 17, lineHeight: 21 });
  pushWrapped("Termo de Ciencia de Riscos e Responsabilidade", { font: "F2", size: 12, lineHeight: 16 });
  y -= 4;

  const summaryLines = [
    `ID do envio: ${record.id}`,
    `Criado em: ${formatDateTime(record.createdAt)}`,
    `Versao do termo: ${record.waiver.version}`,
    `Aceite registrado em: ${formatDateTime(record.waiver.acceptedAt)}`,
    `Hash do texto legal: ${record.waiver.textHash}`,
    `Hash de integridade: ${record.tamperHash}`,
    `SHA-256 da assinatura: ${record.signature.sha256}`,
  ];

  summaryLines.forEach((line) => pushWrapped(line, { font: "F1", size: 10.5, lineHeight: 14 }));
  y -= 6;

  pushWrapped("Dados do participante", { font: "F2", size: 12, lineHeight: 16 });
  const participantLines = [
    `Nome completo: ${record.payload.fullName}`,
    `Data de nascimento: ${record.payload.dateOfBirth}`,
    `Email: ${record.payload.email}`,
    `Telefone: ${record.payload.phone}`,
    `Documento: ${record.payload.idNumber}`,
    `Contato de emergencia: ${record.payload.emergencyContactName}`,
    `Telefone emergencia: ${record.payload.emergencyContactPhone}`,
    `Parentesco emergencia: ${record.payload.emergencyContactRelationship}`,
    `Foto enviada: ${record.payload.photoKey ? "sim" : "nao"}`,
  ];
  participantLines.forEach((line) => pushWrapped(line, { font: "F1", size: 10.5, lineHeight: 14 }));
  y -= 6;

  pushWrapped("Consentimentos", { font: "F2", size: 12, lineHeight: 16 });
  const consentLines = [
    `Leitura e aceite do termo completo: ${formatBoolean(record.payload.consentWaiverText)}`,
    `Responsabilidade civil: ${formatBoolean(record.payload.consentLiability)}`,
    `Consentimento medico: ${formatBoolean(record.payload.consentMedical)}`,
    `Privacidade e retencao: ${formatBoolean(record.payload.consentPrivacy)}`,
  ];
  consentLines.forEach((line) => pushWrapped(line, { font: "F1", size: 10.5, lineHeight: 14 }));

  const signatureBox = {
    x: MARGIN,
    y: 110,
    width: 265,
    height: 112,
  };

  ops.push(pdfTextOp({ font: "F2", size: 12, x: signatureBox.x, y: signatureBox.y + signatureBox.height + 16, text: "Assinatura capturada" }));
  ops.push("q");
  ops.push("0.75 G");
  ops.push("1 w");
  ops.push(
    `${formatPdfNumber(signatureBox.x)} ${formatPdfNumber(signatureBox.y)} ${formatPdfNumber(signatureBox.width)} ${formatPdfNumber(signatureBox.height)} re S`,
  );
  ops.push("Q");

  if (includeSignatureImage) {
    const horizontalPadding = 8;
    const verticalPadding = 8;
    const drawX = signatureBox.x + horizontalPadding;
    const drawY = signatureBox.y + verticalPadding;
    const drawWidth = signatureBox.width - horizontalPadding * 2;
    const drawHeight = signatureBox.height - verticalPadding * 2;

    ops.push("q");
    ops.push(
      `${formatPdfNumber(drawWidth)} 0 0 ${formatPdfNumber(drawHeight)} ${formatPdfNumber(drawX)} ${formatPdfNumber(drawY)} cm`,
    );
    ops.push("/Sig Do");
    ops.push("Q");
  }

  const rightColumnX = signatureBox.x + signatureBox.width + 20;
  const rightColumnWidth = PAGE_WIDTH - rightColumnX - MARGIN;
  const rightColumnMaxChars = Math.max(12, Math.floor(rightColumnWidth / (10 * 0.52)));
  let rightY = signatureBox.y + signatureBox.height + 2;
  const evidenceLines = [
    "Resumo de evidencias:",
    `- Chave da assinatura: ${record.signature.key}`,
    `- Chave do PDF: ${record.documents?.waiverPdfKey || "indisponivel"}`,
    "- Texto legal completo nas paginas seguintes.",
  ];

  evidenceLines.forEach((line, index) => {
    const wrapped = wrapLine(line, rightColumnMaxChars);
    wrapped.forEach((wrappedLine) => {
      ops.push(
        pdfTextOp({
          font: index === 0 ? "F2" : "F1",
          size: index === 0 ? 11 : 10,
          x: rightColumnX,
          y: rightY,
          text: wrappedLine,
        }),
      );
      rightY -= index === 0 ? 14 : 13;
    });
  });

  ops.push(
    pdfTextOp({
      font: "F1",
      size: 9,
      x: MARGIN,
      y: 62,
      text: "Documento gerado automaticamente pelo Blind Wake Club.",
    }),
  );

  return Buffer.from(`${ops.join("\n")}\n`, "binary");
}

function buildLegalTextLines(record: SubmissionRecord): string[] {
  return [
    "TERMO COMPLETO",
    `ID de envio: ${record.id}`,
    "",
    ...WAIVER_LEGAL_TEXT_PT_BR.split("\n"),
  ];
}

function paginateLegalLines(lines: string[]): string[][] {
  const maxChars = Math.floor((PAGE_WIDTH - MARGIN * 2) / APPROX_CHAR_WIDTH);
  const wrapped = lines.flatMap((line) => wrapLine(line, maxChars));
  const linesPerPage = Math.floor((PAGE_HEIGHT - MARGIN * 2) / LEGAL_LINE_HEIGHT);

  const pages: string[][] = [];
  for (let i = 0; i < wrapped.length; i += linesPerPage) {
    pages.push(wrapped.slice(i, i + linesPerPage));
  }

  return pages;
}

function buildLegalPageContent(lines: string[]): Buffer {
  const parts: string[] = [];
  parts.push("BT");
  parts.push(`/F1 ${LEGAL_FONT_SIZE} Tf`);
  parts.push(`${LEGAL_LINE_HEIGHT} TL`);
  parts.push(`${MARGIN} ${PAGE_HEIGHT - MARGIN} Td`);

  lines.forEach((line, index) => {
    const escaped = escapePdfString(line);
    if (index > 0) {
      parts.push("T*");
    }
    parts.push(`(${escaped}) Tj`);
  });

  parts.push("ET");
  return Buffer.from(`${parts.join("\n")}\n`, "binary");
}

function paethPredictor(a: number, b: number, c: number): number {
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

function unfilterScanline(
  filterType: number,
  filtered: Buffer,
  previousRow: Buffer,
  output: Buffer,
  bytesPerPixel: number,
): void {
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

function decodePngToRgb(pngBuffer: Buffer): DecodedPngImage {
  if (pngBuffer.length < 8 || !pngBuffer.subarray(0, 8).equals(PNG_SIGNATURE)) {
    throw new Error("Unsupported signature PNG format");
  }

  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  let compressionMethod = 0;
  let filterMethod = 0;
  let interlaceMethod = 0;
  const idatChunks: Buffer[] = [];

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
    throw new Error("PNG missing required image data");
  }

  if (bitDepth !== 8) {
    throw new Error("Only 8-bit PNG signatures are supported");
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
    throw new Error("PNG data stream is truncated");
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

function buildSignatureImageObject(id: number, image: DecodedPngImage): PdfObject {
  const compressed = zlib.deflateSync(image.rgbData);
  const header = Buffer.from(
    `<< /Type /XObject /Subtype /Image /Width ${image.width} /Height ${image.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode /Length ${compressed.length} >>\nstream\n`,
    "binary",
  );
  const footer = Buffer.from("\nendstream", "binary");

  return buildObject(id, Buffer.concat([header, compressed, footer]));
}

export function generateWaiverPdf(record: SubmissionRecord, signaturePng?: Buffer): Buffer {
  let signatureImage: DecodedPngImage | null = null;
  if (signaturePng && signaturePng.length > 0) {
    try {
      signatureImage = decodePngToRgb(signaturePng);
    } catch {
      signatureImage = null;
    }
  }

  const legalPages = paginateLegalLines(buildLegalTextLines(record));
  const pageContents = [
    buildSummaryPageContent(record, Boolean(signatureImage)),
    ...legalPages.map((lines) => buildLegalPageContent(lines)),
  ];

  const firstPageObjectId = 3;
  const totalPages = pageContents.length;
  const regularFontObjectId = firstPageObjectId + totalPages * 2;
  const boldFontObjectId = regularFontObjectId + 1;
  const signatureObjectId = signatureImage ? boldFontObjectId + 1 : null;

  const pageObjects: PdfObject[] = [];
  const pageRefs: string[] = [];

  pageContents.forEach((contentStream, index) => {
    const pageObjectId = firstPageObjectId + index * 2;
    const contentObjectId = pageObjectId + 1;
    pageRefs.push(`${pageObjectId} 0 R`);

    let resources = `<< /Font << /F1 ${regularFontObjectId} 0 R /F2 ${boldFontObjectId} 0 R >>`;
    if (index === 0 && signatureObjectId) {
      resources += ` /XObject << /Sig ${signatureObjectId} 0 R >>`;
    }
    resources += " >>";

    pageObjects.push(
      buildObject(
        pageObjectId,
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Resources ${resources} /Contents ${contentObjectId} 0 R >>`,
      ),
    );
    pageObjects.push(
      buildObject(
        contentObjectId,
        Buffer.concat([
          Buffer.from(`<< /Length ${contentStream.length} >>\nstream\n`, "binary"),
          contentStream,
          Buffer.from("endstream", "binary"),
        ]),
      ),
    );
  });

  const objects: PdfObject[] = [
    buildObject(1, "<< /Type /Catalog /Pages 2 0 R >>"),
    buildObject(2, `<< /Type /Pages /Kids [${pageRefs.join(" ")}] /Count ${totalPages} >>`),
    ...pageObjects,
    buildObject(regularFontObjectId, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>"),
    buildObject(boldFontObjectId, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>"),
  ];

  if (signatureImage && signatureObjectId) {
    objects.push(buildSignatureImageObject(signatureObjectId, signatureImage));
  }

  return buildPdfBinary(objects);
}
