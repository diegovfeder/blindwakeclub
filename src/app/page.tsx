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

  return (
    <main className="page-panel">
      <section className="page-intro">
        <p className="kicker">Termo digital</p>
        <h1>{hasSubmission ? "Termo enviado com sucesso" : "Termo de Responsabilidade"}</h1>
        <p>
          {hasSubmission
            ? "Seu envio foi registrado. Você pode baixar sua cópia em PDF agora."
            : "Preencha os campos obrigatórios, assine e envie para concluir seu cadastro da sessão."}
        </p>
      </section>

      {hasSubmission ? (
        <section className="submission-id">
          <p>
            ID do envio: <strong>{submitted}</strong>
          </p>
          {waiverVersion ? <p>Versão do termo aceito: {waiverVersion}</p> : null}
          <div className="actions">
            {pdfDownloadUrl ? (
              <a href={pdfDownloadUrl} className="button">
                Baixar meu termo (PDF)
              </a>
            ) : null}
            <Link href="/" className="button button-secondary">
              Enviar novo termo
            </Link>
          </div>
        </section>
      ) : (
        <WaiverForm />
      )}
    </main>
  );
}
