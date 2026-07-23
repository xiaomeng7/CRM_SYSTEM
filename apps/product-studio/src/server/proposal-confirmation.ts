import {createHmac,timingSafeEqual} from "crypto";

type ConfirmationPayload={
  proposalCode:string;
  fingerprint:string;
  customerEmail:string;
  expiresAt:number;
};

const encode=(value:string)=>Buffer.from(value,"utf8").toString("base64url");
const decode=(value:string)=>Buffer.from(value,"base64url").toString("utf8");
const sign=(payload:string,secret:string)=>createHmac("sha256",secret).update(payload).digest("base64url");

export function createProposalConfirmationToken(input:Omit<ConfirmationPayload,"expiresAt">,secret:string,now=Date.now()){
  if(!secret)throw new Error("PROPOSAL_CONFIRMATION_NOT_CONFIGURED");
  const payload=encode(JSON.stringify({...input,customerEmail:input.customerEmail.trim().toLowerCase(),expiresAt:now+30*24*60*60*1000}));
  return `${payload}.${sign(payload,secret)}`;
}

export function verifyProposalConfirmationToken(token:string,secret:string,now=Date.now()):ConfirmationPayload{
  if(!secret)throw new Error("PROPOSAL_CONFIRMATION_NOT_CONFIGURED");
  const [payload,signature,...rest]=String(token||"").split(".");
  if(!payload||!signature||rest.length)throw new Error("INVALID_CONFIRMATION_LINK");
  const expected=sign(payload,secret),actualBuffer=Buffer.from(signature),expectedBuffer=Buffer.from(expected);
  if(actualBuffer.length!==expectedBuffer.length||!timingSafeEqual(actualBuffer,expectedBuffer))throw new Error("INVALID_CONFIRMATION_LINK");
  let parsed:ConfirmationPayload;
  try{parsed=JSON.parse(decode(payload));}catch{throw new Error("INVALID_CONFIRMATION_LINK");}
  if(!parsed.proposalCode||!parsed.fingerprint||!parsed.customerEmail||!Number.isFinite(parsed.expiresAt))throw new Error("INVALID_CONFIRMATION_LINK");
  if(parsed.expiresAt<now)throw new Error("CONFIRMATION_LINK_EXPIRED");
  return parsed;
}

export const proposalConfirmationSecret=()=>String(process.env.SALES_STUDIO_CONFIRM_SECRET||process.env.SALES_STUDIO_SESSION_SECRET||"").trim();
