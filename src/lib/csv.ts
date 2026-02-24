import type { SubmissionRecord } from "@/lib/types";

function escapeCsv(value: string | number | boolean | null | undefined): string {
  const text = value == null ? "" : String(value);
  const escaped = text.replaceAll('"', '""');
  return `"${escaped}"`;
}

export function submissionsToCsv(rows: SubmissionRecord[]): string {
  const headers = [
    "id",
    "criadoEm",
    "nomeCompleto",
    "dataNascimento",
    "email",
    "telefone",
    "numeroDocumento",
    "nomeContatoEmergencia",
    "telefoneContatoEmergencia",
    "parentescoContatoEmergencia",
    "consentimentoTermoCompleto",
    "consentimentoResponsabilidade",
    "consentimentoMedico",
    "consentimentoPrivacidade",
    "versaoTermo",
    "aceiteTermoEm",
    "hashTextoTermo",
    "chaveFoto",
    "chaveAssinatura",
    "chavePdfTermo",
    "hashSha256Assinatura",
    "hashIntegridade",
  ];

  const lines = [headers.map((header) => escapeCsv(header)).join(",")];

  for (const row of rows) {
    const values = [
      row.id,
      row.createdAt,
      row.payload.fullName,
      row.payload.dateOfBirth,
      row.payload.email,
      row.payload.phone,
      row.payload.idNumber,
      row.payload.emergencyContactName,
      row.payload.emergencyContactPhone,
      row.payload.emergencyContactRelationship,
      row.payload.consentWaiverText,
      row.payload.consentLiability,
      row.payload.consentMedical,
      row.payload.consentPrivacy,
      row.waiver.version,
      row.waiver.acceptedAt,
      row.waiver.textHash,
      row.payload.photoKey || "",
      row.signature.key,
      row.documents?.waiverPdfKey || "",
      row.signature.sha256,
      row.tamperHash,
    ];

    lines.push(values.map((item) => escapeCsv(item)).join(","));
  }

  return `${lines.join("\n")}\n`;
}
