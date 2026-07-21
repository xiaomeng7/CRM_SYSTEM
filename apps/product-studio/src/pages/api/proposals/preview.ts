import type {NextApiRequest,NextApiResponse} from "next";

export default async function handler(req:NextApiRequest,res:NextApiResponse){
  if(req.method!=="POST")return res.status(405).json({error:"METHOD_NOT_ALLOWED"});
  const requested=Array.isArray(req.body?.lines)?req.body.lines:[];
  if(!requested.length)return res.status(400).json({error:"EMPTY_SELECTION"});
  const requestedCodes=requested.map((x:{productCode:string})=>String(x.productCode||"").toUpperCase());
  if(new Set(requestedCodes).size!==requestedCodes.length)return res.status(400).json({error:"DUPLICATE_PRODUCT_LINE"});
  const {readContext,selectionQuote,proposalProjection}=require("@bht/product-os/v2");
  const os=readContext.createProductOsV2ReadContext({envName:"neon_dev"});
  try{
    const models=(await Promise.all(requested.map((x:{productCode:string})=>os.service.getProduct(String(x.productCode||"").toUpperCase()))));
    if(models.some((x:unknown)=>!x))return res.status(400).json({error:"UNKNOWN_PRODUCT"});
    const selectedCodes=models.map((x:{productCode:string})=>x.productCode);
    const selectedParents=models.filter((x:{productKind:string})=>x.productKind!=="ADDON");
    const permitted=new Set(selectedParents.flatMap((x:{permittedAddons:{productCode:string}[]})=>x.permittedAddons.map(a=>a.productCode)));
    const invalidAddon=models.find((x:{productKind:string;productCode:string})=>x.productKind==="ADDON"&&!permitted.has(x.productCode));
    if(invalidAddon)return res.status(400).json({error:"ADDON_PARENT_REQUIRED",productCode:invalidAddon.productCode});
    const foundationSelected=selectedCodes.includes("F-01");
    const quote=selectionQuote.calculateSelectionQuote(models.map((product:{productCode:string})=>({product,quantity:Number(requested.find((x:{productCode:string})=>String(x.productCode).toUpperCase()===product.productCode)?.quantity||1)})),{foundationSelected});
    if(!quote.valid)return res.status(400).json({error:"INVALID_SELECTION",details:quote.errors});
    return res.status(200).json(proposalProjection.buildProposalProjection({customer:req.body?.customer,quote,selectedAt:new Date().toISOString()}));
  }catch(error){return res.status(500).json({error:"PROPOSAL_PREVIEW_FAILED"});}finally{await os.disconnect();}
}
