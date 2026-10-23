"use client";

import type { ResearchBundle } from "../lib/types";

type Props = { bundle: ResearchBundle };

function Count({ n, label }: { n: number; label: string }) {
  return n > 0 ? <span className="rc-count">{n} {label}{n === 1 ? "" : "s"}</span> : null;
}

/** Viewable research that was attached to a message and sent to GENE as reference material. */
export default function ResearchCard({ bundle }: Props) {
  const sent = bundle.sent;
  const total = bundle.facts.length + bundle.images.length + bundle.models.length + bundle.music.tracks.length + bundle.music.styles.length + bundle.games.length;
  return (
    <details className="research-card" open>
      <summary>
        <span className="rc-title">Research</span>
        <span className="rc-topic" title={bundle.topic}>{bundle.topic}</span>
        <span className="rc-meta">
          <Count n={bundle.images.length} label="image" />
          <Count n={bundle.facts.length} label="fact" />
          <Count n={bundle.models.length + bundle.engineModels.length} label="model" />
          <Count n={bundle.music.styles.length + bundle.music.tracks.length} label="music ref" />
        </span>
      </summary>

      {total === 0 && <p className="rc-empty">No sources answered for this topic, so nothing was attached. GENE will state assumptions instead of inventing references.</p>}

      {bundle.games.length > 0 && <section>
        <h4>Games like this</h4>
        <ul className="rc-list">{bundle.games.map(game => <li key={game.title}><strong>{game.title}</strong> <span className="rc-dim">{game.examples.join(", ")}</span><p>{game.loop}</p></li>)}</ul>
      </section>}

      {bundle.images.length > 0 && <section>
        <h4>Images</h4>
        <div className="rc-grid">{bundle.images.map(image => <a key={image.id} className="rc-image" href={image.page} target="_blank" rel="noreferrer noopener" title={image.title + " — " + image.license + " — " + image.credit}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={image.thumb} alt={image.title} loading="lazy" referrerPolicy="no-referrer" />
          <span>{image.title}</span><small>{image.categoryLabel ? image.categoryLabel + " · " : ""}{image.license} · {image.source} · reference only{image.licenseState === "unverified" ? " · license unverified" : ""}</small>
        </a>)}</div>
      </section>}

      {bundle.facts.length > 0 && <section>
        <h4>Facts</h4>
        <ul className="rc-list">{bundle.facts.map(fact => <li key={fact.url}><a href={fact.url} target="_blank" rel="noreferrer noopener"><strong>{fact.title}</strong></a><p>{fact.extract}</p></li>)}</ul>
      </section>}

      {(bundle.models.length > 0 || bundle.engineModels.length > 0) && <section>
        <h4>Models</h4>
        {bundle.engineModels.length > 0 && <ul className="rc-list">{bundle.engineModels.map(model => <li key={model.name}><strong>{model.name}</strong> <span className="rc-chip">built into GENE · {model.dims}</span><p className="rc-code">{model.call}</p></li>)}</ul>}
        {bundle.models.length > 0 && <div className="rc-grid">{bundle.models.map(model => <a key={model.id} className="rc-image" href={model.url} target="_blank" rel="noreferrer noopener" title={model.name + " — " + model.license}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={model.thumb} alt={model.name} loading="lazy" referrerPolicy="no-referrer" />
          <span>{model.name}</span><small>{model.license} · Poly Haven · downloadable, not imported{model.licenseState === "unverified" ? " · license unverified" : ""}</small>
        </a>)}</div>}
      </section>}

      {(bundle.music.styles.length > 0 || bundle.music.tracks.length > 0) && <section>
        <h4>Music</h4>
        {bundle.music.styles.length > 0 && <ul className="rc-list">{bundle.music.styles.map(style => <li key={style.genre}>
          <strong>{style.genre}</strong> <span className="rc-chip">mood {style.mood}</span> <span className="rc-chip">~{style.bpm} BPM</span>
          <p>{style.scale}; {style.instruments}. {style.notes}.</p>
          <small className="rc-dim">Sound effects: {style.sfx.join(", ")} · GENE music knowledge, like {style.reference}</small>
        </li>)}</ul>}
        {bundle.music.tracks.map(track => <div key={track.id} className="rc-track">
          <div><strong>{track.title}</strong> <span className="rc-dim">{track.license} · {track.credit}</span> <a href={track.page} target="_blank" rel="noreferrer noopener">source</a></div>
          <audio controls preload="none" src={track.url} />
        </div>)}
      </section>}

      {bundle.evidence && <p className="rc-note">Nothing here has been imported into your project. {bundle.evidence.assets.downloadable > 0 ? bundle.evidence.assets.downloadable + " downloadable item" + (bundle.evidence.assets.downloadable === 1 ? "" : "s") + " must be added with Import." : "Images are references only."}{bundle.evidence.assets.licenseUnverified > 0 ? " " + bundle.evidence.assets.licenseUnverified + " without a stated open licence." : ""}</p>}
      {bundle.unavailable.length > 0 && <p className="rc-note">Not available this time: {bundle.unavailable.join("; ")}.</p>}
      <footer className="rc-sent">{sent ? "Sent to GENE as reference: " + (sent.notes ? "research notes" : "no notes") + (sent.images ? " + " + sent.images + " image" + (sent.images === 1 ? "" : "s") : "") : "Attached to this message"}</footer>
    </details>
  );
}
