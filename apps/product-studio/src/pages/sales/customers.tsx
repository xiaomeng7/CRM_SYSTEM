import Head from "next/head";
import Link from "next/link";
import type {GetServerSideProps} from "next";

type Segment="better_home"|"other_crm";
type Customer={contact_id:string;name:string|null;email:string|null;phone:string|null;account_id:string|null;account_name:string|null;updated_at:string|null;source:"SERVICEM8"|"CRM"|"PRODUCT_OS";draft_code:string|null};
type Props={customers:Customer[];segment:Segment};

export default function Customers({customers,segment}:Props){
  const isBetterHome=segment==="better_home";
  return <>
    <Head><title>Customers — Better Home Sales Studio</title><meta name="robots" content="noindex,nofollow"/></Head>
    <main className="sales-shell">
      <aside className="sales-nav"><Link href="/sales" className="sales-brand">BETTER HOME</Link><p>SALES STUDIO</p><nav><Link href="/sales">Overview</Link><Link href="/configure" prefetch>New selection</Link><Link className="active" href="/sales/customers">Customers</Link><Link href="/sales/proposals">Proposals</Link></nav></aside>
      <section className="sales-main">
        <header><div><p>CUSTOMERS</p><h1>People and homes.</h1><span>{isBetterHome?"Customers already connected to Better Home.":"General CRM contacts available for a new Better Home conversation."}</span></div><Link href="/configure" prefetch>Start a selection</Link></header>
        <nav className="sales-customer-tabs" aria-label="Customer directory">
          <Link className={isBetterHome?"active":""} href="/sales/customers">Better Home customers</Link>
          <Link className={!isBetterHome?"active":""} href="/sales/customers?segment=other_crm">Other CRM contacts</Link>
        </nav>
        {!isBetterHome&&<aside className="sales-directory-note"><strong>Separate CRM directory</strong><span>These contacts are not Better Home customers yet. Many came from ServiceM8, including older imported records. Selecting one starts a new Better Home conversation; it does not change the original CRM record.</span></aside>}
        <section className="sales-list sales-customers">
          <div className="sales-list-head"><div><p>{isBetterHome?"BETTER HOME":"CRM DIRECTORY"}</p><h2>{isBetterHome?"Better Home customers":"Other contacts"}</h2></div></div>
          {customers.length?<div className="sales-table">{customers.map(customer=><article key={customer.contact_id}><div><b>{customer.name||"Unnamed contact"}</b><span>{customer.account_name||"No account"}</span></div><div><small>EMAIL</small><span>{customer.email||"—"}</span></div><div><small>PHONE</small><span>{customer.phone||"—"}</span></div><div><small>SOURCE</small><span>{customer.source==="SERVICEM8"?"ServiceM8":customer.source==="PRODUCT_OS"?"Better Home":"CRM"}</span></div><strong>{customer.updated_at?new Date(customer.updated_at).toLocaleDateString("en-AU"):"—"}</strong><Link className="sales-open" href={customer.draft_code?`/configure?draft=${encodeURIComponent(customer.draft_code)}`:`/configure?customer=${encodeURIComponent(customer.contact_id)}`}>{customer.draft_code?"Open":"Select"}</Link></article>)}</div>:<div className="sales-empty"><h3>{isBetterHome?"No Better Home customers yet.":"No other CRM contacts found."}</h3><p>{isBetterHome?"Save a named Draft and the customer will appear here.":"New customers can still begin from a fresh selection."}</p>{isBetterHome&&<Link href="/configure">Start a new selection</Link>}</div>}
        </section>
      </section>
    </main>
  </>;
}

export const getServerSideProps:GetServerSideProps<Props>=async context=>{
  const {actorFromRequest}=await import("@/server/sales-auth");
  const actor=actorFromRequest(context.req);
  if(!actor)return {redirect:{destination:"/login?next=%2Fsales%2Fcustomers",permanent:false}};
  const segment:Segment=context.query.segment==="other_crm"?"other_crm":"better_home";
  const {readContext,salesStudioService}=require("@bht/product-os/v2");
  const os=readContext.createProductOsV2ReadContext();
  try{return {props:{segment,customers:JSON.parse(JSON.stringify(await salesStudioService.createSalesStudioService(os.prisma).customers(actor,{segment})))}};}
  finally{await os.disconnect();}
};
