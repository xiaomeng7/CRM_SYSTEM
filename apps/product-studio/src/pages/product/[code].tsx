import Head from "next/head";
import type {GetServerSideProps} from "next";
import {DatabaseProductSheet,type ProductSheetModel} from "@/components/DatabaseProductSheet";

export default function ProductSheetPage({product}:{product:ProductSheetModel}){return <><Head><title>{`${product.canonicalName} — Better Home`}</title><meta name="robots" content="noindex"/></Head><DatabaseProductSheet product={product}/></>}

export const getServerSideProps:GetServerSideProps=async(ctx)=>{
  const code=String(ctx.params?.code||"").toUpperCase();
  const {readContext}=require("@bht/product-os/v2");
  const os=readContext.createProductOsV2ReadContext();
  try{const product=await os.service.getProduct(code);if(!product)return {notFound:true};return {props:{product:JSON.parse(JSON.stringify(product))}}}finally{await os.disconnect()}
};
