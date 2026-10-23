const PALETTES = {
  city: ["#d7c6a5", "#b9c0c5", "#e7e1d3", "#4b6574", "#343d46", "#6e9b88"],
  character: ["#e9d9bd", "#3d5368", "#a7b7ad", "#d7a86e", "#4a4240", "#e5e7eb"],
  vehicle: ["#d75a4a", "#252e37", "#c6d0d8", "#e5b84b", "#526d82", "#e9ecef"],
  nature: ["#587b55", "#86a96f", "#a7bb8c", "#74624c", "#d5bd8b", "#4d6a4c"],
  prop: ["#b88a5a", "#76553c", "#d8c7a5", "#414b55", "#8eaaa0", "#c3a76d"]
};

function part(name, shape, position, scale, color, surface = "matte", rotation = [0, 0, 0]) {
  return { name, shape, position, scale, rotation, color, surface };
}
function chooseStyle(prompt, projectStyle) {
  const text = (prompt + " " + projectStyle).toLowerCase();
  if (/voxel|minecraft|blocky/.test(text)) return "voxel-inspired stylized low-poly";
  if (/cartoon|cute|funny|stylized/.test(text)) return "polished cartoon low-poly";
  if (/realistic|realism|modern city|architectural/.test(text)) return "clean realistic-proportion low-poly";
  if (/horror|abandoned|dark/.test(text)) return "moody weathered low-poly";
  return "coherent game-ready stylized low-poly";
}
function makeBuilding(prompt, quality, palette) {
  const p = [], text = prompt.toLowerCase();
  const floors = quality === "performance" ? 2 : quality === "high" ? 5 : 3;
  const width = /tower|skyscraper|office/.test(text) ? 7 : 8, depth = 6, floorH = 2.35, height = floors * floorH;
  p.push(part("foundation", "beveledBox", [0,.25,0], [width+.6,.5,depth+.6], palette[4], "metal"));
  p.push(part("main facade", "beveledBox", [0,height/2+.5,0], [width,height,depth], palette[0]));
  p.push(part("roof slab", "beveledBox", [0,height+.55,0], [width+.35,.35,depth+.35], palette[2]));
  if (/\b(arch|arched|archway)\b/.test(text)) {
    p.push(part("arched entrance surround", "arch", [0,1.15,depth/2+.045], [1.8,2.3,.16], palette[4], "metal"));
  } else {
    p.push(part("entrance frame", "beveledBox", [0,1.35,depth/2+.045], [1.55,2.15,.12], palette[4], "metal"));
    p.push(part("entrance glass", "box", [0,1.48,depth/2+.12], [.88,1.7,.035], "#7ca4b7", "glass"));
  }
  p.push(part("entrance canopy", "beveledBox", [0,2.55,depth/2+.38], [2.2,.18,.9], palette[3], "metal"));
  if (/\b(stair|stairs|staircase)\b/.test(text)) {
    p.push(part("front staircase", "stairs", [0,.62,depth/2+1.35], [2.6,1.2,2.7], palette[2]));
  }
  const columns = 4, spacing = (width-1.6)/(columns-1);
  for (let floor=0; floor<floors; floor++) {
    const y = 1.45 + floor*floorH;
    for (let col=0; col<columns; col++) {
      const x = -width/2 + .8 + col*spacing;
      p.push(part(`window ${floor+1}-${col+1} frame`, "beveledBox", [x,y,depth/2+.05], [1,1.25,.13], palette[4], "metal"));
      p.push(part(`window ${floor+1}-${col+1} glass`, "box", [x,y,depth/2+.13], [.78,1.03,.035], "#8db5c6", "glass"));
    }
    if (floor>0) p.push(part(`floor belt ${floor}`, "beveledBox", [0,floor*floorH+.5,depth/2+.12], [width+.12,.09,.12], palette[3], "metal"));
  }
  if (/house|villa|home/.test(text)) {
    p.push(part("pitched roof", "wedge", [0,height+1.25,0], [width+.7,1.5,depth+.7], palette[3]));
    p.push(part("front steps", "beveledBox", [0,.22,depth/2+.8], [2.5,.25,1.4], palette[2]));
  }
  return p;
}
function makeCharacter(prompt, palette) {
  const skeleton = /skeleton|bone|undead/.test(prompt.toLowerCase()), bone = "#e8e1ce", clothes = palette[1], skin = palette[0];
  const base = skeleton ? bone : clothes, p = [
    part("pelvis","beveledBox",[0,1,0],[.52,.32,.3],base),
    part("torso","beveledBox",[0,1.48,0],[.68,.78,.36],base),
    part("neck","capsule",[0,1.94,0],[.18,.18,.18],skeleton?bone:skin),
    part("head","sphere",[0,2.22,0],[.48,.53,.43],skeleton?bone:skin),
    part("left eye","sphere",[-.105,2.25,.2],[.07,.08,.04],"#24272a","emissive"),
    part("right eye","sphere",[.105,2.25,.2],[.07,.08,.04],"#24272a","emissive"),
    part("left upper arm","capsule",[-.47,1.52,0],[.2,.52,.2],skeleton?bone:clothes,"matte",[0,0,-12]),
    part("right upper arm","capsule",[.47,1.52,0],[.2,.52,.2],skeleton?bone:clothes,"matte",[0,0,12]),
    part("left forearm","capsule",[-.52,1.13,.02],[.16,.42,.16],skeleton?bone:skin),
    part("right forearm","capsule",[.52,1.13,.02],[.16,.42,.16],skeleton?bone:skin),
    part("left hand","sphere",[-.55,.88,.04],[.18,.16,.16],skeleton?bone:skin),
    part("right hand","sphere",[.55,.88,.04],[.18,.16,.16],skeleton?bone:skin),
    part("left thigh","capsule",[-.18,.67,0],[.22,.52,.22],skeleton?bone:clothes),
    part("right thigh","capsule",[.18,.67,0],[.22,.52,.22],skeleton?bone:clothes),
    part("left shin","capsule",[-.18,.28,.02],[.17,.42,.17],skeleton?bone:skin),
    part("right shin","capsule",[.18,.28,.02],[.17,.42,.17],skeleton?bone:skin),
    part("left shoe","beveledBox",[-.18,.08,.09],[.25,.14,.38],palette[3],"rubber"),
    part("right shoe","beveledBox",[.18,.08,.09],[.25,.14,.38],palette[3],"rubber")
  ];
  if (skeleton) {
    p.push(part("rib cage detail","torus",[0,1.53,.19],[.5,.35,.18],bone));
    p.push(part("pelvis detail","torus",[0,1,.17],[.43,.2,.15],bone));
  } else {
    p.push(part("jacket trim","beveledBox",[0,1.5,.19],[.07,.64,.035],palette[3],"metal"));
    p.push(part("belt","beveledBox",[0,1.12,0],[.56,.1,.34],palette[3],"rubber"));
  }
  return p;
}
function makeVehicle(prompt, quality, palette) {
  const p=[], truck=/truck|van|bus|lorry/.test(prompt.toLowerCase()), length=truck?4.8:3.5;
  p.push(part("chassis","beveledBox",[0,.55,0],[length,.35,1.65],palette[1],"metal"));
  p.push(part("main body","beveledBox",[0,.95,0],[length,.75,1.8],palette[0]));
  p.push(part("front bumper","beveledBox",[0,.55,length/2+.05],[1.7,.18,.16],palette[2],"metal"));
  p.push(part("front grille","beveledBox",[0,.85,length/2+.04],[.75,.25,.08],palette[1],"metal"));
  p.push(part("left headlight","box",[-.55,1,length/2+.08],[.25,.14,.07],"#fff0b0","emissive"));
  p.push(part("right headlight","box",[.55,1,length/2+.08],[.25,.14,.07],"#fff0b0","emissive"));
  p.push(part("cabin","beveledBox",[0,1.55,truck?.55:-.15],[truck?1.9:1.65,.75,truck?1.6:1.35],palette[4]));
  p.push(part("windshield","box",[0,1.65,truck?1.38:.57],[1.35,.48,.05],"#8db5c6","glass",[-12,0,0]));
  p.push(part("rear window","box",[0,1.65,truck?-.28:-.85],[1.25,.42,.05],"#8db5c6","glass"));
  for (const x of [-.91,.91]) for (const z of [-length*.31,length*.31]) {
    p.push(part(`wheel ${x} ${z}`,"cylinder",[x,.42,z],[.25,.52,.52],"#26292d","rubber",[0,0,90]));
    p.push(part(`hub ${x} ${z}`,"cylinder",[x*1.01,.42,z],[.28,.22,.22],palette[2],"metal",[0,0,90]));
  }
  if (truck) p.push(part("cargo box","beveledBox",[0,1.55,-1.25],[1.9,1.15,1.65],palette[2],"metal"));
  if (quality!=="performance") {
    p.push(part("roof detail","beveledBox",[0,1.99,truck?.55:-.15],[.75,.06,.25],palette[3],"metal"));
    p.push(part("side stripe left","box",[-.92,.98,0],[.035,.1,length*.68],palette[3],"emissive"));
    p.push(part("side stripe right","box",[.92,.98,0],[.035,.1,length*.68],palette[3],"emissive"));
  }
  return p;
}
function makeProp(prompt, palette) {
  const t=prompt.toLowerCase(), p=[];
  if (/chair|seat|stool/.test(t)) {
    p.push(part("seat cushion","beveledBox",[0,.9,0],[1.05,.18,.95],palette[0]),part("backrest","beveledBox",[0,1.5,-.38],[1.05,1,.18],palette[0]));
    for(const x of [-.4,.4]) for(const z of [-.35,.35]) p.push(part(`chair leg ${x} ${z}`,"beveledBox",[x,.42,z],[.12,.8,.12],palette[1]));
    p.push(part("seat seam","box",[0,1,.48],[.82,.04,.04],palette[2]));
  } else if (/table|desk|workbench/.test(t)) {
    p.push(part("tabletop","beveledBox",[0,1,0],[2,.18,1.1],palette[0]));
    for(const x of [-.82,.82]) for(const z of [-.38,.38]) p.push(part(`table leg ${x} ${z}`,"beveledBox",[x,.48,z],[.14,.9,.14],palette[1]));
    p.push(part("front apron","beveledBox",[0,.78,.42],[1.55,.18,.08],palette[1]));
  } else if (/sofa|couch/.test(t)) {
    p.push(part("sofa base","beveledBox",[0,.48,0],[2.5,.5,1],palette[1]),part("seat cushions","beveledBox",[0,.83,.12],[2.25,.28,.8],palette[0]),part("back cushions","beveledBox",[0,1.2,-.35],[2.35,.72,.22],palette[0]));
    for(const x of [-1.15,1.15]) p.push(part(`armrest ${x}`,"beveledBox",[x,.88,0],[.22,.65,1],palette[1]));
    for(const x of [-.95,.95]) p.push(part(`foot ${x}`,"cylinder",[x,.18,0],[.12,.25,.12],palette[3],"metal"));
  } else if (/lamp|light/.test(t)) {
    p.push(part("lamp base","cylinder",[0,.12,0],[.6,.22,.6],palette[3],"metal"),part("lamp stem","cylinder",[0,1,0],[.12,1.65,.12],palette[3],"metal"),part("lamp shade","cone",[0,1.95,0],[.85,.65,.85],palette[0]),part("bulb","sphere",[0,1.72,0],[.24,.24,.24],"#ffe7a6","emissive"));
  } else if (/tree|plant|bush/.test(t)) {
    p.push(part("trunk","cylinder",[0,1.1,0],[.38,2.2,.38],palette[3]),part("lower canopy","sphere",[0,2.1,0],[1.8,1.65,1.6],palette[0]),part("upper canopy","sphere",[.18,2.8,0],[1.35,1.3,1.25],palette[1]),part("highlight foliage","sphere",[-.38,2.55,.38],[.55,.6,.55],palette[2]));
  } else {
    p.push(part("main body","beveledBox",[0,.7,0],[1.4,1.2,1],palette[0]),part("top panel","beveledBox",[0,1.34,0],[1.1,.12,.75],palette[2],"metal"),part("front panel","box",[0,.72,.52],[.72,.5,.04],palette[3],"metal"),part("detail left","cylinder",[-.48,.75,.56],[.08,.08,.08],palette[1],"metal"),part("detail right","cylinder",[.48,.75,.56],[.08,.08,.08],palette[1],"metal"));
  }
  return p;
}
function makeEnvironment(prompt, quality, palette) {
  const t=prompt.toLowerCase(), p=[part("ground tile","beveledBox",[0,-.15,0],[8,.3,8],palette[2])];
  if (/city|street|urban|town/.test(t)) {
    p.push(
      part("road","box",[0,.02,0],[8,.05,2.5],"#424950"),
      part("left sidewalk","beveledBox",[0,.04,-1.72],[8,.12,.82],"#c7c1b4"),
      part("right sidewalk","beveledBox",[0,.04,1.72],[8,.12,.82],"#c7c1b4"),
      part("left curb","beveledBox",[0,.11,-1.27],[8,.16,.12],"#e3ded2"),
      part("right curb","beveledBox",[0,.11,1.27],[8,.16,.12],"#e3ded2")
    );
    for(const x of [-2.5,-.8,.8,2.5]) p.push(part("road marking "+x,"box",[x,.055,0],[.75,.04,.08],"#e8dca5","emissive"));
    if (/crosswalk|crossing|intersection|zebra/.test(t)) {
      for (const z of [-.95,-.57,-.19,.19,.57,.95]) p.push(part("crosswalk stripe "+z,"box",[3.15,.058,z],[1.05,.035,.19],"#f3f0e6","emissive"));
    }
    p.push(...makeBuilding("city apartment building",quality,PALETTES.city).slice(0,quality==="performance"?10:18).map((item,i)=>({...item,name:"background building "+(i+1),position:[item.position[0]-2.2,item.position[1],item.position[2]-2.45],scale:[Math.max(.04,item.scale[0]*.32),Math.max(.04,item.scale[1]*.68),Math.max(.04,item.scale[2]*.32)]})));
    p.push(
      part("street sign post","cylinder",[3,.8,1.3],[.08,1.6,.08],palette[3],"metal"),
      part("street sign","beveledBox",[3,1.55,1.3],[.75,.35,.08],palette[0],"metal"),
      part("left street lamp pole","cylinder",[-3,1.65,2.65],[.09,3.3,.09],"#424950","metal"),
      part("left street lamp arm","cylinder",[-2.72,3.2,2.65],[.06,.55,.06],"#424950","metal",[0,0,90]),
      part("left street lamp head","beveledBox",[-2.48,3.12,2.65],[.42,.14,.22],"#f4dca0","emissive"),
      part("right street lamp pole","cylinder",[2.1,1.65,-2.65],[.09,3.3,.09],"#424950","metal"),
      part("right street lamp head","beveledBox",[2.1,3.12,-2.65],[.42,.14,.22],"#f4dca0","emissive"),
      part("street bin body","beveledBox",[3.35,.42,-.9],[.42,.82,.42],"#5c7775","metal"),
      part("street bin lid","beveledBox",[3.35,.86,-.9],[.48,.1,.48],"#303b40","metal")
    );
    if (quality !== "performance") {
      p.push(
        part("bench seat","beveledBox",[-2.8,.55,2.05],[1.25,.12,.38],"#9b7655"),
        part("bench back","beveledBox",[-2.8,.88,2.22],[1.25,.5,.1],"#9b7655"),
        part("bench left leg","cylinder",[-3.2,.28,2.05],[.08,.55,.08],"#41494d","metal"),
        part("bench right leg","cylinder",[-2.4,.28,2.05],[.08,.55,.08],"#41494d","metal"),
        part("street planter","beveledBox",[1.55,.24,2.65],[.9,.48,.72],"#8b7961"),
        part("planter shrub","sphere",[1.55,.67,2.65],[.82,.55,.65],"#6e9b72")
      );
    }
  } else {
    p.push(part("tree trunk","cylinder",[-1.4,.8,-.8],[.35,1.6,.35],palette[3]),part("tree crown","sphere",[-1.4,2,-.8],[1.7,1.7,1.7],palette[0]),part("tree highlight","sphere",[-1.75,2.2,-.5],[.75,.85,.75],palette[1]),part("rock cluster","beveledBox",[1.8,.3,1.2],[1,.6,.8],palette[4],"matte",[0,14,8]),part("path","beveledBox",[.5,.03,2],[3.4,.08,.75],palette[4]));
    if(quality!=="performance") p.push(part("small shrub","sphere",[2.1,.45,-1.7],[.85,.75,.8],palette[1]));
  }
  return p;
}
export function buildNativeForgeRecipe(input = {}) {
  const prompt=String(input.prompt||"").trim().slice(0,4000), kind=String(input.kind||"prop");
  const quality=["performance","standard","high"].includes(String(input.quality))?String(input.quality):"standard";
  const text=prompt.toLowerCase(), style=chooseStyle(prompt,String(input.projectStyle||""));
  let palette=PALETTES.prop, parts;
  if (kind==="weapon") throw new Error("Native Forge does not generate weapon assets.");
  if(kind==="character" || /\b(skeleton|character|citizen|person|human|player avatar)\b/.test(text)) { palette=PALETTES.character; parts=makeCharacter(prompt,palette); }
  else if(kind==="building" || /\b(building|house|villa|apartment|skyscraper|tower|office)\b/.test(text)) { palette=PALETTES.city; parts=makeBuilding(prompt,quality,palette); }
  else if(kind==="vehicle" || /\b(car|vehicle|truck|van|bus|lorry)\b/.test(text)) { palette=PALETTES.vehicle; parts=makeVehicle(prompt,quality,palette); }
  else if(kind==="environment" || /\b(environment|city|street|town|forest|park|world|landscape)\b/.test(text)) { palette=/\b(city|street|town|urban)\b/.test(text)?PALETTES.city:PALETTES.nature; parts=makeEnvironment(prompt,quality,palette); }
  else parts=makeProp(prompt,palette);
  const max=quality==="performance"?32:quality==="high"?76:54;
  parts=parts.slice(0,max);
  return {
    name:prompt.split(/[,.!?\n]/)[0].trim().replace(/[^a-zA-Z0-9 _-]/g,"").slice(0,48)||"GENE asset",
    kind:["character","vehicle","building","environment","prop"].includes(kind)?kind:"prop",
    style,
    notes:"Generated by GENE Forge's deterministic native modeller. Inspect the silhouette and proportions in preview before production use.",
    parts
  };
}
