#!/usr/bin/env node

const fs=require("fs");
const path=require("path");
const crypto=require("crypto");
const {PrismaClient}=require("@prisma/client");
const {assertProductOsDatabaseTarget,resolveDatabaseUrlForEnv,fingerprintHost}=require("../src/v2/env-guard");

if(!process.argv.includes("--env=neon_dev")||!process.argv.includes("--apply-approved-assets"))throw new Error("Explicit Neon DEV asset approval flags required");
const sourceArg=process.argv.find(value=>value.startsWith("--source-dir="));
if(!sourceArg)throw new Error("--source-dir is required");
const sourceDir=sourceArg.slice("--source-dir=".length);
assertProductOsDatabaseTarget({envName:"neon_dev",requireUrl:true,requireFingerprint:true});
const root=path.join(__dirname,"../../..");
const expected={
  "F-01":{pdf:"Foundation_A4_V1.pdf",pdfSha256:"d129ed38167e3e10cb0eb9f212dddef087d7511acf51c6d6bdcc707399ca3d3c",assetSha256:"db38fa0efb0ae5ede22a41a1b81a67be1bdb89991173d7fd8fc36041852503ce"},
  "E-01":{pdf:"Mood_Lighting_A4_V1.pdf",pdfSha256:"231b4e1f7243aec58174deb835ebd19a4a2e789af89a6c4e6001aac049a19ec1",assetSha256:"06153727e9854ad9acb1f28f205a22eebab1589ca3999aa474d6277f0ee7b65f"},
  "E-02":{pdf:"Climate_A4_V1.pdf",pdfSha256:"c4e972042f89a1f5789b6adecdeacb609cd07443202e77061dc1a926bc6eebba",assetSha256:"a88de7206e6bfd46f31decfa6771c20386cf43a1a7ae95ff3ea0461d268e289b"},
  "E-03":{pdf:"Healthy_Air_A4_V1.pdf",pdfSha256:"6264323203f891d8630eb61e580e5a1be4eefae71b3e124b2932bda2ffdafa6b",assetSha256:"399a541eb3dfdea39e91a5e5bb0aae0662723fbb5af09108291c8d3d7ef1695c"},
  "E-04":{pdf:"Garden_Care_A4_V1.pdf",pdfSha256:"1bc2ed7ea1ebb64d55ea08a0e41e7fdd19cf6837a4336b76815c0d313df67ea6",assetSha256:"66ced3b244f37b3c517ed58ebe4426260ad250c0d494f054e20c148cae4b206d"},
  "E-05":{pdf:"CCTV_A4_V2_E05.pdf",pdfSha256:"7be48a813d347e91a5523b4b4dd40046b23745a0e3eb54051ceb5f7e3a6a7102",assetSha256:"7d74cb34efb0e692b0d467d61d05f7be9b8757cbb7e737db4cbcc4574a68e04c"},
  "E-06":{pdf:"Smart_Toilet_A4_V2_E06.pdf",pdfSha256:"b8cfbb79f063d842064a1d4aaa9d1704f8d8db53912d1820566916009f245805",assetSha256:"a2f3e566c8908a4c371c07e348ce5c0f4e8161cdabcccfbc3254d9cf050d70bd"}
};
const digest=file=>crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const url=resolveDatabaseUrlForEnv("neon_dev"),db=new PrismaClient({datasourceUrl:url});
(async()=>{const updated=await db.$transaction(async tx=>{const rows=[];for(const [code,item] of Object.entries(expected)){const pdf=path.join(sourceDir,item.pdf),asset=path.join(root,`apps/product-studio/public/assets/product-os/${code.toLowerCase()}/hero-approved-a4.png`);if(digest(pdf)!==item.pdfSha256)throw new Error(`Approved PDF fingerprint mismatch: ${code}`);if(digest(asset)!==item.assetSha256)throw new Error(`Hero fingerprint mismatch: ${code}`);const record=await tx.pos2ImageAsset.update({where:{assetCode:`asset.${code.toLowerCase().replace("-","_")}.hero`},data:{storageUri:`/assets/product-os/${code.toLowerCase()}/hero-approved-a4.png`,publishStatus:"APPROVED",approvalStatus:"FROZEN",sourceMeta:{sourceSystem:"APPROVED_A4_PRODUCT_SHEET",sourceFile:item.pdf,sourcePdfSha256:item.pdfSha256,derivedFromApprovedPdf:true,originalPhotographyFileAvailable:false,assetSha256:item.assetSha256,approvalScope:"A4_PRODUCT_SHEET_AND_DEV_PREVIEW"}}});rows.push({productCode:code,assetCode:record.assetCode,publishStatus:record.publishStatus});}return rows;});console.log(JSON.stringify({target:"neon_dev",fingerprint:fingerprintHost(url),updated}));})().finally(()=>db.$disconnect()).catch(error=>{console.error(`Asset registration failed: ${error.code||error.message}`);process.exitCode=1;});
