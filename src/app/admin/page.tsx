import Link from "next/link";
import { cookies } from "next/headers";

import { ADMIN_SESSION_COOKIE, isAdminTokenValid } from "@/lib/security";
import { readSubmissions } from "@/lib/storage";
import type { SubmissionRecord } from "@/lib/types";

type PageProps = {
  searchParams: Promise<{
    error?: string;
    q?: string;
  }>;
};

export const dynamic = "force-dynamic";

function normalizeQuery(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function rowMatchesQuery(row: SubmissionRecord, query: string): boolean {
  const normalized = normalizeQuery(query);
  if (!normalized) {
    return true;
  }

  const haystack = normalizeQuery(
    [
      row.id,
      row.payload.fullName,
      row.payload.email,
      row.payload.phone,
      row.payload.idNumber,
      row.payload.emergencyContactName,
      row.payload.emergencyContactPhone,
      row.payload.emergencyContactRelationship,
      row.waiver.version,
    ].join(" "),
  );

  return haystack.includes(normalized);
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString("pt-BR");
}

function compactHash(value: string): string {
  if (value.length <= 24) {
    return value;
  }

  return `${value.slice(0, 12)}...${value.slice(-8)}`;
}

export default async function AdminPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const query = (params.q || "").trim();
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

  const allSubmissions = await readSubmissions();
  const submissions = query ? allSubmissions.filter((row) => rowMatchesQuery(row, query)) : allSubmissions;

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const totalCount = allSubmissions.length;
  const todayCount = allSubmissions.filter((row) => {
    const date = new Date(row.createdAt);
    return Number.isFinite(date.getTime()) && date >= todayStart;
  }).length;
  const withPhotoCount = allSubmissions.filter((row) => Boolean(row.payload.photoKey)).length;
  const withPdfCount = allSubmissions.filter((row) => Boolean(row.documents?.waiverPdfKey)).length;

  return (
    <main className="page-panel">
      <section className="page-intro">
        <p className="kicker">Painel de controle</p>
        <h1>Envios administrativos</h1>
        <p>{query ? `Exibindo ${submissions.length} resultado(s) para "${query}".` : `Total de registros: ${totalCount}`}</p>
      </section>

      <section className="admin-stats-grid" aria-label="Resumo de envios">
        <article className="admin-stat-card">
          <p className="admin-stat-label">Total</p>
          <p className="admin-stat-value">{totalCount}</p>
        </article>
        <article className="admin-stat-card">
          <p className="admin-stat-label">Hoje</p>
          <p className="admin-stat-value">{todayCount}</p>
        </article>
        <article className="admin-stat-card">
          <p className="admin-stat-label">Com foto</p>
          <p className="admin-stat-value">{withPhotoCount}</p>
        </article>
        <article className="admin-stat-card">
          <p className="admin-stat-label">Com PDF</p>
          <p className="admin-stat-value">{withPdfCount}</p>
        </article>
      </section>

      <form className="admin-filter-form" method="get">
        <label>
          Buscar por ID, nome, e-mail, telefone ou documento
          <input
            type="search"
            name="q"
            defaultValue={query}
            placeholder="Ex.: Ana, ana@email.com, 12345678900..."
          />
        </label>
        <div className="actions">
          <button className="button button-secondary" type="submit">
            Buscar
          </button>
          {query ? (
            <Link href="/admin" className="button button-secondary">
              Limpar filtro
            </Link>
          ) : null}
        </div>
      </form>

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
              <th>Participante</th>
              <th>Contato de emergência</th>
              <th>Termo</th>
              <th>Arquivos</th>
              <th>Hash de integridade</th>
            </tr>
          </thead>
          <tbody>
            {submissions.length === 0 ? (
              <tr>
                <td colSpan={7}>Nenhum envio encontrado para o filtro atual.</td>
              </tr>
            ) : null}
            {submissions.map((row) => (
              <tr key={row.id}>
                <td>
                  <strong>{row.id}</strong>
                </td>
                <td>{formatDateTime(row.createdAt)}</td>
                <td>
                  <strong>{row.payload.fullName}</strong>
                  <br />
                  {row.payload.email}
                  <br />
                  {row.payload.phone}
                  <br />
                  Documento: {row.payload.idNumber}
                </td>
                <td>
                  {row.payload.emergencyContactName} ({row.payload.emergencyContactRelationship})
                  <br />
                  {row.payload.emergencyContactPhone}
                </td>
                <td>
                  Versão: {row.waiver.version}
                  <br />
                  Aceite em: {formatDateTime(row.waiver.acceptedAt)}
                  <br />
                  Leitura do termo completo: {row.payload.consentWaiverText ? "sim" : "não"}
                </td>
                <td>
                  <a href={`/api/submissions/${row.id}/pdf`} className="admin-inline-link">
                    Baixar PDF
                  </a>
                  <br />
                  Foto enviada: {row.payload.photoKey ? "sim" : "não"}
                </td>
                <td className="hash-cell" title={row.tamperHash}>
                  {compactHash(row.tamperHash)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
