import Head from "next/head";
import type { GetServerSideProps } from "next";

type Draft = {
  draftCode: string;
  status: string;
  customerName: string | null;
  customerEmail: string | null;
  siteAddress: string | null;
  currentVersion: number;
  updatedAt: string;
  owner: { displayName: string; email: string } | null;
  customerLink: { status: string; crmContactId: string | null } | null;
  latest: { total: number; currencyCode: string; versionNumber: number } | null;
};
type Dashboard = {
  actor: { email: string | null; role: string };
  counts: {
    drafts: number;
    readyForReview: number;
    unlinkedCustomers: number;
    proposals: Record<string, number>;
  };
  drafts: Draft[];
};
type Props = { locked: boolean; dashboard?: Dashboard };
const money = (n: number) =>
  new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    maximumFractionDigits: 0,
  }).format(n);

export default function SalesHome({ locked, dashboard }: Props) {
  if (locked)
    return (
      <main className="sales-locked">
        <div>
          <p>BETTER HOME</p>
          <h1>Sales Studio</h1>
          <span>Internal access is not configured on this environment.</span>
          <a href="/better-home">Return to Better Home</a>
        </div>
      </main>
    );
  const d = dashboard!;
  return (
    <>
      <Head>
        <title>Sales Studio — Better Home</title>
        <meta name="robots" content="noindex,nofollow" />
      </Head>
      <main className="sales-shell">
        <aside className="sales-nav">
          <a href="/sales" className="sales-brand">
            BETTER HOME
          </a>
          <p>SALES STUDIO</p>
          <nav>
            <a className="active" href="/sales">
              Overview
            </a>
            <a href="/configure">New selection</a>
            <a href="/sales">Customers</a>
            <a href="/sales/proposals">Proposals</a>
          </nav>
          <footer>
            <b>{d.actor.email}</b>
            <span>{d.actor.role}</span>
            <a href="/logout">Sign out</a>
          </footer>
        </aside>
        <section className="sales-main">
          <header>
            <div>
              <p>OVERVIEW</p>
              <h1>Good evening.</h1>
              <span>A quiet view of the work moving towards a decision.</span>
            </div>
            <a href="/configure">New selection</a>
          </header>
          <div className="sales-metrics">
            <article>
              <span>Active drafts</span>
              <b>{d.counts.drafts}</b>
            </article>
            <article>
              <span>Ready for review</span>
              <b>{d.counts.readyForReview}</b>
            </article>
            <article>
              <span>Customer link required</span>
              <b>{d.counts.unlinkedCustomers}</b>
            </article>
            <article>
              <span>Approved proposals</span>
              <b>{d.counts.proposals.APPROVED || 0}</b>
            </article>
          </div>
          <section className="sales-list">
            <div className="sales-list-head">
              <div>
                <p>RECENT SELECTIONS</p>
                <h2>Drafts</h2>
              </div>
              <a href="/configure">Create new</a>
            </div>
            {d.drafts.length ? (
              <div className="sales-table">
                {d.drafts.map((x) => (
                  <article key={x.draftCode}>
                    <div>
                      <b>{x.customerName || "Unnamed customer"}</b>
                      <span>
                        {x.siteAddress ||
                          x.customerEmail ||
                          "Customer details pending"}
                      </span>
                    </div>
                    <div>
                      <small>{x.draftCode}</small>
                      <span>Version {x.currentVersion}</span>
                    </div>
                    <div>
                      <small>
                        {x.customerLink?.status === "CONFIRMED"
                          ? "CRM confirmed"
                          : "CRM review"}
                      </small>
                      <span>{x.status.replaceAll("_", " ")}</span>
                    </div>
                    <strong>{x.latest ? money(x.latest.total) : "—"}</strong>
                    <a className="sales-open" href={`/sales/drafts/${x.draftCode}`}>Open</a>
                  </article>
                ))}
              </div>
            ) : (
              <div className="sales-empty">
                <h3>No customer selections yet.</h3>
                <p>
                  Begin with a room, an experience and a clear reason it belongs
                  in the home.
                </p>
                <a href="/configure">Create the first selection</a>
              </div>
            )}
          </section>
        </section>
      </main>
    </>
  );
}

export const getServerSideProps: GetServerSideProps<Props> = async (context) => {
  const { actorFromRequest } = await import("@/server/sales-auth");
  const actor = actorFromRequest(context.req);
  if (!actor) return { redirect: { destination: "/login?next=%2Fsales", permanent: false } };
  const { readContext, salesStudioService } = require("@bht/product-os/v2");
  const os = readContext.createProductOsV2ReadContext();
  try {
    const dashboard = await salesStudioService
      .createSalesStudioService(os.prisma)
      .dashboard(actor);
    return {
      props: {
        locked: false,
        dashboard: JSON.parse(JSON.stringify(dashboard)),
      },
    };
  } finally {
    await os.disconnect();
  }
};
