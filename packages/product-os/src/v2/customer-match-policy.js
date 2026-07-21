function normalizeEmail(value){return String(value||"").trim().toLowerCase();}
function normalizePhone(value){const digits=String(value||"").replace(/\D/g,"");return digits.length>=8?digits.slice(-9):"";}

function evaluateCustomerMatch({input={},candidates=[]}={}){
  if(input.crmContactId)return {decision:"LINK_EXPLICIT_ID",requiresHumanReview:false,crmContactId:String(input.crmContactId),candidateIds:[]};
  const email=normalizeEmail(input.email),phone=normalizePhone(input.phone);
  const matches=candidates.filter(c=>(email&&normalizeEmail(c.email)===email)||(phone&&normalizePhone(c.phone)===phone));
  if(matches.length===0)return {decision:"NO_MATCH_CREATE_REVIEW",requiresHumanReview:true,crmContactId:null,candidateIds:[]};
  if(matches.length===1)return {decision:"SUGGEST_EXISTING_REVIEW",requiresHumanReview:true,crmContactId:null,candidateIds:[String(matches[0].id)]};
  return {decision:"AMBIGUOUS_MANUAL_REVIEW",requiresHumanReview:true,crmContactId:null,candidateIds:matches.map(x=>String(x.id))};
}

module.exports={normalizeEmail,normalizePhone,evaluateCustomerMatch};
