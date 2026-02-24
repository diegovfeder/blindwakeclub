export interface WaiverPayload {
  fullName: string;
  dateOfBirth: string;
  email: string;
  phone: string;
  idNumber: string;
  emergencyContactName: string;
  emergencyContactPhone: string;
  emergencyContactRelationship: string;
  consentWaiverText: boolean;
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
  waiver: {
    version: string;
    textHash: string;
    acceptedAt: string;
  };
  signature: {
    key: string;
    sha256: string;
  };
  documents?: {
    waiverPdfKey?: string | null;
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
