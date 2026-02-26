import type { ValidationResult, WaiverPayload } from "@/lib/types";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_PATTERN = /^\(\d{2}\)\s9\d{4}-\d{4}$/;
const ID_PATTERN = /^[A-Za-z0-9.\-]{4,30}$/;

export function validateWaiverPayload(payload: Partial<WaiverPayload>): ValidationResult {
  const errors: Record<string, string> = {};

  if (!payload.fullName?.trim()) {
    errors.fullName = "Nome completo é obrigatório.";
  }

  if (!payload.dateOfBirth || Number.isNaN(Date.parse(payload.dateOfBirth))) {
    errors.dateOfBirth = "Data de nascimento é obrigatória.";
  }

  if (payload.email && !EMAIL_PATTERN.test(payload.email)) {
    errors.email = "Se informado, use um e-mail válido.";
  }

  if (!payload.phone || !PHONE_PATTERN.test(payload.phone)) {
    errors.phone = "Telefone válido é obrigatório no formato (41) 98765-4321.";
  }

  if (payload.idNumber && !ID_PATTERN.test(payload.idNumber)) {
    errors.idNumber = "Se informado, use CPF ou RG válido (ex.: 052.317.202-81).";
  }

  if (!payload.emergencyContactPhone || !PHONE_PATTERN.test(payload.emergencyContactPhone)) {
    errors.emergencyContactPhone =
      "Telefone de emergência obrigatório no formato (41) 98765-4321.";
  }

  if (!payload.consentLiability) {
    errors.consentLiability = "Consentimento de responsabilidade é obrigatório.";
  }

  if (!payload.consentWaiverText) {
    errors.consentWaiverText = "Você deve confirmar leitura e aceite do termo completo.";
  }

  if (!payload.consentMedical) {
    errors.consentMedical = "Consentimento médico é obrigatório.";
  }

  if (!payload.consentPrivacy) {
    errors.consentPrivacy = "Consentimento de privacidade é obrigatório.";
  }

  if (!payload.signatureDataUrl?.startsWith("data:image/png;base64,")) {
    errors.signatureDataUrl = "Assinatura é obrigatória.";
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
  };
}

export function isSafePhotoKey(value: string): boolean {
  return /^[a-zA-Z0-9._-]{6,120}$/.test(value);
}
