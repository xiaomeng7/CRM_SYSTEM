import type { LivingCollection } from "@/data/collection";
import { CollectionFront } from "./CollectionFront";
import { CollectionBack } from "./CollectionBack";

interface ProductCardProps {
  collection: LivingCollection;
}

export function ProductCard({ collection }: ProductCardProps) {
  return (
    <div className="studio">
      <div className="studio__toolbar screen-only">
        <button
          type="button"
          className="studio__print-btn"
          onClick={() => window.print()}
        >
          Print
        </button>
      </div>

      <div className="studio__pages">
        <section className="product-page product-page--front" aria-label="Front">
          <CollectionFront collection={collection} />
        </section>
        <section className="product-page product-page--back" aria-label="Back">
          <CollectionBack collection={collection} />
        </section>
      </div>
    </div>
  );
}
