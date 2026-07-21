import Head from "next/head";
import type {GetServerSideProps} from "next";
import {useEffect,useState} from "react";

type ProposalLine={productCode:string;productName:string;quantity:number;unitPrice:number|null;lineTotal:number|null};
type Proposal={proposalId:string;status:string;generatedAt:string;customer:{name:string;email:string;phone:string;siteAddress:string};currencyCode:string;taxBasis:string;lines:ProposalLine[];total:number;commercialNotice:string};

const money=(value:number|null)=>value==null?"Contact us":new Intl.NumberFormat("en-AU",{style:"currency",currency:"AUD",maximumFractionDigits:0}).format(value);

export default function ProposalPreview(){
  const [proposal,setProposal]=useState<Proposal|null>(null);
  useEffect(()=>{try{const raw=localStorage.getItem("better-home-proposal-preview-v1");if(raw)setProposal(JSON.parse(raw));}catch{setProposal(null);}},[]);
  return <><Head><title>Proposal preview — Better Home</title><meta name="robots" content="noindex"/></Head><main className="proposal-preview-shell">
    <div className="proposal-toolbar"><a href="/configure">Back to selection</a><button onClick={()=>window.print()} disabled={!proposal}>Print / Save PDF</button></div>
    {!proposal?<section className="proposal-empty"><h1>No proposal preview is ready.</h1><p>Return to the configurator and choose Preview &amp; print.</p><a href="/configure">Open configurator</a></section>:<section className="proposal-page">
      <header className="proposal-head"><div><span>BETTER HOME</span><h1>Proposal preview</h1><p>Residential Living Experience</p></div><div><b>{proposal.proposalId}</b><span>{new Date(proposal.generatedAt).toLocaleDateString("en-AU")}</span><em>{proposal.status}</em></div></header>
      <section className="proposal-customer"><div><span>Prepared for</span><h2>{proposal.customer.name||"Customer name to be confirmed"}</h2><p>{proposal.customer.email}</p><p>{proposal.customer.phone}</p></div><div><span>Installation address</span><p>{proposal.customer.siteAddress||"Site address to be confirmed"}</p></div></section>
      <section className="proposal-selection"><h2>Your Better Home selection</h2><div className="proposal-table"><div className="proposal-row proposal-row--head"><span>Product</span><span>Qty</span><span>Unit</span><span>Total</span></div>{proposal.lines.map(line=><div className="proposal-row" key={line.productCode}><div><b>{line.productName}</b><small>{line.productCode}</small></div><span>{line.quantity}</span><span>{money(line.unitPrice)}</span><strong>{money(line.lineTotal)}</strong></div>)}</div></section>
      <section className="proposal-total"><div><span>Indicative investment</span><small>Installed · GST inclusive unless stated otherwise</small></div><strong>{money(proposal.total)}</strong></section>
      <section className="proposal-next"><h2>What happens next</h2><div><article><b>01</b><p>Review this selection together.</p></article><article><b>02</b><p>Confirm site conditions and final scope.</p></article><article><b>03</b><p>Issue the formal proposal for approval.</p></article></div></section>
      <footer><p>{proposal.commercialNotice}</p><span>Technology should quietly support everyday life.</span></footer>
    </section>}
  </main></>;
}

export const getServerSideProps:GetServerSideProps=async context=>{
  const {actorFromRequest}=await import("@/server/sales-auth");
  if(!actorFromRequest(context.req))return {redirect:{destination:`/login?next=${encodeURIComponent(context.resolvedUrl)}`,permanent:false}};
  return {props:{}};
};
