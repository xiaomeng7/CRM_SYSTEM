export type ProductSheetModel = {
  productCode:string; canonicalName:string; productKind:string; hero:string|null; approvedImage:{storageUri:string;altText:string|null}|null; printEligible:boolean;
  customerContent:{subtitle:string|null;decisionSubtitle?:string|null;storyTitle:string|null;storyBody:string|null;problem:string|null;response:string|null;frontMoments:{sequence:number;title:string|null;caption:string|null}[]};
  customerExperiences:{title:string|null;description:string|null;sequence:number}[]; standardScope:{heading:string|null;lines:string[];sequence:number}[];
  compatibleExperiences:{productCode:string;canonicalName:string;customerCopy:string}[]; permittedAddons:{productCode:string;canonicalName:string;experiencePromise:string|null;standardScopeUnit:string|null;price:{amount:number}|null}[]; featuredAddons:{productCode:string;canonicalName:string;experiencePromise:string|null;standardScopeUnit:string|null;price:{amount:number}|null}[];
  installationAssumptions:string[]; activePrice:{amount:number;currencyCode:string;displayMode:string;taxBasis:string;fulfilmentMode:string}|null; includedBenefits:{benefitCode:string;displayName:string;unlocked:boolean;missingProductCodes:string[]}[];
  themeLayout:{themes:{tokens:Record<string,string>}[]}; releaseVersion:string;
};

const money=(n:number)=>new Intl.NumberFormat("en-AU",{style:"currency",currency:"AUD",maximumFractionDigits:0}).format(n);

export function DatabaseProductSheet({product}:{product:ProductSheetModel}){
  const accent="#697d61";
  const approvedHeroLines:Record<string,string[]>={"C-03":["The day","begins quietly."]};
  const heroLines=approvedHeroLines[product.productCode]||(product.hero||"").split(/(?<=\.)\s+/).filter(Boolean);
  const productClass=`os-product-${product.productCode.toLowerCase().replace(/[^a-z0-9]+/g,"-")}`;
  const linearMoments=["F-01","C-01","C-03"].includes(product.productCode);
  const hierarchy=["FOUNDATION","COLLECTION","EXPERIENCE","ADD-ON"];
  const activeHierarchy=product.productKind==="ADDON"?"ADD-ON":product.productKind;
  return <main className={`os-sheet-wrap ${productClass} os-kind-${product.productKind.toLowerCase()} ${linearMoments?"os-layout-linear-moments":""}`} style={{"--accent":accent} as React.CSSProperties}>
    <div className="os-toolbar"><div><a href="/sales">BETTER HOME</a><span> · {product.productCode}</span></div><div className="os-toolbar-actions"><a href="/sales">Sales Studio</a><a href="/configure">Build a selection</a><button onClick={()=>window.print()} disabled={!product.printEligible}>{product.printEligible?"Print A4":"Image approval required"}</button></div></div>
    <section className="os-page os-front">
      <header className="os-kicker"><div><strong>BETTER HOME</strong><span>{product.canonicalName}</span></div><b>{product.productCode}</b></header>
      <div className="os-front-title"><h1>{heroLines.map((line,index)=><span key={index}>{line}</span>)}</h1><h2>{product.customerContent.subtitle}</h2></div>
      {product.approvedImage?<figure className="os-hero"><img src={product.approvedImage.storageUri} alt={product.approvedImage.altText||product.canonicalName}/></figure>:<div className="os-hero os-hero--pending"><span>Approved hero image pending</span></div>}
      <section className="os-story"><h3>{product.customerContent.storyTitle}</h3><p>{product.customerContent.storyBody}</p></section>
      <section className="os-moments-section"><h3>Everyday moments</h3><div className="os-moments">{product.customerContent.frontMoments.map(x=><div key={x.sequence}><small>{String(x.sequence).padStart(2,"0")}</small><b>{x.title}</b><span>{x.caption}</span></div>)}</div></section>
      <div className="os-front-quote">“Technology should quietly support everyday life.”</div>
      <footer><strong>BETTER HOME TECHNOLOGY PTY LTD</strong><span>{product.productCode} | {product.releaseVersion} | 1/2</span></footer>
    </section>
    <section className="os-page os-back">
      <header className="os-back-head"><div><span>{product.productCode} / DECISION GUIDE</span><h1>{product.canonicalName}</h1>{product.customerContent.decisionSubtitle?<p>{product.customerContent.decisionSubtitle}</p>:null}</div><div className="os-price">{product.activePrice?<><strong>{product.activePrice.displayMode==="FROM"?"From ":""}{money(product.activePrice.amount)}</strong><span>{product.activePrice.fulfilmentMode==="INSTALLED"?"INSTALLED":"SUPPLY ONLY"} · {product.activePrice.taxBasis==="GST_INCLUSIVE"?"INCL GST":"EX GST"}</span></>:<strong>Contact us</strong>}</div></header>
      <div className="os-decision"><article><h2>The problem</h2><p>{product.customerContent.problem}</p></article><article><h2>How Better Home responds</h2><p>{product.customerContent.response}</p></article></div>
      <section><h2>What you experience</h2><div className="os-experiences">{product.customerExperiences.map((x,i)=><article key={i}><span>{String(i+1).padStart(2,"0")}</span><div><h3>{x.title}</h3><p>{x.description}</p></div></article>)}</div></section>
      <section><h2>Included in this product</h2><div className="os-scope">{product.standardScope.map(x=><article key={x.sequence}><h3>{x.heading}</h3>{x.lines.map(y=><p key={y}>{y}</p>)}</article>)}</div></section>
      <div className="os-lower"><section><h2>Expand further</h2>{product.compatibleExperiences.map(x=><article key={x.productCode}><h3>{x.canonicalName}</h3><p>{x.customerCopy}</p></article>)}{product.includedBenefits.map(x=><article key={x.benefitCode} className="os-benefit"><h3>{x.displayName}</h3><p>{x.unlocked?"Included with this selection.":`Unlocks with ${x.missingProductCodes.join(" + ")}.`}</p></article>)}</section><section><h2>Available Add-ons</h2>{(product.featuredAddons||[]).map(x=><article key={x.productCode}><h3>{x.canonicalName}</h3><p>{x.experiencePromise||x.standardScopeUnit}</p><small>{x.price?money(x.price.amount):"Contact us"}</small></article>)}</section></div>
      <section className="os-assumptions"><h2>Installation assumptions</h2><p>{product.installationAssumptions.join(" ")}</p></section>
      <footer><nav aria-label="Product hierarchy">{hierarchy.map((level,index)=><span key={level} className={activeHierarchy===level?"is-active":""}>{level}{index<hierarchy.length-1?<i>→</i>:null}</span>)}</nav><span>{product.productCode} | {product.releaseVersion} | 2/2</span></footer>
    </section>
  </main>
}
