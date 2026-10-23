const CATEGORIES_GAME = [
  { id: "ui-menus", label: "UI and menus", suffix: "game HUD menu interface layout" },
  { id: "gameplay", label: "Gameplay and camera", suffix: "gameplay screenshot level camera perspective" },
  { id: "characters", label: "Characters and animation", suffix: "character sprite model animation design" },
  { id: "environments", label: "Environments and props", suffix: "environment architecture buildings props setting" }
];

const CATEGORIES_APP = [
  { id: "ui-layout", label: "UI and layout", suffix: "application dashboard interface layout" },
  { id: "interaction-patterns", label: "Interaction patterns", suffix: "navigation form controls interaction" },
  { id: "visual-style", label: "Visual style and typography", suffix: "typography color palette components" },
  { id: "illustrations-icons", label: "Illustrations and icons", suffix: "illustration icon set" }
];

function cleanTopic(value) {
  return String(value || "")
    .replace(/[\u0000-\u001f<>]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
}

/**
 * Plan image-reference searches separately from factual research. Visual references
 * are enabled by default; images:false is an explicit caller opt-out, not a requirement
 * for users to write the word "image" in their prompt.
 */
export function planVisualReferenceQueries({ topic, kind = "game", engine = "auto", images = true } = {}) {
  const subject = cleanTopic(topic);
  if (images === false || subject.length < 3) return [];
  const isApp = kind === "app" || engine === "webapp";
  const textGame = /text.?based|interactive fiction|visual novel|choice.?based|text adventure|narrative game|detective story/i.test(subject);
  const categories = isApp ? CATEGORIES_APP : CATEGORIES_GAME;
  return categories.map(category => {
    let suffix = category.suffix;
    if (textGame && category.id === "gameplay") suffix = "interactive narrative game dialogue choice screen visual novel scene layout reference";
    if (textGame && category.id === "characters") suffix = "original character portrait expression sheet visual novel character design reference";
    const query = (subject + " " + suffix).replace(/\s+/g, " ").trim().slice(0, 220);
    return { id: category.id, label: category.label, query };
  });
}

const STOPWORDS = new Set(["a","an","the","and","or","for","with","from","into","game","video","gameplay","design","style","reference","model","models","art","asset","assets","3d","2d","webgl","canvas","make","create","build","like","about","based","using"]);
function topicTerms(topic) {
  return cleanTopic(topic).toLowerCase().split(/[^a-z0-9\u0600-\u06ff]+/i)
    .filter(word => word.length >= 3 && !STOPWORDS.has(word)).slice(0, 12);
}
const CATEGORY_TERMS = {
  "ui-menus": ["ui","menu","hud","interface","button","screen","layout","dashboard"],
  gameplay: ["gameplay","level","camera","player","obstacle","platform","screenshot","game"],
  characters: ["character","sprite","skeleton","person","figure","portrait","animation","model","hero","creature"],
  environments: ["environment","architecture","building","city","street","landscape","room","forest","road","world","interior","exterior"],
  "ui-layout": ["ui","interface","dashboard","layout","application","website","screen"],
  "interaction-patterns": ["navigation","form","controls","interaction","button","menu"],
  "visual-style": ["typography","color","palette","components","font","cards","design"],
  "illustrations-icons": ["illustration","icon","icons","drawing","artwork","symbol"]
};
/** Rank actual image results against both the user's topic and the requested visual category. */
export function rankVisualReferenceResults(images, topic) {
  const terms = topicTerms(topic);
  const ranked = (Array.isArray(images) ? images : []).map((image, index) => {
    const title = String(image?.title || "").toLowerCase();
    const category = String(image?.category || "");
    const categoryTerms = CATEGORY_TERMS[category] || [];
    const topicHits = terms.filter(term => title.includes(term));
    const categoryHits = categoryTerms.filter(term => title.includes(term));
    const score = topicHits.length * 4 + categoryHits.length;
    return { image, index, score, topicHits: topicHits.length, categoryHits: categoryHits.length };
  });
  // If the query is specific, a generic category match is not enough: reject unrelated
  // images instead of filling slots with irrelevant material. Keep topic-matching items first.
  return ranked.filter(item => item.score > 0 && (terms.length === 0 || item.topicHits > 0 || item.categoryHits >= 2))
    .sort((a, b) => b.score - a.score || b.topicHits - a.topicHits || b.categoryHits - a.categoryHits || a.index - b.index)
    .map(item => ({ ...item.image, relevanceScore: item.score }));
}
