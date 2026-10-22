const CATEGORIES_GAME = [
  { id: "ui-menus", label: "UI and menus", suffix: "video game user interface HUD main menu pause menu layout design reference" },
  { id: "gameplay", label: "Gameplay and camera", suffix: "gameplay screenshot level layout camera perspective player obstacles reference" },
  { id: "characters", label: "Characters and animation", suffix: "game character design turnaround animation pose silhouette reference" },
  { id: "environments", label: "Environments and props", suffix: "game environment level art buildings props lighting background reference" }
];

const CATEGORIES_APP = [
  { id: "ui-layout", label: "UI and layout", suffix: "web application interface dashboard layout responsive design reference" },
  { id: "interaction-patterns", label: "Interaction patterns", suffix: "website navigation form controls interaction design user interface reference" },
  { id: "visual-style", label: "Visual style and typography", suffix: "web design typography color palette cards spacing component design reference" },
  { id: "illustrations-icons", label: "Illustrations and icons", suffix: "web app illustration icon set visual asset design reference" }
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
