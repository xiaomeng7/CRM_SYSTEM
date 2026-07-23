import Head from "next/head";
import type {GetServerSideProps} from "next";
import {useEffect,useMemo,useState} from "react";
import type {ProductSheetModel} from "@/components/DatabaseProductSheet";
import SalesSidebar from "@/components/SalesSidebar";

type Product=ProductSheetModel&{productKind:string;hierarchy:{requiresFoundation:boolean}};
type ResumeDraft={draftCode:string;customerName:string|null;customerEmail:string|null;customerPhone:string|null;siteAddress:string|null;latest:{lines:{productCode:string;quantity:number}[]}|null};
type Props={products:Product[];resumeDraft?:ResumeDraft|null;actor:{email:string|null;role:string}};
type Quantities=Record<string,number>;

const money=(n:number)=>new Intl.NumberFormat("en-AU",{style:"currency",currency:"AUD",maximumFractionDigits:0}).format(n);

export default function Configure({products,resumeDraft,actor}:Props){
  const foundation=products.find(p=>p.productKind==="FOUNDATION");
  const collections=products.filter(p=>p.productKind==="COLLECTION");
  const experiences=products.filter(p=>p.productKind==="EXPERIENCE"&&p.productCode!=="E-04");
  const roomExperiences=experiences.filter(p=>p.productCode==="E-01"||p.productCode==="E-03");
  const wholeHomeExperiences=experiences.filter(p=>p.productCode!=="E-01"&&p.productCode!=="E-03");
  const standalone=products.filter(p=>p.productKind==="STANDALONE"||p.productCode==="E-04");
  const [selected,setSelected]=useState<string[]>([]);
  const [quantities,setQuantities]=useState<Quantities>({});
  const [customer,setCustomer]=useState({name:"",email:"",phone:"",siteAddress:""});
  const [message,setMessage]=useState("");
  const [draftCode,setDraftCode]=useState("");
  const [preparing,setPreparing]=useState(false);
  const [experienceTargets,setExperienceTargets]=useState<Record<string,string[]>>({});
  useEffect(()=>{try{if(resumeDraft?.latest){setSelected(resumeDraft.latest.lines.map(x=>x.productCode));setQuantities(Object.fromEntries(resumeDraft.latest.lines.map(x=>[x.productCode,x.quantity])));setCustomer({name:resumeDraft.customerName||"",email:resumeDraft.customerEmail||"",phone:resumeDraft.customerPhone||"",siteAddress:resumeDraft.siteAddress||""});setDraftCode(resumeDraft.draftCode);return;}const raw=localStorage.getItem("better-home-selection-draft-v1");if(raw){const draft=JSON.parse(raw);setSelected(Array.isArray(draft.selected)?draft.selected:[]);setQuantities(draft.quantities||{});setExperienceTargets(draft.experienceTargets||{});setCustomer(draft.customer||{name:"",email:"",phone:"",siteAddress:""});setDraftCode(draft.draftCode||`DRAFT-${crypto.randomUUID().toUpperCase()}`);}else setDraftCode(`DRAFT-${crypto.randomUUID().toUpperCase()}`);}catch{setDraftCode(`DRAFT-${crypto.randomUUID().toUpperCase()}`);}},[resumeDraft]);
  const selectedSet=useMemo(()=>new Set(selected),[selected]);
  const selectedParents=products.filter(p=>selectedSet.has(p.productCode));
  const permittedAddons=useMemo(()=>{
    const byCode=new Map<string,{addon:Product["permittedAddons"][number];parents:string[]}>();
    for(const parent of selectedParents)for(const addon of parent.permittedAddons){const found=byCode.get(addon.productCode);if(found)found.parents.push(parent.productCode);else byCode.set(addon.productCode,{addon,parents:[parent.productCode]});}
    return [...byCode.values()];
  },[selectedParents]);
  const addOnCodes=new Set(permittedAddons.map(x=>x.addon.productCode));
  const roomTargets=collections.filter(collection=>selectedSet.has(collection.productCode)).flatMap(collection=>Array.from({length:quantities[collection.productCode]||1},(_,index)=>({key:`${collection.productCode}:${index+1}`,productCode:collection.productCode,label:`${collection.canonicalName.replace(" Collection","")} ${index+1}`})));
  const compatibleRoomTargets=(experience:Product)=>roomTargets.filter(room=>collections.find(collection=>collection.productCode===room.productCode)?.compatibleExperiences.some(item=>item.productCode===experience.productCode));
  const effectiveSelected=selected.filter(code=>products.some(p=>p.productCode===code)||addOnCodes.has(code));
  const lines=effectiveSelected.map(code=>{
    const product=products.find(p=>p.productCode===code);const addon=permittedAddons.find(x=>x.addon.productCode===code)?.addon;
    const targetQty=product?.productKind==="EXPERIENCE"?(experienceTargets[code]||[]).filter(target=>roomTargets.some(room=>room.key===target)).length:0;
    return {code,name:product?.canonicalName||addon?.canonicalName||code,amount:product?.activePrice?.amount??addon?.price?.amount??0,qty:targetQty||quantities[code]||1,targets:targetQty?(experienceTargets[code]||[]).map(target=>roomTargets.find(room=>room.key===target)?.label).filter(Boolean):[]};
  });
  const total=lines.reduce((sum,x)=>sum+x.amount*x.qty,0);
  const toggle=(code:string)=>setSelected(current=>{
    if(current.includes(code)){
      let next=current.filter(x=>x!==code);
      if(code===foundation?.productCode){
        const dependent=new Set(products.filter(p=>p.hierarchy.requiresFoundation&&p.productCode!=="E-04").map(p=>p.productCode));
        next=next.filter(x=>!dependent.has(x));
      }
      const allowedAddons=new Set(products.filter(p=>next.includes(p.productCode)).flatMap(p=>p.permittedAddons.map(a=>a.productCode)));
      return next.filter(x=>products.some(p=>p.productCode===x)||allowedAddons.has(x));
    }
    const product=products.find(p=>p.productCode===code);
    const needsFoundation=product?.hierarchy.requiresFoundation&&product.productCode!=="E-04"&&foundation&&!current.includes(foundation.productCode);
    return [...current,...(needsFoundation?[foundation.productCode]:[]),code];
  });
  const setQty=(code:string,qty:number)=>setQuantities(q=>({...q,[code]:Math.max(1,Math.floor(qty||1))}));
  const toggleExperienceTarget=(experience:Product,target:string)=>{setExperienceTargets(current=>{const active=(current[experience.productCode]||[]).filter(key=>roomTargets.some(room=>room.key===key));const next=active.includes(target)?active.filter(key=>key!==target):[...active,target];setSelected(selectedNow=>next.length?[...selectedNow.filter(code=>code!==experience.productCode),experience.productCode]:selectedNow.filter(code=>code!==experience.productCode));return {...current,[experience.productCode]:next};});};
  const requestProjection=async()=>{const response=await fetch("/api/proposals/preview",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({customer,lines:lines.map(x=>({productCode:x.code,quantity:x.qty}))})});const result=await response.json();if(!response.ok)throw new Error(result.error);return result;};
  const saveDraft=async()=>{setMessage("Saving customer and selection…");localStorage.setItem("better-home-selection-draft-v1",JSON.stringify({schemaVersion:"1.0.0",draftCode,savedAt:new Date().toISOString(),selected:effectiveSelected,quantities,experienceTargets,customer}));try{const projection=await requestProjection();const response=await fetch("/api/drafts/save",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({draftCode,projection})});const result=await response.json();if(!response.ok)throw new Error(result.error);setMessage(`${result.draftCode} version ${result.versionNumber} saved. The customer is now in Better Home Customers.`);return result;}catch(error){setMessage(`Saved on this device; server save failed: ${error instanceof Error?error.message:"UNKNOWN"}`);return null;}};
  const openProposal=()=>{setPreparing(true);const savedAt=new Date().toISOString();const proposal={proposalId:draftCode,status:"INDICATIVE PREVIEW",generatedAt:savedAt,customer,currencyCode:"AUD",taxBasis:"GST_INCLUSIVE",lines:lines.map(line=>({productCode:line.code,productName:line.targets.length?`${line.name} — ${line.targets.join(", ")}`:line.name,quantity:line.qty,unitPrice:line.amount,lineTotal:line.amount*line.qty})),total,commercialNotice:"Indicative selection only. Final scope, site conditions and pricing are confirmed before contract."};localStorage.setItem("better-home-selection-draft-v1",JSON.stringify({schemaVersion:"1.0.0",draftCode,savedAt,selected:effectiveSelected,quantities,experienceTargets,customer}));localStorage.setItem("better-home-proposal-preview-v1",JSON.stringify(proposal));window.location.assign("/proposal-preview");};
  const createProposal=async()=>{if(!customer.name.trim()){setMessage("Add the customer name before creating a Proposal.");return;}setPreparing(true);try{const saved=await saveDraft();if(!saved)throw new Error("The Proposal was not created because the Draft could not be saved.");const ready=await fetch(`/api/drafts/${encodeURIComponent(draftCode)}/ready`,{method:"POST"});const readyResult=await ready.json();if(!ready.ok)throw new Error(readyResult.error||"Unable to mark Draft ready");const response=await fetch(`/api/drafts/${encodeURIComponent(draftCode)}/proposals`,{method:"POST"});const result=await response.json();if(!response.ok)throw new Error(result.error||"Unable to create Proposal");window.location.assign(`/sales/proposals/${encodeURIComponent(result.proposalCode)}`);}catch(error){setMessage(error instanceof Error?error.message:"Unable to create Proposal");setPreparing(false);}};
  const Card=({p}:{p:Product})=><article className={`cfg-card ${selectedSet.has(p.productCode)?"is-selected":""}`}>
    {p.approvedImage?<figure className="cfg-card-image"><img src={p.approvedImage.storageUri} alt={p.approvedImage.altText||p.canonicalName}/></figure>:null}
    <div><span>{p.productCode}</span><h3>{p.canonicalName}</h3><p>{p.customerContent.subtitle||p.hero}</p></div>
    <div className="cfg-card-actions"><strong>{p.activePrice?money(p.activePrice.amount):"Contact us"}</strong><a href={`/product/${p.productCode}`} target="_blank">View A4</a><button onClick={()=>toggle(p.productCode)}>{selectedSet.has(p.productCode)?"Remove":"Add"}</button></div>
  </article>;
  return <><Head><title>Build your Better Home selection</title><meta name="robots" content="noindex"/></Head><main className="sales-shell cfg-sales-shell"><SalesSidebar active="configure" email={actor.email} role={actor.role}/><section className="cfg-shell">
    <header className="cfg-hero"><a href="/sales">BETTER HOME</a><p>PRODUCT CONFIGURATOR</p><h1>Start with the way you want to live.</h1><span>Choose a foundation, add the rooms that matter, then extend only the experiences already in your home.</span></header>
    <div className="cfg-layout"><div className="cfg-flow">
      <section><div className="cfg-step"><b>01</b><div><h2>Foundation</h2><p>The shared layer every connected Collection and Experience relies on.</p></div></div>{foundation&&<Card p={foundation}/>}</section>
      <section><div className="cfg-step"><b>02</b><div><h2>Collections</h2><p>Choose one for each room or living area you want Better Home to support.</p></div></div><div className="cfg-grid">{collections.map(p=><Card key={p.productCode} p={p}/>)}</div></section>
      <section><div className="cfg-step"><b>03</b><div><h2>Experiences</h2><p>Mood Lighting and Healthy Air belong to a selected room. Climate supports the central air-conditioning system as one whole-home Experience.</p></div></div><div className="cfg-grid">{roomExperiences.map(p=>{const targets=compatibleRoomTargets(p);const active=experienceTargets[p.productCode]||[];return <article key={p.productCode} className={`cfg-card cfg-experience ${selectedSet.has(p.productCode)?"is-selected":""}`}>{p.approvedImage?<figure className="cfg-card-image"><img src={p.approvedImage.storageUri} alt={p.approvedImage.altText||p.canonicalName}/></figure>:null}<div><span>{p.productCode}</span><h3>{p.canonicalName}</h3><p>{p.customerContent.subtitle||p.hero}</p></div><div className="cfg-room-targets"><small>{targets.length?"APPLY TO":"SELECT A COMPATIBLE COLLECTION FIRST"}</small>{targets.map(target=><button key={target.key} className={active.includes(target.key)?"is-active":""} onClick={()=>toggleExperienceTarget(p,target.key)}>{target.label}</button>)}</div><div className="cfg-card-actions"><strong>{p.activePrice?`${money(p.activePrice.amount)} per room`:"Contact us"}</strong><a href={`/product/${p.productCode}`} target="_blank">View A4</a>{selectedSet.has(p.productCode)&&<button onClick={()=>{setSelected(current=>current.filter(code=>code!==p.productCode));setExperienceTargets(current=>({...current,[p.productCode]:[]}));}}>Remove all</button>}</div></article>;})}{wholeHomeExperiences.map(p=><div key={p.productCode} className="cfg-whole-home"><small>WHOLE-HOME · NO ROOM SELECTION REQUIRED</small><Card p={p}/></div>)}</div></section>
      {standalone.length>0&&<section><div className="cfg-step"><b>04</b><div><h2>Independent products</h2><p>Garden Care and other independent products can be purchased without first selecting a Collection.</p></div></div><div className="cfg-grid">{standalone.map(p=><Card key={p.productCode} p={p}/>)}</div></section>}
      <section><div className="cfg-step"><b>05</b><div><h2>Permitted Add-ons</h2><p>Only equipment already present in a selected product can be extended.</p></div></div>{permittedAddons.length?<div className="cfg-grid">{permittedAddons.map(({addon,parents})=><article key={addon.productCode} className={`cfg-card cfg-addon ${selectedSet.has(addon.productCode)?"is-selected":""}`}><div><span>{addon.productCode} · FOR {parents.join(" / ")}</span><h3>{addon.canonicalName}</h3><p>{addon.experiencePromise||addon.standardScopeUnit}</p></div><div className="cfg-card-actions"><strong>{addon.price?money(addon.price.amount):"Contact us"}</strong><button onClick={()=>toggle(addon.productCode)}>{selectedSet.has(addon.productCode)?"Remove":"Add"}</button></div></article>)}</div>:<div className="cfg-empty">Select a Collection or Experience to see its permitted Add-ons.</div>}</section>
    </div><aside className="cfg-quote"><p>YOUR SELECTION</p><h2>Estimated investment</h2>{lines.length?<div className="cfg-lines">{lines.map(x=><div key={x.code}><div><b>{x.name}</b><span>{x.code}</span></div><label>× <input aria-label={`${x.name} quantity`} type="number" min="1" value={x.qty} onChange={e=>setQty(x.code,Number(e.target.value))}/></label><strong>{money(x.amount*x.qty)}</strong><button className="cfg-line-remove" onClick={()=>toggle(x.code)} aria-label={`Remove ${x.name}`}>Remove</button></div>)}</div>:<p className="cfg-muted">Nothing selected yet.</p>}<div className="cfg-total"><span>Indicative total<br/><small>Installed · incl. GST unless marked otherwise</small></span><strong>{money(total)}</strong></div><div className="cfg-customer"><input placeholder="Customer name" value={customer.name} onChange={e=>setCustomer({...customer,name:e.target.value})}/><input placeholder="Email" value={customer.email} onChange={e=>setCustomer({...customer,email:e.target.value})}/><input placeholder="Phone" value={customer.phone} onChange={e=>setCustomer({...customer,phone:e.target.value})}/><textarea placeholder="Site address" value={customer.siteAddress} onChange={e=>setCustomer({...customer,siteAddress:e.target.value})}/></div><div className="cfg-action-guide"><b>Save draft</b><span>Save the customer and editable selection.</span><b>Preview &amp; print</b><span>Open a printable preview. Nothing is sent.</span><b>Create proposal</b><span>Fix this version and add it to Proposals.</span></div><div className="cfg-quote-actions"><button onClick={()=>saveDraft()} disabled={!lines.length||preparing}>Save draft</button><button onClick={openProposal} disabled={!lines.length||preparing}>Preview &amp; print</button></div><button className="cfg-primary" onClick={createProposal} disabled={!lines.length||preparing}>{preparing?"Creating…":"Create proposal"}</button>{message&&<p className="cfg-message">{message}</p>}<p className="cfg-note">Creating a Proposal saves it for internal review. It does not email the customer automatically.</p></aside></div>
  </section></main></>;
}

export const getServerSideProps:GetServerSideProps<Props>=async context=>{
  const {actorFromRequest}=await import("@/server/sales-auth");const actor=actorFromRequest(context.req);if(!actor)return {redirect:{destination:`/login?next=${encodeURIComponent(context.resolvedUrl)}`,permanent:false}};
  const {getSalesCatalog}=await import("@/server/catalog-cache");const products:Product[]=await getSalesCatalog();let resumeDraft=null;const requested=typeof context.query.draft==="string"?context.query.draft:null;if(requested){const {readContext,salesStudioService}=require("@bht/product-os/v2");const os=readContext.createProductOsV2ReadContext();try{resumeDraft=await salesStudioService.createSalesStudioService(os.prisma).draftDetail(actor,requested);}finally{await os.disconnect();}}return {props:{products:JSON.parse(JSON.stringify(products)),resumeDraft:resumeDraft?JSON.parse(JSON.stringify(resumeDraft)):null,actor:{email:actor.email,role:actor.role}}};
};
