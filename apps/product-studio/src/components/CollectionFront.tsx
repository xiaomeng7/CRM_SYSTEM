import type { LivingCollection } from "@/data/collection";

interface CollectionFrontProps {
  collection: LivingCollection;
}

export function CollectionFront({ collection }: CollectionFrontProps) {
  return (
    <div className="card-front">
      <header className="card-front__header">
        <div className="card-front__header-left">
          <span className="card-front__brand">{collection.brandName}</span>
          <span className="card-front__collection">{collection.title}</span>
        </div>
        <div className="card-front__header-right">
          <span className="card-front__code">{collection.code}</span>
          <span
            className="card-front__accent-tab"
            style={{ backgroundColor: collection.accentColor }}
            aria-hidden="true"
          />
        </div>
      </header>

      <section className="card-front__hero-statement">
        <h1 className="card-front__hero-title">
          {collection.heroStatement.split("\n").map((line, index) => (
            <span key={line}>
              {index > 0 ? <br /> : null}
              {line}
            </span>
          ))}
        </h1>
        <p className="card-front__hero-subtitle">{collection.subtitle}</p>
      </section>

      <figure className="card-front__hero-image">
        <img
          src={collection.heroImage}
          alt={collection.heroImageAlt}
          className="card-front__hero-img"
        />
      </figure>

      <section className="card-front__story">
        {collection.story.map((paragraph) => (
          <p key={paragraph} className="card-front__story-paragraph">
            {paragraph}
          </p>
        ))}
      </section>

      <section className="card-front__moments">
        <h2 className="card-front__moments-title">Everyday Moments</h2>
        <ul className="card-front__moments-list">
          {collection.moments.map((moment) => (
            <li key={moment} className="card-front__moment">
              <span className="card-front__moment-mark" aria-hidden="true" />
              <span className="card-front__moment-label">{moment}</span>
            </li>
          ))}
        </ul>
      </section>

      <blockquote className="card-front__quote">
        <p>{collection.closingQuote}</p>
      </blockquote>
    </div>
  );
}
