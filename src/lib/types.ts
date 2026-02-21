export interface WaiverPayload {
  fullName: string;
  dateOfBirth: string;
  email: string;
  phone: string;
  idNumber: string;
  emergencyContactName: string;
  emergencyContactPhone: string;
  emergencyContactRelationship: string;
  consentLiability: boolean;
  consentMedical: boolean;
  consentPrivacy: boolean;
  signatureDataUrl: string;
  photoKey?: string | null;
}

export interface SubmissionRecord {
  id: string;
  createdAt: string;
  payload: Omit<WaiverPayload, "signatureDataUrl">;
  signature: {
    key: string;
    sha256: string;
  };
  tamperHash: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: Record<string, string>;
}

export interface UploadTokenPayload {
  key: string;
  mime: string;
  size: number;
  expires: number;
}
