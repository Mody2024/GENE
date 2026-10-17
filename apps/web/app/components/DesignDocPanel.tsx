"use client";

import type { DesignDoc } from "../lib/types";

/** Read-only view of the approved design document that every build request receives. */
export default function DesignDocPanel({ doc, isApp }: { doc: DesignDoc; isApp: boolean }) {
  return (
    <section className="g3-doc" aria-label="Design document">
      <header>
        <div>
          <div className="eyebrow">DESIGN DOCUMENT</div>
          <h3>{doc.title}</h3>
          <p>{doc.pitch}</p>
        </div>
        <span className="g3-doc-badge">Sent with every build</span>
      </header>
      <div className="g3-doc-grid">
        <div><span>Genre</span><strong>{doc.genre}</strong></div>
        <div><span>Audience</span><strong>{doc.audience}</strong></div>
        <div><span>Platform</span><strong>{doc.platform}</strong></div>
        {!isApp && <div><span>Perspective</span><strong>{doc.camera}</strong></div>}
        <div><span>Controls</span><strong>{doc.controls}</strong></div>
        <div><span>Scope</span><strong>{doc.content.scope}</strong></div>
        {!isApp && <div><span>Levels planned</span><strong>{doc.content.levels}</strong></div>}
        {!isApp && <div><span>Music mood</span><strong>{doc.audio.mood}</strong></div>}
      </div>
      <div className="g3-doc-art">
        <span>Art direction</span>
        <strong>{doc.art.style}</strong>
        <div className="g3-swatches" aria-label="Palette">{doc.art.palette.map(color => <i key={color} style={{ background: color }} title={color} />)}</div>
      </div>
      <div className="g3-doc-columns">
        <div><h4>Design pillars</h4><ul>{doc.pillars.map(item => <li key={item}>{item}</li>)}</ul></div>
        <div><h4>Milestones</h4><ol>{doc.milestones.map(item => <li key={item}>{item}</li>)}</ol></div>
        <div><h4>Known risks</h4><ul>{doc.risks.map(item => <li key={item}>{item}</li>)}</ul></div>
      </div>
      {doc.coreLoop.length > 0 && <div className="g3-doc-loop"><h4>Core loop</h4><div>{doc.coreLoop.map(item => <span key={item}>{item}</span>)}</div></div>}
    </section>
  );
}
