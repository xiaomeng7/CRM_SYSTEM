import Head from "next/head";
import { ProductCard } from "@/components/ProductCard";
import { livingCollection } from "@/data/living";

export default function LivingPage() {
  return (
    <>
      <Head>
        <title>{livingCollection.title} — Better Home</title>
        <meta name="robots" content="noindex" />
      </Head>
      <ProductCard collection={livingCollection} />
    </>
  );
}
