#!/usr/bin/env node

const fs=require("fs");
const path=require("path");
const crypto=require("crypto");
const {PrismaClient}=require("@prisma/client");
const {assertProductOsDatabaseTarget,resolveDatabaseUrlForEnv,fingerprintHost}=require("../src/v2/env-guard");

if(!process.argv.includes("--env=neon_dev")||!process.argv.includes("--apply-approved-assets")) throw new Error("Explicit Neon DEV asset approval flags required");
assertProductOsDatabaseTarget({envName:"neon_dev",requireUrl:true,requireFingerprint:true});
const root=path.join(__dirname,"../../..");
const pdf=path.join(root,"docs/product-os/source/Better_Home_Collections_A4_Review_Set_V1.pdf");
const pdfHash=crypto.createHash("sha256").update(fs.readFileSync(pdf)).digest("hex");
if(pdfHash!=="f16c53443b49d71478732fb94dbb0bcc85a5968e645f286167e918f47123fff8") throw new Error("Approved A4 PDF fingerprint mismatch");
const expected={
  "C-01":"5959292cd4f6a911c007b5bcb3598e4cb89ae2ad9380678fb5e487eee301ebdd",
  "C-02":"77b69c95a1d3662f31ba3498a9a7099b85f01e136e3f4361bbaa5e0bbd7e9f25",
  "C-03":"94d8576b0e6c49d98b3e73e78e5d77eb377f78e405f7711dad1cd0616d73a6ad",
  "C-04":"fce83569a60fd499a112e8d372fb0bb97e991540b8adef4dacd5341369659ce1",
  "C-05":"8629a41d5e5361b56ae1f48906e824006957a08d506ab13272f795a2c01734dd",
  "C-06":"01c88a9ebe2fa909ad34e7263de833381542b139b33200eb8b116101b27dba88"
};
const url=resolveDatabaseUrlForEnv("neon_dev"),db=new PrismaClient({datasourceUrl:url});
(async()=>{
  const updated=await db.$transaction(async tx=>{
    const rows=[];
    for(const [code,sha256] of Object.entries(expected)){
      const local=path.join(root,`apps/product-studio/public/assets/product-os/${code.toLowerCase()}/hero-approved-a4.png`);
      const actual=crypto.createHash("sha256").update(fs.readFileSync(local)).digest("hex");
      if(actual!==sha256) throw new Error(`Hero fingerprint mismatch: ${code}`);
      const asset=await tx.pos2ImageAsset.update({where:{assetCode:`asset.${code.toLowerCase().replace("-","_")}.hero`},data:{storageUri:`/assets/product-os/${code.toLowerCase()}/hero-approved-a4.png`,publishStatus:"APPROVED",approvalStatus:"FROZEN",sourceMeta:{sourceSystem:"APPROVED_A4_REVIEW_SET_V1",sourcePdfSha256:pdfHash,derivedFromApprovedPdf:true,originalPhotographyFileAvailable:false,assetSha256:sha256,approvalScope:"A4_PRODUCT_SHEET_AND_DEV_PREVIEW"}}});
      rows.push({productCode:code,assetCode:asset.assetCode,publishStatus:asset.publishStatus});
    }
    return rows;
  });
  console.log(JSON.stringify({target:"neon_dev",fingerprint:fingerprintHost(url),sourcePdfSha256:pdfHash,updated}));
})().finally(()=>db.$disconnect()).catch(e=>{console.error(`Asset registration failed: ${e.code||e.message}`);process.exitCode=1});
