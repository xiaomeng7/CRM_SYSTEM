const {assertCan,canAccessDraft}=require("./sales-auth-policy");
const {normalizeDraftCode}=require("./sales-draft-service");
function normalizeProposalCode(value){const code=String(value||"").trim().toUpperCase();if(!/^PROP-[A-Z0-9]{10}$/.test(code))throw new Error("Invalid proposal code");return code;}

function createSalesStudioService(prisma){
  async function dashboard(actor){
    const a=assertCan(actor,"CATALOG_READ");
    const ownOnly=a.role==="SALES";
    const draftWhere=ownOnly?{ownerUser:{externalSubject:a.userId}}:{};
    const [drafts,proposalGroups]=await Promise.all([
      prisma.pos2SelectionDraft.findMany({where:draftWhere,include:{ownerUser:{select:{displayName:true,email:true}},customerLink:true,versions:{orderBy:{versionNumber:"desc"},take:1,select:{versionNumber:true,total:true,currencyCode:true,createdAt:true,selectionFingerprint:true}}},orderBy:{updatedAt:"desc"},take:100}),
      prisma.pos2Proposal.groupBy({by:["status"],_count:{_all:true}})
    ]);
    const rows=drafts.map(d=>({draftCode:d.draftCode,status:d.status,customerName:d.customerName,customerEmail:d.customerEmail,siteAddress:d.siteAddress,currentVersion:d.currentVersion,updatedAt:d.updatedAt,owner:d.ownerUser,customerLink:d.customerLink?{status:d.customerLink.status,crmContactId:d.customerLink.crmContactId}:null,latest:d.versions[0]?{versionNumber:d.versions[0].versionNumber,total:Number(d.versions[0].total),currencyCode:d.versions[0].currencyCode,createdAt:d.versions[0].createdAt,selectionFingerprint:d.versions[0].selectionFingerprint}:null}));
    return {actor:a,counts:{drafts:rows.length,readyForReview:rows.filter(x=>x.status==="READY_FOR_REVIEW").length,unlinkedCustomers:rows.filter(x=>x.customerLink?.status!=="CONFIRMED").length,proposals:Object.fromEntries(proposalGroups.map(x=>[x.status,x._count._all]))},drafts:rows};
  }
  async function draftDetail(actor,draftCode){
    const a=assertCan(actor,"CATALOG_READ");
    const code=normalizeDraftCode(draftCode);
    const draft=await prisma.pos2SelectionDraft.findUnique({
      where:{draftCode:code},
      include:{
        ownerUser:{select:{displayName:true,email:true,externalSubject:true}},
        customerLink:true,
        versions:{orderBy:{versionNumber:"desc"},include:{lines:{orderBy:{productCodeSnapshot:"asc"}},proposals:{orderBy:{createdAt:"desc"}}}}
      }
    });
    if(!draft)return null;
    if(!canAccessDraft(a,draft.ownerUser?.externalSubject,"READ")){
      const error=new Error("Draft access denied");error.code="SALES_STUDIO_FORBIDDEN";throw error;
    }
    const versions=draft.versions.map(v=>({
      id:v.id,versionNumber:v.versionNumber,selectionFingerprint:v.selectionFingerprint,
      customerSnapshot:v.customerSnapshot,currencyCode:v.currencyCode,taxBasis:v.taxBasis,
      total:Number(v.total),createdAt:v.createdAt,
      lines:v.lines.map(line=>({productCode:line.productCodeSnapshot,productName:line.productNameSnapshot,quantity:line.quantity,unitPrice:Number(line.unitPrice),lineTotal:Number(line.lineTotal)})),
      proposals:v.proposals.map(p=>({proposalCode:p.proposalCode,status:p.status,total:Number(p.total),createdAt:p.createdAt,approvedAt:p.approvedAt,sentAt:p.sentAt}))
    }));
    return {draftCode:draft.draftCode,status:draft.status,customerName:draft.customerName,customerEmail:draft.customerEmail,customerPhone:draft.customerPhone,siteAddress:draft.siteAddress,currentVersion:draft.currentVersion,createdAt:draft.createdAt,updatedAt:draft.updatedAt,owner:draft.ownerUser?{displayName:draft.ownerUser.displayName,email:draft.ownerUser.email}:null,customerLink:draft.customerLink?{status:draft.customerLink.status,crmContactId:draft.customerLink.crmContactId}:null,versions,latest:versions[0]||null};
  }
  async function proposalDetail(actor,proposalCode){
    const a=assertCan(actor,"PROPOSAL_PREVIEW"),code=normalizeProposalCode(proposalCode);
    const proposal=await prisma.pos2Proposal.findUnique({where:{proposalCode:code},include:{approvedByUser:{select:{displayName:true,email:true}},deliveries:{orderBy:{deliveredAt:"desc"}},acceptance:true,operationalHandoff:true,draftVersion:{include:{draft:{include:{ownerUser:{select:{displayName:true,email:true,externalSubject:true}},customerLink:true}},lines:{orderBy:{productCodeSnapshot:"asc"}}}}}});
    if(!proposal)return null;const draft=proposal.draftVersion.draft;
    if(!canAccessDraft(a,draft.ownerUser?.externalSubject,"READ")){const error=new Error("Proposal access denied");error.code="SALES_STUDIO_FORBIDDEN";throw error;}
    return {proposalCode:proposal.proposalCode,status:proposal.status,total:Number(proposal.total),currencyCode:proposal.currencyCode,taxBasis:proposal.taxBasis,selectionFingerprint:proposal.selectionFingerprint,createdAt:proposal.createdAt,updatedAt:proposal.updatedAt,approvedAt:proposal.approvedAt,sentAt:proposal.sentAt,approvedBy:proposal.approvedByUser,deliveries:proposal.deliveries,acceptance:proposal.acceptance?{...proposal.acceptance,acceptedTotal:Number(proposal.acceptance.acceptedTotal)}:null,operationalHandoff:proposal.operationalHandoff,projectionSnapshot:proposal.projectionSnapshot,draft:{draftCode:draft.draftCode,versionNumber:proposal.draftVersion.versionNumber,customerName:draft.customerName,customerEmail:draft.customerEmail,customerPhone:draft.customerPhone,siteAddress:draft.siteAddress,owner:draft.ownerUser?{displayName:draft.ownerUser.displayName,email:draft.ownerUser.email}:null,customerLink:draft.customerLink?{status:draft.customerLink.status,crmContactId:draft.customerLink.crmContactId}:null},lines:proposal.draftVersion.lines.map(x=>({productCode:x.productCodeSnapshot,productName:x.productNameSnapshot,quantity:x.quantity,unitPrice:Number(x.unitPrice),lineTotal:Number(x.lineTotal)}))};
  }
  async function proposals(actor){
    const a=assertCan(actor,"PROPOSAL_PREVIEW"),ownOnly=a.role==="SALES";
    const rows=await prisma.pos2Proposal.findMany({where:ownOnly?{draftVersion:{draft:{ownerUser:{externalSubject:a.userId}}}}:{},include:{draftVersion:{include:{draft:{select:{draftCode:true,customerName:true,siteAddress:true}}}}},orderBy:{updatedAt:"desc"},take:100});
    return rows.map(x=>({proposalCode:x.proposalCode,status:x.status,total:Number(x.total),currencyCode:x.currencyCode,updatedAt:x.updatedAt,draftCode:x.draftVersion.draft.draftCode,draftVersion:x.draftVersion.versionNumber,customerName:x.draftVersion.draft.customerName,siteAddress:x.draftVersion.draft.siteAddress}));
  }
  async function customers(actor){
    assertCan(actor,"CATALOG_READ");
    const rows=await prisma.$queryRaw`
      SELECT c.id::text AS contact_id,c.name,c.email,c.phone,
        a.id::text AS account_id,a.name AS account_name,
        c.updated_at
      FROM contacts c
      LEFT JOIN accounts a ON a.id=c.account_id
      ORDER BY c.updated_at DESC NULLS LAST
      LIMIT 100`;
    return rows.map(row=>({...row,updated_at:row.updated_at?new Date(row.updated_at).toISOString():null}));
  }
  return {dashboard,draftDetail,proposalDetail,proposals,customers};
}

module.exports={normalizeProposalCode,createSalesStudioService};
