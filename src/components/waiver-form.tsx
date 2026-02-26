"use client";

import { FormEvent, type PointerEvent as CanvasPointerEvent, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { WAIVER_LEGAL_TEXT_PT_BR, WAIVER_VERSION } from "@/lib/waiver";

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_PATTERN = /^[0-9+()\-\s]{7,20}$/;
const ID_PATTERN = /^[A-Za-z0-9\-]{4,30}$/;
const WAIVER_LINES = WAIVER_LEGAL_TEXT_PT_BR.split("\n");

type StepIndex = 0 | 1 | 2;

type FormState = {
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
};

type PresignResponse = {
  key: string;
  uploadUrl: string;
};

type SubmissionResponse = {
  submissionId: string;
  createdAt: string;
  tamperHash: string;
  waiverVersion: string;
  pdfDownloadUrl?: string;
};

type SubmitPhase = "idle" | "uploading_photo" | "saving_submission";

const INITIAL_STATE: FormState = {
  fullName: "",
  dateOfBirth: "",
  email: "",
  phone: "",
  idNumber: "",
  emergencyContactName: "",
  emergencyContactPhone: "",
  emergencyContactRelationship: "",
  consentWaiverText: false,
  consentLiability: false,
  consentMedical: false,
  consentPrivacy: false,
};

const STEP_META = [
  {
    title: "Seus dados",
    hint: "Somente dados essenciais para o termo.",
  },
  {
    title: "Emergência",
    hint: "Telefone obrigatório. Os demais campos são opcionais.",
  },
  {
    title: "Termo e assinatura",
    hint: "Aceite único + assinatura digital.",
  },
] as const;

const FIELD_TO_STEP: Record<string, StepIndex> = {
  fullName: 0,
  dateOfBirth: 0,
  email: 0,
  phone: 0,
  idNumber: 0,
  emergencyContactName: 1,
  emergencyContactPhone: 1,
  emergencyContactRelationship: 1,
  consentWaiverText: 2,
  consentLiability: 2,
  consentMedical: 2,
  consentPrivacy: 2,
  signatureDataUrl: 2,
  photo: 2,
};

async function readJsonSafe<T>(response: Response): Promise<T | null> {
  try {
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

export function WaiverForm() {
  const router = useRouter();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef(false);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);

  const [step, setStep] = useState<StepIndex>(0);
  const [form, setForm] = useState<FormState>(INITIAL_STATE);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState("");
  const [hasSignature, setHasSignature] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState("");
  const [submitPhase, setSubmitPhase] = useState<SubmitPhase>("idle");

  const isSubmitting = submitPhase !== "idle";
  const submitButtonLabel =
    submitPhase === "uploading_photo"
      ? "Enviando foto..."
      : submitPhase === "saving_submission"
        ? "Enviando termo..."
        : "Enviar termo";

  const submitStatusMessage =
    submitPhase === "uploading_photo"
      ? "Enviando foto para o storage..."
      : submitPhase === "saving_submission"
        ? "Salvando termo e gerando PDF..."
        : "";

  const photoSummary = useMemo(() => {
    if (!photoFile) {
      return "Nenhuma foto selecionada";
    }

    const mb = (photoFile.size / (1024 * 1024)).toFixed(2);
    return `${photoFile.name} (${mb} MB)`;
  }, [photoFile]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const resize = () => {
      const context = canvas.getContext("2d");
      if (!context) {
        return;
      }

      const ratio = Math.max(window.devicePixelRatio || 1, 1);
      const bounds = canvas.getBoundingClientRect();
      canvas.width = Math.floor(bounds.width * ratio);
      canvas.height = Math.floor(bounds.height * ratio);
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      context.lineWidth = 2.5;
      context.lineCap = "round";
      context.lineJoin = "round";
      context.strokeStyle = "#111";
      context.fillStyle = "#fff";
      context.fillRect(0, 0, bounds.width, bounds.height);
      setHasSignature(false);
    };

    resize();
    window.addEventListener("resize", resize);

    return () => {
      window.removeEventListener("resize", resize);
    };
  }, []);

  useEffect(() => {
    if (!photoFile) {
      setPhotoPreviewUrl("");
      return;
    }

    const nextPreviewUrl = URL.createObjectURL(photoFile);
    setPhotoPreviewUrl(nextPreviewUrl);

    return () => {
      URL.revokeObjectURL(nextPreviewUrl);
    };
  }, [photoFile]);

  const setField = (field: keyof FormState, value: string | boolean) => {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const setUnifiedConsent = (checked: boolean) => {
    setForm((current) => ({
      ...current,
      consentWaiverText: checked,
      consentLiability: checked,
      consentMedical: checked,
      consentPrivacy: checked,
    }));
  };

  const getCanvasPoint = (event: CanvasPointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return { x: 0, y: 0 };
    }

    const rect = canvas.getBoundingClientRect();
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };
  };

  const beginDraw = (event: CanvasPointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    canvas.setPointerCapture(event.pointerId);
    drawingRef.current = true;
    const point = getCanvasPoint(event);
    lastPointRef.current = point;

    const context = canvas.getContext("2d");
    if (!context) {
      return;
    }

    context.beginPath();
    context.arc(point.x, point.y, 1, 0, Math.PI * 2);
    context.fillStyle = "#111";
    context.fill();
    setHasSignature(true);
  };

  const draw = (event: CanvasPointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) {
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const point = getCanvasPoint(event);
    const previous = lastPointRef.current;
    lastPointRef.current = point;

    if (!previous) {
      return;
    }

    const context = canvas.getContext("2d");
    if (!context) {
      return;
    }

    context.beginPath();
    context.moveTo(previous.x, previous.y);
    context.lineTo(point.x, point.y);
    context.stroke();
    setHasSignature(true);
  };

  const endDraw = () => {
    drawingRef.current = false;
    lastPointRef.current = null;
  };

  const clearSignature = () => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const context = canvas.getContext("2d");
    if (!context) {
      return;
    }

    const bounds = canvas.getBoundingClientRect();
    context.fillStyle = "#fff";
    context.fillRect(0, 0, bounds.width, bounds.height);
    setHasSignature(false);
  };

  const validateClientSide = (): Record<string, string> => {
    const nextErrors: Record<string, string> = {};

    if (!form.fullName.trim()) {
      nextErrors.fullName = "Nome completo é obrigatório.";
    }

    if (!form.dateOfBirth) {
      nextErrors.dateOfBirth = "Data de nascimento é obrigatória.";
    }

    if (!form.phone.trim() || !PHONE_PATTERN.test(form.phone)) {
      nextErrors.phone = "Telefone válido é obrigatório.";
    }

    if (form.email.trim() && !EMAIL_PATTERN.test(form.email.trim())) {
      nextErrors.email = "Se informado, use um e-mail válido.";
    }

    if (form.idNumber.trim() && !ID_PATTERN.test(form.idNumber.trim())) {
      nextErrors.idNumber = "Se informado, use um documento válido.";
    }

    if (!form.emergencyContactPhone.trim() || !PHONE_PATTERN.test(form.emergencyContactPhone)) {
      nextErrors.emergencyContactPhone = "Telefone do contato de emergência é obrigatório e deve ser válido.";
    }

    if (!form.consentWaiverText) {
      nextErrors.consentWaiverText = "Você deve aceitar os termos obrigatórios para continuar.";
    }

    if (!hasSignature) {
      nextErrors.signatureDataUrl = "Assinatura é obrigatória.";
    }

    if (photoFile) {
      if (photoFile.size > MAX_UPLOAD_BYTES) {
        nextErrors.photo = "A foto é muito grande. Máximo de 5 MB.";
      }

      if (!ALLOWED_MIME.has(photoFile.type)) {
        nextErrors.photo = "A foto deve ser JPEG, PNG ou WEBP.";
      }
    }

    return nextErrors;
  };

  const getStepErrors = (source: Record<string, string>, stepIndex: StepIndex) => {
    return Object.fromEntries(
      Object.entries(source).filter(([field]) => FIELD_TO_STEP[field] === stepIndex),
    );
  };

  const findFirstStepForErrors = (source: Record<string, string>): StepIndex => {
    const steps = Object.keys(source)
      .map((field) => FIELD_TO_STEP[field])
      .filter((value): value is StepIndex => value !== undefined);

    if (steps.length === 0) {
      return 2;
    }

    return Math.min(...steps) as StepIndex;
  };

  const goToNextStep = () => {
    const nextErrors = validateClientSide();
    const stepErrors = getStepErrors(nextErrors, step);
    setErrors(stepErrors);

    if (Object.keys(stepErrors).length > 0) {
      return;
    }

    setStep((current) => (Math.min(current + 1, 2) as StepIndex));
    setServerError("");
  };

  const goToPreviousStep = () => {
    setErrors({});
    setServerError("");
    setStep((current) => (Math.max(current - 1, 0) as StepIndex));
  };

  const uploadPhotoIfPresent = async (): Promise<string | null> => {
    if (!photoFile) {
      return null;
    }

    const presignResponse = await fetch("/api/uploads/presign", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        fileName: photoFile.name,
        mimeType: photoFile.type,
        size: photoFile.size,
      }),
    });

    const presignPayload = await readJsonSafe<PresignResponse & { error?: string }>(presignResponse);
    if (!presignResponse.ok || !presignPayload?.uploadUrl || !presignPayload.key) {
      throw new Error(presignPayload?.error || "Não foi possível iniciar o upload da foto.");
    }

    const uploadResponse = await fetch(presignPayload.uploadUrl, {
      method: "PUT",
      headers: {
        "content-type": photoFile.type,
      },
      body: photoFile,
    });

    const uploadPayload = await readJsonSafe<{ key?: string; error?: string }>(uploadResponse);
    if (!uploadResponse.ok || !uploadPayload?.key) {
      throw new Error(uploadPayload?.error || "Não foi possível enviar a foto.");
    }

    return uploadPayload.key;
  };

  const submitForm = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setServerError("");

    const nextErrors = validateClientSide();
    setErrors(nextErrors);

    if (Object.keys(nextErrors).length > 0) {
      setStep(findFirstStepForErrors(nextErrors));
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) {
      setServerError("Área de assinatura indisponível.");
      return;
    }

    setSubmitPhase(photoFile ? "uploading_photo" : "saving_submission");

    try {
      const photoKey = await uploadPhotoIfPresent();
      setSubmitPhase("saving_submission");
      const signatureDataUrl = canvas.toDataURL("image/png");

      const payload = {
        ...form,
        signatureDataUrl,
        photoKey,
      };

      const submitResponse = await fetch("/api/submissions", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const submitPayload = await readJsonSafe<
        SubmissionResponse & {
          error?: string;
          errors?: Record<string, string>;
        }
      >(submitResponse);

      if (!submitResponse.ok || !submitPayload?.submissionId) {
        const apiErrors = submitPayload?.errors || {};
        if (Object.keys(apiErrors).length > 0) {
          setErrors(apiErrors);
          setStep(findFirstStepForErrors(apiErrors));
        }

        throw new Error(submitPayload?.error || "Não foi possível enviar o termo.");
      }

      const nextParams = new URLSearchParams({
        submitted: submitPayload.submissionId,
      });

      if (submitPayload.pdfDownloadUrl) {
        nextParams.set("pdf", submitPayload.pdfDownloadUrl);
      }

      if (submitPayload.waiverVersion) {
        nextParams.set("waiverVersion", submitPayload.waiverVersion);
      }

      setSubmitPhase("idle");
      router.push(`/?${nextParams.toString()}`);
    } catch (error) {
      setServerError(error instanceof Error ? error.message : "Erro inesperado ao enviar o formulário.");
      setSubmitPhase("idle");
    }
  };

  return (
    <form className="waiver-form" onSubmit={submitForm} noValidate>
      <fieldset className="waiver-form-content" disabled={isSubmitting}>
        <div className="waiver-stepper" role="list" aria-label="Etapas do formulário">
          {STEP_META.map((meta, index) => {
            const stepIndex = index as StepIndex;
            const stateClass =
              stepIndex === step ? "is-active" : stepIndex < step ? "is-complete" : "is-pending";

            return (
              <article key={meta.title} className={`waiver-step-card ${stateClass}`} role="listitem">
                <span className="waiver-step-badge">{index + 1}</span>
                <div>
                  <h3>{meta.title}</h3>
                  <p>{meta.hint}</p>
                </div>
              </article>
            );
          })}
        </div>

        {step === 0 ? (
          <section className="step-panel">
            <h2>Dados principais</h2>
            <p className="hint">Vamos começar rápido. Só o essencial é obrigatório.</p>

            <div className="field-grid">
              <label>
                Nome completo *
                <input
                  type="text"
                  value={form.fullName}
                  onChange={(event) => setField("fullName", event.target.value)}
                  autoComplete="name"
                  required
                />
                {errors.fullName && <span className="error">{errors.fullName}</span>}
              </label>

              <label>
                Data de nascimento *
                <input
                  type="date"
                  value={form.dateOfBirth}
                  onChange={(event) => setField("dateOfBirth", event.target.value)}
                  required
                />
                {errors.dateOfBirth && <span className="error">{errors.dateOfBirth}</span>}
              </label>

              <label>
                Telefone *
                <input
                  type="tel"
                  value={form.phone}
                  onChange={(event) => setField("phone", event.target.value)}
                  autoComplete="tel"
                  required
                />
                {errors.phone && <span className="error">{errors.phone}</span>}
              </label>

              <label>
                E-mail (opcional)
                <input
                  type="email"
                  value={form.email}
                  onChange={(event) => setField("email", event.target.value)}
                  autoComplete="email"
                />
                {errors.email && <span className="error">{errors.email}</span>}
              </label>

              <label>
                Documento (opcional)
                <input
                  type="text"
                  value={form.idNumber}
                  onChange={(event) => setField("idNumber", event.target.value)}
                />
                {errors.idNumber && <span className="error">{errors.idNumber}</span>}
              </label>
            </div>
          </section>
        ) : null}

        {step === 1 ? (
          <section className="step-panel">
            <h2>Contato de emergência</h2>
            <p className="hint">
              Para segurança operacional, só o telefone de emergência é obrigatório.
            </p>

            <div className="field-grid">
              <label>
                Telefone do contato de emergência *
                <input
                  type="tel"
                  value={form.emergencyContactPhone}
                  onChange={(event) => setField("emergencyContactPhone", event.target.value)}
                  required
                />
                {errors.emergencyContactPhone && <span className="error">{errors.emergencyContactPhone}</span>}
              </label>

              <label>
                Nome do contato (opcional)
                <input
                  type="text"
                  value={form.emergencyContactName}
                  onChange={(event) => setField("emergencyContactName", event.target.value)}
                />
                {errors.emergencyContactName && <span className="error">{errors.emergencyContactName}</span>}
              </label>

              <label>
                Relação com você (opcional)
                <input
                  type="text"
                  value={form.emergencyContactRelationship}
                  onChange={(event) => setField("emergencyContactRelationship", event.target.value)}
                />
                {errors.emergencyContactRelationship && (
                  <span className="error">{errors.emergencyContactRelationship}</span>
                )}
              </label>
            </div>
          </section>
        ) : null}

        {step === 2 ? (
          <>
            <section className="waiver-legal-block step-panel">
              <h2>Aceite legal</h2>
              <p className="hint">Um único aceite confirma os termos obrigatórios do waiver.</p>

              <details className="waiver-details">
                <summary>Ver termo completo (versão {WAIVER_VERSION})</summary>
                <div className="waiver-legal-scroll">
                  {WAIVER_LINES.map((line, index) => (
                    <p key={`${index}-${line}`} className="waiver-legal-line">
                      {line || "\u00A0"}
                    </p>
                  ))}
                </div>
              </details>

              <label className="checkbox-row checkbox-row-lg">
                <input
                  type="checkbox"
                  checked={form.consentWaiverText}
                  onChange={(event) => setUnifiedConsent(event.target.checked)}
                />
                Li e aceito os termos de responsabilidade, consentimento médico e privacidade. *
              </label>
              {errors.consentWaiverText && <span className="error">{errors.consentWaiverText}</span>}
            </section>

            <section className="signature-block step-panel">
              <h2>Assinatura *</h2>
              <p className="hint">Assine dentro da caixa usando mouse, dedo ou caneta.</p>
              <canvas
                ref={canvasRef}
                className="signature-canvas"
                onPointerDown={beginDraw}
                onPointerMove={draw}
                onPointerUp={endDraw}
                onPointerLeave={endDraw}
                onPointerCancel={endDraw}
              />
              <div className="actions">
                <button type="button" className="button button-secondary" onClick={clearSignature}>
                  Limpar assinatura
                </button>
              </div>
              {errors.signatureDataUrl && <span className="error">{errors.signatureDataUrl}</span>}
            </section>

            <section className="photo-block step-panel">
              <h2>Foto opcional</h2>
              <p className="hint">Formatos aceitos: JPEG, PNG, WEBP. Tamanho máximo: 5 MB.</p>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={(event) => setPhotoFile(event.target.files?.[0] || null)}
              />
              <p className="hint">{photoSummary}</p>
              {photoPreviewUrl ? (
                <img src={photoPreviewUrl} alt="Pré-visualização da foto" className="photo-preview" />
              ) : null}
              {errors.photo && <span className="error">{errors.photo}</span>}
            </section>

            <section className="notice-block step-panel">
              <h2>Aviso de privacidade</h2>
              <p>
                Blind Wake Club armazena os dados do termo para operação de segurança, conformidade legal
                e resposta a incidentes, com acesso restrito à equipe autorizada.
              </p>
            </section>
          </>
        ) : null}

        <div className="step-actions">
          {step > 0 ? (
            <button type="button" className="button button-secondary" onClick={goToPreviousStep}>
              Voltar
            </button>
          ) : null}

          {step < 2 ? (
            <button type="button" className="button" onClick={goToNextStep}>
              Continuar
            </button>
          ) : (
            <button type="submit" className="button" disabled={isSubmitting}>
              {submitButtonLabel}
            </button>
          )}
        </div>
      </fieldset>

      {serverError && <p className="error server-error">{serverError}</p>}
      {isSubmitting ? (
        <p className="hint submit-status" role="status" aria-live="polite">
          {submitStatusMessage}
        </p>
      ) : null}
    </form>
  );
}
