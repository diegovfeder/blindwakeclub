"use client";

import { FormEvent, type PointerEvent as CanvasPointerEvent, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { WAIVER_LEGAL_TEXT_PT_BR, WAIVER_VERSION } from "@/lib/waiver";

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);
const WAIVER_LINES = WAIVER_LEGAL_TEXT_PT_BR.split("\n");

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
  const waiverScrollRef = useRef<HTMLDivElement | null>(null);
  const drawingRef = useRef(false);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);

  const [form, setForm] = useState<FormState>(INITIAL_STATE);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState("");
  const [hasSignature, setHasSignature] = useState(false);
  const [canConfirmWaiver, setCanConfirmWaiver] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitPhase, setSubmitPhase] = useState<SubmitPhase>("idle");
  const [serverError, setServerError] = useState("");

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

  const updateWaiverReadState = () => {
    const element = waiverScrollRef.current;
    if (!element) {
      return;
    }

    if (element.scrollHeight <= element.clientHeight + 8) {
      setCanConfirmWaiver(true);
      return;
    }

    const readEnough = element.scrollTop + element.clientHeight >= element.scrollHeight - 24;
    if (readEnough) {
      setCanConfirmWaiver(true);
    }
  };

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
    updateWaiverReadState();
    window.addEventListener("resize", updateWaiverReadState);
    return () => {
      window.removeEventListener("resize", updateWaiverReadState);
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

    if (!form.email.includes("@")) {
      nextErrors.email = "E-mail válido é obrigatório.";
    }

    if (!form.phone.trim()) {
      nextErrors.phone = "Telefone é obrigatório.";
    }

    if (!form.idNumber.trim()) {
      nextErrors.idNumber = "Número do documento é obrigatório.";
    }

    if (!form.emergencyContactName.trim()) {
      nextErrors.emergencyContactName = "Nome do contato de emergência é obrigatório.";
    }

    if (!form.emergencyContactPhone.trim()) {
      nextErrors.emergencyContactPhone = "Telefone do contato de emergência é obrigatório.";
    }

    if (!form.emergencyContactRelationship.trim()) {
      nextErrors.emergencyContactRelationship = "Parentesco é obrigatório.";
    }

    if (!form.consentLiability) {
      nextErrors.consentLiability = "Você deve aceitar o termo de responsabilidade.";
    }

    if (!form.consentWaiverText) {
      nextErrors.consentWaiverText = "Você deve confirmar leitura e aceite do termo completo.";
    }

    if (!form.consentMedical) {
      nextErrors.consentMedical = "Você deve aceitar o consentimento médico.";
    }

    if (!form.consentPrivacy) {
      nextErrors.consentPrivacy = "Você deve aceitar a política de privacidade e retenção.";
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
        setErrors(submitPayload?.errors || {});
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
          E-mail *
          <input
            type="email"
            value={form.email}
            onChange={(event) => setField("email", event.target.value)}
            autoComplete="email"
            required
          />
          {errors.email && <span className="error">{errors.email}</span>}
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
          Número do documento *
          <input
            type="text"
            value={form.idNumber}
            onChange={(event) => setField("idNumber", event.target.value)}
            required
          />
          {errors.idNumber && <span className="error">{errors.idNumber}</span>}
        </label>

        <label>
          Nome do contato de emergência *
          <input
            type="text"
            value={form.emergencyContactName}
            onChange={(event) => setField("emergencyContactName", event.target.value)}
            required
          />
          {errors.emergencyContactName && <span className="error">{errors.emergencyContactName}</span>}
        </label>

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
          Parentesco do contato de emergência *
          <input
            type="text"
            value={form.emergencyContactRelationship}
            onChange={(event) => setField("emergencyContactRelationship", event.target.value)}
            required
          />
          {errors.emergencyContactRelationship && (
            <span className="error">{errors.emergencyContactRelationship}</span>
          )}
        </label>
        </div>

        <section className="waiver-legal-block">
        <h2>Leia o termo completo</h2>
        <p className="hint">
          Role até o final para habilitar a confirmação de leitura. Versão atual: {WAIVER_VERSION}.
        </p>
        <div className="waiver-legal-scroll" ref={waiverScrollRef} onScroll={updateWaiverReadState}>
          {WAIVER_LINES.map((line, index) => (
            <p key={`${index}-${line}`} className="waiver-legal-line">
              {line || "\u00A0"}
            </p>
          ))}
        </div>

        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={form.consentWaiverText}
            onChange={(event) => setField("consentWaiverText", event.target.checked)}
            disabled={!canConfirmWaiver}
          />
          Li e concordo com o termo completo (versão {WAIVER_VERSION}). *
        </label>
        {!canConfirmWaiver ? (
          <span className="hint">Leia o conteúdo até o fim para liberar esta confirmação.</span>
        ) : null}
        {errors.consentWaiverText && <span className="error">{errors.consentWaiverText}</span>}
        </section>

        <section className="consent-block">
        <h2>Consentimentos</h2>

        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={form.consentLiability}
            onChange={(event) => setField("consentLiability", event.target.checked)}
          />
          Entendo que o wakeboard é uma atividade de risco e isento a Blind Wake Club de
          responsabilidades padrão na medida permitida por lei. *
        </label>
        {errors.consentLiability && <span className="error">{errors.consentLiability}</span>}

        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={form.consentMedical}
            onChange={(event) => setField("consentMedical", event.target.checked)}
          />
          Autorizo atendimento médico de emergência caso eu não consiga dar consentimento no momento
          de um incidente. *
        </label>
        {errors.consentMedical && <span className="error">{errors.consentMedical}</span>}

        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={form.consentPrivacy}
            onChange={(event) => setField("consentPrivacy", event.target.checked)}
          />
          Confirmo que li o aviso de privacidade e a política de retenção descritos abaixo. *
        </label>
        {errors.consentPrivacy && <span className="error">{errors.consentPrivacy}</span>}
        </section>

        <section className="signature-block">
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

        <section className="photo-block">
        <h2>Envio de foto opcional</h2>
        <p className="hint">Formatos aceitos: JPEG, PNG, WEBP. Tamanho máximo: 5 MB.</p>
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={(event) => setPhotoFile(event.target.files?.[0] || null)}
        />
        <p className="hint">{photoSummary}</p>
        {photoPreviewUrl ? <img src={photoPreviewUrl} alt="Pré-visualização da foto" className="photo-preview" /> : null}
        {errors.photo && <span className="error">{errors.photo}</span>}
        </section>

        <section className="notice-block">
        <h2>Aviso de privacidade e retenção</h2>
        <p>
          Blind Wake Club armazena os dados do termo para operações de segurança, conformidade
          legal e resposta a incidentes. O acesso é restrito à equipe autorizada.
        </p>
        <p>
          Política de retenção: os registros são mantidos por até 3 anos a partir da data de envio,
          salvo quando houver obrigação legal de armazenamento por prazo maior.
        </p>
        </section>
      </fieldset>

      {serverError && <p className="error server-error">{serverError}</p>}
      {isSubmitting ? (
        <p className="hint submit-status" role="status" aria-live="polite">
          {submitStatusMessage}
        </p>
      ) : null}

      <button type="submit" className="button" disabled={isSubmitting}>
        {submitButtonLabel}
      </button>
    </form>
  );
}
