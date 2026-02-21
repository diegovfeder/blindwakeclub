import InstagramIcon from "@/components/instagram-icon";
import { WaiverForm } from "@/components/waiver-form";
import { INSTAGRAM_PROFILE, SOCIAL_LINKS } from "@/lib/constants";

type PageProps = {
  searchParams: Promise<{
    submitted?: string;
  }>;
};

export default async function HomePage({ searchParams }: PageProps) {
  const { submitted } = await searchParams;

  return (
    <main className="page-panel">
      <section className="page-intro">
        <p className="kicker">Termo digital</p>
        <h1>Termo de Responsabilidade</h1>
        <p>Preencha os campos obrigatórios, assine e envie para concluir seu cadastro da sessão.</p>
      </section>

      <section className="social-card" aria-label="Instagram da Blind Wake Club">
        <div className="social-copy">
          <p className="kicker">Comunidade</p>
          <h2>Siga a BL!ND no Instagram</h2>
          <p>
            {INSTAGRAM_PROFILE.displayName} · {INSTAGRAM_PROFILE.location}
          </p>
          <p className="social-handle">{INSTAGRAM_PROFILE.handle}</p>
        </div>

        <a href={SOCIAL_LINKS.instagram} target="_blank" rel="noreferrer" className="social-cta">
          <InstagramIcon size={20} color="currentColor" className="instagram-icon" />
          Abrir perfil
        </a>
      </section>

      {submitted ? (
        <p className="submission-id">
          ID do envio: <strong>{submitted}</strong>
        </p>
      ) : null}

      <WaiverForm />
    </main>
  );
}
