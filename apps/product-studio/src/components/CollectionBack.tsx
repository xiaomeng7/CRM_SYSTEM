import type { LivingCollection } from "@/data/collection";

interface CollectionBackProps {
  collection: LivingCollection;
}

export function CollectionBack({ collection }: CollectionBackProps) {
  return (
    <div className="card-back">
      <header className="card-back__header">
        <div className="card-back__header-left">
          <h1 className="card-back__title">{collection.title}</h1>
          <p className="card-back__subtitle">{collection.collectionSubtitle}</p>
        </div>
        <div className="card-back__header-right">
          <p className="card-back__price-label">{collection.priceLabel}</p>
          <p className="card-back__price">{collection.price}</p>
        </div>
      </header>

      <section className="card-back__experiences">
        <h2 className="section-title">Everyday Experiences</h2>
        <ul className="card-back__experience-list">
          {collection.experiences.map((experience) => (
            <li key={experience.title} className="card-back__experience">
              <h3 className="card-back__experience-title">{experience.title}</h3>
              <p className="card-back__experience-text">{experience.text}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="card-back__included">
        <h2 className="section-title">Included with this Collection</h2>
        <div className="card-back__included-grid">
          {collection.included.map((group) => (
            <div key={group.title} className="card-back__included-card">
              <h3 className="card-back__included-title">{group.title}</h3>
              <ul className="card-back__included-list">
                {group.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <section className="card-back__enhancements">
        <h2 className="section-title">Compatible Experience Packs</h2>
        <ul className="card-back__enhancement-list">
          {collection.compatibleExperiencePacks.map((experiencePack) => (
            <li key={experiencePack}>{experiencePack}</li>
          ))}
        </ul>
      </section>

      <footer className="card-back__footer">
        <p className="card-back__footer-main">{collection.footer}</p>
        <p className="card-back__footer-small">{collection.footerSmall}</p>
      </footer>
    </div>
  );
}
