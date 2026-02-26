import { WaiverForm } from "@/components/waiver-form";
import Link from "next/link";

type PageProps = {
  searchParams: Promise<{
    submitted?: string;
    pdf?: string;
    waiverVersion?: string;
  }>;
};

export default async function HomePage({ searchParams }: PageProps) {
  const { submitted, pdf, waiverVersion } = await searchParams;
  const pdfDownloadUrl = pdf?.startsWith("/api/submissions/") ? pdf : null;
  const hasSubmission = Boolean(submitted);
  const statusText = pdfDownloadUrl
    ? "PDF pronto para download"
    : "PDF em processamento";

  return (
    <main className="page-panel">
      <section className="page-intro">
        <p className="kicker">Termo digital</p>
        <h1>
          {hasSubmission
            ? "Termo enviado com sucesso"
            : "Termo de Responsabilidade"}
        </h1>
        <p>
          {hasSubmission
            ? "Pronto. Seu envio foi registrado com sucesso e já está disponível para consulta."
            : "Preencha os campos obrigatórios, assine e envie para concluir seu cadastro da sessão."}
        </p>
      </section>

      {hasSubmission ? (
        <section className="submission-success">
          <header className="success-hero">
            <span className="success-badge" aria-hidden="true">
              ✓
            </span>
            <div>
              <p className="success-kicker">Envio confirmado</p>
              <h2>Cadastro concluído</h2>
              <p className="success-copy">
                Guarde o identificador abaixo e baixe seu termo assinado para
                referência.
              </p>
            </div>
          </header>

          <div className="success-meta-grid">
            <article className="success-meta-card">
              <p className="success-meta-label">ID do envio</p>
              <p className="success-meta-value success-meta-value-mono">
                {submitted}
              </p>
            </article>

            {waiverVersion ? (
              <article className="success-meta-card">
                <p className="success-meta-label">Versão do termo</p>
                <p className="success-meta-value">{waiverVersion}</p>
              </article>
            ) : null}

            <article className="success-meta-card">
              <p className="success-meta-label">Status do documento</p>
              <p className="success-meta-value">{statusText}</p>
            </article>
          </div>

          <div className="success-actions">
            {pdfDownloadUrl ? (
              <a href={pdfDownloadUrl} className="button">
                Baixar meu termo (PDF)
              </a>
            ) : null}
            <Link href="/" className="button button-secondary">
              Enviar novo termo
            </Link>
          </div>

          <p className="success-note">
            Se precisar de suporte, informe o ID do envio para a equipe do BL!ND
            WAKE CLUB.
          </p>
        </section>
      ) : (
        <WaiverForm />
      )}
    </main>
  );
}
