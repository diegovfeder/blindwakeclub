import Link from "next/link";

export default function NotFound() {
  return (
    <main className="page-panel not-found-panel">
      <section className="not-found-content">
        <p className="kicker">Erro 404</p>
        <h1>Página não encontrada</h1>
        <p>
          Este endereço não está disponível no momento. Use o botão abaixo para continuar no
          termo digital.
        </p>
      </section>

      <div className="actions not-found-actions">
        <Link href="/" className="button">
          Abrir termo digital
        </Link>
        <Link href="/admin" className="button button-secondary">
          Ir para área admin
        </Link>
      </div>
    </main>
  );
}
