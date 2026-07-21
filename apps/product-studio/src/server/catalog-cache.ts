const CACHE_TTL_MS=30*60*1000;
const cacheKey="__betterHomeSalesCatalogCache";

type CacheEntry={expiresAt:number;products:any[]};

export async function getSalesCatalog(){
  const root=globalThis as typeof globalThis&Record<string,unknown>;
  const cached=root[cacheKey] as CacheEntry|undefined;
  if(cached&&cached.expiresAt>Date.now())return cached.products;
  const {readContext}=require("@bht/product-os/v2");
  const os=readContext.createProductOsV2ReadContext();
  try{const products=JSON.parse(JSON.stringify(await os.service.listProductModels()));root[cacheKey]={products,expiresAt:Date.now()+CACHE_TTL_MS};return products;}finally{await os.disconnect();}
}
