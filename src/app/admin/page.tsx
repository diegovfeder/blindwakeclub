import Link from "next/link";
import { cookies } from "next/headers";

import { ADMIN_SESSION_COOKIE, isAdminTokenValid } from "@/lib/security";
import { readSubmissions } from "@/lib/storage";

type PageProps = {
  searchParams: Promise<{
    error?: string;
  }>;
};

export const dynamic = "force-dynamic";

export default async function AdminPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const cookieStore = await cookies();
  const adminToken = cookieStore.get(ADMIN_SESSION_COOKIE)?.value || "";

  if (!isAdminTokenValid(adminToken)) {
    return (
      <main className="page-panel">
        <section className="page-intro">
          <p className="kicker">Área restrita</p>
          <h1>Envios administrativos</h1>
          <p>Informe seu token de admin para visualizar os envios de termos.</p>
        </section>

        <form className="token-form" action="/api/admin/session" method="post">
          <label>
            Token de admin
            <input name="token" type="password" autoComplete="current-password" required />
          </label>
          <button className="button" type="submit">
            Ver envios
          </button>
        </form>
        {params.error === "invalid-token" ? (
          <p className="error server-error">Token inválido. Tente novamente.</p>
        ) : null}
      </main>
    );
  }

  const submissions = await readSubmissions();

  return (
    <main className="page-panel">
      <section className="page-intro">
        <p className="kicker">Painel de controle</p>
        <h1>Envios administrativos</h1>
        <p>Total de registros: {submissions.length}</p>
      </section>

      <div className="actions">
        <Link href="/api/admin/submissions.csv" className="button">
          Baixar exportação CSV
        </Link>
        <form action="/api/admin/logout" method="post">
          <button className="button button-secondary" type="submit">
            Sair
          </button>
        </form>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Criado em</th>
              <th>Nome</th>
              <th>Email</th>
              <th>Telefone</th>
              <th>Contato de emergência</th>
              <th>Foto</th>
              <th>Hash de integridade</th>
            </tr>
          </thead>
          <tbody>
            {submissions.map((row) => (
              <tr key={row.id}>
                <td>{row.id}</td>
                <td>{new Date(row.createdAt).toLocaleString()}</td>
                <td>{row.payload.fullName}</td>
                <td>{row.payload.email}</td>
                <td>{row.payload.phone}</td>
                <td>
                  {row.payload.emergencyContactName} ({row.payload.emergencyContactRelationship})
                </td>
                <td>{row.payload.photoKey || "-"}</td>
                <td className="hash-cell">{row.tamperHash}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
