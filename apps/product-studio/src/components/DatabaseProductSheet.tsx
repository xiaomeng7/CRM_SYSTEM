export type ProductSheetModel = {
  productCode:string; canonicalName:string; productKind:string; hero:string|null; approvedImage:{storageUri:string;altText:string|null}|null; printEligible:boolean;
  customerContent:{subtitle:string|null;storyTitle:string|null;storyBody:string|null;problem:string|null;response:string|null;frontMoments:{sequence:number;title:string|null;caption:string|null}[]};
  customerExperiences:{title:string|null;description:string|null;sequence:number}[]; standardScope:{heading:string|null;lines:string[];sequence:number}[];
  compatibleExperiences:{productCode:string;canonicalName:string;customerCopy:string}[]; permittedAddons:{productCode:string;canonicalName:string;experiencePromise:string|null;standardScopeUnit:string|null;price:{amount:number}|null}[]; featuredAddons:{productCode:string;canonicalName:string;experiencePromise:string|null;standardScopeUnit:string|null;price:{amount:number}|null}[];
  installationAssumptions:string[]; activePrice:{amount:number;currencyCode:string;displayMode:string;taxBasis:string;fulfilmentMode:string}|null; includedBenefits:{benefitCode:string;displayName:string;unlocked:boolean;missingProductCodes:string[]}[];
  themeLayout:{themes:{tokens:Record<string,string>}[]}; releaseVersion:string;
};

const money=(n:number)=>new Intl.NumberFormat("en-AU",{style:"currency",currency:"AUD",maximumFractionDigits:0}).format(n);

export function DatabaseProductSheet({product}:{product:ProductSheetModel}){
  const accent=product.themeLayout?.themes?.[0]?.tokens?.accent || "#68785f";
  return <main className="os-sheet-wrap" style={{"--accent":accent} as React.CSSProperties}>
    <div className="os-toolbar"><div><strong>{product.productCode}</strong> · Product OS DEV</div><div className="os-toolbar-actions"><a href="/configure">Build a selection</a><button onClick={()=>window.print()} disabled={!product.printEligible}>{product.printEligible?"Print A4":"Image approval required"}</button></div></div>
    <section className="os-page os-front">
      <header className="os-kicker"><span>BETTER HOME</span><span>{product.productCode}</span></header>
      <div className="os-front-title"><p>{product.canonicalName}</p><h1>{product.hero}</h1><h2>{product.customerContent.subtitle}</h2></div>
      {product.approvedImage?<figure className="os-hero"><img src={product.approvedImage.storageUri} alt={product.approvedImage.altText||product.canonicalName}/></figure>:<div className="os-hero os-hero--pending"><span>Approved hero image pending</span></div>}
      <section className="os-story"><h3>{product.customerContent.storyTitle}</h3><p>{product.customerContent.storyBody}</p></section>
      <div className="os-moments">{product.customerContent.frontMoments.map(x=><div key={x.sequence}><b>{x.title}</b><span>{x.caption}</span></div>)}</div>
      <footer>Technology should quietly support everyday life.</footer>
    </section>
    <section className="os-page os-back">
      <header className="os-back-head"><div><span>{product.productCode} / DECISION GUIDE</span><h1>{product.canonicalName}</h1></div><div className="os-price">{product.activePrice?<><strong>{product.activePrice.displayMode==="FROM"?"From ":""}{money(product.activePrice.amount)}</strong><span>{product.activePrice.fulfilmentMode==="INSTALLED"?"INSTALLED":"SUPPLY ONLY"} · {product.activePrice.taxBasis==="GST_INCLUSIVE"?"INCL GST":"EX GST"}</span></>:<strong>Contact us</strong>}</div></header>
      <div className="os-decision"><article><h2>The problem</h2><p>{product.customerContent.problem}</p></article><article><h2>How Better Home responds</h2><p>{product.customerContent.response}</p></article></div>
      <section><h2>What you experience</h2><div className="os-experiences">{product.customerExperiences.map((x,i)=><article key={i}><span>{String(i+1).padStart(2,"0")}</span><div><h3>{x.title}</h3><p>{x.description}</p></div></article>)}</div></section>
      <section><h2>Included in this product</h2><div className={`os-scope os-scope--count-${product.standardScope.length}`}>{product.standardScope.map(x=><article key={x.sequence}><h3>{x.heading}</h3>{x.lines.map(y=><p key={y}>{y}</p>)}</article>)}</div></section>
      <div className="os-lower"><section><h2>Expand further</h2>{product.compatibleExperiences.map(x=><article key={x.productCode}><h3>{x.canonicalName}</h3><p>{x.customerCopy}</p></article>)}{product.includedBenefits.map(x=><article key={x.benefitCode} className="os-benefit"><h3>{x.displayName}</h3><p>{x.unlocked?"Included with this selection.":`Unlocks with ${x.missingProductCodes.join(" + ")}.`}</p></article>)}</section><section><h2>Available Add-ons</h2>{(product.featuredAddons||[]).map(x=><article key={x.productCode}><h3>{x.canonicalName}</h3><p>{x.experiencePromise||x.standardScopeUnit}</p><small>{x.price?money(x.price.amount):"Contact us"}</small></article>)}</section></div>
      <section className="os-assumptions"><h2>Installation assumptions</h2><p>{product.installationAssumptions.join(" ")}</p></section>
      <footer><span>FOUNDATION → COLLECTION → EXPERIENCE → ADD-ON</span><span>{product.productCode} | {product.releaseVersion} | 2/2</span></footer>
    </section>
  </main>
}
