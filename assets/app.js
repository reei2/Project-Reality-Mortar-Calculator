(function(){
"use strict";

/* ================= MAP DATA — name, size km (PR Map Gallery) ================= */
var MAPS = [
  /* 2 km — 150 m squares */
  ["Al Basrah",2],["Assault on Grozny",2],["Battle of Debrecen",2],["Battle of Ia Drang",2],
  ["Beirut",2],["Brecourt Assault",2],["Carentan",2],["Charlies Point",2],["Donbas",2],
  ["Dovre",2],["Dovre Winter",2],["Dragon Fly",2],["Fools Road",2],["Goose Green",2],
  ["Iron Ridge",2],["Kafr Halab",2],["Karbala",2],["Kokan",2],["Kozelsk",2],["Krivaja Valley",2],
  ["Lashkar Valley",2],["Musa Qala - BETA",2],["Muttrah City",2],["Nuijamaa",2],["Omaha Beach",2],
  ["Operation Barracuda",2],["Operation Brunswick",2],["Operation Falcon",2],["Operation Marlin",2],
  ["Outpost",2],["Ramiel",2],["Ras el Masri",2],["Route E-106",2],["Rzhev",2],["Sahel",2],
  ["Sbeneh Outskirts",2],["Shahadah",2],["Stalingrad",2],["Stalingrad Summer",2],["Talbisah",2],
  ["Ulyanovsk",2],["Zakho - BETA",2],
  /* 4 km — 300 m squares */
  ["Adak - BETA",4],["Ascheberg",4],["Bamyan",4],["Battle of Kerch",4],["Belyaevo",4],
  ["Black Gold",4],["Burning Sands",4],["Fields of Kassel",4],["Hades Peak",4],["Icebreaker",4],
  ["Kashan Desert",4],["Khamisiyah",4],["Korbach Offensive - BETA",4],["Kunar Province - BETA",4],
  ["Masirah",4],["Operation Bobcat",4],["Operation Soul Rebel",4],["Operation Thunder - BETA",4],
  ["Pavlovsk Bay",4],["Road to Damascus - BETA",4],["Saaremaa",4],["Shijia Valley",4],
  ["Silent Eagle",4],["Vadso City",4],["Vung Ro",4],["Wanda Shan",4],["Xiangshan",4],["Yamalia",4],
  /* 8 km — 600 m squares */
  ["The Falklands",8]
];
var GRID_M = {2:150, 4:300, 8:600};
var MAX_RANGE = 1500, MIN_RANGE = 80, GRAV = 9.81;

/* ================= STATE — positions stored as board fractions (scale-free) ================= */
function refToFrac(colLetter, rowNum, kp, sub){
  var col = colLetter.charCodeAt(0) - 65;            /* A=0 */
  var row = rowNum - 1;                              /* 1 = top (north) */
  var kpCol = (kp - 1) % 3,  kpRow = 2 - Math.floor((kp - 1) / 3);   /* phone pad: 7 8 9 top */
  var sCol  = (sub - 1) % 3, sRow  = 2 - Math.floor((sub - 1) / 3);
  var fx = (col + (kpCol + (sCol + 0.5) / 3) / 3) / 13;
  var fy = (row + (kpRow + (sRow + 0.5) / 3) / 3) / 13;
  return {x: fx, y: fy};
}
var mortars = [refToFrac("F", 11, 7, 5)];   /* the example from the FOB: F11 kp7 sub5; a 2nd entry appears via Add Mortar */
var target = refToFrac("G", 7, 5, 5);   /* red TARGET mark (Mortar 1's) starts in the exact centre of the grid */
var target2 = null;   /* Mortar 2's OWN target mark (blue TARGET 2) — created by Add Mortar, never shared with Mortar 1 */
var mode = "m1";                            /* "m1" | "m2" | "target" | "target2" — which marker a tap places */
var locked = { m1: false, m2: false, target: false, target2: false };   /* a locked marker can't be moved by board taps/drags */
var mortarFacing = [0, 0];   /* each mortar's compass facing in degrees (0 = north, clockwise), turned with A / D on the compass strip in the Mini Game (the line-up lives only there, not in the Firing solution panel); the arrow drawn on each mortar icon points this way, and the job is to line it up straight down that mortar's own target line */
function isLocked(which){ return !!locked[which]; }
var showNumbers = true;                     /* keypad + subkeypad numbers visible (zoom labels only); grid refs like G10 always stay */
function activeMortar(){ return ((mode === "m2" || mode === "target2") && mortars[1]) ? 1 : 0; }
function targetFor(idx){ return (idx === 1 && target2) ? target2 : target; }   /* each mortar aims at its OWN target mark */
var currentMap = MAPS.filter(function(m){ return m[0] === "Kokan"; })[0];
/* Mini Game — dial training state (declared early: marker transforms read it) */
var game = { active: false, fired: false, over: false, range: 0, correctMils: 0, playerMils: 1200, dials: [1200, 1200],
             round: 1, shots: 0, hits: 0, bonus: 0, streak: 0, bestStreak: 0, targetFrac: null,
             type: null, hp: 0, maxHp: 0, timeLeft: 0, timeMax: 0, velM: null,
             defenders: [], defSquads: [], vehicles: [], emplacements: [],
             infMen: [], vehTgt: [], vehCount: 0,
             smokeTimed: false, smokeSquad: [], smokeSquadLabelEl: null,
             dcFriendlies: [], dcEnemySquads: [], dcElapsed: 0, infHalted: false,
             markDx: 0, markDy: 0, markSrc: null, spotterDx: 0, spotterDy: 0, revealed: false, laserShown: false, lastImpact: null, lastImpacts: [null, null],
             spotterCompromised: false, spotterFate: null, spotterShots: 0, spotterRiskAt: Infinity,
             uavFuel: 0, uavState: null,
             checkUsed: false, check: null, checkShown: false, checkedFrac: null,
             ammo: 5, reloading: false, flying: false, cooldown: false,
             shell: "he", ammoStore: [{ he: 5, smoke: 5 }, { he: 5, smoke: 5 }] };
/* per-mortar, per-shell ammo: EVERY mortar carries its OWN magazine
   of 5 for EACH shell type (HE and Smoke) — Mortar 1's HE, Mortar 1's
   Smoke, Mortar 2's HE and Mortar 2's Smoke are four separate counts */
/* per-mortar dial: EACH mortar keeps its OWN dial angle for its
   OWN target — dials[0] is Mortar 1 → TARGET, dials[1] is Mortar 2
   → TARGET 2. They are never shared or copied. game.playerMils is
   kept as a mirror of the ACTIVE mortar's dial only, for the few
   readouts that still read a single value. */
function dialOf(mIdx){ return game.dials[mIdx != null ? mIdx : activeMortar()]; }
function setDialOf(mIdx, v){ game.dials[mIdx] = Math.min(1650, Math.max(800, v)); if (mIdx === activeMortar()) game.playerMils = game.dials[mIdx]; }
function syncPlayerMils(){ game.playerMils = game.dials[activeMortar()]; }
function ammoOf(mIdx, shell){ return game.ammoStore[mIdx][shell || game.shell]; }
function setAmmoOf(mIdx, shell, n){ game.ammoStore[mIdx][shell || game.shell] = Math.max(0, Math.min(5, n)); }
function anyAmmoForShell(shell){ var t = 0; for (var am = 0; am < mortars.length; am++) t += ammoOf(am, shell); return t; }
function shellName(shell){ return (shell || game.shell) === "smoke" ? "Smoke" : "HE"; }

/* ================= DOM ================= */
var $ = function(id){ return document.getElementById(id); };
var svg = $("board"), NS = "http://www.w3.org/2000/svg";
var MARGIN = 36, PLOT = 800 - MARGIN * 2, CELL = PLOT / 13;

function el(name, attrs, parent){
  var e = document.createElementNS(NS, name);
  for (var k in attrs) e.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(e);
  return e;
}
function fracToPx(f){ return { x: MARGIN + f.x * PLOT, y: MARGIN + f.y * PLOT }; }
function pxToFrac(px, py){
  return {
    x: Math.min(0.9999, Math.max(0, (px - MARGIN) / PLOT)),
    y: Math.min(0.9999, Math.max(0, (py - MARGIN) / PLOT))
  };
}

/* ================= BUILD STATIC GRID ================= */
/* ================= MAP BACKGROUND PHOTO (under grid + markers) ================= */
var gBg = el("g", {}, svg);
var bgDefs = el("defs", {}, gBg);
var plotClip = el("clipPath", {id: "plotClip"}, bgDefs);
el("rect", {x: MARGIN, y: MARGIN, width: PLOT, height: PLOT}, plotClip);
var mapImg = el("image", {x: MARGIN, y: MARGIN, width: PLOT, height: PLOT,
  preserveAspectRatio: "none", "clip-path": "url(#plotClip)", opacity: 0.92}, gBg);
/* A missing photo used to fail silently (bare grid, no explanation) — the
   usual cause is a downloaded copy opened without its assets/maps folder
   beside it, or the file opened from inside a zip. Say so on the board. */
mapImg.addEventListener("error", function(){
  mapImg.style.display = "none";
  var w = document.getElementById("mapImgWarn");
  if (w) w.hidden = false;
});
mapImg.addEventListener("load", function(){
  var w = document.getElementById("mapImgWarn");
  if (w) w.hidden = true;
});
/* board-colour wash over the photo so grid lines, labels and markers stay readable */
el("rect", {x: MARGIN, y: MARGIN, width: PLOT, height: PLOT,
  style: "fill:var(--board-bg);opacity:var(--mapwash);pointer-events:none"}, gBg);
/* the gallery's own file naming: strip spaces/underscores, lowercase */
function mapImgSrc(name){ return "assets/maps/" + name.replace(/\s|_/g, "").toLowerCase() + ".jpg"; }
var lastImgSrc = "";
function setMapImage(){
  var src = mapImgSrc(currentMap[0]);
  if (src === lastImgSrc) return;               /* render() runs per drag move */
  lastImgSrc = src;
  mapImg.style.display = "";
  mapImg.setAttribute("href", src);
  mapImg.setAttributeNS("http://www.w3.org/1999/xlink", "xlink:href", src);
}

var gSub = el("g", {}, svg), gGrid = el("g", {}, svg), gRefs = el("g", {style:"pointer-events:none"}, svg), gLabels = el("g", {style:"pointer-events:none"}, svg), gDyn = el("g", {}, svg);
(function buildGrid(){
  var i, p;
  /* subkeypad lines */
  for (i = 1; i < 117; i++){
    p = MARGIN + i * (PLOT / 117);
    if (i % 9 === 0 || i % 3 === 0) continue;
    el("line", {x1:p, y1:MARGIN, x2:p, y2:MARGIN + PLOT, stroke:"var(--grid-sub)", "stroke-width":0.5}, gSub);
    el("line", {x1:MARGIN, y1:p, x2:MARGIN + PLOT, y2:p, stroke:"var(--grid-sub)", "stroke-width":0.5}, gSub);
  }
  /* keypad lines */
  for (i = 1; i < 39; i++){
    if (i % 3 === 0) continue;
    p = MARGIN + i * (PLOT / 39);
    el("line", {x1:p, y1:MARGIN, x2:p, y2:MARGIN + PLOT, stroke:"var(--grid-kp)", "stroke-width":0.8}, gSub);
    el("line", {x1:MARGIN, y1:p, x2:MARGIN + PLOT, y2:p, stroke:"var(--grid-kp)", "stroke-width":0.8}, gSub);
  }
  /* main squares + border */
  for (i = 0; i <= 13; i++){
    p = MARGIN + i * CELL;
    el("line", {x1:p, y1:MARGIN, x2:p, y2:MARGIN + PLOT, stroke:"var(--grid-major)", "stroke-width": i===0||i===13 ? 2 : 1.2}, gGrid);
    el("line", {x1:MARGIN, y1:p, x2:MARGIN + PLOT, y2:p, stroke:"var(--grid-major)", "stroke-width": i===0||i===13 ? 2 : 1.2}, gGrid);
  }
  /* column letters A-M (top + bottom), row numbers 1-13 (left + right) */
  for (i = 0; i < 13; i++){
    var cx = MARGIN + i * CELL + CELL / 2, cy = MARGIN + i * CELL + CELL / 2;
    var L = String.fromCharCode(65 + i);
    var t;
    t = el("text", {x:cx, y:MARGIN - 12, "text-anchor":"middle", "font-size":17, "class":"blabel"}, gGrid); t.textContent = L;
    t = el("text", {x:cx, y:MARGIN + PLOT + 24, "text-anchor":"middle", "font-size":17, "class":"blabel"}, gGrid); t.textContent = L;
    t = el("text", {x:MARGIN - 12, y:cy + 6, "text-anchor":"middle", "font-size":17, "class":"blabel"}, gGrid); t.textContent = (i + 1);
    t = el("text", {x:MARGIN + PLOT + 14, y:cy + 6, "text-anchor":"middle", "font-size":17, "class":"blabel"}, gGrid); t.textContent = (i + 1);
    /* faint cell ref inside each main square */
    for (var j = 0; j < 13; j++){
      var r = el("text", {x: MARGIN + j * CELL + 4, y: MARGIN + i * CELL + 13, "font-size":9.5, "class":"cellref"}, gRefs);
      r.textContent = String.fromCharCode(65 + j) + (i + 1);
    }
  }
  /* north arrow */
  var nt = el("text", {x: MARGIN + PLOT, y: 20, "text-anchor":"end", "font-size":15, "class":"blabel"}, gGrid);
  nt.textContent = "N ↑";
})();

/* dynamic elements */
var rangeRing  = el("circle", {fill:"none", "stroke-width":2, "stroke-dasharray":"9 7"}, gDyn);
var minRing    = el("circle", {fill:"rgba(255,90,78,.10)", stroke:"var(--target)", "stroke-width":1, "stroke-dasharray":"3 4"}, gDyn);
var fireLine   = el("line", {"stroke-width":2.5}, gDyn);
var fireLine2  = el("line", {"stroke-width":2, opacity:.85}, gDyn);
var mortG = el("g", {style:"cursor:grab"}, gDyn);
var mort2G = el("g", {style:"cursor:grab"}, gDyn);
var tgtG  = el("g", {style:"cursor:grab"}, gDyn);
var tgt2G = el("g", {style:"cursor:grab"}, gDyn);
function buildMortarMarker(g, color, label){
  /* mortar icon: a direction ARROW riding on the badge + tube on
     bipod + base plate. The arrow is drawn FIRST, pointing north,
     in its own group: refreshMortarArrows() rotates that group to
     the mortar's compass facing (mortarFacing), so the arrow
     always shows which way the mortar is turned — line it up
     straight down the target line with A / D on the compass strip
     under the sight dial. The badge circle is drawn over the
     arrow's shaft, so only its head and neck stick out. */
  var ag = el("g", {}, g);
  var head = el("path", {d:"M0 -37 L10.5 -20 L4 -20 L4 -12 L-4 -12 L-4 -20 L-10.5 -20 Z",
    fill:color, stroke:"var(--inset)", "stroke-width":1.4, "stroke-linejoin":"round"}, ag);
  el("circle", {r:19, fill:"var(--inset)", stroke:color, "stroke-width":2.5}, g);
  var m = el("g", {stroke:color, "stroke-width":2.6, "stroke-linecap":"round", fill:"none"}, g);
  el("line", {x1:-3, y1:8, x2:7, y2:-9}, m);            /* tube */
  el("line", {x1:-3, y1:8, x2:-9, y2:13}, m);           /* bipod L */
  el("line", {x1:-3, y1:8, x2:4,  y2:13}, m);           /* bipod R */
  el("line", {x1:-11, y1:14, x2:9, y2:14}, m);          /* base plate */
  var mt = el("text", {y:33, "text-anchor":"middle", "font-size":13, "font-weight":700, fill:color, "font-family":"'IBM Plex Mono',monospace"}, g);
  mt.textContent = label;
  return { g: ag, head: head, color: color };
}
var mortarArrow1 = buildMortarMarker(mortG, "var(--mortar)", "MORTAR");
var mortarArrow2 = buildMortarMarker(mort2G, "var(--mortar2)", "MORTAR 2");
mort2G.style.display = "none";
function buildTargetMarker(g, color, label){
  /* target icon: crosshair in the mortar's paired colour */
  el("circle", {r:16, fill:"none", stroke:color, "stroke-width":2.5}, g);
  var t = el("g", {stroke:color, "stroke-width":2.5, "stroke-linecap":"round"}, g);
  el("line", {x1:0, y1:-22, x2:0, y2:-9}, t);
  el("line", {x1:0, y1:9,  x2:0, y2:22}, t);
  el("line", {x1:-22, y1:0, x2:-9, y2:0}, t);
  el("line", {x1:9,  y1:0, x2:22, y2:0}, t);
  el("circle", {r:3.2, fill:color, stroke:"none"}, g);
  var tt = el("text", {y:36, "text-anchor":"middle", "font-size":13, "font-weight":700, fill:color, "font-family":"'IBM Plex Mono',monospace"}, g);
  tt.textContent = label;
}
buildTargetMarker(tgtG, "var(--target)", "TARGET");
buildTargetMarker(tgt2G, "var(--target2)", "TARGET 2");
tgt2G.style.display = "none";

/* padlock badge riding on each marker (inside the marker group, so it
   keeps the same constant on-screen size as the marker). Always visible:
   an open padlock in dim grey means unlocked, a filled closed padlock in
   the marker colour means locked. Tapping the padlock toggles that
   marker's lock — it never starts a marker drag. */
function makeLockBadge(g, color, which){
  var b = el("g", {}, g);
  el("circle", {cx:16, cy:-16, r:9.5, fill:"var(--inset)", stroke:color, "stroke-width":2}, b);
  /* unlocked: open padlock, outline only */
  var open = el("g", {stroke:"var(--board-label)", "stroke-width":1.7, fill:"none", "stroke-linecap":"round"}, b);
  el("path", {d:"M13.2 -15.2 v-2.2 a2.8 2.8 0 0 1 5.6 0 v1"}, open);   /* shackle, right leg open */
  el("rect", {x:12.4, y:-15.2, width:7.2, height:6, rx:1.2}, open);    /* body outline */
  /* locked: closed padlock, body filled in the marker colour */
  var shut = el("g", {style:"display:none"}, b);
  var sp = el("g", {stroke:color, "stroke-width":1.7, fill:"none", "stroke-linecap":"round"}, shut);
  el("path", {d:"M13.2 -15.4 v-2 a2.8 2.8 0 0 1 5.6 0 v2"}, sp);       /* shackle */
  el("rect", {x:12.4, y:-15.4, width:7.2, height:6, rx:1.2, fill:color, stroke:"none"}, shut);   /* body */
  /* generous invisible tap target over the badge */
  var hit = el("circle", {cx:16, cy:-16, r:14, fill:"transparent", style:"cursor:pointer"}, b);
  var ti = el("title", {}, hit); ti.textContent = "Tap to lock / unlock this marker";
  hit.addEventListener("pointerdown", function(evt){
    evt.stopPropagation(); evt.preventDefault();
    locked[which] = !locked[which];
    syncLockBtns(); render();
  });
  return { set: function(on){
    open.style.display = on ? "none" : "";
    shut.style.display = on ? "" : "none";
  }};
}
var lockBadge1 = makeLockBadge(mortG, "var(--mortar)", "m1");
var lockBadge2 = makeLockBadge(mort2G, "var(--mortar2)", "m2");
var lockBadgeT = makeLockBadge(tgtG, "var(--target)", "target");
var lockBadgeT2 = makeLockBadge(tgt2G, "var(--target2)", "target2");

/* minigame target marker: an orange diamond, separate from the real
   TARGET marker so the game's random target never feeds the firing
   solution panel (the game gives a range hint only, no answer).
   The diamond is only a MARK, and like in game a mark is not always
   accurate: it is drawn at the target's true position plus this
   round's mark error (game.markDx / markDy, in metres), which varies
   with who called the target in — see MARK_SOURCES. The hit rings
   are NOT drawn at all: there is no visible hit radius, the player
   reads the fall of shot and adjusts, like in game. The ring
   elements below are kept hidden permanently. */
var gameRingsG = el("g", {style:"display:none;pointer-events:none"}, gDyn);
var ringBlast  = el("circle", {fill:"rgba(255,138,60,.07)", stroke:"var(--orange)", "stroke-dasharray":"6 5", opacity:.75}, gameRingsG);
var ringClose  = el("circle", {fill:"rgba(255,138,60,.06)", stroke:"var(--orange)", opacity:.85}, gameRingsG);
var ringDirect = el("circle", {fill:"rgba(255,90,78,.10)", stroke:"var(--red)", opacity:.9}, gameRingsG);
/* defending infantry around a built position (FOB / Hideout / Cache /
   Emplacement): one small marker per man, placed at true scale around
   the orange diamond — positions are metre offsets on each defender
   (game.defenders), this group only draws them */
var gameDefG = el("g", {style:"display:none;pointer-events:none"}, gDyn);
/* parked vehicles around a FOB / Cache / Hideout: one marker per
   truck or car / jeep, at metre offsets on each vehicle
   (game.vehicles), drawn under the defenders and the diamond */
var gameVehG = el("g", {style:"display:none;pointer-events:none"}, gDyn);
/* the INFANTRY target's scattered dots: one small marker per man,
   at metre offsets around the mark (game.infMen), drawn exactly
   like the defenders — real ground scatter, positioned per frame
   by updateMarkerTransforms, NOT a fixed on-screen patch inside
   the mark group (that is what made them bunch up) */
var gameInfG = el("g", {style:"display:none;pointer-events:none"}, gDyn);
/* the VEHICLE target's icons: 1–3 top-down vehicle icons at metre
   offsets around the mark (game.vehTgt), positioned per frame
   like the parked vehicles */
var gameVehTgtG = el("g", {style:"display:none;pointer-events:none"}, gDyn);
/* the SMOKE mission's friendly squad: green dots (one per man,
   game.smokeSquad) that start away from the smoke point and MOVE
   toward the smoke icon as a timed smoke clock runs down. Only
   shown on a TIMED smoke mission — an untimed smoke mission has
   no moving squad. Positioned per frame by
   updateMarkerTransforms, at metre offsets around the MARK */
var gameSmokeSquadG = el("g", {style:"display:none;pointer-events:none"}, gDyn);
/* the DANGER CLOSE mission's two sides: the surrounded FRIENDLY
   squads (green dots, game.dcFriendlies) holding the centre at
   the target's true position, and the ENEMY infantry squads
   (orange dots, game.dcEnemySquads) surrounding them and closing
   in — both at metre offsets around game.targetFrac, positioned
   per frame by updateMarkerTransforms */
var gameDcFriendG = el("g", {style:"display:none;pointer-events:none"}, gDyn);
var gameDcEnemyG = el("g", {style:"display:none;pointer-events:none"}, gDyn);
/* the emplacements dug in near a FOB / Hideout: one marker per
   emplacement at its metre offset from the position
   (game.emplacements), drawn under the diamond — they sit at
   their TRUE spots, like the defenders and parked vehicles;
   only the orange diamond is a possibly-off mark */
var gameEmpG = el("g", {style:"display:none;pointer-events:none"}, gDyn);
var gameTgtG = el("g", {style:"display:none;pointer-events:none"}, gDyn);
/* the game target has three looks. Built positions (FOB / Hideout /
   Cache) and emplacements keep the big orange diamond — a marked
   structure. INFANTRY and VEHICLE targets are NOT diamonds.
   INFANTRY is drawn in exactly the defender style (orange disc,
   dark rim, dark centre — see makeDefenders) but SCATTERED over
   real ground: 1–5 squads of a random 1–8 men each, at metre
   offsets around the mark in their own group (gameInfG), spread
   out in the open and re-rolled every round instead of one fixed
   tight cluster (see scatterInfantryTarget). A VEHICLE target
   gets 1–3 VEHICLE ICONS — top-down truck silhouettes in the
   same orange-on-dark marking colours, at metre offsets around
   the mark in their own group (gameVehTgtG), drawn like the
   parked vehicles around a FOB / Cache / Hideout but
   orange-marked so they read as the target (see
   scatterVehicleTarget). The mark position, mark error and
   movement are as before — but scoring for these two types is
   PER MAN / PER VEHICLE (see the scattered-health block below):
   there is no shared pool at the centre, each dot and each icon
   is hit where it stands. */
var gameTgtParts = {};
/* the top-down vehicle icon (truck silhouette) in the orange
   target marking — body, cab and four wheels — drawn into any
   group; used for every icon of a vehicle target */
function drawVehIcon(parent){
  var wg = el("g", {fill:"var(--orange)"}, parent);
  el("rect", {x:-8.5, y:-8.6, width:5, height:2.8, rx:1}, wg);
  el("rect", {x:3.5, y:-8.6, width:5, height:2.8, rx:1}, wg);
  el("rect", {x:-8.5, y:5.8, width:5, height:2.8, rx:1}, wg);
  el("rect", {x:3.5, y:5.8, width:5, height:2.8, rx:1}, wg);
  el("rect", {x:-12.5, y:-6, width:25, height:12, rx:2, fill:"var(--inset)", stroke:"var(--orange)", "stroke-width":2.2}, parent);
  el("rect", {x:5, y:-6, width:7.5, height:12, fill:"var(--orange)", opacity:.38}, parent);
  el("line", {x1:4, y1:-6, x2:4, y2:6, stroke:"var(--orange)", "stroke-width":1.6}, parent);
  el("line", {x1:-10, y1:0, x2:2.5, y2:0, stroke:"var(--orange)", "stroke-width":1, opacity:.65}, parent);
}
(function buildGameMarker(){
  var dia = el("g", {}, gameTgtG); gameTgtParts.diamond = dia;
  el("polygon", {points:"0,-20 14,0 0,20 -14,0", fill:"var(--inset)", stroke:"var(--orange)", "stroke-width":2.5}, dia);
  var c = el("g", {stroke:"var(--orange)", "stroke-width":2.2, "stroke-linecap":"round"}, dia);
  el("line", {x1:0, y1:-9, x2:0, y2:9}, c);
  el("line", {x1:-9, y1:0, x2:9, y2:0}, c);
  /* infantry target: defender-style dots, SCATTERED over real
     ground — the dots themselves live in gameInfG at metre
     offsets and are (re)built by scatterInfantryTarget() each
     round, so this group just stays empty and hidden */
  var inf = el("g", {style:"display:none"}, gameTgtG); gameTgtParts.infantry = inf;
  /* vehicle target: 1–3 top-down vehicle icons — they live in
     gameVehTgtG at metre offsets and are (re)built by
     scatterVehicleTarget() each round, so this group just stays
     empty and hidden */
  var veh = el("g", {style:"display:none"}, gameTgtG); gameTgtParts.vehicle = veh;
  /* smoke mission: the requested smoke point — a pale smoke cloud
     with the exact point dotted orange at its centre */
  var smk = el("g", {style:"display:none"}, gameTgtG); gameTgtParts.smoke = smk;
  el("circle", {cx:-8, cy:3, r:6.5, fill:"#ccd2d8", stroke:"var(--inset)", "stroke-width":1.6}, smk);
  el("circle", {cx:8, cy:3, r:6.5, fill:"#ccd2d8", stroke:"var(--inset)", "stroke-width":1.6}, smk);
  el("circle", {cx:0, cy:-3.5, r:8, fill:"#e8ecef", stroke:"var(--inset)", "stroke-width":1.6}, smk);
  el("circle", {cx:0, cy:4.5, r:7, fill:"#f2f4f6"}, smk);
  el("circle", {r:2.3, fill:"var(--orange)", stroke:"var(--inset)", "stroke-width":1}, smk);
  var t = el("text", {id:"gameTgtLabel", y:36, "text-anchor":"middle", "font-size":12, "font-weight":700, fill:"var(--orange)", "font-family":"'IBM Plex Mono',monospace"}, gameTgtG);
  t.textContent = "GAME TARGET";
  gameTgtParts.label = t;
})();
/* SCATTER the infantry target: rebuild its dots fresh every round
   as SQUADS dispersed in the open, rolled exactly like the squads
   defending a built position — 1–5 SQUADS, each squad a random
   1–8 MEN (so anywhere from 1 to 40 dots), in the defender dot
   style. The dots sit at METRE offsets from the mark
   (game.infMen), drawn in gameInfG and positioned per frame by
   updateMarkerTransforms exactly like the defenders — so the
   scatter is REAL GROUND, not a fixed on-screen patch inside the
   mark group (offsets in screen units are what made the dots
   bunch into one blob around the mark, however they were
   rolled). Each squad holds its own spot on the ground: the
   first squad near the mark (0–10 m out), the rest at separated
   bearings 25–55 m out, with each squad's men jittered a few
   metres around their squad's spot — so the pattern spreads
   wider the more you zoom, like real men in the open. The roll
   is kept on game.infSquads (the squad sizes) so the round text
   can name it. The pattern is rolled once per round (in
   setGameTargetVisual, called by newTarget) and then rides with
   the mark — a moving infantry target carries its scatter with
   it as it moves. Hits are judged PER DOT: each man is his own
   target (see the scattered-health block below). */
function scatterInfantryTarget(){
  clearInfantryTarget();
  game.infSquads = [];
  var squads = 1 + Math.floor(Math.random() * 5);          /* 1–5 squads */
  var baseA = Math.random() * Math.PI * 2;
  for (var s = 0; s < squads; s++){
    var size = 1 + Math.floor(Math.random() * 8);          /* 1 squad = 1–8 men */
    game.infSquads.push(size);
    /* each squad holds its own spot on the ground: first near
       the mark, the rest well spread at separated bearings */
    var a = baseA + s * (Math.PI * (0.9 + Math.random() * 0.7)) + (Math.random() - .5) * .5;
    var ring = s === 0 ? Math.random() * 10 : 25 + Math.random() * 30;   /* centre squad 0–10 m, others 25–55 m out */
    var cx = Math.cos(a) * ring, cy = Math.sin(a) * ring;
    for (var m = 0; m < size; m++){
      var ja = Math.random() * Math.PI * 2, jd = Math.random() * 6;
      /* each man is his OWN target now: he carries an alive flag
         and is taken down only by a shell landing close to HIM
         (see resolveImpact) — there is no shared squad HP pool
         any more, so a shell bursting in empty ground between
         two squads 40 m apart hurts nobody, and a shell on one
         squad leaves the other squad untouched */
      var d = { dx: cx + Math.cos(ja) * jd, dy: cy + Math.sin(ja) * jd, alive: true, el: null };
      var g = el("g", {}, gameInfG);
      el("circle", {r:5.4, fill:"var(--orange)", stroke:"var(--inset)", "stroke-width":1.6}, g);
      el("circle", {r:2.1, fill:"var(--inset)"}, g);
      d.el = g;
      game.infMen.push(d);
    }
  }
}
function clearInfantryTarget(){
  while (gameInfG.firstChild) gameInfG.removeChild(gameInfG.firstChild);
  game.infMen = [];
}
function infantryScatterText(){
  if (!game.infSquads || !game.infSquads.length) return "";
  var total = 0;
  for (var i = 0; i < game.infSquads.length; i++) total += game.infSquads[i];
  return game.infSquads.length + (game.infSquads.length === 1 ? " squad" : " squads") +
    " (" + game.infSquads.join(" + ") + ") — " + total + (total === 1 ? " man" : " men") + ", up to ~55 m apart.";
}
/* ================= VEHICLE TARGET — 1–3 VEHICLE ICONS =================
   A vehicle target is not always a lone vehicle: every round
   rolls 1–3 vehicles, drawn as top-down vehicle icons (the truck
   silhouette in the orange target marking) at metre offsets
   around the mark (game.vehTgt), in gameVehTgtG, positioned per
   frame by updateMarkerTransforms like the parked vehicles —
   the first vehicle sits on the mark, the others 12–24 m off at
   random bearings, each at its own angle, re-rolled every round.
   Like the infantry scatter, hits are judged PER ICON: each
   vehicle is its own target with its own fate / HP, not one
   shared entity at the mark (see the scattered-health block). */
function scatterVehicleTarget(){
  clearVehicleTarget();
  var n = 1 + Math.floor(Math.random() * 3);          /* 1–3 vehicles */
  game.vehCount = n;
  for (var i = 0; i < n; i++){
    var a = Math.random() * Math.PI * 2;
    var dist = i === 0 ? 0 : 12 + Math.random() * 12;   /* first on the mark, others 12–24 m off */
    /* each vehicle is its OWN target too: its own alive flag and
       its own HP pool (set from the type in newGameRound for a
       stationary vehicle target) — damage is worked out per
       vehicle from the shell's distance to THAT vehicle, never
       from one shared pool measured to the mark's centre, so a
       shell on one vehicle does nothing to another 20 m away */
    var v = { dx: Math.cos(a) * dist, dy: Math.sin(a) * dist,
              rot: Math.floor(Math.random() * 360), alive: true, hp: 0, maxHp: 0, el: null };
    var g = el("g", {}, gameVehTgtG);
    drawVehIcon(g);
    v.el = g;
    game.vehTgt.push(v);
  }
}
function clearVehicleTarget(){
  while (gameVehTgtG.firstChild) gameVehTgtG.removeChild(gameVehTgtG.firstChild);
  game.vehTgt = []; game.vehCount = 0;
}
function vehicleTargetText(){
  if (!game.vehCount) return "";
  if (game.vehCount === 1) return "1 vehicle — hit on its own.";
  return game.vehCount + " vehicles around the mark — each hit on its own.";
}
/* ================= SCATTERED TARGETS — PER-MAN / PER-VEHICLE HEALTH =================
   An infantry target is 1–5 squads scattered over real ground,
   tens of metres apart, and a vehicle target is 1–3 vehicles
   spread around the mark — so neither can honestly share one
   health pool measured to a single centre point: a shell that
   lands on one squad (or one vehicle) was doing nothing to the
   others, yet the old shared pool took damage anyway, and a
   shell landing in the empty middle took health off men and
   vehicles it never came near. Now every man and every vehicle
   is scored where HE / IT actually stands:
   - INFANTRY (moving or holding): each man goes down only when
     a shell lands within INF_KILL_M of that man — the same 14 m
     a defending man falls at. The target is down only when
     EVERY man is down; the status card counts men, not HP.
   - VEHICLE (always stationary): each vehicle has its OWN HP pool (the
     type's HP, per vehicle) and takes its own graded
     50 / 25 / 10 damage from the shell's distance to that
     vehicle. The target is down only when every vehicle is
     destroyed; the card shows each vehicle's HP separately. */
var INF_KILL_M = 14;   /* metres — a shell this close to a scattered infantryman takes that man down (same as a defender) */
function infTargetAlive(){
  var n = 0;
  if (game.infMen) for (var i = 0; i < game.infMen.length; i++) if (game.infMen[i].alive) n++;
  return n;
}
function vehTargetAlive(){
  var n = 0;
  if (game.vehTgt) for (var i = 0; i < game.vehTgt.length; i++) if (game.vehTgt[i].alive) n++;
  return n;
}
/* ================= SMOKE MISSION — VARIED TIMEOUT + FRIENDLY SQUAD =================
   A smoke mission's clock is VARIED, rolled fresh every smoke
   round: sometimes there is NO timeout at all (the squad is
   holding and will wait however long the smoke takes), and the
   rest of the time the squad is on a timed advance of a varied
   length. Only a TIMED smoke mission gets the friendly squad on
   the map: a cluster of GREEN dots — friendly infantry, in the
   same dot style as the orange defenders / infantry targets but
   green — starting 65–90 m short of the smoke point and moving
   toward the smoke icon as the clock runs down, reaching it
   exactly when the clock empties. Their current offset is their
   start offset scaled by timeLeft / timeMax, worked out in
   updateMarkerTransforms, and gameTick re-runs that every tick
   so they visibly advance. An untimed smoke mission rolls no
   squad: nothing is moving on a clock. */
var SMOKE_DURATIONS = [30, 35, 40, 45, 50, 60, 75];   /* seconds — the varied timed clocks */
var SMOKE_NO_TIMEOUT_CHANCE = 0.35;                    /* share of smoke missions with no timeout at all */
function clearSmokeSquad(){
  while (gameSmokeSquadG.firstChild) gameSmokeSquadG.removeChild(gameSmokeSquadG.firstChild);
  game.smokeSquad = [];
  game.smokeSquadLabelEl = null;
}
function makeSmokeSquad(){
  clearSmokeSquad();
  var size = 4 + Math.floor(Math.random() * 5);          /* one friendly squad: 4–8 men */
  var a = Math.random() * Math.PI * 2;
  var dist = 65 + Math.random() * 25;                    /* starts 65–90 m short of the point */
  var cx = Math.cos(a) * dist, cy = Math.sin(a) * dist;
  for (var m = 0; m < size; m++){
    var ja = Math.random() * Math.PI * 2, jd = Math.random() * 6;
    var d = { startDx: cx + Math.cos(ja) * jd, startDy: cy + Math.sin(ja) * jd, el: null };
    var g = el("g", {}, gameSmokeSquadG);
    el("circle", {r:5.4, fill:"var(--green)", stroke:"var(--inset)", "stroke-width":1.6}, g);
    el("circle", {r:2.1, fill:"var(--inset)"}, g);
    d.el = g;
    game.smokeSquad.push(d);
  }
  var lg = el("g", {}, gameSmokeSquadG);
  var lt = el("text", {y:-11, "text-anchor":"middle", "font-size":10.5, "font-weight":700, fill:"var(--green)", "font-family":"'IBM Plex Mono',monospace"}, lg);
  lt.textContent = "FRIENDLY SQUAD";
  game.smokeSquadLabelEl = lg;
}
function smokeTimeoutText(){
  if (!game.type || game.type.id !== "smoke") return "";
  if (!game.smokeTimed)
    return "No timeout — squad holds and waits.";
  return "Timed: " + Math.round(game.timeMax) + " s — green squad advances on the point as the clock runs.";
}
/* ================= DANGER CLOSE — SURROUNDED SQUAD CALLS FOR FIRE =================
   A mission in the spirit of Long Tan: 1–2 FRIENDLY squads
   (green dots), each a varied 1–5 men, are pinned down at the
   position and SURROUNDED by the enemy — 2–5 separate ENEMY
   infantry squads (orange dots), each a varied 1–8 men, spread
   on bearings all around the friendlies and CLOSING IN on them
   as the mission runs. The friendlies are asking for mortar
   support danger close: the rounds have to land on the enemy
   squads pressing in, metres from the friendlies themselves.
   Each friendly squad has its OWN health: it starts at 100 HP
   and BLEEDS at a rate set by how many enemy MEN are actually
   pressing — 0.02 HP per second for EACH enemy man still up,
   counted live across every surrounding squad. So a lone
   3-man squad only bleeds the friendlies at 0.06 HP/s (a squad
   holds out for about 1,670 seconds — barely bleeding), one
   full 8-man squad bleeds 0.16 HP/s (about 625 seconds), and
   16 men up bleed 0.32 HP/s (about 310 seconds). Every enemy
   man you kill slows the bleeding a little; wiping a squad
   slows it a lot. A friendly squad at 0 HP is overrun and the
   mission fails. And danger close cuts both ways: your own
   rounds landing close to a friendly squad wound it too
   (graded by distance to the squad). The mission is won when
   every enemy man is down. Enemy men are killed per man, like
   scattered infantry — a shell only takes down the men it
   lands close to, where that squad stands NOW. And a squad
   HIT by a burst (a man down, or a shell inside its blast)
   STOPS closing in: it goes to ground at the distance it had
   reached (sq.halted / sq.frozenDist, see dcSquadCentre) —
   though its men still count toward the friendly bleed while
   they are up. Squads that have not been hit keep closing in
   while the shells fly. */
var DC_DRAIN_PER_MAN = 0.02;   /* HP lost per SECOND by each friendly squad, PER enemy man still up — total drain = this × enemy men alive (3 men = 0.06 HP/s, 8 men = 0.16 HP/s, 16 men = 0.32 HP/s) */
function dcDrainRate(){
  return DC_DRAIN_PER_MAN * dcEnemyMenAlive();
}
var DC_CLOSE_SPEED = 0.45;   /* m/s the enemy squads press in at */
var DC_CLOSE_MIN = 9;        /* metres — the closest the enemy presses in to */
/* friendly-fire bands: metres from a friendly squad's centre →
   HP that squad loses to your own round landing there */
var DC_FF_BANDS = [ [8, 30], [16, 15], [24, 6] ];
function dcEnemySquadsAlive(){
  var n = 0;
  if (game.dcEnemySquads) for (var i = 0; i < game.dcEnemySquads.length; i++){
    var sq = game.dcEnemySquads[i], any = false;
    for (var m = 0; m < sq.men.length; m++) if (sq.men[m].alive) any = true;
    if (any) n++;
  }
  return n;
}
function dcEnemyMenAlive(){
  var n = 0;
  if (game.dcEnemySquads) for (var i = 0; i < game.dcEnemySquads.length; i++)
    for (var m = 0; m < game.dcEnemySquads[i].men.length; m++) if (game.dcEnemySquads[i].men[m].alive) n++;
  return n;
}
function dcEnemyMenTotal(){
  var n = 0;
  if (game.dcEnemySquads) for (var i = 0; i < game.dcEnemySquads.length; i++) n += game.dcEnemySquads[i].men.length;
  return n;
}
/* an enemy squad's CURRENT centre offset from the position: it
   started dist0 metres out on its bearing and has been pressing
   in at DC_CLOSE_SPEED ever since, down to DC_CLOSE_MIN — UNLESS
   it has been HIT by a mortar burst (a man down, or a shell
   inside its blast), in which case it has STOPPED closing in:
   its distance is frozen where the burst caught it (sq.frozenDist,
   set in resolveImpact) and it goes to ground there for the rest
   of the mission, while squads that have not been hit keep
   pressing in */
function dcSquadCentre(sq){
  var d = sq.frozenDist != null ? sq.frozenDist
    : Math.max(DC_CLOSE_MIN, sq.dist0 - DC_CLOSE_SPEED * game.dcElapsed);
  return { x: sq.dirx * d, y: sq.diry * d };
}
function clearDangerClose(){
  while (gameDcFriendG.firstChild) gameDcFriendG.removeChild(gameDcFriendG.firstChild);
  while (gameDcEnemyG.firstChild) gameDcEnemyG.removeChild(gameDcEnemyG.firstChild);
  game.dcFriendlies = [];
  game.dcEnemySquads = [];
  game.dcElapsed = 0;
}
function makeDangerClose(){
  clearDangerClose();
  var fi, fj, ei, em;
  /* friendlies: 1–2 squads of a varied 1–5 men, holding in the
     centre — squad centres a few metres apart around the
     position, men jittered around their squad's spot, drawn
     GREEN like the smoke mission's friendly squad */
  var nF = 1 + Math.floor(Math.random() * 2);              /* 1–2 friendly squads */
  var fBase = Math.random() * Math.PI * 2;
  for (fi = 0; fi < nF; fi++){
    var fSize = 1 + Math.floor(Math.random() * 5);         /* 1 squad = 1–5 men */
    var fa = fBase + fi * Math.PI * (0.8 + Math.random() * 0.5);
    var fRing = fi === 0 ? Math.random() * 3 : 5 + Math.random() * 4;   /* centres 0–9 m apart */
    var fsq = { hp: 100, maxHp: 100, size: fSize,
                cx: Math.cos(fa) * fRing, cy: Math.sin(fa) * fRing,
                men: [], labelEl: null };
    for (fj = 0; fj < fSize; fj++){
      var ja = Math.random() * Math.PI * 2, jd = Math.random() * 4.5;
      var fm = { dx: Math.cos(ja) * jd, dy: Math.sin(ja) * jd, el: null };
      var fg = el("g", {}, gameDcFriendG);
      el("circle", {r:5.4, fill:"var(--green)", stroke:"var(--inset)", "stroke-width":1.6}, fg);
      el("circle", {r:2.1, fill:"var(--inset)"}, fg);
      fm.el = fg;
      fsq.men.push(fm);
    }
    var flg = el("g", {}, gameDcFriendG);
    var flt = el("text", {y:-11, "text-anchor":"middle", "font-size":10.5, "font-weight":700, fill:"var(--green)", "font-family":"'IBM Plex Mono',monospace"}, flg);
    flt.textContent = nF > 1 ? "FRIENDLY " + (fi + 1) : "FRIENDLY SQUAD";
    fsq.labelEl = flg;
    game.dcFriendlies.push(fsq);
  }
  /* enemy: 2–5 separate infantry squads SURROUNDING the
     friendlies — a surround is never a single squad — bearings
     spread right around the circle so they really do close in
     from every side — each a varied 1–8 men, starting 38–58 m
     out and pressing in */
  var nE = 2 + Math.floor(Math.random() * 4);              /* 2–5 enemy squads */
  var eBase = Math.random() * Math.PI * 2;
  for (ei = 0; ei < nE; ei++){
    var eSize = 1 + Math.floor(Math.random() * 8);         /* 1 squad = 1–8 men */
    var ea = eBase + (ei / nE) * Math.PI * 2 + (Math.random() - .5) * .6;
    var esq = { dirx: Math.cos(ea), diry: Math.sin(ea),
                dist0: 38 + Math.random() * 20,            /* starts 38–58 m out */
                halted: false, frozenDist: null,           /* set when a mortar burst hits this squad: it stops closing in */
                men: [] };
    for (em = 0; em < eSize; em++){
      var eja = Math.random() * Math.PI * 2, ejd = Math.random() * 6;
      var enm = { dx: Math.cos(eja) * ejd, dy: Math.sin(eja) * ejd, alive: true, el: null };
      var eg = el("g", {}, gameDcEnemyG);
      el("circle", {r:5.4, fill:"var(--orange)", stroke:"var(--inset)", "stroke-width":1.6}, eg);
      el("circle", {r:2.1, fill:"var(--inset)"}, eg);
      enm.el = eg;
      esq.men.push(enm);
    }
    game.dcEnemySquads.push(esq);
  }
}
function dangerCloseText(){
  if (!game.dcFriendlies || !game.dcFriendlies.length) return "";
  var fSizes = [], eSizes = [], fMen = 0, eMen = 0, i;
  for (i = 0; i < game.dcFriendlies.length; i++){ fSizes.push(game.dcFriendlies[i].size); fMen += game.dcFriendlies[i].size; }
  for (i = 0; i < game.dcEnemySquads.length; i++){ eSizes.push(game.dcEnemySquads[i].men.length); eMen += game.dcEnemySquads[i].men.length; }
  return game.dcFriendlies.length + (game.dcFriendlies.length === 1 ? " friendly" : " friendlies") +
    " (" + fSizes.join(" + ") + ") — " + fMen + (fMen === 1 ? " man" : " men") +
    " vs " + game.dcEnemySquads.length + " enemy squads" +
    " (" + eSizes.join(" + ") + ") — " + eMen + (eMen === 1 ? " man" : " men") + " closing in.";
}
/* ================= DANGER CLOSE — THE ONE COORDINATE THE SQUAD CALLS =================
   The pinned squad gives the mortars exactly ONE thing: a single
   coordinate to shoot. They do not give a range, a bearing or a
   correction — just the grid ref of the ONE enemy squad they want
   hit first. WHICH squad that is depends on HOW MANY enemy squads
   they are facing (counted live, squads still up):
   - facing 2 squads: the NEAREST one — the closest is the
     immediate threat.
   - facing 3 or more: the LARGEST one (most men still up, ties
     broken by nearest) — the biggest squad bleeds them fastest.
   - facing 1 (the last one standing): that one.
   The call is worked out live (dcCallTarget), so the status card
   always shows the current call: as squads press in the ref moves
   with the called squad, and when the called squad is wiped the
   call switches to the next squad by the same rule. And Ask
   spotter on this mission is just as limited: the pinned squad
   only confirms whether the selected mortar's last round landed
   in the RIGHT PLACE or NOT — no metres, no add / drop, no
   left / right (see askSpotter's danger-close branch). */
function dcCallTarget(){
  if (!game.targetFrac || !game.dcEnemySquads || !game.dcEnemySquads.length) return null;
  var B = boardMeters(); if (!B) return null;
  var alive = [], i, j;
  for (i = 0; i < game.dcEnemySquads.length; i++){
    var sq = game.dcEnemySquads[i], men = 0;
    for (j = 0; j < sq.men.length; j++) if (sq.men[j].alive) men++;
    if (!men) continue;
    var cen = dcSquadCentre(sq);
    alive.push({ idx: i, men: men, cx: cen.x, cy: cen.y, dist: Math.hypot(cen.x, cen.y) });
  }
  if (!alive.length) return null;
  var count = alive.length, pick = null, why = "";
  if (count === 1){
    pick = alive[0]; why = "the last squad still up";
  } else if (count === 2){
    pick = alive[0];
    for (i = 1; i < alive.length; i++) if (alive[i].dist < pick.dist) pick = alive[i];
    why = "nearest first — facing only 2 squads, the closest is the immediate threat";
  } else {
    pick = alive[0];
    for (i = 1; i < alive.length; i++)
      if (alive[i].men > pick.men || (alive[i].men === pick.men && alive[i].dist < pick.dist)) pick = alive[i];
    why = "largest first — facing " + count + " squads, the biggest bleeds them fastest";
  }
  var frac = { x: game.targetFrac.x + pick.cx / B, y: game.targetFrac.y + pick.cy / B };
  return { idx: pick.idx, count: count, men: pick.men, ref: fracToRef(frac).compact, why: why };
}
function dcCallText(){
  var c = dcCallTarget();
  if (!c) return "";
  return "The pinned squad calls ONE coordinate to shoot: " + c.ref +
    " — enemy squad " + (c.idx + 1) + " (" + c.men + (c.men === 1 ? " man" : " men") + " up, " + c.why + ")." +
    " The coordinate they call depends on how many enemy squads they are facing: 2 squads → the nearest one, 3 or more → the largest one, the last one standing → that one." +
    " That coordinate is all they give — no range and no correction — and Ask spotter on this mission only tells you whether a round landed in the right place or not.";
}
/* switch the game target's look for this round's type: scattered
   dots for infantry, 1–3 vehicle icons for a vehicle target, the
   orange diamond otherwise */
function setGameTargetVisual(type){
  if (!gameTgtParts.diamond) return;
  var id = type ? type.id : "";
  var isInf = id === "infantry" || id === "infantryHold";
  var isVeh = id === "vehicleStatic";
  var isSmoke = id === "smoke";
  if (isInf) scatterInfantryTarget();   /* fresh scatter every round */
  else { game.infSquads = []; clearInfantryTarget(); }
  if (isVeh) scatterVehicleTarget();    /* fresh 1–3 icons every round */
  else clearVehicleTarget();
  gameTgtParts.diamond.style.display = (isInf || isVeh || isSmoke) ? "none" : "";
  gameTgtParts.infantry.style.display = "none";   /* the infantry dots live in gameInfG now */
  gameTgtParts.vehicle.style.display = "none";    /* the vehicle icons live in gameVehTgtG now */
  gameTgtParts.smoke.style.display = isSmoke ? "" : "none";
  if (gameTgtParts.label)
    gameTgtParts.label.setAttribute("y", isInf ? 40 : (isVeh ? 24 : 36));
}
/* ================= COMMANDER UAV — ring + drone badge around the mark =================
   When the commander called the target in, his UAV is overhead
   watching it: the mark gets a slowly spinning dashed ring with a
   quadcopter drone badge riding on top of it and a UAV label,
   tinted by the UAV's state (grey en route, green on station,
   orange low on fuel) — and the whole ring vanishes when the UAV
   RTBs. It rides on the MARK position with the orange diamond
   (set in updateMarkerTransforms) — it is NOT re-centred on the
   true position. The fuel itself is simulated with the spotter
   code (see UAV FUEL below).
   The ring has a REAL GROUND RADIUS (UAV_RING_M below), not a
   fixed on-screen size: a commander mark can sit at most 15 m
   off the true position (see MARK_SOURCES), so a 30 m radius
   ring centred on the mark always contains the true position,
   at any zoom and on any map scale. The ring lives inside the
   marker group, which is scaled by 1 / view.s so markers keep a
   constant on-screen size — layoutUavRing() therefore sets the
   ring's local radius to ground radius × px-per-metre × view.s,
   which cancels the group scale and leaves the ring's board
   radius at exactly UAV_RING_M × px-per-metre. It is re-run from
   updateMarkerTransforms(), which every zoom, pan, map change
   and render funnels through. The drone badge and label ride on
   the ring's top edge, so they move out with it; their own size
   stays screen-constant like the other markers. On a 0 km map
   there is no ground scale, so the ring falls back to its old
   fixed on-screen size. */
var UAV_RING_M = 30;   /* real ground radius of the UAV ring, in metres */
var gameUavG = el("g", {style:"display:none;pointer-events:none"}, gDyn);
var uavParts = {};
function layoutUavRing(){
  if (!uavParts.ring) return;
  var B = boardMeters();
  var s = (typeof view !== "undefined" && view && view.s) ? view.s : 1;
  var rLocal = B > 0 ? UAV_RING_M * (PLOT / B) * s : 34;
  uavParts.ring.setAttribute("r", rLocal);
  if (uavParts.icon) uavParts.icon.setAttribute("transform", "translate(0," + (-rLocal) + ")");
  if (uavParts.label) uavParts.label.setAttribute("y", -rLocal + 4);
}
(function buildUavMarker(){
  var spin = el("g", {"class":"uavring"}, gameUavG);
  uavParts.ring = el("circle", {r:34, fill:"none", stroke:"var(--green)", "stroke-width":2, "stroke-dasharray":"7 5", opacity:.9}, spin);
  var icon = el("g", {transform:"translate(0,-34)"}, gameUavG);
  uavParts.icon = icon;
  uavParts.badge = el("circle", {r:11, fill:"var(--inset)", stroke:"var(--green)", "stroke-width":1.8}, icon);
  var d = el("g", {stroke:"var(--green)", "stroke-width":1.6, "stroke-linecap":"round", fill:"none"}, icon);
  uavParts.drone = d;
  el("line", {x1:-5.5, y1:-5.5, x2:5.5, y2:5.5}, d);
  el("line", {x1:-5.5, y1:5.5, x2:5.5, y2:-5.5}, d);
  var rc = [[-5.5,-5.5],[5.5,-5.5],[-5.5,5.5],[5.5,5.5]];
  for (var i = 0; i < rc.length; i++) el("circle", {cx:rc[i][0], cy:rc[i][1], r:2.7}, d);
  uavParts.body = el("circle", {r:2.3, fill:"var(--green)", stroke:"none"}, d);
  uavParts.label = el("text", {x:15, y:-30, "font-size":10.5, "font-weight":700, fill:"var(--green)", "font-family":"'IBM Plex Mono',monospace"}, gameUavG);
  uavParts.label.textContent = "UAV";
  layoutUavRing();   /* size the ring to its real ground radius for this map at the starting zoom */
})();
function uavColor(){
  return game.uavState === "low" ? "var(--orange)" : (game.uavState === "travel" ? "var(--ink-faint)" : "var(--green)");
}
function tintUav(){
  var c = uavColor();
  uavParts.ring.setAttribute("stroke", c);
  uavParts.badge.setAttribute("stroke", c);
  uavParts.drone.setAttribute("stroke", c);
  uavParts.body.setAttribute("fill", c);
  uavParts.label.setAttribute("fill", c);
}
/* TRUE POSITION reveal marker: hidden until the player presses
   Skip target. Drawn at the target's REAL position (game.targetFrac,
   no mark error) in green, with a dashed line back to the orange
   mark so the mark error can be seen at a glance */
var gameTrueLine = el("line", {stroke:"var(--green)", "stroke-width":1.6, "stroke-dasharray":"5 4", style:"display:none;pointer-events:none"}, gDyn);
var gameTrueG = el("g", {style:"display:none;pointer-events:none"}, gDyn);
(function buildTrueMarker(){
  el("circle", {r:15, fill:"none", stroke:"var(--green)", "stroke-width":2.2, "stroke-dasharray":"4 3"}, gameTrueG);
  var c = el("g", {stroke:"var(--green)", "stroke-width":2.4, "stroke-linecap":"round"}, gameTrueG);
  el("line", {x1:0, y1:-19, x2:0, y2:-8}, c);
  el("line", {x1:0, y1:8, x2:0, y2:19}, c);
  el("line", {x1:-19, y1:0, x2:-8, y2:0}, c);
  el("line", {x1:8, y1:0, x2:19, y2:0}, c);
  el("circle", {r:3, fill:"var(--green)", stroke:"none"}, gameTrueG);
  var t = el("text", {y:-26, "text-anchor":"middle", "font-size":11, "font-weight":700, fill:"var(--green)", "font-family":"'IBM Plex Mono',monospace"}, gameTrueG);
  t.textContent = "TRUE POSITION";
})();

/* LASER DESIGNATOR — FRIENDLY SPOTTER on the grid + lased position.
   When this round's mark is from a friendly spotter with laser
   designator binoculars (markSrc id "laser"), he is NOT drawn on
   the target: his green FRIENDLY SPOTTER icon — a soldier figure
   with binoculars raised — stands on the grid 50–150 m FROM the
   target (game.spotterDx / spotterDy, in metres, rolled fresh in
   rollMark every laser round), with a faint dashed line to the
   mark he is lasing. The offset is stored in real ground metres
   and converted through boardMeters() at draw time, so the gap
   on screen DEPENDS ON THE MAP: 100 m is a long way on a 1 km
   map and a short hop on a 4 km map. When the player then Asks
   spotter, the spotter lases the target and the ACCURATE lased
   position is drawn on the grid: a cyan SQUARE with a centre dot
   at the target's true position, with a dashed line back to the
   orange mark — and it only shows TEMPORARILY, for a few seconds,
   then fades (game.laserShown, set in askSpotter via
   showLasedTemporarily).
   It is NOT the Skip-target reveal: the round stays live, and the
   marker is cyan / LASER, not green / TRUE POSITION. Rounds from a
   regular squad, a passing squad or regular infantry never show it —
   they only report the fall of shot after every shell dropped. */
var gameSpotterLine = el("line", {stroke:"var(--green)", "stroke-width":1.4, "stroke-dasharray":"4 4", opacity:.55, style:"display:none;pointer-events:none"}, gDyn);
var gameLaserG = el("g", {style:"display:none;pointer-events:none"}, gDyn);
var spotterParts = {};
(function buildSpotterBadge(){
  /* friendly spotter figure: head with binoculars raised to the
     eyes, shoulders below — in friendly green, labelled so the
     player knows the man off the target is theirs. This ONE
     figure is the icon for EVERY ground spotter who gets an
     icon: the laser designator spotter, the sniper team's
     spotter and the REGULAR INFANTRY spotter all use it exactly
     as drawn here — only the label beside it (set by
     tintSpotter) and his distance from the target differ. When
     the enemy spots him the figure is re-tinted: red with a
     cross when he is killed, orange when he has fled. */
  spotterParts.ring = el("circle", {r:12, fill:"var(--inset)", stroke:"var(--green)", "stroke-width":1.8}, gameLaserG);
  var b = el("g", {stroke:"var(--green)", "stroke-width":1.5, fill:"none", "stroke-linecap":"round"}, gameLaserG);
  spotterParts.figure = b;
  el("circle", {cx:0, cy:-3.6, r:3.4}, b);                 /* head */
  el("path", {d:"M -6.5 7.5 A 7 7 0 0 1 6.5 7.5"}, b);    /* shoulders */
  var lens = el("g", {fill:"var(--green)", stroke:"none"}, gameLaserG);
  spotterParts.lens = lens;
  el("circle", {cx:-2.5, cy:-3.8, r:1.6}, lens);           /* binocular lenses over the eyes */
  el("circle", {cx:2.5, cy:-3.8, r:1.6}, lens);
  var cross = el("g", {stroke:"var(--red)", "stroke-width":2.2, "stroke-linecap":"round", style:"display:none"}, gameLaserG);
  spotterParts.cross = cross;
  el("line", {x1:-7, y1:-7, x2:7, y2:7}, cross);
  el("line", {x1:-7, y1:7, x2:7, y2:-7}, cross);
  var t = el("text", {x:15, y:4, "font-size":10.5, "font-weight":700, fill:"var(--green)", "font-family":"'IBM Plex Mono',monospace"}, gameLaserG);
  spotterParts.label = t;
  t.textContent = "FRIENDLY SPOTTER";
})();
function tintSpotter(){
  if (!spotterParts.ring) return;
  var col = "var(--green)", label = spotterIconLabel(game.markSrc);
  if (game.spotterCompromised && game.spotterFate === "killed"){ col = "var(--red)"; label = "SPOTTER DOWN"; }
  else if (game.spotterCompromised && game.spotterFate === "fled"){ col = "var(--orange)"; label = "SPOTTER FLED"; }
  spotterParts.ring.setAttribute("stroke", col);
  spotterParts.figure.setAttribute("stroke", col);
  spotterParts.lens.setAttribute("fill", col);
  spotterParts.label.setAttribute("fill", col);
  spotterParts.label.textContent = label;
  spotterParts.cross.style.display = (game.spotterCompromised && game.spotterFate === "killed") ? "" : "none";
  gameLaserG.setAttribute("opacity", game.spotterCompromised && game.spotterFate === "killed" ? .8 : 1);
}
var gameLasedLine = el("line", {stroke:"var(--target2)", "stroke-width":1.6, "stroke-dasharray":"5 4", style:"display:none;pointer-events:none"}, gDyn);
var gameLasedG = el("g", {style:"display:none;pointer-events:none"}, gDyn);
(function buildLasedMarker(){
  /* the laser mark itself, like a designator mark in game: a SQUARE
     with a CENTRE DOT in it — not a circle or a crosshair. It only
     SHOWS TEMPORARILY (LASER_SHOW_MS in askSpotter): the lase is a
     momentary paint of the target, then it fades off the grid and
     the player asks again to re-lase. */
  el("rect", {"class":"laserring", x:-14, y:-14, width:28, height:28, fill:"none", stroke:"var(--target2)", "stroke-width":2.4}, gameLasedG);
  el("rect", {x:-8, y:-8, width:16, height:16, fill:"none", stroke:"var(--target2)", "stroke-width":1.2, opacity:.65}, gameLasedG);
  el("circle", {r:3.2, fill:"var(--target2)", stroke:"none"}, gameLasedG);
  var t = el("text", {y:-21, "text-anchor":"middle", "font-size":11, "font-weight":700, fill:"var(--target2)", "font-family":"'IBM Plex Mono',monospace"}, gameLasedG);
  t.textContent = "LASED POSITION";
})();
/* the lased square is TEMPORARY: it shows for LASER_SHOW_MS after
   Ask spotter, then this timer takes it off the grid again */
var LASER_SHOW_MS = 8000;   /* 8 seconds the lased square stays on the grid — ask again to re-lase */
var laserTimer = null;
function clearLaserTimer(){ if (laserTimer){ clearTimeout(laserTimer); laserTimer = null; } }
function showLasedTemporarily(){
  clearLaserTimer();
  game.laserShown = true;
  laserTimer = setTimeout(function(){
    laserTimer = null;
    game.laserShown = false;
    updateMarkerTransforms();
  }, LASER_SHOW_MS);
  updateMarkerTransforms();
}

/* CHECK ON MARK — the checker on the grid + the checked position.
   On a SQUAD MARK / PASSING SQUAD round there is no spotter to
   ask, so the player can REQUEST A CHECK ON THE MARK instead
   (see CHECK ON MARK below): a checker — commander UAV, an
   infantry squad on foot, or a vehicle driving in, rolled fresh
   per request — starts FAR AWAY on the grid and travels to the
   mark (game.check.curFrac, stepped by the check timer), drawn
   here as a friendly-green icon that changes with the kind: the
   drone badge for the UAV, the same friendly spotter figure as
   every ground spotter for the infantry squad, and a truck
   silhouette for the vehicle. A faint dashed line joins it to
   the mark while it travels. On arrival it reports the CHECKED
   target position: an amber diamond with a centre dot at the
   checked spot (CHECKED POSITION), with a dashed line back to
   the orange mark — shown only TEMPORARILY, like the lased
   square, then it fades. It is NOT the Skip reveal: the round
   stays live and the marker is amber / CHECKED, not green /
   TRUE POSITION. */
var gameCheckLine = el("line", {stroke:"var(--amber)", "stroke-width":1.4, "stroke-dasharray":"4 4", opacity:.55, style:"display:none;pointer-events:none"}, gDyn);
var gameCheckG = el("g", {style:"display:none;pointer-events:none"}, gDyn);
var checkParts = {};
(function buildCheckMarker(){
  var uav = el("g", {}, gameCheckG); checkParts.uav = uav;
  el("circle", {r:11, fill:"var(--inset)", stroke:"var(--green)", "stroke-width":1.8}, uav);
  var d = el("g", {stroke:"var(--green)", "stroke-width":1.6, "stroke-linecap":"round", fill:"none"}, uav);
  el("line", {x1:-5.5, y1:-5.5, x2:5.5, y2:5.5}, d);
  el("line", {x1:-5.5, y1:5.5, x2:5.5, y2:-5.5}, d);
  var rc = [[-5.5,-5.5],[5.5,-5.5],[-5.5,5.5],[5.5,5.5]];
  for (var i = 0; i < rc.length; i++) el("circle", {cx:rc[i][0], cy:rc[i][1], r:2.7}, d);
  el("circle", {r:2.3, fill:"var(--green)", stroke:"none"}, uav);
  var inf = el("g", {style:"display:none"}, gameCheckG); checkParts.infantry = inf;
  el("circle", {r:12, fill:"var(--inset)", stroke:"var(--green)", "stroke-width":1.8}, inf);
  var b = el("g", {stroke:"var(--green)", "stroke-width":1.5, fill:"none", "stroke-linecap":"round"}, inf);
  el("circle", {cx:0, cy:-3.6, r:3.4}, b);                 /* head */
  el("path", {d:"M -6.5 7.5 A 7 7 0 0 1 6.5 7.5"}, b);    /* shoulders */
  var lens = el("g", {fill:"var(--green)", stroke:"none"}, inf);
  el("circle", {cx:-2.5, cy:-3.8, r:1.6}, lens);           /* binocular lenses over the eyes — the same friendly spotter figure */
  el("circle", {cx:2.5, cy:-3.8, r:1.6}, lens);
  var veh = el("g", {style:"display:none"}, gameCheckG); checkParts.vehicle = veh;
  el("rect", {x:-13, y:-6.5, width:26, height:13, rx:2, fill:"var(--inset)", stroke:"var(--green)", "stroke-width":2}, veh);
  el("rect", {x:5.5, y:-6.5, width:7.5, height:13, fill:"var(--green)", opacity:.38}, veh);
  el("line", {x1:-10, y1:0, x2:4, y2:0, stroke:"var(--green)", "stroke-width":1, opacity:.65}, veh);
  var t = el("text", {x:16, y:4, "font-size":10.5, "font-weight":700, fill:"var(--green)", "font-family":"'IBM Plex Mono',monospace"}, gameCheckG);
  checkParts.label = t;
  t.textContent = "CHECKING MARK";
})();
function setCheckIcon(kindId){
  if (!checkParts.uav) return;
  checkParts.uav.style.display = kindId === "uav" ? "" : "none";
  checkParts.infantry.style.display = kindId === "infantry" ? "" : "none";
  checkParts.vehicle.style.display = kindId === "vehicle" ? "" : "none";
  checkParts.label.textContent = kindId === "uav" ? "UAV — CHECKING MARK"
    : kindId === "vehicle" ? "VEHICLE — CHECKING MARK" : "INFANTRY — CHECKING MARK";
}
var gameCheckedLine = el("line", {stroke:"var(--amber)", "stroke-width":1.6, "stroke-dasharray":"5 4", style:"display:none;pointer-events:none"}, gDyn);
var gameCheckedG = el("g", {style:"display:none;pointer-events:none"}, gDyn);
(function buildCheckedMarker(){
  /* the checked position itself: an amber DIAMOND with a centre
     dot — distinct from the cyan lased square and the green
     TRUE POSITION marker. It only SHOWS TEMPORARILY
     (CHECK_SHOW_MS in showCheckedTemporarily): the check is a
     report you act on, then it fades and the mark is yours. */
  el("polygon", {points:"0,-15 11,0 0,15 -11,0", fill:"none", stroke:"var(--amber)", "stroke-width":2.4}, gameCheckedG);
  el("polygon", {points:"0,-8.5 6,0 0,8.5 -6,0", fill:"none", stroke:"var(--amber)", "stroke-width":1.2, opacity:.65}, gameCheckedG);
  el("circle", {r:3.2, fill:"var(--amber)", stroke:"none"}, gameCheckedG);
  var t = el("text", {y:-22, "text-anchor":"middle", "font-size":11, "font-weight":700, fill:"var(--amber)", "font-family":"'IBM Plex Mono',monospace"}, gameCheckedG);
  t.textContent = "CHECKED POSITION";
})();
/* the checked diamond is TEMPORARY: it shows for CHECK_SHOW_MS
   after the checker arrives, then this timer takes it off again */
var CHECK_SHOW_MS = 10000;   /* 10 seconds the checked position stays on the grid */
var checkedTimer = null;
function clearCheckedTimer(){ if (checkedTimer){ clearTimeout(checkedTimer); checkedTimer = null; } }
function showCheckedTemporarily(){
  clearCheckedTimer();
  game.checkShown = true;
  checkedTimer = setTimeout(function(){
    checkedTimer = null;
    game.checkShown = false;
    updateMarkerTransforms();
  }, CHECK_SHOW_MS);
  updateMarkerTransforms();
}

/* shot effects layer (minigame): each shot's own group holds its
   shell and the dashed trail in the air that follows the shell
   (built in animateShot), the burst where the round lands, and an
   impact mark that lingers so the player can see where it fell */
var gFx = el("g", {style:"pointer-events:none"}, gDyn);
var fxLine  = el("line", {stroke:"#ffffff", "stroke-width":2, opacity:0}, gFx);
var fxShell = el("circle", {r:5, fill:"#ffffff", stroke:"var(--orange)", "stroke-width":2, opacity:0}, gFx);
var fxFlash = el("circle", {r:6, fill:"#ffb52e", opacity:0}, gFx);
var fxRing  = el("circle", {fill:"none", stroke:"var(--orange)", "stroke-width":3, opacity:0}, gFx);
var fxSmoke = [];
for (var fxi = 0; fxi < 4; fxi++)
  fxSmoke.push(el("circle", {r:5, fill:"#cbbfa5", opacity:0}, gFx));
var fxMark = el("g", {style:"display:none"}, gFx);
(function buildFxMark(){
  var m = el("g", {stroke:"#ffffff", "stroke-width":2.2, "stroke-linecap":"round"}, fxMark);
  el("line", {x1:-7, y1:-7, x2:7, y2:7}, m);
  el("line", {x1:-7, y1:7, x2:7, y2:-7}, m);
  el("circle", {r:11, fill:"none", stroke:"var(--orange)", "stroke-width":1.6}, fxMark);
})();
function hideFx(){
  fxLine.setAttribute("opacity", 0);
  fxShell.setAttribute("opacity", 0);
  fxFlash.setAttribute("opacity", 0);
  fxRing.setAttribute("opacity", 0);
  for (var i = 0; i < fxSmoke.length; i++) fxSmoke[i].setAttribute("opacity", 0);
  fxMark.style.display = "none";
  /* every in-flight shot owns its own effect group (class shotfx) so
     back-to-back shots can be in the air at once — clear them all */
  var groups = gFx.querySelectorAll(".shotfx");
  for (var j = 0; j < groups.length; j++) groups[j].parentNode.removeChild(groups[j]);
}

/* ================= MATH ================= */
function boardMeters(){ return 13 * GRID_M[currentMap[1]]; }
function posMeters(f){ var B = boardMeters(); return { x: f.x * B, y: f.y * B }; }

function fracToRef(f){
  var gx = Math.min(12, Math.floor(f.x * 13)), gy = Math.min(12, Math.floor(f.y * 13));
  var wx = f.x * 13 - gx, wy = f.y * 13 - gy;
  var kpC = Math.min(2, Math.floor(wx * 3)), kpR = Math.min(2, Math.floor(wy * 3));
  var sx = wx * 3 - kpC, sy = wy * 3 - kpR;
  var sC = Math.min(2, Math.floor(sx * 3)), sR = Math.min(2, Math.floor(sy * 3));
  var kp  = (2 - kpR) * 3 + kpC + 1;
  var sub = (2 - sR) * 3 + sC + 1;
  return {
    compact: String.fromCharCode(65 + gx) + (gy + 1) + "-" + kp + "-" + sub,
    long: String.fromCharCode(65 + gx) + (gy + 1) + " · keypad " + kp + " · sub " + sub
  };
}
/* PR mortar solution: high-arc projectile, v² = g · 1500 m (max range at 45°).
   Reproduces the in-game calculator: 330 m flat → 1487 mils. */
function elevation(R, dh){
  if (R <= 0) return null;
  var a = (GRAV * R * R) / (2 * GRAV * MAX_RANGE);   /* = R² / 3000 */
  var b = -R, c = dh + a;
  var disc = b * b - 4 * a * c;
  if (disc < 0) return null;
  var tan = (-b + Math.sqrt(disc)) / (2 * a);
  var deg = Math.atan(tan) * 180 / Math.PI;
  return { deg: deg, mils: deg * 6400 / 360 };
}
function fmt(n, d){ return n.toLocaleString("en-US", {minimumFractionDigits: d||0, maximumFractionDigits: d||0}); }

/* firing solution from one mortar position to the shared target */
function solution(mf, tf){
  var mp = posMeters(mf), tp = posMeters(tf || (mortars[1] && mf === mortars[1] ? targetFor(1) : target));
  var dx = tp.x - mp.x;                 /* + east */
  var dyS = tp.y - mp.y;                /* + south (screen down) */
  return { dx: dx, dyS: dyS,
           range: Math.sqrt(dx * dx + dyS * dyS),
           brg: (Math.atan2(dx, -dyS) * 180 / Math.PI + 360) % 360 };   /* 0 = north, clockwise */
}
/* Markers are scaled by 1/zoom, so they keep a constant on-screen size and
   never swallow the keypad / subkeypad being aimed at, however far in you zoom. */
function updateMarkerTransforms(){
  refreshMortarArrows();   /* the arrow on each mortar icon points at that mortar's compass facing */
  lockBadge1.set(locked.m1);
  lockBadge2.set(locked.m2);
  lockBadgeT.set(locked.target);
  lockBadgeT2.set(locked.target2);
  mortG.style.cursor = locked.m1 ? "default" : "grab";
  mort2G.style.cursor = locked.m2 ? "default" : "grab";
  tgtG.style.cursor = locked.target ? "default" : "grab";
  tgt2G.style.cursor = locked.target2 ? "default" : "grab";
  var k = 1 / view.s;
  layoutUavRing();   /* keep the UAV ring at its real ground radius at this zoom / map scale */
  var p1 = fracToPx(mortars[0]);
  mortG.setAttribute("transform", "translate(" + p1.x + "," + p1.y + ") scale(" + k + ")");
  if (mortars[1]){
    var p2 = fracToPx(mortars[1]);
    mort2G.setAttribute("transform", "translate(" + p2.x + "," + p2.y + ") scale(" + k + ")");
    mort2G.style.display = "";
  } else {
    mort2G.style.display = "none";
  }
  var pt = fracToPx(target);
  tgtG.setAttribute("transform", "translate(" + pt.x + "," + pt.y + ") scale(" + k + ")");
  if (target2){
    var pt2 = fracToPx(target2);
    tgt2G.setAttribute("transform", "translate(" + pt2.x + "," + pt2.y + ") scale(" + k + ")");
    tgt2G.style.display = "";
  } else tgt2G.style.display = "none";
  if (game.targetFrac){
    /* the orange diamond is drawn at the MARK position — the true
       target plus this round's mark error — clamped onto the board;
       defenders, vehicles and the emplacements sit at their true
       spots around game.targetFrac, so a rough mark can sit visibly
       off the position it refers to */
    var Bm0 = boardMeters();
    var mf = Bm0 > 0
      ? { x: Math.min(.995, Math.max(.005, game.targetFrac.x + (game.markDx || 0) / Bm0)),
          y: Math.min(.995, Math.max(.005, game.targetFrac.y + (game.markDy || 0) / Bm0)) }
      : game.targetFrac;
    var gp = fracToPx(mf);
    gameTgtG.setAttribute("transform", "translate(" + gp.x + "," + gp.y + ") scale(" + k + ")");
    /* commander UAV overhead: the ring + drone badge ride on the
       mark at the same spot while the UAV is up — any state but
       RTB; once it RTBs the ring is gone for the rest of the round */
    if (game.active && game.markSrc && game.markSrc.id === "uav" && game.uavState && game.uavState !== "rtb"){
      gameUavG.setAttribute("transform", "translate(" + gp.x + "," + gp.y + ") scale(" + k + ")");
      gameUavG.style.display = "";
    } else gameUavG.style.display = "none";
    /* ground spotter with an icon (laser / sniper / REGULAR
       INFANTRY — all three share the SAME friendly spotter
       figure, see buildSpotterBadge): he does NOT sit on the
       mark — his icon stands at his own ground position,
       game.spotterDx / spotterDy metres from the mark (distance
       rolled per source in rollMark), converted through THIS
       map's ground scale (Bm0), so the on-screen gap depends on
       the map. If his rolled spot would fall off the board, he
       takes the mirrored bearing instead; the faint dashed line
       joins him to the mark he is watching — until the enemy
       spots him: a killed spotter keeps his icon where he fell
       (red, crossed, SPOTTER DOWN) and a fled spotter's icon
       sits at the ground he ran to (orange, SPOTTER FLED), and
       the line is gone either way, because he is not watching
       the target any more. */
    if (game.active && hasSpotterIcon(game.markSrc)){
      tintSpotter();
      var sfx, sfy;
      if (Bm0 > 0){
        sfx = mf.x + (game.spotterDx || 0) / Bm0; sfy = mf.y + (game.spotterDy || 0) / Bm0;
        if (sfx < .012 || sfx > .988 || sfy < .012 || sfy > .988){ sfx = mf.x - (game.spotterDx || 0) / Bm0; sfy = mf.y - (game.spotterDy || 0) / Bm0; }
        sfx = Math.min(.988, Math.max(.012, sfx)); sfy = Math.min(.988, Math.max(.012, sfy));
      } else { sfx = mf.x + .06; sfy = mf.y - .06; }   /* no ground scale on this map: fixed small offset */
      var sp = fracToPx({x:sfx, y:sfy});
      gameLaserG.setAttribute("transform", "translate(" + sp.x + "," + sp.y + ") scale(" + k + ")");
      gameLaserG.style.display = "";
      if (!game.spotterCompromised){
        gameSpotterLine.setAttribute("x1", sp.x); gameSpotterLine.setAttribute("y1", sp.y);
        gameSpotterLine.setAttribute("x2", gp.x); gameSpotterLine.setAttribute("y2", gp.y);
        gameSpotterLine.setAttribute("stroke-width", 1.4 * k);
        gameSpotterLine.setAttribute("stroke-dasharray", (4 * k) + " " + (4 * k));
        gameSpotterLine.style.display = "";
      } else gameSpotterLine.style.display = "none";
    } else { gameLaserG.style.display = "none"; gameSpotterLine.style.display = "none"; }
    /* lased correction on the grid: after Ask spotter on a laser
       round, the accurate lased position (the true position) is
       drawn in cyan with a dashed line back to the orange mark.
       Hidden once Skip target reveals the true position itself. */
    if (game.laserShown && !game.revealed){
      var tpLaser = fracToPx(game.targetFrac);
      gameLasedG.setAttribute("transform", "translate(" + tpLaser.x + "," + tpLaser.y + ") scale(" + k + ")");
      gameLasedG.style.display = "";
      gameLasedLine.setAttribute("x1", gp.x); gameLasedLine.setAttribute("y1", gp.y);
      gameLasedLine.setAttribute("x2", tpLaser.x); gameLasedLine.setAttribute("y2", tpLaser.y);
      gameLasedLine.setAttribute("stroke-width", 1.6 * k);
      gameLasedLine.setAttribute("stroke-dasharray", (5 * k) + " " + (4 * k));
      gameLasedLine.style.display = "";
    } else {
      gameLasedG.style.display = "none";
      gameLasedLine.style.display = "none";
    }
    /* check on mark: the checker (UAV / infantry / vehicle) rides
       at its CURRENT ground position — far away when the request
       goes in, walking / driving / flying to the mark as the
       check timer steps game.check.curFrac — at constant
       on-screen size like the other markers, with a faint dashed
       line to the mark while it is still travelling. Once it has
       arrived it stays standing short of the mark for the rest
       of the round. */
    if (game.active && game.check && game.check.curFrac){
      var cpk = fracToPx(game.check.curFrac);
      gameCheckG.setAttribute("transform", "translate(" + cpk.x + "," + cpk.y + ") scale(" + k + ")");
      gameCheckG.style.display = "";
      if (game.check.phase === "travel"){
        gameCheckLine.setAttribute("x1", cpk.x); gameCheckLine.setAttribute("y1", cpk.y);
        gameCheckLine.setAttribute("x2", gp.x); gameCheckLine.setAttribute("y2", gp.y);
        gameCheckLine.setAttribute("stroke-width", 1.4 * k);
        gameCheckLine.setAttribute("stroke-dasharray", (4 * k) + " " + (4 * k));
        gameCheckLine.style.display = "";
      } else gameCheckLine.style.display = "none";
    } else { gameCheckG.style.display = "none"; gameCheckLine.style.display = "none"; }
    /* checked position: after the checker arrives, the checked
       spot is drawn in amber at the checked position (the true
       position rounded to the checker's precision) with a dashed
       line back to the orange mark. Hidden once Skip target
       reveals the true position itself. */
    if (game.checkShown && !game.revealed && game.checkedFrac){
      var cpChecked = fracToPx(game.checkedFrac);
      gameCheckedG.setAttribute("transform", "translate(" + cpChecked.x + "," + cpChecked.y + ") scale(" + k + ")");
      gameCheckedG.style.display = "";
      gameCheckedLine.setAttribute("x1", gp.x); gameCheckedLine.setAttribute("y1", gp.y);
      gameCheckedLine.setAttribute("x2", cpChecked.x); gameCheckedLine.setAttribute("y2", cpChecked.y);
      gameCheckedLine.setAttribute("stroke-width", 1.6 * k);
      gameCheckedLine.setAttribute("stroke-dasharray", (5 * k) + " " + (4 * k));
      gameCheckedLine.style.display = "";
    } else {
      gameCheckedG.style.display = "none";
      gameCheckedLine.style.display = "none";
    }
    /* Skip-target reveal: the green TRUE POSITION marker sits at the
       REAL target (no mark error) and the dashed line joins it back
       to the orange mark, so the mark error is visible at a glance */
    if (game.revealed){
      var tpTrue = fracToPx(game.targetFrac);
      gameTrueG.setAttribute("transform", "translate(" + tpTrue.x + "," + tpTrue.y + ") scale(" + k + ")");
      gameTrueG.style.display = "";
      gameTrueLine.setAttribute("x1", gp.x); gameTrueLine.setAttribute("y1", gp.y);
      gameTrueLine.setAttribute("x2", tpTrue.x); gameTrueLine.setAttribute("y2", tpTrue.y);
      gameTrueLine.setAttribute("stroke-width", 1.6 * k);
      gameTrueLine.setAttribute("stroke-dasharray", (5 * k) + " " + (4 * k));
      gameTrueLine.style.display = "";
    } else {
      gameTrueG.style.display = "none";
      gameTrueLine.style.display = "none";
    }
    /* defenders sit at their metre offsets around the target, each
       marker keeping constant on-screen size like the other markers;
       a man who is down stays on the map, faded, so the cleared
       squads can be read at a glance */
    if (game.defenders && game.defenders.length && boardMeters() > 0){
      gameDefG.style.display = "";
      var Bd = boardMeters();
      for (var di = 0; di < game.defenders.length; di++){
        var dd = game.defenders[di];
        if (!dd.el) continue;
        var dp = fracToPx({ x: game.targetFrac.x + dd.dx / Bd, y: game.targetFrac.y + dd.dy / Bd });
        dd.el.setAttribute("transform", "translate(" + dp.x + "," + dp.y + ") scale(" + k + ")");
        dd.el.setAttribute("opacity", dd.alive ? 1 : .25);
      }
    } else gameDefG.style.display = "none";
    /* parked vehicles likewise: metre offsets around the target,
       each marker at constant on-screen size, rotated to the way
       it is parked; a destroyed vehicle stays, faded */
    if (game.vehicles && game.vehicles.length && boardMeters() > 0){
      gameVehG.style.display = "";
      var Bv = boardMeters();
      for (var vi = 0; vi < game.vehicles.length; vi++){
        var vv = game.vehicles[vi];
        if (!vv.el) continue;
        var vp = fracToPx({ x: game.targetFrac.x + vv.dx / Bv, y: game.targetFrac.y + vv.dy / Bv });
        vv.el.setAttribute("transform", "translate(" + vp.x + "," + vp.y + ") scale(" + k + ") rotate(" + vv.rot + ")");
        vv.el.setAttribute("opacity", vv.alive ? 1 : .25);
      }
    } else gameVehG.style.display = "none";
    /* infantry target: the scattered dots sit at their metre
       offsets around the MARK, each at constant on-screen size —
       real ground scatter, so the squads spread wider the more
       you zoom instead of bunching around the diamond */
    if (game.infMen && game.infMen.length && boardMeters() > 0){
      gameInfG.style.display = "";
      var Bim = boardMeters();
      for (var im = 0; im < game.infMen.length; im++){
        var md = game.infMen[im];
        if (!md.el) continue;
        var mp2 = fracToPx({ x: mf.x + md.dx / Bim, y: mf.y + md.dy / Bim });
        md.el.setAttribute("transform", "translate(" + mp2.x + "," + mp2.y + ") scale(" + k + ")");
        md.el.setAttribute("opacity", md.alive ? 1 : .25);   /* a man who is down stays on the map, faded, like a defender */
      }
    } else gameInfG.style.display = "none";
    /* vehicle target: its 1–3 icons likewise, at their metre
       offsets around the mark, each rotated to its own angle */
    if (game.vehTgt && game.vehTgt.length && boardMeters() > 0){
      gameVehTgtG.style.display = "";
      var Bvt = boardMeters();
      for (var vt = 0; vt < game.vehTgt.length; vt++){
        var tv = game.vehTgt[vt];
        if (!tv.el) continue;
        var tp2 = fracToPx({ x: mf.x + tv.dx / Bvt, y: mf.y + tv.dy / Bvt });
        tv.el.setAttribute("transform", "translate(" + tp2.x + "," + tp2.y + ") scale(" + k + ") rotate(" + tv.rot + ")");
        tv.el.setAttribute("opacity", tv.alive ? 1 : .25);   /* a destroyed vehicle stays on the map, faded */
      }
    } else gameVehTgtG.style.display = "none";
    /* smoke mission, timed only: the friendly GREEN squad moves
       toward the smoke icon (the mark) as the clock runs down —
       each man's current offset is his start offset scaled by
       timeLeft / timeMax, so the squad starts 65–90 m short of
       the point and arrives exactly as the clock empties. An
       untimed smoke mission has no squad on the map at all. */
    if (game.smokeSquad && game.smokeSquad.length && boardMeters() > 0){
      gameSmokeSquadG.style.display = "";
      var Bsm = boardMeters();
      var smFactor = (game.smokeTimed && game.timeMax > 0)
        ? Math.max(0, Math.min(1, game.timeLeft / game.timeMax)) : 1;
      var smCx = 0, smCy = 0;
      for (var sm = 0; sm < game.smokeSquad.length; sm++){
        var sd = game.smokeSquad[sm];
        if (!sd.el) continue;
        smCx += sd.startDx; smCy += sd.startDy;
        var sp = fracToPx({ x: mf.x + sd.startDx * smFactor / Bsm, y: mf.y + sd.startDy * smFactor / Bsm });
        sd.el.setAttribute("transform", "translate(" + sp.x + "," + sp.y + ") scale(" + k + ")");
      }
      if (game.smokeSquadLabelEl && game.smokeSquad.length){
        var lp = fracToPx({ x: mf.x + (smCx / game.smokeSquad.length) * smFactor / Bsm,
                            y: mf.y + (smCy / game.smokeSquad.length) * smFactor / Bsm });
        game.smokeSquadLabelEl.setAttribute("transform", "translate(" + lp.x + "," + lp.y + ") scale(" + k + ")");
      }
    } else gameSmokeSquadG.style.display = "none";
    /* danger close: the FRIENDLY squads (green) hold at their
       spots around the position's true centre; their men fade
       one by one as their squad's HP bleeds away, so the card's
       HP can be read on the map too. The ENEMY squads (orange)
       sit at their squads' CURRENT centres — pressing in from
       their start rings toward the friendlies as dcElapsed
       grows — with their men jittered around the centre; a man
       who is down stays on the map, faded */
    if (game.dcFriendlies && game.dcFriendlies.length && boardMeters() > 0){
      gameDcFriendG.style.display = "";
      var Bdc = boardMeters();
      for (var dfi2 = 0; dfi2 < game.dcFriendlies.length; dfi2++){
        var fsq2 = game.dcFriendlies[dfi2];
        var downN = Math.floor((1 - Math.max(0, fsq2.hp) / fsq2.maxHp) * fsq2.men.length);
        for (var dfm = 0; dfm < fsq2.men.length; dfm++){
          var fmd = fsq2.men[dfm];
          if (!fmd.el) continue;
          var fpp = fracToPx({ x: game.targetFrac.x + (fsq2.cx + fmd.dx) / Bdc, y: game.targetFrac.y + (fsq2.cy + fmd.dy) / Bdc });
          fmd.el.setAttribute("transform", "translate(" + fpp.x + "," + fpp.y + ") scale(" + k + ")");
          fmd.el.setAttribute("opacity", dfm < downN ? .25 : 1);
        }
        if (fsq2.labelEl){
          var flp = fracToPx({ x: game.targetFrac.x + fsq2.cx / Bdc, y: game.targetFrac.y + fsq2.cy / Bdc });
          fsq2.labelEl.setAttribute("transform", "translate(" + flp.x + "," + flp.y + ") scale(" + k + ")");
        }
      }
    } else gameDcFriendG.style.display = "none";
    if (game.dcEnemySquads && game.dcEnemySquads.length && boardMeters() > 0){
      gameDcEnemyG.style.display = "";
      var Bde = boardMeters();
      for (var dei2 = 0; dei2 < game.dcEnemySquads.length; dei2++){
        var esq2 = game.dcEnemySquads[dei2];
        var ecen = dcSquadCentre(esq2);
        for (var dem = 0; dem < esq2.men.length; dem++){
          var emd2 = esq2.men[dem];
          if (!emd2.el) continue;
          var epp = fracToPx({ x: game.targetFrac.x + (ecen.x + emd2.dx) / Bde, y: game.targetFrac.y + (ecen.y + emd2.dy) / Bde });
          emd2.el.setAttribute("transform", "translate(" + epp.x + "," + epp.y + ") scale(" + k + ")");
          emd2.el.setAttribute("opacity", emd2.alive ? 1 : .25);
        }
      }
    } else gameDcEnemyG.style.display = "none";
    /* the emplacements near a FOB / Hideout each sit at their own
       metre offset from the position's true centre, at constant
       on-screen size; a destroyed one stays on the map faded */
    if (game.emplacements && game.emplacements.length && boardMeters() > 0){
      gameEmpG.style.display = "";
      var Be = boardMeters();
      for (var ei = 0; ei < game.emplacements.length; ei++){
        var ee = game.emplacements[ei];
        if (!ee.el) continue;
        var ep = fracToPx({ x: game.targetFrac.x + ee.dx / Be, y: game.targetFrac.y + ee.dy / Be });
        ee.el.setAttribute("transform", "translate(" + ep.x + "," + ep.y + ") scale(" + k + ")");
        ee.el.setAttribute("opacity", ee.hp > 0 ? 1 : .25);
      }
    } else gameEmpG.style.display = "none";
    /* hit rings stay HIDDEN — no visible hit radius, like in game */
    gameRingsG.style.display = "none";
  } else { gameRingsG.style.display = "none"; gameEmpG.style.display = "none"; gameTrueG.style.display = "none"; gameTrueLine.style.display = "none"; gameUavG.style.display = "none"; gameLaserG.style.display = "none"; gameSpotterLine.style.display = "none"; gameLasedG.style.display = "none"; gameLasedLine.style.display = "none"; gameCheckG.style.display = "none"; gameCheckLine.style.display = "none"; gameCheckedG.style.display = "none"; gameCheckedLine.style.display = "none"; gameInfG.style.display = "none"; gameVehTgtG.style.display = "none"; gameSmokeSquadG.style.display = "none"; gameDcFriendG.style.display = "none"; gameDcEnemyG.style.display = "none"; }
}
/* one-line summary of a mortar's solution, for the both-mortars box */
function dualText(idx){
  var s = solution(mortars[idx]);
  var head = "M" + (idx + 1) + " " + fracToRef(mortars[idx]).compact + " → " + fracToRef(targetFor(idx)).compact + " · ";
  if (s.range > MAX_RANGE) return head + "OUT OF RANGE · " + fmt(s.range) + " m";
  if (s.range < MIN_RANGE) return head + "TOO CLOSE · " + fmt(s.range) + " m";
  var e = elevation(s.range, parseFloat($("heightInput").value) || 0);
  return head + "enter " + fmt(Math.round(s.range / 10) * 10) + " · " +
         (e ? fmt(Math.round(e.mils)) + " mils" : "—") + " · " + fmt(s.brg) + "°";
}

/* ================= IN-GAME SIGHT — barrel elevation dial =================
   The gauge like the in-game BARREL ELEVATION sight, turned on its side
   on the LEFT of its panel: the hub sits at the right, the half-circle
   arc stands upright and bulges to the LEFT, its apex (the top of the
   scale) heading left, and the scale runs from the top of the arc down
   to the bottom. Like the real sight it does NOT show the whole
   800–1600 scale at once: only a moving window of 300 mils is drawn,
   centred on the current elevation under a fixed needle that points
   left from the hub to the middle of the arc. As the range (and so
   the elevation) moves, the window slides with it — at an elevation
   near 1550 mils the dial shows 1400 at its top end to 1700 at its
   bottom, at 1200 it shows 1050–1350, and so on. Because only 300 mils
   are spread over the full 272-unit radius, neighbouring 5-mil ticks
   sit ~10 units apart with a clear gap between them, not a solid band.
   The in-game tick ladder runs along the arc, per 100 mils between
   numbered majors: a small short line every 5 mils, a medium line at
   25 and 75, and the large long line at 50 (the centre line of the
   block); the numbered majors sit at every 100 with mil + degree
   numbers. The readouts beside the dial are the range and angle to
   set in the game. */
var DIAL = { cx: 302, cy: 302, rx: 238, ry: 272 };
var DIAL_WIN = 300;   /* mils visible at once, like the in-game sight */
var dialWin = { start: 1200 - DIAL_WIN / 2, end: 1200 + DIAL_WIN / 2 };
/* position of a mil value inside the window: 0 = top of the arc,
   0.5 = the left-hand apex, 1 = bottom of the arc */
function milToDialT(mils){ return (mils - dialWin.start) / DIAL_WIN; }
function dialPoint(t, scale){
  var phi = (0.5 - t) * Math.PI;
  return { x: DIAL.cx - DIAL.rx * scale * Math.cos(phi), y: DIAL.cy - DIAL.ry * scale * Math.sin(phi) };
}
function dialUnit(p){
  var dx = p.x - DIAL.cx, dy = p.y - DIAL.cy, d = Math.hypot(dx, dy) || 1;
  return { x: dx / d, y: dy / d };
}
(function buildDial(){
  var g = $("dialStatic");
  /* the half-disc face on its side: an ellipse far taller than it is
     wide, flat diameter down the right, arc bulging left like the
     in-game sight. The face itself is fixed; only the tick window
     drawn over it (drawDialTicks) slides. */
  var p0 = dialPoint(0, 1), p1 = dialPoint(1, 1);
  el("path", {d: "M" + p0.x + " " + p0.y + " A" + DIAL.rx + " " + DIAL.ry + " 0 0 0 " + p1.x + " " + p1.y + " Z",
    fill: "var(--inset)", stroke: "var(--line)", "stroke-width": 1.5}, g);
  var pi0 = dialPoint(0, .74), pi1 = dialPoint(1, .74);
  el("path", {d: "M" + pi0.x + " " + pi0.y + " A" + (DIAL.rx * .74) + " " + (DIAL.ry * .74) + " 0 0 0 " + pi1.x + " " + pi1.y,
    fill: "none", stroke: "var(--line-soft)", "stroke-width": 1}, g);
})();
/* Draw ONLY the current 300-mil window of ticks, centred on centerMils.
   Ticks sit on absolute mil values (multiples of 5), so as the centre
   moves the whole ladder slides smoothly across the arc — rotating
   under the fixed centre needle, exactly like the in-game sight.
   The loop must step by 5 — stepping by 20 skips the 25/50/75 marks
   entirely, which is why the medium and large lines never appeared. */
function drawDialTicks(centerMils){
  dialWin.start = centerMils - DIAL_WIN / 2;
  dialWin.end = centerMils + DIAL_WIN / 2;
  var g = $("dialTicks");
  while (g.firstChild) g.removeChild(g.firstChild);
  g.style.display = "";
  var first = Math.ceil(dialWin.start / 5) * 5;
  for (var mils = first; mils <= dialWin.end; mils += 5){
    var dg = milToDialT(mils);
    var kind = mils % 100 === 0 ? 3
             : (mils % 50 === 0 ? 2
             : (mils % 25 === 0 ? 1 : 0));
    var len = [10, 20, 34, 26][kind];
    var b = dialPoint(dg, 1), u = dialUnit(b);
    var a = { x: b.x - u.x * len, y: b.y - u.y * len };
    el("line", {x1: a.x, y1: a.y, x2: b.x, y2: b.y,
      stroke: "var(--board-label)",
      "stroke-width": [1.2, 2, 3.4, 2.6][kind]}, g);
    if (kind >= 3){
      var lp = { x: b.x + u.x * 17, y: b.y + u.y * 17 };
      var t = el("text", {x: lp.x, y: lp.y + 4, "text-anchor": "middle", "font-size": 12, "class": "dialtick"}, g);
      t.textContent = fmt(mils);
      var dp = dialPoint(dg, .80);
      var dt = el("text", {x: dp.x, y: dp.y + 3, "text-anchor": "middle", "font-size": 10, "class": "dialtick", opacity: .8}, g);
      dt.textContent = Math.round(mils * 360 / 6400) + "°";
    }
  }
  var wt = $("dialWindowTxt");
  if (wt) wt.textContent = "BARREL ELEVATION · SHOWING " + fmt(Math.round(dialWin.start)) + " — " + fmt(Math.round(dialWin.end)) + " MILS";
}
function updateGamePanel(){
  updateCompass();   /* the Mini Game's compass strip follows the selected mortar, its facing and its target line */
  var ai = activeMortar();
  var col = ai === 1 ? "var(--mortar2)" : "var(--mortar)";
  var who = $("gameWho");
  who.textContent = (mortars[1] ? "MORTAR " + (ai + 1) : "MORTAR") + (ai === 1 ? " → TARGET 2" : " → TARGET");
  who.style.color = col;
  var needle = $("dialNeedle"), tip = $("dialTip"), atxt = $("dialAngleTxt");
  function noSolution(note){
    needle.style.display = "none"; tip.style.display = "none";
    var tk = $("dialTicks"); if (tk) tk.style.display = "none";
    var wt = $("dialWindowTxt"); if (wt) wt.textContent = "BARREL ELEVATION";
    atxt.textContent = "—"; atxt.style.fill = "";
    $("gameRange").textContent = "—"; $("gameAngle").textContent = "—";
    $("gameRangeSub").textContent = "steps of 10 — last 0 is fixed";
    $("gameAngleSub").textContent = "set with W / S";
    $("gameNote").textContent = note;
  }
  if (currentMap[1] === 0){
    $("gameBrg").textContent = "—";
    noSolution("This map has no grid scale, so there is no in-game solution to set.");
    return;
  }
  var s = solution(mortars[ai]);
  $("gameBrg").textContent = fmt(s.brg) + "° · " + fmt(s.brg * 6400 / 360) + " mils";
  if (s.range > MAX_RANGE){
    noSolution("Out of range — " + fmt(s.range) + " m. Move the mortar closer; there is no angle to set.");
    return;
  }
  var dh = parseFloat($("heightInput").value) || 0;
  var e = elevation(s.range, dh);
  if (!e){
    noSolution("No firing solution at this height difference.");
    return;
  }
  var enter = Math.round(s.range / 10) * 10, milsR = Math.round(e.mils);
  $("gameRange").textContent = fmt(enter);
  $("gameRangeSub").textContent = "exact " + fmt(s.range) + " m — enter " + fmt(enter);
  $("gameAngle").textContent = fmt(milsR);
  $("gameAngleSub").textContent = e.deg.toFixed(1) + "° · set with W / S";
  /* slide the 300-mil window so this elevation sits at the centre of
     the arc, then the fixed needle — hub out to the left-hand apex
     tick — reads it there, the way the index reads on the in-game sight */
  drawDialTicks(e.mils);
  var outerP = dialPoint(milToDialT(e.mils), 1), ou = dialUnit(outerP);
  var tipP = { x: outerP.x - ou.x * 10, y: outerP.y - ou.y * 10 };
  needle.setAttribute("x2", tipP.x); needle.setAttribute("y2", tipP.y);
  needle.setAttribute("stroke", col); needle.style.display = "";
  tip.setAttribute("cx", tipP.x); tip.setAttribute("cy", tipP.y);
  tip.setAttribute("fill", col); tip.style.display = "";
  atxt.textContent = fmt(milsR) + " mils"; atxt.style.fill = col;
  $("gameNote").textContent = s.range < MIN_RANGE
    ? "Below the 80 m minimum range — the angle is shown, but the mortar cannot fire this close."
    : "Enter this range in the in-game calculator and dial the barrel to this angle on the dial.";
}
/* ================= COMPASS STRIP — MINI GAME ONLY, UNDER ITS TRAINING DIAL =================
   The compass line-up lives ONLY in the Mini Game — there is no
   compass strip in the Firing solution panel. Like the compass tape at the bottom of the in-game screen: a
   sliding strip of degree numbers and cardinal marks (105, 120,
   SE, 150, 165, S …). The strip shows a 90° window centred on the
   selected mortar's FACING — the direction the arrow on its icon
   on the grid is pointing. At the top centre sits a small HOLLOW
   triangle, fixed: that is the mortar's current heading mark.
   Riding the strip is a SOLID triangle at the bearing of the
   TARGET LINE (mortar → its own target mark). Turning the mortar
   with A (left) / D (right) slides the strip and rotates the
   icon's arrow together; when the solid triangle lines up
   exactly under the small hollow triangle, the mortar's arrow
   points straight down the target line. Each mortar keeps its
   OWN facing, like its own dial — turning one never turns the
   other. Facings are whole degrees and the target line is read
   to the nearest degree, so an exact line-up is reachable. */
var COMPASS_WIN = 90;   /* degrees of compass tape visible on the strip at once */
var CARDINALS = { 0:"N", 45:"NE", 90:"E", 135:"SE", 180:"S", 225:"SW", 270:"W", 315:"NW" };
function deg3(n){ return ("00" + ((Math.round(n) % 360 + 360) % 360)).slice(-3); }
function brgDiff(from, to){ return ((to - from + 540) % 360) - 180; }   /* signed shortest turn, + = turn right (D) */
function drawCompassTapeInto(g, facing){
  if (!g) return;
  while (g.firstChild) g.removeChild(g.firstChild);
  var pxPerDeg = 300 / COMPASS_WIN;
  var first = Math.floor((facing - COMPASS_WIN / 2 - 10) / 5) * 5;
  for (var d = first; d <= facing + COMPASS_WIN / 2 + 10; d += 5){
    var abs = ((d % 360) + 360) % 360;
    var x = 150 + (d - facing) * pxPerDeg;
    if (x < -24 || x > 324) continue;
    var major = abs % 15 === 0;
    el("line", {x1:x, y1:64, x2:x, y2: major ? 50 : 57, stroke:"var(--on-inset-dim)", "stroke-width": major ? 1.6 : 1}, g);
    if (major){
      var card = CARDINALS[abs];
      var t = el("text", {x:x, y:45, "text-anchor":"middle",
        "font-size": card ? 14 : 11.5, "font-weight":700,
        fill: card ? "var(--on-inset)" : "var(--on-inset-dim)",
        "font-family":"'IBM Plex Mono',monospace"}, g);
      t.textContent = card ? card : abs;
    }
  }
}
/* the one compass tape — the Mini Game strip's — drawn from the
   selected mortar's facing every time it changes */
function drawCompassTape(facing){
  drawCompassTapeInto($("gameCompassTape"), facing);
}
function refreshMortarArrows(){
  var defs = [[mortarArrow1, 0], [mortarArrow2, 1]];
  for (var i = 0; i < defs.length; i++){
    var a = defs[i][0], idx = defs[i][1];
    if (!a || !mortars[idx]) continue;
    a.g.setAttribute("transform", "rotate(" + mortarFacing[idx] + ")");
    var lined = false;
    if (currentMap[1] !== 0){
      var tBrg = Math.round(solution(mortars[idx]).brg) % 360;
      lined = Math.abs(brgDiff(mortarFacing[idx], tBrg)) < 0.5;
    }
    a.head.setAttribute("fill", lined ? "var(--green)" : a.color);
  }
}
/* paint the Mini Game's compass strip from the selected mortar's
   facing and its own target line — one facing per mortar, one
   target line per mortar */
function paintCompassStrip(o, ai, facing){
  if (!o.who) return;
  var col = ai === 1 ? "var(--mortar2)" : "var(--mortar)";
  o.who.textContent = (mortars[1] ? "MORTAR " + (ai + 1) : "MORTAR") + (ai === 1 ? " → TARGET 2" : " → TARGET");
  o.who.style.color = col;
  o.facingEl.textContent = deg3(facing) + "° · " + fmt(Math.round(facing * 6400 / 360)) + " mils";
  drawCompassTapeInto(o.tape, facing);
  if (currentMap[1] === 0){
    o.tri.style.display = "none";
    o.targetEl.textContent = "—";
    o.status.textContent = "No grid scale on this map — no target line to line up on";
    o.status.classList.remove("on");
    return;
  }
  o.tri.style.display = "";
  var tBrg = Math.round(solution(mortars[ai]).brg) % 360;
  o.targetEl.textContent = deg3(tBrg) + "° · " + fmt(Math.round(tBrg * 6400 / 360)) + " mils";
  var rel = brgDiff(facing, tBrg);
  var pxPerDeg = 300 / COMPASS_WIN;
  var x = 150 + Math.max(-142, Math.min(142, rel * pxPerDeg));
  o.tri.setAttribute("transform", "translate(" + x + ",0)");
  var lined = Math.abs(rel) < 0.5;
  o.path.setAttribute("fill", lined ? "var(--green)" : "var(--target)");
  o.hollow.setAttribute("stroke", lined ? "var(--green)" : "var(--ink)");
  o.status.classList.toggle("on", lined);
  o.status.textContent = lined
    ? "✓ STRAIGHT ON TARGET LINE — the mortar's arrow points at the target"
    : "Off by " + Math.abs(rel) + "° — turn " + (rel > 0 ? "D ▶ right" : "◀ A left") + " until the solid triangle lines up under the small triangle";
}
function updateCompass(){
  if (!$("gameCompassWho")) return;
  var ai = activeMortar();
  var facing = mortarFacing[ai];
  /* the ONLY compass strip is the Mini Game's, under its training
     dial: the mortar on the game's DIAL tabs, its facing, and the
     line to its own target mark */
  paintCompassStrip({ who: $("gameCompassWho"), facingEl: $("gameCompassFacing"), tape: $("gameCompassTape"),
    tri: $("gameCompassSolidTri"), path: $("gameCompassSolidPath"), hollow: $("gameCompassHollowTri"),
    targetEl: $("gameCompassTargetBrg"), status: $("gameCompassStatus") }, ai, facing);
  refreshMortarArrows();
}
function setFacing(idx, deg){
  mortarFacing[idx] = ((Math.round(deg) % 360) + 360) % 360;
  if (idx === activeMortar()) updateCompass(); else refreshMortarArrows();
}
function turnCompass(delta){
  var ai = activeMortar();
  setFacing(ai, mortarFacing[ai] + delta);
}
/* A / D on the keyboard, like in game: A turns the mortar left,
   D turns it right — but ONLY while the Mini Game is open, since
   the compass line-up lives only there. Ignored while typing in
   a field. Held-key auto-repeat is welcome: it keeps turning.
   Shift = ±10° steps. */
document.addEventListener("keydown", function(evt){
  if (!game.active) return;
  if (evt.ctrlKey || evt.metaKey || evt.altKey) return;
  var tag = document.activeElement && document.activeElement.tagName;
  if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return;
  var step = evt.shiftKey ? 10 : 1;
  if (evt.key === "a" || evt.key === "A"){ turnCompass(-step); evt.preventDefault(); }
  else if (evt.key === "d" || evt.key === "D"){ turnCompass(step); evt.preventDefault(); }
});
/* on-screen A / D buttons for mouse / touch: tap = one step,
   press-and-hold keeps turning like holding the key */
function bindCompassHold(btn, delta){
  var t1 = null, t2 = null;
  function clearTimers(){
    if (t1) clearTimeout(t1);
    if (t2) clearInterval(t2);
    t1 = t2 = null;
    btn.classList.remove("held");
  }
  btn.addEventListener("pointerdown", function(evt){
    evt.preventDefault();
    btn.classList.add("held");
    turnCompass(delta);
    t1 = setTimeout(function(){ t2 = setInterval(function(){ turnCompass(delta); }, 30); }, 380);
  });
  btn.addEventListener("pointerup", clearTimers);
  btn.addEventListener("pointerleave", clearTimers);
  btn.addEventListener("pointercancel", clearTimers);
  btn.addEventListener("click", function(evt){ evt.preventDefault(); });   /* the pointerdown already stepped */
}
/* the Mini Game strip's own A / D buttons: hold-to-turn, turning
   the mortar on the game's DIAL tabs (the Firing solution panel
   has no A / D buttons any more — its compass is gone) */
var gameAdL = $("gameAdLeftBtn"), gameAdR = $("gameAdRightBtn");
if (gameAdL) bindCompassHold(gameAdL, -1);
if (gameAdR) bindCompassHold(gameAdR, 1);

/* ================= RENDER ================= */
function render(){
  setMapImage();
  /* 0 km novelty maps: the gallery gives them no grid scale, so there is
     nothing honest to calculate — say so instead of inventing a scale. */
  if (currentMap[1] === 0){
    $("chipSize").textContent = "0 km";
    $("chipGrid").textContent = "—"; $("chipKp").textContent = "—"; $("chipSub").textContent = "—";
    $("sqScale").textContent = "no grid scale";
    var ai0 = activeMortar();
    var mP0 = fracToPx(mortars[ai0]), tP0 = fracToPx(targetFor(ai0)), t2P0 = fracToPx(targetFor(1 - ai0));
    updateMarkerTransforms();
    fireLine.setAttribute("x1", mP0.x); fireLine.setAttribute("y1", mP0.y);
    fireLine.setAttribute("x2", tP0.x); fireLine.setAttribute("y2", tP0.y);
    fireLine.setAttribute("stroke", "var(--amber)");
    fireLine.removeAttribute("stroke-dasharray");
    if (mortars[1]){
      var mP0b = fracToPx(mortars[1]);
      fireLine2.setAttribute("x1", mP0b.x); fireLine2.setAttribute("y1", mP0b.y);
      fireLine2.setAttribute("x2", t2P0.x); fireLine2.setAttribute("y2", t2P0.y);
      fireLine2.setAttribute("stroke", "var(--mortar2)");
      fireLine2.style.display = "";
    } else fireLine2.style.display = "none";
    rangeRing.setAttribute("r", 0); minRing.setAttribute("r", 0);
    var mR0 = fracToRef(mortars[0]), tR0 = fracToRef(target);
    $("mortarLab").textContent = mortars[1] ? "MORTAR 1" : "MORTAR";
    $("mortarRef").textContent = mR0.long; $("targetRef").textContent = tR0.long;
    if (mortars[1]) $("mortar2Ref").textContent = fracToRef(mortars[1]).long;
    if (mortars[1] && target2) $("target2Ref").textContent = fracToRef(target2).long;
    if (document.activeElement !== $("mortarInput")) $("mortarInput").value = mR0.compact;
    if (mortars[1] && document.activeElement !== $("mortar2Input")) $("mortar2Input").value = fracToRef(mortars[1]).compact;
    if (document.activeElement !== $("targetInput")) $("targetInput").value = tR0.compact;
    if (mortars[1] && target2 && document.activeElement !== $("target2Input")) $("target2Input").value = fracToRef(target2).compact;
    $("dual1").textContent = "—"; $("dual2").textContent = "—";
    var st0 = $("statusBox");
    st0.textContent = "NO GRID SCALE — no mortar solution for this map";
    st0.className = "status close"; $("elevBox").className = "lcd";
    $("elevMils").textContent = "—"; $("elevDeg").textContent = "Deagle5 / Shipment are 0 km novelty maps with no grid scale";
    $("rangeExact").textContent = "—"; $("rangeDelta").textContent = "—";
    $("rangeEnter").textContent = "—";
    $("brgDeg").textContent = "—"; $("brgMils").textContent = "—";
    $("sqDist").textContent = "—";
    $("dEW").textContent = "—"; $("dNS").textContent = "—";
    var rows0 = "";
    for (var r0 = 100; r0 <= 1500; r0 += 100){
      var e0b = elevation(r0, 0);
      rows0 += "<tr><td>" + fmt(r0) + " m</td><td>" + fmt(r0) + "</td><td>" + fmt(Math.round(e0b.mils)) + "</td></tr>";
    }
    $("rtBody").innerHTML = rows0;
    updateGamePanel();
    return;
  }
  var gm = GRID_M[currentMap[1]], B = boardMeters();
  var ai = activeMortar();
  var sol = solution(mortars[ai]);
  var dx = sol.dx, dyS = sol.dyS, range = sol.range;
  var dh = parseFloat($("heightInput").value) || 0;
  var who = mortars[1] ? " — MORTAR " + (ai + 1) : "";

  /* chips + scale labels */
  $("chipSize").textContent = currentMap[1] + " km";
  $("chipGrid").textContent = gm + " m";
  $("chipKp").textContent = fmt(gm / 3, gm % 3 ? 1 : 0) + " m";
  $("chipSub").textContent = fmt(gm / 9, 1) + " m";
  $("sqScale").textContent = "1 square = " + gm + " m";

  /* board dynamics */
  var mPx = fracToPx(mortars[ai]), tPx = fracToPx(targetFor(ai));
  var pxPerM = PLOT / B;
  rangeRing.setAttribute("cx", mPx.x); rangeRing.setAttribute("cy", mPx.y);
  rangeRing.setAttribute("r", MAX_RANGE * pxPerM);
  minRing.setAttribute("cx", mPx.x); minRing.setAttribute("cy", mPx.y);
  minRing.setAttribute("r", Math.max(3, MIN_RANGE * pxPerM));
  fireLine.setAttribute("x1", mPx.x); fireLine.setAttribute("y1", mPx.y);
  fireLine.setAttribute("x2", tPx.x); fireLine.setAttribute("y2", tPx.y);
  if (mortars[1]){
    var oPx = fracToPx(mortars[1 - ai]), oTPx = fracToPx(targetFor(1 - ai));
    fireLine2.setAttribute("x1", oPx.x); fireLine2.setAttribute("y1", oPx.y);
    fireLine2.setAttribute("x2", oTPx.x); fireLine2.setAttribute("y2", oTPx.y);
    var oOut = solution(mortars[1 - ai]).range > MAX_RANGE;
    fireLine2.setAttribute("stroke", oOut ? "var(--red)" : "var(--mortar2)");
    if (oOut) fireLine2.setAttribute("stroke-dasharray", (6 / view.s) + " " + (5 / view.s));
    else fireLine2.removeAttribute("stroke-dasharray");
    fireLine2.style.display = "";
  } else fireLine2.style.display = "none";
  updateMarkerTransforms();
  /* while the game is live, keep its range hint measured from the
     RED TARGET mark as placed — this covers red-mark taps/drags,
     typed refs, Swap, mortar drags and map/scale changes, since
     every one of them funnels through render() */
  if (game.active) refreshGameHintFromMark();

  var out = range > MAX_RANGE, tooClose = range < MIN_RANGE;
  rangeRing.setAttribute("stroke", out ? "var(--red)" : "var(--amber)");
  fireLine.setAttribute("stroke", out ? "var(--red)" : "var(--amber)");

  /* refs */
  var mRef = fracToRef(mortars[0]), tRef = fracToRef(target);
  $("mortarLab").textContent = mortars[1] ? "MORTAR 1" : "MORTAR";
  $("mortarRef").textContent = mRef.long;
  $("targetRef").textContent = tRef.long;
  if (mortars[1]) $("mortar2Ref").textContent = fracToRef(mortars[1]).long;
  if (mortars[1] && target2) $("target2Ref").textContent = fracToRef(target2).long;
  if (document.activeElement !== $("mortarInput")) $("mortarInput").value = mRef.compact;
  if (mortars[1] && document.activeElement !== $("mortar2Input")) $("mortar2Input").value = fracToRef(mortars[1]).compact;
  if (document.activeElement !== $("targetInput")) $("targetInput").value = tRef.compact;
  if (mortars[1] && target2 && document.activeElement !== $("target2Input")) $("target2Input").value = fracToRef(target2).compact;

  /* deltas */
  $("dEW").textContent = fmt(Math.abs(dx)) + " m " + (dx >= 0 ? "E" : "W");
  $("dNS").textContent = fmt(Math.abs(dyS)) + " m " + (dyS <= 0 ? "N" : "S");
  $("rangeDelta").textContent = "Δ " + fmt(Math.abs(dx)) + (dx >= 0 ? " E" : " W") + " · " + fmt(Math.abs(dyS)) + (dyS <= 0 ? " N" : " S");
  $("sqDist").textContent = (range / gm).toFixed(2) + " squares";

  /* bearing: 0 = north, clockwise */
  var brg = sol.brg;
  $("brgDeg").textContent = fmt(brg);
  $("brgMils").textContent = fmt(brg * 6400 / 360);

  /* range + status + elevation */
  var st = $("statusBox"), lcd = $("elevBox");
  $("rangeExact").textContent = fmt(range);
  if (out){
    st.textContent = "✕ OUT OF RANGE — " + fmt(range) + " m (max 1,500 m)" + who;
    st.className = "status out"; lcd.className = "lcd out";
    $("rangeEnter").textContent = "—";
    $("elevMils").textContent = "—"; $("elevDeg").textContent = "no solution — move the mortar closer";
    fireLine.setAttribute("stroke-dasharray", (6 / view.s) + " " + (5 / view.s));
  } else if (tooClose){
    st.textContent = "⚠ TOO CLOSE — below 80 m minimum" + who;
    st.className = "status close"; lcd.className = "lcd";
    $("rangeEnter").textContent = fmt(Math.round(range / 10) * 10);
    var e0 = elevation(range, dh);
    $("elevMils").textContent = e0 ? fmt(Math.round(e0.mils)) : "—";
    $("elevDeg").textContent = e0 ? e0.deg.toFixed(1) + "°" : "—";
    fireLine.removeAttribute("stroke-dasharray");
  } else {
    st.textContent = "● IN RANGE" + who;
    st.className = "status"; lcd.className = "lcd";
    $("rangeEnter").textContent = fmt(Math.round(range / 10) * 10);
    var e1 = elevation(range, dh);
    $("elevMils").textContent = e1 ? fmt(Math.round(e1.mils)) : "—";
    $("elevDeg").textContent = e1 ? e1.deg.toFixed(1) + "°" : "—";
    fireLine.removeAttribute("stroke-dasharray");
  }

  /* range table (flat, height 0) with current entered range highlighted */
  var enter = Math.round(range / 10) * 10, rows = "";
  for (var r = 100; r <= 1500; r += 100){
    var e = elevation(r, 0);
    rows += "<tr" + (Math.abs(enter - r) < 50 && !out ? " class=\"hl\"" : "") + "><td>" + fmt(r) + " m</td><td>" + fmt(r) + "</td><td>" + fmt(Math.round(e.mils)) + "</td></tr>";
  }
  $("rtBody").innerHTML = rows;

  /* both-mortars summary */
  if (mortars[1]){
    $("dual1").textContent = dualText(0);
    $("dual1").style.color = "var(--mortar)";
    $("dual2").textContent = dualText(1);
    $("dual2").style.color = "var(--mortar2)";
  }
  updateGamePanel();
}

/* ================= MAP SELECT ================= */
(function buildSelect(){
  var sel = $("mapSelect"), sizes = [2, 4, 8];
  sizes.forEach(function(sz){
    var og = document.createElement("optgroup");
    og.label = sz + " km maps — " + GRID_M[sz] + " m per grid square";
    MAPS.filter(function(m){ return m[1] === sz; }).forEach(function(m){
      var o = document.createElement("option");
      o.value = m[0]; o.textContent = m[0] + " (" + sz + " km)";
      if (m[0] === "Kokan") o.selected = true;
      og.appendChild(o);
    });
    sel.appendChild(og);
  });
  sel.addEventListener("change", function(){
    currentMap = MAPS.filter(function(m){ return m[0] === sel.value; })[0];
    render();
  });
})();

/* ================= MODE + BOARD INTERACTION ================= */
function setMode(m){
  mode = m;
  $("modeMortar").classList.toggle("active", m === "m1");
  $("modeMortar2").classList.toggle("active", m === "m2");
  $("modeTarget").classList.toggle("active", m === "target");
  $("modeTarget2").classList.toggle("active", m === "target2");
  $("modeMortar").setAttribute("aria-pressed", m === "m1");
  $("modeMortar2").setAttribute("aria-pressed", m === "m2");
  $("modeTarget").setAttribute("aria-pressed", m === "target");
  $("modeTarget2").setAttribute("aria-pressed", m === "target2");
  render();   /* the readout follows the selected mortar */
  updateAmmoUI();   /* the ammo box shows the newly selected mortar's own magazines */
  if (typeof refreshGameControls === "function") refreshGameControls();   /* the spotter button now corrects THIS mortar, from its own fall of shot */
  if (typeof updateTrainDial === "function") updateTrainDial();   /* the training dial now shows THIS mortar's own angle */
}
$("modeMortar").addEventListener("click", function(){ setMode("m1"); });
$("modeMortar2").addEventListener("click", function(){ setMode("m2"); });
$("modeTarget").addEventListener("click", function(){ setMode("target"); });
$("modeTarget2").addEventListener("click", function(){ setMode("target2"); });
function syncMortar2UI(){
  var has = !!mortars[1];
  var _tb = document.querySelector("#controlsPanel .toolbar"); if (_tb) _tb.classList.toggle("has-m2", has);   /* two-mortar state: the place-mode segment wraps 2 x 2 on its own row so its buttons never overlap the other controls */
  $("modeMortar2").style.display = has ? "" : "none";
  $("modeTarget2").style.display = has ? "" : "none";
  $("lockM2Btn").style.display = has ? "" : "none";
  $("lockTgt2Btn").style.display = has ? "" : "none";
  $("rowMortar2").style.display = has ? "" : "none";
  $("rowTarget2").style.display = has ? "" : "none";
  $("fieldMortar2").style.display = has ? "" : "none";
  $("fieldTarget2").style.display = has ? "" : "none";
  $("dualBox").style.display = has ? "" : "none";
  $("addMortarBtn").textContent = has ? "➖ Remove Mortar 2" : "➕ Add Mortar";
  var dm2 = $("dialM2Btn"); if (dm2) dm2.style.display = has ? "" : "none";
  var fb2s = $("gameFire2Btn"); if (fb2s) fb2s.style.display = has ? "" : "none";
  var rc2s = $("reloadCol2"); if (rc2s) rc2s.style.display = has ? "" : "none";
  if (!has) cancelReloadFor(1);   /* removing Mortar 2 stops its own reload; Mortar 1's keeps running */
  updateAmmoUI();   /* FIRE labels + ammo list follow how many mortars are placed */
  if (typeof updateTrainDial === "function") updateTrainDial();   /* dial tabs follow Mortar 2 too */
}
/* lock toggles: while locked, board taps/drags can't move that marker
   (placeAt refuses); typed refs and Swap still apply — they're deliberate */
function syncLockBtns(){
  var defs = [["lockM1Btn", "m1", "mortar"], ["lockM2Btn", "m2", "mortar 2"], ["lockTgtBtn", "target", "target"], ["lockTgt2Btn", "target2", "target 2"]];
  defs.forEach(function(d){
    var b = $(d[0]);
    b.classList.toggle("locked", locked[d[1]]);
    b.setAttribute("aria-pressed", locked[d[1]] ? "true" : "false");
    b.textContent = (locked[d[1]] ? "🔓 Unlock " : "🔒 Lock ") + d[2];
  });
}
[["lockM1Btn", "m1"], ["lockM2Btn", "m2"], ["lockTgtBtn", "target"], ["lockTgt2Btn", "target2"]].forEach(function(d){
  $(d[0]).addEventListener("click", function(){
    locked[d[1]] = !locked[d[1]];
    syncLockBtns();
    render();
  });
});
syncLockBtns();
$("addMortarBtn").addEventListener("click", function(){
  if (mortars[1]){
    mortars.length = 1;
    target2 = null;   /* removing Mortar 2 removes its own target mark too */
    if (mode === "m2" || mode === "target2") mode = "m1";
  } else {
    /* second mortar starts one grid square east of the first, and
       gets its OWN target mark one grid square east of TARGET —
       separate from Mortar 1's mark from the moment it appears */
    mortars.push({ x: Math.min(0.985, mortars[0].x + 1 / 13), y: mortars[0].y });
    target2 = { x: Math.min(0.985, target.x + 1 / 13), y: target.y };
    mode = "m2";
  }
  syncMortar2UI();
  setMode(mode);
});
$("swapBtn").addEventListener("click", function(){
  var ai = activeMortar();
  /* Swap exchanges the selected mortar with ITS OWN target mark */
  if (ai === 1 && target2){ var ts = mortars[1]; mortars[1] = target2; target2 = ts; }
  else { var t = mortars[ai]; mortars[ai] = target; target = t; }
  render();
});
$("exampleBtn").addEventListener("click", function(){
  var sel = $("mapSelect"); sel.value = "Kokan";
  currentMap = MAPS.filter(function(m){ return m[0] === "Kokan"; })[0];
  mortars = [refToFrac("F", 11, 7, 5)]; target = refToFrac("G", 10, 7, 7); target2 = null;
  $("heightInput").value = 0; syncMortar2UI(); setMode("target"); render();
});
$("heightInput").addEventListener("input", render);

/* ================= DRAGGABLE FLOATING PANELS =================
   Full-screen map, tracker-style: the Map, Firing solution and
   About panels float over the map and are dragged by their ⋮⋮
   headers to anywhere on screen. Panels keep explicit left/top
   once moved (right/bottom anchoring is converted on first drag).
   Reset layout restores the default corners. Collapse (–)
   buttons fold a panel to just its header. The Controls panel is
   the exception: it is DOCKED at the bottom left and never
   drags — it only minimizes / reopens with its – / + button. */
var stageEl = $("stage");
var panelZ = 40;
/* the Controls panel is NOT in this list: it is DOCKED at the
   bottom left (static, like the Mini Game panel) and is never
   dragged — only minimized / reopened with its – / + button */
var PANEL_DEFAULTS = ["topPanel", "panel", "infoPanel"];
function makeDraggable(panel){
  var head = panel.querySelector(".draghead");
  if (!head) return;
  var drag = null;
  head.addEventListener("pointerdown", function(evt){
    if (evt.target.closest("button")) return;   /* header buttons are not drag handles */
    var sr = stageEl.getBoundingClientRect(), r = panel.getBoundingClientRect();
    /* pin the panel by left/top so right/bottom-anchored panels drag cleanly */
    panel.style.transform = "none";   /* centred panels (the game Summary) lose their centring transform once dragged */
    panel.style.left = (r.left - sr.left) + "px";
    panel.style.top = (r.top - sr.top) + "px";
    panel.style.right = "auto"; panel.style.bottom = "auto";
    panel.style.width = r.width + "px";
    panel.style.zIndex = ++panelZ;
    panel.classList.add("dragging");
    drag = { dx: evt.clientX - r.left, dy: evt.clientY - r.top };
    head.setPointerCapture(evt.pointerId);
    evt.preventDefault();
  });
  head.addEventListener("pointermove", function(evt){
    if (!drag) return;
    var sr = stageEl.getBoundingClientRect();
    var x = evt.clientX - sr.left - drag.dx;
    var y = evt.clientY - sr.top - drag.dy;
    x = Math.max(-40, Math.min(sr.width - 90, x));   /* keep a grabbable part in view */
    y = Math.max(0, Math.min(sr.height - 44, y));
    panel.style.left = x + "px";
    panel.style.top = y + "px";
  });
  function endDrag(){ drag = null; panel.classList.remove("dragging"); }
  head.addEventListener("pointerup", endDrag);
  head.addEventListener("pointercancel", endDrag);
  /* clicking anywhere on a panel brings it to the front */
  panel.addEventListener("pointerdown", function(){ panel.style.zIndex = ++panelZ; });
}
PANEL_DEFAULTS.forEach(function(id){ var p = $(id); if (p) makeDraggable(p); });
/* the Mini Game Summary panel is draggable too, but it is NOT in
   PANEL_DEFAULTS: it is not docked and has no default docked spot —
   it opens centred, floats where the player drags it, and closes
   completely with its Close button */
var gameInfoPanelEl = $("gameInfoPanel");
if (gameInfoPanelEl) makeDraggable(gameInfoPanelEl);
/* the Mini Game panel is NOT draggable: it is static, fixed to the right edge.
   The Controls panel is not draggable either: it is docked at the
   bottom left — Reset layout only reopens it if it was minimized. */
function resetLayout(){
  var cp0 = $("controlsPanel");
  if (cp0){
    cp0.classList.remove("collapsed");
    var cb0 = cp0.querySelector("[data-collapse]");
    if (cb0) cb0.textContent = "–";
  }
  PANEL_DEFAULTS.forEach(function(id){
    var p = $(id); if (!p) return;
    p.style.left = ""; p.style.top = ""; p.style.right = ""; p.style.bottom = "";
    p.style.width = ""; p.style.zIndex = "";
    p.classList.remove("collapsed");
    var b = p.querySelector("[data-collapse]");
    if (b) b.textContent = "–";
  });
  /* the About panel's default state is collapsed to its header */
  var info = $("infoPanel");
  if (info){
    info.classList.add("collapsed");
    var ib = info.querySelector("[data-collapse]");
    if (ib) ib.textContent = "+";
  }
}
$("resetLayoutBtn").addEventListener("click", resetLayout);
/* collapse buttons: fold a panel down to its header (and back) */
document.querySelectorAll("[data-collapse]").forEach(function(btn){
  btn.addEventListener("click", function(){
    var p = $(btn.getAttribute("data-collapse"));
    if (!p) return;
    var on = p.classList.toggle("collapsed");
    btn.textContent = on ? "+" : "–";
  });
});
/* keep every panel reachable after a resize */
window.addEventListener("resize", function(){
  PANEL_DEFAULTS.forEach(function(id){
    var p = $(id); if (!p || !p.style.left) return;
    var sr = stageEl.getBoundingClientRect(), r = p.getBoundingClientRect();
    var x = Math.max(-40, Math.min(sr.width - 90, r.left - sr.left));
    var y = Math.max(0, Math.min(sr.height - 44, r.top - sr.top));
    p.style.left = x + "px"; p.style.top = y + "px";
  });
});

/* ================= ZOOM + PAN =================
   The viewBox does all the work: svgPoint() converts through the live
   screen CTM, so placement, drag and hit-testing stay in board
   coordinates and every readout is computed exactly as at 100%. */
var view = { s: 1, cx: 400, cy: 400 };        /* scale + view centre, board coords */
var MIN_ZOOM = 1, MAX_ZOOM = 20;              /* 2000%: the view (40 units) is narrower than one main square (56 units) */
function applyView(){
  var w = 800 / view.s;
  var x = Math.min(820 - w, Math.max(-20, view.cx - w / 2));
  var y = Math.min(820 - w, Math.max(-20, view.cy - w / 2));
  view.cx = x + w / 2; view.cy = y + w / 2;
  svg.setAttribute("viewBox", x + " " + y + " " + w + " " + w);
  $("zoomLabel").textContent = Math.round(view.s * 100) + "%";
  $("zoomOutBtn").disabled = view.s <= MIN_ZOOM + 0.001;
  $("zoomInBtn").disabled = view.s >= MAX_ZOOM - 0.001;
  $("zoomResetBtn").disabled = view.s <= MIN_ZOOM + 0.001;
  svg.style.cursor = view.s > 1 ? "grab" : "crosshair";
  /* lines and markers keep a constant on-screen weight / size at any zoom */
  fireLine.setAttribute("stroke-width", 2.5 / view.s);
  fireLine2.setAttribute("stroke-width", 2 / view.s);
  rangeRing.setAttribute("stroke-width", 2 / view.s);
  rangeRing.setAttribute("stroke-dasharray", (9 / view.s) + " " + (7 / view.s));
  minRing.setAttribute("stroke-width", Math.max(0.2, 1 / view.s));
  updateMarkerTransforms();
  updateZoomLabels();
}
/* While zoomed in, number the subdivisions of the squares in view:
   keypad numbers (1-9, phone layout) from 300%, and the subkeypad numbers
   inside each keypad from 1000% — so the exact cell being tapped is visible.
   Labels are rebuilt only when the set of visible squares changes. */
var labelKey = "";
function updateZoomLabels(){
  var w = 800 / view.s;
  var c0 = Math.max(0, Math.floor((view.cx - w / 2 - MARGIN) / CELL));
  var c1 = Math.min(12, Math.floor((view.cx + w / 2 - MARGIN) / CELL));
  var r0 = Math.max(0, Math.floor((view.cy - w / 2 - MARGIN) / CELL));
  var r1 = Math.min(12, Math.floor((view.cy + w / 2 - MARGIN) / CELL));
  var showKp = view.s >= 3, showSub = view.s >= 10;
  var key = showKp ? [c0, c1, r0, r1, showSub ? 1 : 0].join(",") : "off";
  if (key === labelKey) return;
  labelKey = key;
  while (gLabels.firstChild) gLabels.removeChild(gLabels.firstChild);
  if (!showKp) return;
  for (var r = r0; r <= r1; r++){
    for (var c = c0; c <= c1; c++){
      var ox = MARGIN + c * CELL, oy = MARGIN + r * CELL;
      for (var n = 1; n <= 9; n++){
        var kc = (n - 1) % 3, kr = 2 - Math.floor((n - 1) / 3);   /* phone pad: 7 8 9 on top */
        var kx = ox + kc * CELL / 3, ky = oy + kr * CELL / 3;
        var t = el("text", {x: kx + CELL / 6, y: ky + CELL / 6 + 3, "text-anchor": "middle",
          "font-size": 8.5, "font-weight": 700, fill: "var(--board-label)", opacity: .95}, gLabels);
        t.textContent = n;
        if (showSub){
          for (var s2 = 1; s2 <= 9; s2++){
            var sc = (s2 - 1) % 3, sr = 2 - Math.floor((s2 - 1) / 3);
            var sx = kx + sc * CELL / 9, sy = ky + sr * CELL / 9;
            var st2 = el("text", {x: sx + CELL / 18, y: sy + CELL / 18 + 1.3, "text-anchor": "middle",
              "font-size": 3.6, fill: "var(--board-label)", opacity: .7}, gLabels);
            st2.textContent = s2;
          }
        }
      }
    }
  }
}
function zoomAt(p, factor){
  var ns = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, view.s * factor));
  if (ns === view.s) return;
  /* keep the anchored board point at the same spot in the view */
  view.cx = p.x + (view.cx - p.x) * (view.s / ns);
  view.cy = p.y + (view.cy - p.y) * (view.s / ns);
  view.s = ns;
  applyView();
}
function resetZoom(){ view.s = 1; view.cx = 400; view.cy = 400; applyView(); }
$("zoomInBtn").addEventListener("click", function(){ zoomAt({x: view.cx, y: view.cy}, 1.5); });
$("zoomOutBtn").addEventListener("click", function(){ zoomAt({x: view.cx, y: view.cy}, 1 / 1.5); });
$("zoomResetBtn").addEventListener("click", resetZoom);
/* keypad-numbers toggle: hides ONLY the keypad and subkeypad numbers
   drawn while zoomed (gLabels). The main grid refs inside each square
   (gRefs — e.g. G10, L9) and all grid lines always stay visible. */
function applyNumbers(){
  gLabels.style.display = showNumbers ? "" : "none";
  $("subdivBtn").setAttribute("aria-pressed", showNumbers ? "true" : "false");
  $("subdivBtn").textContent = showNumbers ? "🔢 Keypad numbers: on" : "🔢 Keypad numbers: off";
}
$("subdivBtn").addEventListener("click", function(){ showNumbers = !showNumbers; applyNumbers(); });
applyNumbers();
svg.addEventListener("wheel", function(evt){
  evt.preventDefault();
  var p = svgPoint(evt);
  zoomAt(p, evt.deltaY < 0 ? 1.18 : 1 / 1.18);
}, { passive: false });

/* ================= BOARD INTERACTION =================
   One pointer: drag a marker to move it; at 100% a board drag places and
   drags the selected marker (original behaviour). Zoomed in, a board
   drag pans and a plain tap places. Two pointers: pinch zoom + pan. */
var dragging = null;          /* "m1" | "m2" | "target" while a marker is dragged */
var panState = null;          /* pending / active pan on empty board (zoomed) */
var pointers = {};            /* live pointer cache for pinch */
var pinch = null;
function svgPoint(evt){
  var pt = svg.createSVGPoint(); pt.x = evt.clientX; pt.y = evt.clientY;
  return pt.matrixTransform(svg.getScreenCTM().inverse());
}
function nearMarker(p){
  var R = Math.max(4, 30 / view.s);
  var cands = [["m1", mortars[0]], ["target", target]];
  if (mortars[1]) cands.splice(1, 0, ["m2", mortars[1]]);
  if (mortars[1] && target2) cands.push(["target2", target2]);
  var best = null, bd = Infinity;
  for (var i = 0; i < cands.length; i++){
    var q = fracToPx(cands[i][1]);
    var d = Math.hypot(p.x - q.x, p.y - q.y);
    if (d < bd){ bd = d; best = cands[i][0]; }
  }
  return bd < R ? best : null;
}
/* free placement — the marker lands exactly where it is tapped / dragged,
   anywhere inside a subkeypad, not snapped to its centre */
function placeAt(which, p){
  if (isLocked(which)) return;   /* locked: board taps and drags never move it */
  var f = pxToFrac(p.x, p.y);
  if (which === "m1") mortars[0] = f;
  else if (which === "m2" && mortars[1]) mortars[1] = f;
  else if (which === "target") target = f;
  else if (which === "target2" && target2) target2 = f;
  render();
}
svg.addEventListener("pointerdown", function(evt){
  pointers[evt.pointerId] = { x: evt.clientX, y: evt.clientY };
  if (Object.keys(pointers).length === 2){
    /* second finger down: cancel any drag/pan and start a pinch */
    var ids = Object.keys(pointers);
    var a = pointers[ids[0]], b = pointers[ids[1]];
    pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), cx: view.cx, cy: view.cy, s: view.s,
              mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
    dragging = null; panState = null;
    svg.setPointerCapture(evt.pointerId);
    evt.preventDefault();
    return;
  }
  var p = svgPoint(evt);
  if (p.x < MARGIN - 28 || p.x > MARGIN + PLOT + 28 || p.y < MARGIN - 28 || p.y > MARGIN + PLOT + 28) return;
  var hit = nearMarker(p);
  if (hit){
    dragging = hit; setMode(hit); placeAt(hit, p);
  } else if (view.s > 1){
    panState = { sx: evt.clientX, sy: evt.clientY, cx: view.cx, cy: view.cy, moved: false, mode: mode };
  } else {
    dragging = mode; setMode(mode); placeAt(mode, p);
  }
  svg.setPointerCapture(evt.pointerId);
  evt.preventDefault();
});
svg.addEventListener("pointermove", function(evt){
  if (pointers[evt.pointerId]) pointers[evt.pointerId] = { x: evt.clientX, y: evt.clientY };
  if (pinch){
    var ids = Object.keys(pointers);
    if (ids.length !== 2) return;
    var a = pointers[ids[0]], b = pointers[ids[1]];
    var d = Math.hypot(a.x - b.x, a.y - b.y);
    var rect = svg.getBoundingClientRect();
    var upx = (800 / pinch.s) / rect.width;             /* board units per screen px at pinch start */
    view.s = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, pinch.s * (pinch.d > 0 ? d / pinch.d : 1)));
    view.cx = pinch.cx - ((a.x + b.x) / 2 - pinch.mx) * upx;
    view.cy = pinch.cy - ((a.y + b.y) / 2 - pinch.my) * upx;
    applyView();
    return;
  }
  if (panState){
    var rect2 = svg.getBoundingClientRect();
    var upx2 = (800 / view.s) / rect2.width;
    var dxp = evt.clientX - panState.sx, dyp = evt.clientY - panState.sy;
    if (Math.abs(dxp) + Math.abs(dyp) > 6) panState.moved = true;
    if (panState.moved){
      view.cx = panState.cx - dxp * upx2;
      view.cy = panState.cy - dyp * upx2;
      applyView();
    }
    return;
  }
  if (!dragging) return;
  placeAt(dragging, svgPoint(evt));
});
function endPointer(evt){
  delete pointers[evt.pointerId];
  if (pinch && Object.keys(pointers).length < 2) pinch = null;
  if (panState){
    if (!panState.moved){
      var p = svgPoint(evt);
      if (!(p.x < MARGIN - 28 || p.x > MARGIN + PLOT + 28 || p.y < MARGIN - 28 || p.y > MARGIN + PLOT + 28)){
        setMode(panState.mode); placeAt(panState.mode, p);
      }
    }
    panState = null;
  }
  dragging = null;
}
svg.addEventListener("pointerup", endPointer);
svg.addEventListener("pointercancel", endPointer);
applyView();

/* ================= GRID-REF INPUTS ================= */
function parseRef(str){
  var m = /^\s*([A-M])\s*(\d{1,2})\s*(?:[-– ]\s*([1-9]))?\s*(?:[-– ]\s*([1-9]))?\s*$/i.exec(str || "");
  if (!m) return null;
  var row = parseInt(m[2], 10);
  if (row < 1 || row > 13) return null;
  return refToFrac(m[1].toUpperCase(), row, m[3] ? +m[3] : 5, m[4] ? +m[4] : 5);
}
function bindRef(inputId, errId, apply){
  $(inputId).addEventListener("change", function(){
    var f = parseRef($(inputId).value);
    if (!f){ $(errId).textContent = "Use A1–M13, e.g. F11-7-5"; return; }
    $(errId).textContent = "";
    apply(f);
    render();
  });
  $(inputId).addEventListener("input", function(){ $(errId).textContent = ""; });
}
bindRef("mortarInput", "mortarErr", function(f){ mortars[0] = f; });
bindRef("mortar2Input", "mortar2Err", function(f){ if (mortars[1]) mortars[1] = f; });
bindRef("targetInput", "targetErr", function(f){ target = f; });
bindRef("target2Input", "target2Err", function(f){ if (target2) target2 = f; });

/* ================= DIAL TRAINING MINIGAME =================
   A random target is marked on the board (orange diamond) at a random
   bearing / range from the selected mortar. Inside the game the player
   gets ONLY the range hint — the range to enter, straight from the
   range calculator — never the elevation or bearing answer. They work
   the elevation out from that range themselves and dial it in on the
   training dial with W / S, exactly like the in-game sight:
   W raises the barrel (elevation up), S lowers it (elevation down),
   1 mil per tap (no snapping to tick lines), Shift for 25. FIRE scores the shot; only then is
   the correct elevation revealed, as feedback on that finished round.
   The player's CURRENT mils are hidden everywhere in the game —
   no number under the dial, none on the dial tabs or the line
   under them, none in the dial's window label, none in the
   round intro or the round-away message: like in game they read
   their setting off the sight scale itself (numbered every
   100 mils, ticks every 5), and finer than the 5-mil ticks is
   pure guessing. The calculator's angle stays — that is the
   order to aim for — but the spotter never gives an angle or an
   exact range at all: only a relative correction in metres from
   the mark (add / drop metres for the range), plus a left/right
   correction in metres measured from the target. Post-shot feedback may still name a finished shot's
   mils. */
var trainWin = { start: 1200 - DIAL_WIN / 2, end: 1200 + DIAL_WIN / 2 };
function trainT(mils){ return (mils - trainWin.start) / DIAL_WIN; }
(function buildTrainDial(){
  var g = $("trainDialStatic");
  var p0 = dialPoint(0, 1), p1 = dialPoint(1, 1);
  el("path", {d: "M" + p0.x + " " + p0.y + " A" + DIAL.rx + " " + DIAL.ry + " 0 0 0 " + p1.x + " " + p1.y + " Z",
    fill: "var(--inset)", stroke: "var(--line)", "stroke-width": 1.5}, g);
  var pi0 = dialPoint(0, .74), pi1 = dialPoint(1, .74);
  el("path", {d: "M" + pi0.x + " " + pi0.y + " A" + (DIAL.rx * .74) + " " + (DIAL.ry * .74) + " 0 0 0 " + pi1.x + " " + pi1.y,
    fill: "none", stroke: "var(--line-soft)", "stroke-width": 1}, g);
})();
/* same tick ladder as the sight dial (small 5, medium 25/75, large 50,
   numbered majors every 100), but only the 300-mil window around the
   player's current setting is drawn, sliding as they adjust */
function drawTrainTicks(centerMils){
  trainWin.start = centerMils - DIAL_WIN / 2;
  trainWin.end = centerMils + DIAL_WIN / 2;
  var g = $("trainDialTicks");
  while (g.firstChild) g.removeChild(g.firstChild);
  var first = Math.ceil(trainWin.start / 5) * 5;
  for (var mils = first; mils <= trainWin.end; mils += 5){
    var dg = trainT(mils);
    var kind = mils % 100 === 0 ? 3 : (mils % 50 === 0 ? 2 : (mils % 25 === 0 ? 1 : 0));
    var len = [10, 20, 34, 26][kind];
    var b = dialPoint(dg, 1), u = dialUnit(b);
    var a = { x: b.x - u.x * len, y: b.y - u.y * len };
    el("line", {x1: a.x, y1: a.y, x2: b.x, y2: b.y,
      stroke: "var(--board-label)", "stroke-width": [1.2, 2, 3.4, 2.6][kind]}, g);
    if (kind >= 3){
      var lp = { x: b.x + u.x * 17, y: b.y + u.y * 17 };
      var t = el("text", {x: lp.x, y: lp.y + 4, "text-anchor": "middle", "font-size": 12, "class": "dialtick"}, g);
      t.textContent = fmt(mils);
      var dp = dialPoint(dg, .80);
      var dt = el("text", {x: dp.x, y: dp.y + 3, "text-anchor": "middle", "font-size": 10, "class": "dialtick", opacity: .8}, g);
      dt.textContent = Math.round(mils * 360 / 6400) + "°";
    }
  }
  /* NO mils readout of the window either: in game the sight shows
     only its scale — numbered every 100 mils, ticks every 5 — so
     where the window sits is read off the scale, never printed */
  $("trainWindowTxt").textContent = "MORTAR " + (activeMortar() + 1) + " DIAL · NO MILS READOUT — READ THE SCALE";
}
function updateDialSeg(){
  syncPlayerMils();
  var ai = activeMortar();
  var b1 = $("dialM1Btn"), b2 = $("dialM2Btn");
  if (b1){
    b1.classList.toggle("active", ai === 0);
    b1.setAttribute("aria-pressed", ai === 0 ? "true" : "false");
    /* the dial tabs name the target only — a mortar's current mils
       are NEVER printed (hidden like in game: read the dial scale) */
    $("dialM1Val").textContent = "→ TARGET";
  }
  if (b2){
    b2.style.display = mortars[1] ? "" : "none";
    b2.classList.toggle("active", ai === 1);
    b2.setAttribute("aria-pressed", ai === 1 ? "true" : "false");
    $("dialM2Val").textContent = "→ TARGET 2";
  }
  var bl = $("dialBothLine");
  if (bl) bl.textContent = mortars[1]
    ? "M1 → TARGET · M2 → TARGET 2 · separate angles, neither mils shown"
    : "Each mortar keeps its own angle — no mils readout, read the dial scale";
  var tt = $("trainAngleTxt");
  /* needle / label colour follows the mortar whose dial is shown */
  var col = ai === 1 ? "var(--mortar2)" : "var(--orange)";
  var nd = $("trainNeedle"), tp2 = $("trainTip");
  if (nd){ nd.setAttribute("stroke", col); }
  if (tp2){ tp2.setAttribute("fill", col); }
  if (tt){ tt.setAttribute("fill", col); }
}
function updateTrainDial(){
  syncPlayerMils();
  updateDialSeg();
  var milsNow = dialOf();
  drawTrainTicks(milsNow);
  var outerP = dialPoint(trainT(milsNow), 1), ou = dialUnit(outerP);
  var tipP = { x: outerP.x - ou.x * 10, y: outerP.y - ou.y * 10 };
  var needle = $("trainNeedle"), tip = $("trainTip");
  needle.setAttribute("x2", tipP.x); needle.setAttribute("y2", tipP.y);
  tip.setAttribute("cx", tipP.x); tip.setAttribute("cy", tipP.y);
  /* the big number under the training dial is GONE: the player's
     current mils are hidden, like in game — the needle against the
     tick scale (numbered every 100, ticks every 5 mils) is all
     there is to read, and between the 5-mil ticks it is a guess */
  $("trainAngleTxt").textContent = "MORTAR " + (activeMortar() + 1) + " DIAL";
  /* the compass strip under the training dial follows the same
     mortar the DIAL tabs just selected — its facing, its line */
  if (typeof updateCompass === "function") updateCompass();
}
function gameScoreText(){
  if (game.streak > game.bestStreak) game.bestStreak = game.streak;   /* best streak is part of the shareable stats */
  $("gameScore").innerHTML = "ROUND <b>" + game.round + "</b> · TARGETS DOWN <b>" + game.hits + "</b>" +
    (game.bonus ? " · BONUS <b>+" + game.bonus + "</b>" : "") + " · ROUNDS FIRED <b>" +
    game.shots + "</b> · STREAK <b>" + game.streak + "</b>";
  if (typeof updateSharePreview === "function") updateSharePreview();
}
function setGameFeedback(cls, html){
  var fb = $("gameFeedback");
  fb.className = "gamefeedback" + (cls ? " " + cls : "");
  fb.innerHTML = html;
}
/* the game's range calculator: type a range, get the flat-ground
   elevation for it — the same conversion the in-game calculator does.
   It converts ANY range the player types; it never reads the round's
   answer, it just runs the standard PR solution on the typed value. */
function updateGameCalc(){
  var v = parseFloat($("gameCalcRange").value);
  var aEl = $("gameCalcAngle"), sEl = $("gameCalcSub");
  if (isNaN(v) || v <= 0){
    aEl.textContent = "—"; sEl.textContent = "type a range";
    return;
  }
  if (v > MAX_RANGE){
    aEl.textContent = "—"; sEl.textContent = "out of range — max 1,500 m";
    return;
  }
  var e = elevation(v, 0);
  if (!e){
    aEl.textContent = "—"; sEl.textContent = "no solution at this range";
    return;
  }
  aEl.textContent = fmt(Math.round(e.mils));
  sEl.textContent = e.deg.toFixed(1) + "° · enter " + fmt(Math.round(v / 10) * 10) + " in game" +
    (v < MIN_RANGE ? " · below 80 m min" : "");
}
$("gameCalcRange").addEventListener("input", updateGameCalc);
/* range a given elevation actually reaches on flat ground — the inverse
   of the PR solution (R = 1500 · sin 2θ), used only for shot feedback */
function rangeForMils(mils){
  var th = mils * 360 / 6400 * Math.PI / 180;
  return MAX_RANGE * Math.sin(2 * th);
}
/* ================= TARGET TYPES — timeout vs health =================
   The only moving target is Infantry, which runs on a TIMEOUT: it
   keeps moving on the board, the range hint changes with it, and the
   round is lost when the timer empties. Moving Infantry gets a LONG
   timeout (60 s) and a slow on-foot speed, so it stays in play far
   longer before it moves off. Vehicles are always STATIONARY — there
   is no moving-vehicle target (it was pure guesswork to dial against
   a target that kept driving off while you set up). Hard targets
   (Cache, FOB / Hideout, the four Emplacements, stationary Vehicle —
   and Infantry HOLDING a flag / building, a stationary infantry
   variant that never moves, drifts or escapes) have HEALTH instead:
   no timer, but one round won't destroy them — damage grades
   50 / 25 / 10 HP by hit band inside that target's own blast rings.
   The magazine holds 5 rounds, like in game; a reload loads
   2 shells at a time, every 2 shells taking 5–10 s. */
/* Dynamic hit variants: there is NO single hit distance. Every
   type carries its own rings in metres — direct (full effect) /
   close / blast (outer edge) — but they are HIDDEN: never drawn
   around the diamond and never quoted in metres, because in game
   there is no visible hit radius. Rings are sized to the target
   itself, not to a big shell-blast circle: a FOB is only a
   small tent and a Cache is only a weapon box, so both get small,
   tight rings; a squad or a vehicle covers a little more ground.
   Timed targets also carry `kill`: the radius that actually takes
   them down (infantry in the open die anywhere inside their blast
   ring). Hard targets take graded damage inside the blast:
   50 / 25 / 10 HP. */
/* Dynamic FOB, like in game: the forward base depends on the
   faction. Conventional forces — BLUFOR and REDFOR alike
   (Russia / MEC / China) — always build a FOB; insurgent forces
   never do, they get a HIDEOUT instead, so FOB and Hideout are two
   separate targets in the pool and either can come up on a round.
   There is NO standalone Emplacement target any more: in game an
   emplacement is dug in at a built position, so a FOB or Hideout
   USUALLY has one of the four built variants — AT TOW, AA MANPAD,
   MG Nest or Mortar pit — near it, rolled per round (sometimes
   NONE at all — a bare position), each with its own
   HP and rings (EMPLACEMENT_VARIANTS below). */
var GAME_TYPES = [
  { id:"infantry", short:"INFANTRY", label:"INFANTRY — MOVING", category:"timed", time:60, speed:2,
    direct:8, close:14, blast:22, kill:22,
    desc:"Scattered squads, no shared health — each man falls only to a round close to him. 60 s, then it moves off — but a round landing on it stops it moving." },
  { id:"infantryHold", short:"INFANTRY", label:"INFANTRY — HOLDING", category:"health", hp:50,
    direct:8, close:14, blast:22,
    desc:"Holding, scattered, no shared health — each man falls only to a round close to him." },
  { id:"cache", short:"CACHE", label:"WEAPON CACHE", category:"health", hp:100,
    direct:4, close:8, blast:14,
    desc:"Weapon box, tight rings. 100 HP · 50/25/10 per band. The Cache itself is the primary target — destroy it and the mission is done. Its defenders and parked vehicles are BONUS only: each one destroyed counts +1 targets down, but none of them ends the mission — only the Cache does." },
  { id:"fob", short:"FOB", label:"FOB — CONVENTIONAL", category:"health", hp:150,
    direct:5, close:10, blast:16,
    desc:"FOB, tight rings. 150 HP · 50/25/10 per band. The FOB itself is the primary target — destroy it and the mission is done. Its emplacements, defenders and parked vehicles are BONUS only: each one destroyed counts +1 targets down, but none of them ends the mission — only the FOB does." },
  { id:"hideout", short:"HIDEOUT", label:"HIDEOUT — INSURGENCY", category:"health", hp:100,
    direct:4, close:8, blast:14,
    desc:"Hideout, tight rings. 100 HP · 50/25/10 per band. The Hideout itself is the primary target — destroy it and the mission is done. Its emplacements, defenders and parked vehicles are BONUS only: each one destroyed counts +1 targets down, but none of them ends the mission — only the Hideout does." },
  { id:"vehicleStatic", short:"VEHICLE", label:"VEHICLE — STATIONARY", category:"health", hp:100,
    direct:6, close:12, blast:19,
    desc:"1–3 parked vehicles, own 100 HP each · 50/25/10 per band." },
  /* a MISSION, not a target to destroy: an infantry squad asks
     for SMOKE on a point so it can advance behind the screen.
     The point is fixed and the mission's clock is VARIED, rolled
     per round (category "smoke": the point itself never moves,
     no HP, nothing to kill): sometimes the squad is on a timed
     advance of a varied length — and then the friendly squad
     shows on the map as green dots moving toward the smoke
     point as the clock runs down — and sometimes there is NO
     timeout at all and the squad simply holds and waits. A
     round landing inside the point's own generous rings puts
     the screen up. No spotter correction and no true-position
     reveal on a smoke mission. The `time` below is nominal
     only — newGameRound rolls the real clock (or none). */
  { id:"smoke", short:"SMOKE", label:"SMOKE — SCREEN THE ADVANCE", category:"smoke", time:45,
    direct:10, close:20, blast:30,
    desc:"Smoke the point so the squad can advance. No HP, no spotter, no reveal." },
  /* a MISSION, not a target to destroy — danger-close support
     for a surrounded friendly force, Long Tan style: 1–2
     friendly squads (green dots, 1–5 men each) are pinned at
     the position and surrounded by 2–5 separate enemy infantry
     squads (orange dots) closing in on them from every side,
     and they are asking for mortar fire on their own position.
     Each friendly squad has its own health — 100 HP, bleeding
     0.02 HP per second per enemy man still up — and
     your own rounds landing close wound them too. Category
     "dangerclose": no timeout row and no shared HP — the
     friendly squads' HP is the clock (see the DANGER CLOSE
     block above and dcTick). The rings here only feed the
     fall-of-shot wording; enemy men are killed per man and
     friendly damage uses its own bands. */
  { id:"dangerClose", short:"DANGER CLOSE", label:"DANGER CLOSE — SURROUNDED", category:"dangerclose",
    direct:8, close:14, blast:22,
    desc:"Friendlies (green) surrounded by enemy (orange). Friendlies 100 HP, bleed 0.02 HP/s per enemy man up. An enemy squad hit by a round stops closing in. Kill all enemy — keep rounds off the green. The pinned squad calls ONE coordinate to shoot, picked by how many enemy squads they face (2 → nearest, 3+ → largest), and Ask spotter only confirms right place or not." }
];
/* ================= MARK ACCURACY — VARIED BY SOURCE =================
   The orange diamond is only a mark on the map, and in game a mark
   is only as good as whoever called the target in. Each round
   rolls a source, and the source sets how far the mark can sit
   from the real target (the error is rolled per round, in metres,
   at a random bearing — the card names the source, never the
   error):
   - COMMANDER UAV: the commander is watching the target from the
     sky on the UAV feed (realitymod.org manual, Commander → UAV)
     and marks what he sees — a tight mark, a few metres off.
   - SQUAD MARK: a squad on the ground spotted it and marked it —
     a fair mark, can sit a good way off. Nobody is left watching
     the fall of shot, so Ask spotter is DISABLED on a squad mark.
   - FRIENDLY SPOTTER — LASER DESIGNATOR: sometimes (rolled fresh
     every round, like the other sources) the mark is from a
     friendly spotter carrying laser designator
     binoculars — he lases the target, so his mark is ACCURATE
     (only a few metres off). He is drawn on the grid as a green
     FRIENDLY SPOTTER icon standing 50–150 m FROM the target
     (rolled every round, in ground metres — so his on-screen
     distance from the target depends on the selected map's
     size), never on the mark itself, and when the player asks him for
     a correction he lases it again and the accurate lased
     position is SHOWN ON THE GRID MAP as a square with a centre
     dot (cyan LASED mark, see askSpotter / gameLasedG) — and only
     TEMPORARILY, for a few seconds, before it fades. Sources without a laser get no
     lased mark on the grid, but the dedicated spotters (sniper,
     regular infantry, UAV) still report the fall of
     shot after EVERY shell dropped (the post-shot feedback)
     and still answer Ask spotter in metres as before. A SQUAD
     MARK or PASSING SQUAD mark is the exception: nobody is
     watching, so Ask spotter is disabled for those two sources.
   - SNIPER TEAM — SPOTTING SCOPE: a sniper team's spotter, well
     back (90–200 m) on a scope — a tight mark, tight corrections,
     no laser. He uses the SAME friendly spotter icon.
   - REGULAR INFANTRY — BINOCULARS: a regular infantryman with
     ordinary binoculars — a fair mark, corrections to the
     nearest 15 m, no laser. He uses the SAME friendly spotter
     icon as the laser spotter (40–110 m from the target), only
     his label reads REGULAR INFANTRY SPOTTER.
   - PASSING SQUAD: a squad just passing stumbled onto it and
     called it in roughly, or it was found by accident — the
     roughest mark, can be well off the real target. That squad
     has moved on, so Ask spotter is DISABLED on a passing mark.
   SQUAD MARK and PASSING SQUAD rounds instead get REQUEST
   CHECK ON MARK: a varied checker (commander UAV / infantry
   squad on foot / vehicle driving in) comes in from far away
   and checks the mark from a standoff — the ground checkers
   stop well short of it, only the UAV goes over it — and
   reports the checked target position, once per round (see
   CHECK ON MARK below).
   And ANY ground spotter can be SPOTTED BY THE ENEMY as the
   round goes on — killed where he sits, or forced to run away
   from the target to survive — and then he gives no corrections
   for the rest of the round (see SPOTTER SPOTTED below).
   Whatever the source, the mark is NEVER more than 50 m from
   the true position (MARK_MAX_OFF_M) — the passing squad's
   roughest roll is capped at 50 m.
   Hits are always judged against the REAL target position; the
   defenders, parked vehicles and the FOB / Hideout emplacements sit
   at their true spots, so a rough mark can sit visibly off the
   position — walk the rounds in from the fall of shot. */
var MARK_SOURCES = [
  { id:"laser",   label:"FRIENDLY SPOTTER — LASER DESIGNATOR",  max:5, w:3, icon:true, distMin:50, distMax:150,
    note:"friendly spotter lasing with designator binoculars — his green icon stands 50–150 m from the target on the grid (real ground metres, so the gap depends on the map). Accurate mark, and Ask spotter puts the lased position on the grid." },
  { id:"sniper",  label:"SNIPER TEAM — SPOTTING SCOPE",  max:10, w:2, icon:true, distMin:90, distMax:200,
    note:"a sniper team's spotter on a scope, well back — his green icon (same friendly spotter figure) stands 90–200 m from the target on the grid. Tight mark, tight corrections, but no laser: no lased position on the grid." },
  { id:"uav",     label:"COMMANDER UAV",  max:15, w:3,
    note:"tight mark from the UAV feed. Low fuel / RTB ends his corrections." },
  { id:"infantry", label:"REGULAR INFANTRY — BINOCULARS",  max:30, w:4, icon:true, distMin:40, distMax:110,
    note:"a regular infantryman spotting with ordinary binoculars — no laser. He gets the SAME green friendly spotter icon on the grid, 40–110 m from the target. Fair mark, corrections to the nearest 15 m, and no lased position on the grid." },
  { id:"squad",   label:"SQUAD MARK",     max:40, w:4,
    note:"ground mark — can sit a fair way off. No spotter watching the fall of shot, so Ask spotter is disabled on a squad mark — but you can Request check on mark instead: a varied checker (commander UAV, an infantry squad on foot, or a vehicle driving in) comes in from far away, stops short of the mark — only the UAV flies over it — and reports the checked target position, once per round. (Danger close excepted: there the pinned squad only calls one coordinate and confirms right place or not.)" },
  { id:"passing", label:"PASSING SQUAD",  max:50, w:3,
    note:"rough mark — can be well off. The passing squad has moved on, so Ask spotter is disabled on a passing-squad mark — but you can Request check on mark instead: a varied checker (commander UAV, an infantry squad on foot, or a vehicle driving in) comes in from far away, stops short of the mark — only the UAV flies over it — and reports the checked target position, once per round." }
];
/* which sources are ONE man on the ground with eyes on the target —
   he can be SPOTTED BY THE ENEMY (see SPOTTER SPOTTED below). The
   UAV is in the sky and is lost to fuel instead, never to this. */
function isGroundSpotterSrc(src){ return !!src && src.id !== "uav"; }
/* marks with NO spotter to ask: a SQUAD MARK is just a mark a squad
   dropped on the map and a PASSING SQUAD has already moved on —
   neither is watching the fall of shot, so Ask spotter is DISABLED
   for the whole round whenever the mark came from either source
   (refreshGameControls keeps the button dead and askSpotter
   refuses). Dedicated sources — laser, sniper, regular infantry
   and the commander UAV — still correct as before. The ONE
   exception is a DANGER CLOSE mission (its mark is a squad mark):
   there the button stays live but the pinned squad only confirms
   right place / not — the exception is applied at the call sites
   (refreshGameControls / askSpotter), not in this helper. */
function isNoSpotterMarkSrc(src){ return !!src && (src.id === "squad" || src.id === "passing"); }
function hasSpotterIcon(src){ return !!src && !!src.icon; }
function spotterIconLabel(src){
  if (!src) return "FRIENDLY SPOTTER";
  if (src.id === "infantry") return "REGULAR INFANTRY SPOTTER";
  if (src.id === "sniper") return "SNIPER SPOTTER";
  return "FRIENDLY SPOTTER";
}
/* hard cap: the true position is never more than 50 m from the mark,
   whatever the source — rollMark and the smoke / danger-close
   overrides all clamp to this */
var MARK_MAX_OFF_M = 50;
function rollMark(){
  var tw = 0, i;
  for (i = 0; i < MARK_SOURCES.length; i++) tw += MARK_SOURCES[i].w;
  var r = Math.random() * tw, src = MARK_SOURCES[0];
  for (i = 0; i < MARK_SOURCES.length; i++){ r -= MARK_SOURCES[i].w; if (r <= 0){ src = MARK_SOURCES[i]; break; } }
  game.markSrc = src;
  var dist = Math.min(src.max, MARK_MAX_OFF_M) * Math.sqrt(Math.random());   /* biased toward the smaller end, never over 50 m */
  var a = Math.random() * Math.PI * 2;
  game.markDx = Math.cos(a) * dist;
  game.markDy = Math.sin(a) * dist;
  /* ground spotter with an icon (laser / sniper / regular
     infantry): he stands at HIS source's distance from the target
     at a random bearing — never on the mark. Stored in ground
     metres and converted through the selected map's scale when
     drawn, so his on-screen distance from the target depends on
     the map (see updateMarkerTransforms). Regular infantry uses
     the SAME friendly spotter icon as the laser spotter — only
     his label, distance and precision differ. */
  if (hasSpotterIcon(src)){
    var sd = src.distMin + Math.random() * (src.distMax - src.distMin), sa = Math.random() * Math.PI * 2;
    game.spotterDx = Math.cos(sa) * sd;
    game.spotterDy = Math.sin(sa) * sd;
  } else { game.spotterDx = 0; game.spotterDy = 0; }
  resetSpotterRisk();
}
/* ================= SPOTTER SPOTTED — ENEMY EYES ON YOUR SPOTTER =================
   A ground spotter is a man sitting still with binoculars up,
   watching the target — and sometimes the enemy spots HIM.
   Rolled fresh every round (resetSpotterRisk): in a bit under
   half of ground-spotter rounds he is on borrowed time — after
   2–4 landed rounds the enemy has him — and every Ask spotter
   (radio call, and for the laser man a lase that can glint) also
   carries a small chance of giving him away on the spot. When
   he is spotted he is either KILLED where he sits or he RUNS —
   he bolts away from the target to survive — and either way he
   CANNOT give corrections any more this round: the Ask spotter
   button dies (refreshGameControls / askSpotter), any lased
   square comes off the grid, and his icon tells the story —
   red SPOTTER DOWN where he fell, or orange SPOTTER FLED at the
   ground he ran to, well away from the target. The UAV never
   gets spotted this way: it is lost to fuel instead. Smoke
   missions have no spotter and danger-close friendlies are
   already the target, so neither rolls this. */
var SPOTTER_SPOTTED_CHANCE = 0.45;   /* share of ground-spotter rounds where the enemy eventually spots him */
var SPOTTER_ASK_RISK = 0.12;         /* chance each Ask spotter gives him away */
function resetSpotterRisk(){
  game.spotterCompromised = false;
  game.spotterFate = null;
  game.spotterShots = 0;
  game.spotterRiskAt = (isGroundSpotterSrc(game.markSrc) && Math.random() < SPOTTER_SPOTTED_CHANCE)
    ? 2 + Math.floor(Math.random() * 3)   /* spotted after 2–4 landed rounds */
    : Infinity;
}
function compromiseSpotter(){
  if (game.spotterCompromised) return game.spotterFate;
  game.spotterCompromised = true;
  game.spotterFate = Math.random() < 0.5 ? "killed" : "fled";
  game.laserShown = false; clearLaserTimer();
  if (game.spotterFate === "fled" && hasSpotterIcon(game.markSrc)){
    /* he runs AWAY from the target along his own bearing, another
       120–180 m out — updateMarkerTransforms draws him at the new
       ground, mirrored back onto the board if he runs off its edge */
    var d0 = Math.hypot(game.spotterDx || 0, game.spotterDy || 0) || 1;
    var run = 120 + Math.random() * 60;
    game.spotterDx = (game.spotterDx || 0) / d0 * (d0 + run);
    game.spotterDy = (game.spotterDy || 0) / d0 * (d0 + run);
  }
  updateMarkerTransforms();
  refreshGameControls();
  return game.spotterFate;
}
function spotterFateText(){
  return game.spotterFate === "killed"
    ? "he was <b>killed where he sat</b> — his icon stays on the grid, marked SPOTTER DOWN"
    : "he <b>ran for it</b> — bolted away from the target to survive, and his icon now sits where he ran to, marked SPOTTER FLED";
}
function spotterSpottedMsg(){
  return "⚠️ <b>ENEMY SPOTTED YOUR SPOTTER</b> — " + spotterFateText() + ". <b>No more corrections this round</b>: walk the rounds in from the fall of shot yourself.";
}
/* after a round lands: count it against his exposure, and when
   the rolled moment comes the enemy spots him — the warning is
   APPENDED to the impact feedback so the fall of shot still reads */
function maybeSpotterSpottedAfterShot(){
  if (!game.active || game.over || game.spotterCompromised) return;
  if (!isGroundSpotterSrc(game.markSrc)) return;
  if (!game.type || game.type.id === "smoke" || game.type.id === "dangerClose") return;
  game.spotterShots++;
  if (game.spotterShots >= game.spotterRiskAt){
    compromiseSpotter();
    var fb = $("gameFeedback");
    if (fb) fb.innerHTML += "<br><br>" + spotterSpottedMsg();
  }
}
function markText(){
  if (!game.markSrc) return "";
  return "Mark: " + game.markSrc.label + " — " + game.markSrc.note;
}
/* ================= CHECK ON MARK — SQUAD / PASSING MARKS GET A CHECKER =================
   A SQUAD MARK or PASSING SQUAD mark has nobody watching the
   fall of shot, so Ask spotter is disabled on those rounds —
   but the player can REQUEST A CHECK ON THE MARK instead: a
   checker is sent FROM FAR AWAY to the mark to check the
   target position, and WHO comes is VARIED, rolled fresh on
   every request:
   - COMMANDER UAV: the commander sends the UAV over — it flies
     in from far off (the fastest check, ~3 s) and looks down on
     the mark from the sky; the tightest check, good to the
     nearest 5 m.
   - VEHICLE: a vehicle crew drives in from far away (~6 s)
     but stops 180 m short of the mark and checks the position
     through binoculars from there; good to the nearest 10 m.
   - INFANTRY: an infantry squad walks in from far away on foot
     (the slowest check, ~9 s) but stops 120 m short of the mark
     and checks the position through binoculars from there;
     good to the nearest 15 m.
   A ground checker NEVER comes right up to the mark: the mark
   sits on or near an enemy target, and nobody walks or drives
   onto a target just to look at it — ground checkers check
   from a standoff (kind.stop), and only the UAV goes right
   over the mark, from the sky. The checker's icon travels
   across the grid from its far start (260–520 m out, rolled
   per kind) to that stop point, so the player watches it come
   in and halt short of the mark. On arrival it
   REPORTS: how far the mark sits off the true target, the
   bearing / compass direction of the true target FROM the
   mark, and the CHECKED POSITION on the grid — an amber
   diamond at the true position rounded to the checker's
   precision step, shown temporarily (CHECK_SHOW_MS) like the
   lased square. It is a check of the MARK, not a correction:
   it needs no fall of shot, gives no range and no dial mils,
   and it does not end or reveal the round (Skip still does
   that). ONE check per round — sending someone across the map
   is a big ask — and it is gone once used, whatever happens.
   Only Squad Mark / Passing Squad rounds get the button
   (refreshGameControls shows it only there): dedicated
   spotter rounds already have Ask spotter, a smoke mission's
   squad is advancing, not checking, and danger close keeps
   its own limited right-place check. */
var CHECK_KINDS = [
  { id:"uav",      label:"COMMANDER UAV", who:"The commander UAV", verb:"flies in from far off and looks down on the mark from the sky", dur:3000, step:5,  w:2, fromMin:380, fromMax:520, stop:0 },
  { id:"vehicle",  label:"VEHICLE CHECK", who:"A vehicle crew",    verb:"drives in from far away but stops 180 m short of the mark — a vehicle never drives right up onto a target — and checks the target position through binoculars from there", dur:6000, step:10, w:3, fromMin:300, fromMax:480, stop:180 },
  { id:"infantry", label:"INFANTRY CHECK", who:"An infantry squad", verb:"walks in from far away on foot but stops 120 m short of the mark — infantry never walk right up onto a target to look at it — and checks the target position through binoculars from there", dur:9000, step:15, w:3, fromMin:260, fromMax:420, stop:120 }
];
function checkKindById(id){
  for (var i = 0; i < CHECK_KINDS.length; i++) if (CHECK_KINDS[i].id === id) return CHECK_KINDS[i];
  return CHECK_KINDS[0];
}
function isCheckMarkRound(){
  return !!(game.active && isNoSpotterMarkSrc(game.markSrc) && game.type &&
            game.type.id !== "smoke" && game.type.id !== "dangerClose");
}
function checkBriefNote(){
  return isCheckMarkRound()
    ? " No spotter is watching this mark, but you can <b>Request check on mark</b> once this round: a checker rolled fresh — <b>commander UAV</b> from the sky, an <b>infantry squad</b> on foot, or a <b>vehicle</b> driving in — comes in from far away and reports the checked target position. The ground checkers stop well short of the mark and check through binoculars — nobody walks or drives right up onto a target — and only the UAV goes over it."
    : "";
}
var checkTimer = null;
function clearCheckTimer(){ if (checkTimer){ clearInterval(checkTimer); checkTimer = null; } }
function resetCheck(){
  clearCheckTimer(); clearCheckedTimer();
  game.check = null; game.checkUsed = false;
  game.checkShown = false; game.checkedFrac = null;
}
function requestCheckOnMark(){
  if (!game.active || game.over || !game.type) return;
  if (!isCheckMarkRound()){
    setGameFeedback("miss", "No check to request on this round — a check on the mark is only for a <b>Squad Mark</b> or <b>Passing Squad</b> mark, where nobody is watching. This round has its own spotter: use <b>Ask spotter</b>.");
    return;
  }
  if (game.checkUsed){
    setGameFeedback("near", game.check && game.check.phase === "travel"
      ? "Check already on its way — <b>" + game.check.kind.label + "</b> is on its way in to check the mark. Wait for it to get into position and report."
      : "This round's mark has already been checked — <b>one check per round</b>. Work from the checked position and the fall of shot.");
    return;
  }
  game.checkUsed = true;
  var tw = 0, i;
  for (i = 0; i < CHECK_KINDS.length; i++) tw += CHECK_KINDS[i].w;
  var r = Math.random() * tw, kind = CHECK_KINDS[0];
  for (i = 0; i < CHECK_KINDS.length; i++){ r -= CHECK_KINDS[i].w; if (r <= 0){ kind = CHECK_KINDS[i]; break; } }
  var B = boardMeters(), tp = posMeters(game.targetFrac);
  var markM = { x: tp.x + (game.markDx || 0), y: tp.y + (game.markDy || 0) };
  var a = Math.random() * Math.PI * 2;
  var dist = kind.fromMin + Math.random() * (kind.fromMax - kind.fromMin);   /* far away: 260–520 m out, by kind */
  var fromM = { x: markM.x + Math.cos(a) * dist, y: markM.y + Math.sin(a) * dist };
  fromM.x = Math.min(B * .98, Math.max(B * .02, fromM.x));
  fromM.y = Math.min(B * .98, Math.max(B * .02, fromM.y));
  if (Math.hypot(fromM.x - markM.x, fromM.y - markM.y) < 80){   /* clamped start landed too close: come from the other side */
    fromM.x = Math.min(B * .98, Math.max(B * .02, markM.x - Math.cos(a) * dist));
    fromM.y = Math.min(B * .98, Math.max(B * .02, markM.y - Math.sin(a) * dist));
  }
  /* the stop point sits on the side the checker came from, at the
     kind's STANDOFF from the mark (kind.stop): the UAV flies right
     over the mark (stop 0), but a ground checker NEVER comes right
     up to the mark / target — the vehicle halts 180 m short and
     the infantry 120 m short and they check through binoculars
     from there. The standoff is capped so a board-clamped start
     can never push the stop past the checker's own start. */
  var dxF = fromM.x - markM.x, dyF = fromM.y - markM.y;
  var dFrom = Math.hypot(dxF, dyF) || 1;
  var stopD = Math.min(kind.stop, Math.max(0, dFrom - 60));
  var stopM = { x: markM.x + dxF / dFrom * stopD, y: markM.y + dyF / dFrom * stopD };
  game.check = { kind: kind, phase: "travel", t0: Date.now(),
                 dur: (typeof REDUCED !== "undefined" && REDUCED) ? 400 : kind.dur,
                 fromM: fromM, toM: stopM, curFrac: { x: fromM.x / B, y: fromM.y / B } };
  setCheckIcon(kind.id);
  setGameFeedback("near", "📡 <b>CHECK ON MARK REQUESTED — " + kind.label + "</b>. " + kind.who + " " + kind.verb + " — watch the grid: its icon is coming in from far away, and when it is in position it will report the checked target position. <b>One check per round</b>, and Ask spotter stays disabled on a " + (game.markSrc.id === "passing" ? "Passing Squad" : "Squad") + " mark.");
  refreshGameControls();
  updateMarkerTransforms();
  clearCheckTimer();
  checkTimer = setInterval(tickCheck, 100);
}
function tickCheck(){
  var c = game.check;
  if (!game.active || !c || c.phase !== "travel"){ clearCheckTimer(); return; }
  var t = Math.min(1, (Date.now() - c.t0) / c.dur);
  var B = boardMeters();
  var mx = c.fromM.x + (c.toM.x - c.fromM.x) * t, my = c.fromM.y + (c.toM.y - c.fromM.y) * t;
  c.curFrac = { x: mx / B, y: my / B };
  if (t >= 1){ clearCheckTimer(); finishCheck(); return; }
  updateMarkerTransforms();
}
function finishCheck(){
  var c = game.check;
  if (!c) return;
  c.phase = "done";
  if (!game.active || game.over){ refreshGameControls(); updateMarkerTransforms(); return; }
  var kind = c.kind, B = boardMeters();
  /* the mark → true vector is the mark error reversed; the
     checked position is the true position ROUNDED to this
     checker's precision step, measured from the mark — a UAV
     check is good to 5 m, a vehicle check to 10 m, infantry
     on foot to 15 m */
  var vx = -(game.markDx || 0), vy = -(game.markDy || 0);
  var dist = Math.hypot(vx, vy);
  var qx = Math.round(vx / kind.step) * kind.step, qy = Math.round(vy / kind.step) * kind.step;
  var tp = posMeters(game.targetFrac);
  var markM = { x: tp.x + (game.markDx || 0), y: tp.y + (game.markDy || 0) };
  game.checkedFrac = { x: (markM.x + qx) / B, y: (markM.y + qy) / B };
  showCheckedTemporarily();   /* amber CHECKED POSITION diamond on the grid, for a few seconds only */
  var brg = (Math.atan2(vx, -vy) * 180 / Math.PI + 360) % 360;
  var compass = ["north", "north-east", "east", "south-east", "south", "south-west", "west", "north-west"][Math.round(brg / 45) % 8];
  var arrived = kind.stop > 0
    ? kind.who + " stopped " + kind.stop + " m short of the mark — it never goes right up to the target — and checked the target position through binoculars from there."
    : kind.who + " is over the mark and checked the target position from the sky.";
  setGameFeedback("near", "📡 <b>MARK CHECKED — " + kind.label + "</b>: " + arrived + " " +
    (dist < kind.step
      ? "The mark is <b>right on the target</b> — inside " + kind.step + " m, as close as this check can tell. Keep your mark where it is and walk the rounds in from the fall of shot."
      : "The mark sits <b>" + fmt(Math.round(dist)) + " m off</b> — from the mark, the true target lies <b>" + compass + "</b> (bearing " + fmt(Math.round(brg)) + "° from the mark). The <b>checked position is on the grid now</b> (amber diamond, CHECKED POSITION) for a few seconds: move your target mark onto it and fire from there. This check is good to the nearest " + kind.step + " m.") +
    " One check per round — that's it used.");
  refreshGameControls();
  updateMarkerTransforms();
}
/* ================= UAV FUEL — the commander UAV is not up forever =================
   Per the PR manual (Commander → UAV) the UAV burns fuel the
   whole time it is up: 0.2% a second while TRAVELLING, 0.33% a
   second while OPERATING over the target, and it refuels at base
   at the same 0.33% rate — so a commander-called round starts on
   the tank the UAV managed to refuel to between tasks (rolled
   50–95%), spends ~4 s travelling in at the travel rate, then
   drains at the operating rate while it watches. At 20% it is
   LOW FUEL — but even on low fuel the commander UAV can still
   see from the sky, so it KEEPS calling spotter corrections
   while it is up there: low fuel is a warning, not the end.
   Only at 0% does it RTB: then the commander has no eyes left
   and CANNOT call spotter corrections any more this round —
   the Ask spotter button dies (see refreshGameControls /
   askSpotter) and the ring around the mark vanishes too.
   Ground spotters don't burn fuel, but they can be spotted by
   the enemy instead (see SPOTTER SPOTTED). The status card
   carries a UAV FUEL bar like the one on the commander screen
   (top left). */
var uavTimer = null;
var UAV_DRAIN_TRAVEL = 0.2;   /* % per second while travelling */
var UAV_DRAIN_OPS = 0.33;     /* % per second while operating — and the refuel rate at base */
var UAV_LOW_PCT = 20;         /* at or under this the UAV is low on fuel */
var UAV_TRAVEL_S = 4;         /* seconds travelling in before it is on station */
function stopUavTimer(){ if (uavTimer){ clearInterval(uavTimer); uavTimer = null; } }
function startUav(){
  stopUavTimer();
  if (!game.markSrc || game.markSrc.id !== "uav"){ game.uavState = null; game.uavFuel = 0; updateUavUI(); return; }
  game.uavFuel = 50 + Math.random() * 45;   /* refuelled at base at 0.33%/s between tasks — never a full tank twice in a row */
  game.uavState = "travel";
  tintUav(); updateUavUI();
  var travelLeft = UAV_TRAVEL_S;
  uavTimer = setInterval(function(){
    if (!game.active || game.over || !game.markSrc || game.markSrc.id !== "uav"){ stopUavTimer(); return; }
    if (game.uavState === "travel"){
      game.uavFuel = Math.max(0, game.uavFuel - UAV_DRAIN_TRAVEL * 0.5);
      travelLeft -= 0.5;
      if (travelLeft <= 0){ game.uavState = "station"; tintUav(); }
    } else if (game.uavState === "station" || game.uavState === "low"){
      game.uavFuel = Math.max(0, game.uavFuel - UAV_DRAIN_OPS * 0.5);
      if (game.uavFuel <= 0){
        game.uavFuel = 0; game.uavState = "rtb"; stopUavTimer();
        setGameFeedback("near", "UAV RTB — the tank is empty and the commander is recovering it at base. No more spotter corrections this round: walk the rounds in from the fall of shot. (A squad-called target would still have its spotter.)");
        tintUav(); updateMarkerTransforms();
      } else if (game.uavState === "station" && game.uavFuel <= UAV_LOW_PCT){
        game.uavState = "low"; tintUav();
        setGameFeedback("near", "UAV LOW FUEL — " + Math.round(game.uavFuel) + "% left and burning at 0.33%/s. He can still see from the sky up there, so the commander KEEPS calling corrections on low fuel — but when the tank hits 0% he RTBs and the corrections end, so spend them before then.");
      }
    }
    updateUavUI(); refreshGameControls();
  }, 500);
}
function updateUavUI(){
  var row = $("gameUavRow"); if (!row) return;
  if (!game.markSrc || game.markSrc.id !== "uav" || !game.uavState){ row.style.display = "none"; return; }
  row.style.display = "";
  var bar = $("gameUavBar");
  bar.style.width = Math.max(0, Math.min(100, game.uavFuel)) + "%";
  bar.style.background = game.uavState === "rtb" ? "var(--red)" : (game.uavState === "low" ? "var(--orange)" : "var(--green)");
  $("gameUavText").textContent =
    game.uavState === "rtb" ? "RTB · 0%" :
    game.uavState === "low" ? "LOW FUEL · " + Math.round(game.uavFuel) + "%" :
    game.uavState === "travel" ? "EN ROUTE · " + Math.round(game.uavFuel) + "%" :
    "ON STATION · " + Math.round(game.uavFuel) + "%";
}
/* ===== EMPLACEMENTS — VARIED, USUALLY NEAR A FOB / HIDEOUT, SOMETIMES NONE =====
   No standalone emplacement rounds: a FOB or a Hideout USUALLY has
   emplacements dug in near it, like in game — per the PR manual's
   construction work a built position can carry several at once —
   but SOMETIMES (about 1 round in 4) it has NONE around it at all:
   a bare position with just its structure, its defenders and its
   parked vehicles, cleared without any emplacement to destroy.
   When it has them, the loadout is VARIED and re-rolled every
   round: 2–5 emplacements
   — 5 is the MAX a FOB / Hideout can carry, never more — from the
   four variants built in game (AT TOW, AA MANPAD, MG Nest, Mortar
   pit), and a position can carry TWO Mortar pits at once. The
   fullest roll is the 5-max TOW + AA MANPAD + MG Nest + 2× Mortar,
   and TOW + AA MANPAD + 2× Mortar is another, alongside smaller
   mixes like TOW + MG + Mortar or AA + 2× Mortar. They sit spread
   around the position,
   20–38 m from its centre at separated random bearings — at their
   true spots, like the defenders and parked vehicles (the squads
   are around the position, not on the FOB itself). Each one has
   its own HP and takes graded damage inside its own hidden rings
   (50 / 25 / 10 HP). The structure itself is the PRIMARY target:
   destroying it is target down and ends the mission, even if
   emplacements are still up. Emplacements are BONUS only — each
   one destroyed counts +1 targets down in the score, but no
   emplacement (and nothing else around the position) ever ends
   the mission while the structure stands. Cache gets none —
   only the forward base does. */
var EMPLACEMENT_VARIANTS = [
  { id:"tow",    short:"TOW",    label:"AT TOW",    hp:75,  direct:4, close:8, blast:13 },
  { id:"aa",     short:"MANPAD", label:"AA MANPAD", hp:50,  direct:4, close:7, blast:12 },
  { id:"mg",     short:"MG",     label:"MG NEST",   hp:75,  direct:5, close:9, blast:14 },
  { id:"mortar", short:"MORTAR", label:"MORTAR PIT", hp:100, direct:5, close:10, blast:15 }
];
function empVariant(id){
  for (var i = 0; i < EMPLACEMENT_VARIANTS.length; i++) if (EMPLACEMENT_VARIANTS[i].id === id) return EMPLACEMENT_VARIANTS[i];
  return EMPLACEMENT_VARIANTS[0];
}
/* varied loadouts, by variant id — MAX 5 emplacements, never
   more. The 5-max rolls come first: TOW + AA MANPAD + MG Nest +
   2 Mortars (every variant, Mortar doubled), and TOW + AA MANPAD
   + 2 Mortars + MG in the same set; the rest mix the four variants
   at 2–4 strong, with Mortar appearing once or twice and never
   more than twice, and no other variant doubled */
var EMPLACEMENT_LOADOUTS = [
  ["tow","aa","mg","mortar","mortar"],
  ["tow","aa","mg","mortar","mortar"],
  ["tow","aa","mortar","mortar"],
  ["tow","aa","mg","mortar"],
  ["tow","mg","mortar","mortar"],
  ["aa","mg","mortar","mortar"],
  ["tow","aa","mortar"],
  ["tow","mortar","mortar"],
  ["aa","mortar","mortar"],
  ["mg","mortar","mortar"],
  ["tow","aa","mg"],
  ["tow","mg","mortar"],
  ["aa","mg","mortar"],
  ["tow","aa"],
  ["aa","mortar"]
];
function emplacementsAlive(){
  var n = 0;
  if (game.emplacements) for (var i = 0; i < game.emplacements.length; i++) if (game.emplacements[i].hp > 0) n++;
  return n;
}
function emplacementText(){
  if (!game.emplacements || !game.emplacements.length)
    return (game.type && (game.type.id === "fob" || game.type.id === "hideout")) ? "No emplacements around it this round." : "";
  var parts = [], counts = {}, order = [];
  for (var i = 0; i < game.emplacements.length; i++){
    var v = game.emplacements[i].variant;
    if (!counts[v.id]){ counts[v.id] = 0; order.push(v); }
    counts[v.id]++;
  }
  for (var j = 0; j < order.length; j++){
    var vv = order[j], c = counts[vv.id];
    parts.push((c > 1 ? c + "× " : "") + vv.label + " (" + vv.hp + " HP" + (c > 1 ? " each" : "") + ")");
  }
  return game.emplacements.length + " emplacements: " + parts.join(", ") + ".";
}
function makeEmplacements(type){
  while (gameEmpG.firstChild) gameEmpG.removeChild(gameEmpG.firstChild);
  game.emplacements = [];
  if (!type || (type.id !== "fob" && type.id !== "hideout")) return;
  /* sometimes a FOB / Hideout has NO emplacements around it at
     all — about 1 round in 4 rolls a bare position: no TOW, no
     MANPAD, no MG Nest, no Mortar pit, so the position is cleared
     with just its structure, defenders and parked vehicles */
  if (Math.random() < 0.25) return;
  var loadout = EMPLACEMENT_LOADOUTS[Math.floor(Math.random() * EMPLACEMENT_LOADOUTS.length)].slice(0, 5);   /* hard cap: max 5 emplacements */
  /* shuffle the order so which variant sits on which bearing varies too */
  for (var si = loadout.length - 1; si > 0; si--){
    var sj = Math.floor(Math.random() * (si + 1)), tmp = loadout[si]; loadout[si] = loadout[sj]; loadout[sj] = tmp;
  }
  var baseA = Math.random() * Math.PI * 2;
  var mortarSeen = 0;
  for (var i = 0; i < loadout.length; i++){
    var v = empVariant(loadout[i]);
    /* spread the emplacements around the position: roughly even
       angular spacing with jitter, so they never stack on one spot */
    var a = baseA + (i / loadout.length) * Math.PI * 2 + (Math.random() - .5) * .7;
    var ring = 20 + Math.random() * 18;                    /* 20–38 m out */
    var label = v.short;
    if (v.id === "mortar"){ mortarSeen++; if (loadout.filter(function(x){ return x === "mortar"; }).length > 1) label = "MORTAR " + mortarSeen; }
    var e = { variant: v, hp: v.hp, maxHp: v.hp,
              dx: Math.cos(a) * ring, dy: Math.sin(a) * ring, el: null };
    var g = el("g", {}, gameEmpG);
    el("polygon", {points:"0,-12 9,0 0,12 -9,0", fill:"var(--inset)", stroke:"var(--orange)", "stroke-width":2}, g);
    el("circle", {r:2.4, fill:"var(--orange)"}, g);
    var t = el("text", {y:27, "text-anchor":"middle", "font-size":10.5, "font-weight":700, fill:"var(--orange)", "font-family":"'IBM Plex Mono',monospace"}, g);
    t.textContent = label;
    e.el = g;
    game.emplacements.push(e);
  }
}
/* ================= DEFENDING INFANTRY — around built positions =================
   Like in game, a built position is defended: a FOB, a Hideout
   and a Cache is SURROUNDED by infantry — the squads are around
   the position, not on the structure itself —
   1–2 squads, and 1 squad is 1–8 men, so 1–16 men in total. Each
   squad is placed as a group on its own side of the position,
   15–26 m out from the centre (outside the structure's own direct
   ring, so one perfect hit on the tent / box does not wipe them
   all), with its men spread a few metres around the squad's spot.
   A shell that lands within DEF_KILL_M of a man takes that man
   down, wherever the shell lands relative to the structure. The
   structure is the PRIMARY target — only it ends the mission.
   Defenders are BONUS only: each man down counts +1 targets down
   in the score, but clearing every defender (or everything else
   around the position) never ends the mission while the
   structure stands. Moving / timed targets and plain
   infantry / vehicle targets get no defenders — they ARE infantry
   or vehicles already. */
var DEFENDED_IDS = { fob:1, hideout:1, cache:1 };
var DEF_KILL_M = 14;   /* metres — a shell this close to a man takes him down */
function defendersAlive(){
  var n = 0;
  if (game.defenders) for (var i = 0; i < game.defenders.length; i++) if (game.defenders[i].alive) n++;
  return n;
}
function defendersText(){
  if (!game.defenders || !game.defenders.length) return "";
  var sq = game.defSquads.length;
  return "Defenders: " + sq + (sq === 1 ? " squad" : " squads") + " (" + game.defSquads.join(" + ") + ") — " +
    game.defenders.length + (game.defenders.length === 1 ? " man." : " men.");
}
function makeDefenders(type){
  while (gameDefG.firstChild) gameDefG.removeChild(gameDefG.firstChild);
  game.defenders = []; game.defSquads = [];
  if (!type || !DEFENDED_IDS[type.id]) return;
  var squads = 1 + Math.floor(Math.random() * 2);          /* 1–2 squads */
  var baseA = Math.random() * Math.PI * 2;
  for (var s = 0; s < squads; s++){
    var size = 1 + Math.floor(Math.random() * 8);          /* 1 squad = 1–8 men */
    game.defSquads.push(size);
    /* each squad holds its own side of the position */
    var a = baseA + s * (Math.PI * (0.9 + Math.random() * 0.7)) + (Math.random() - .5) * .5;
    var ring = 15 + Math.random() * 11;                    /* 15–26 m out */
    var cx = Math.cos(a) * ring, cy = Math.sin(a) * ring;
    for (var m = 0; m < size; m++){
      var ja = Math.random() * Math.PI * 2, jd = Math.random() * 4.5;
      var d = { dx: cx + Math.cos(ja) * jd, dy: cy + Math.sin(ja) * jd, alive: true, squad: s, el: null };
      var g = el("g", {}, gameDefG);
      el("circle", {r: 5.4, fill: "var(--orange)", stroke: "var(--inset)", "stroke-width": 1.6}, g);
      el("circle", {r: 2.1, fill: "var(--inset)"}, g);
      d.el = g;
      game.defenders.push(d);
    }
  }
}
/* ================= PARKED VEHICLES — around FOB / Cache / Hideout =================
   Dynamic, re-rolled EVERY round like the squads: a FOB, a Cache
   and a Hideout (only those three — emplacements get squads but no
   parked vehicles) have 1–2 trucks AND 1–2 cars / jeeps parked
   around them. All of them park together in one group on a random
   side of the position, 20–30 m out, in a shuffled order along a
   row — so the counts, the side, the row direction and the order
   are different every round. A shell within a vehicle's own kill
   radius destroys it (truck 13 m, car / jeep 11 m); the row is
   tight (about 7 m between vehicles) so one round placed in the
   middle of the row can take more than one. The structure is
   the PRIMARY target — only destroying it ends the mission.
   Parked vehicles are BONUS only: each truck or car / jeep
   destroyed counts +1 targets down in the score, but wiping
   out every parked vehicle (or everything else around the
   position) never ends the mission while the structure
   stands. */
var VEHICLE_GUARD_IDS = { fob:1, hideout:1, cache:1 };
function vehiclesAlive(){
  var n = 0;
  if (game.vehicles) for (var i = 0; i < game.vehicles.length; i++) if (game.vehicles[i].alive) n++;
  return n;
}
function vehiclesText(){
  if (!game.vehicles || !game.vehicles.length) return "";
  var tr = 0, ca = 0;
  for (var i = 0; i < game.vehicles.length; i++){ if (game.vehicles[i].kind === "truck") tr++; else ca++; }
  return "Parked: " + tr + (tr === 1 ? " truck" : " trucks") + " + " + ca + (ca === 1 ? " car/jeep." : " cars/jeeps.");
}
function makeVehicles(type){
  while (gameVehG.firstChild) gameVehG.removeChild(gameVehG.firstChild);
  game.vehicles = [];
  if (!type || !VEHICLE_GUARD_IDS[type.id]) return;
  var kinds = [];
  var nTr = 1 + Math.floor(Math.random() * 2);   /* 1–2 trucks */
  var nCa = 1 + Math.floor(Math.random() * 2);   /* 1–2 cars / jeeps */
  for (var ti = 0; ti < nTr; ti++) kinds.push("truck");
  for (var ci = 0; ci < nCa; ci++) kinds.push("car");
  /* shuffle the row order so trucks and cars mix differently each round */
  for (var si = kinds.length - 1; si > 0; si--){
    var sj = Math.floor(Math.random() * (si + 1)), tmp = kinds[si]; kinds[si] = kinds[sj]; kinds[sj] = tmp;
  }
  var a = Math.random() * Math.PI * 2;                       /* random side */
  var ring = 20 + Math.random() * 10;                        /* 20–30 m out */
  var cx = Math.cos(a) * ring, cy = Math.sin(a) * ring;
  var tx = -Math.sin(a), ty = Math.cos(a);                   /* row runs along the tangent */
  var rot = Math.atan2(ty, tx) * 180 / Math.PI;
  for (var vi = 0; vi < kinds.length; vi++){
    var kind = kinds[vi];
    var along = (vi - (kinds.length - 1) / 2) * 7 + (Math.random() - .5) * 2.4;
    var v = { kind: kind, alive: true, el: null,
              killM: kind === "truck" ? 13 : 11,
              rot: rot + (Math.random() - .5) * 24,
              dx: cx + tx * along + (Math.random() - .5) * 3,
              dy: cy + ty * along + (Math.random() - .5) * 3 };
    var g = el("g", {}, gameVehG);
    if (kind === "truck"){
      el("rect", {x: -10, y: -4.6, width: 20, height: 9.2, rx: 1.4, fill: "#3f4638", stroke: "#ece9df", "stroke-width": 1.1}, g);
      el("rect", {x: 4.5, y: -4.6, width: 5.5, height: 9.2, fill: "var(--inset)", stroke: "#ece9df", "stroke-width": .8}, g);
      el("line", {x1: -8, y1: 0, x2: 3.5, y2: 0, stroke: "#ece9df", "stroke-width": .7, opacity: .6}, g);
    } else {
      el("rect", {x: -6.6, y: -3.6, width: 13.2, height: 7.2, rx: 1.6, fill: "#4a4438", stroke: "#ece9df", "stroke-width": 1.1}, g);
      el("rect", {x: -.5, y: -3.6, width: 3.4, height: 7.2, fill: "var(--inset)", stroke: "#ece9df", "stroke-width": .8}, g);
    }
    v.el = g;
    game.vehicles.push(v);
  }
}
function hitBand(dist, t){
  if (dist <= t.direct) return { id:"direct", label:"DIRECT HIT", dmg:50 };
  if (dist <= t.close)  return { id:"close",  label:"CLOSE HIT", dmg:25 };
  if (dist <= t.blast)  return { id:"blast",  label:"BLAST HIT", dmg:10 };
  return { id:"miss", label:"MISS", dmg:0 };
}
var gameTimer = null, fireCooldownTimer = null;
/* RELOAD is SEPARATE per mortar: each mortar has its OWN live
   reload state and its OWN timer, so Mortar 1 and Mortar 2 can be
   reloading at the same time, for (potentially) different shells,
   and each one's Skip next batch stops only its own reload.
   reloadStates[i] is null while mortar i is not reloading.
   game.reloading is kept only as an "any mortar reloading" mirror. */
var reloadTimers = [null, null];
var reloadStates = [null, null];
function isReloading(idx){ return !!reloadStates[idx]; }
function anyReloading(){ return !!reloadStates[0] || !!reloadStates[1]; }
function syncReloadFlag(){ game.reloading = anyReloading(); }
function reloadTxtEl(idx){ return $(idx === 1 ? "gameReload2Txt" : "gameReloadTxt"); }
/* the fall of shot is kept PER MORTAR: lastImpacts[i] is mortar
   i's own last landed round, so the spotter correction is worked
   out for the SELECTED mortar from ITS OWN shot — never from the
   other mortar's. game.lastImpact stays as a mirror of the most
   recent impact overall. */
function lastImpactFor(idx){ return game.lastImpacts ? game.lastImpacts[idx] : null; }
function clearLastImpacts(){ game.lastImpacts = [null, null]; game.lastImpact = null; }
var FIRE_DELAY = 500;   /* ms — 0.5 s between every shot */
/* reload pacing: shells are loaded 2 at a time, and every batch of
   2 shells takes 5–10 s (rolled per batch). There is no ammo box
   or rearm step — RELOAD alone refills the magazine, in pairs. */
var RELOAD_MIN = 5, RELOAD_MAX = 10;   /* seconds per 2 shells */
function startFireCooldown(){
  game.cooldown = true;
  if (fireCooldownTimer) clearTimeout(fireCooldownTimer);
  fireCooldownTimer = setTimeout(function(){
    fireCooldownTimer = null;
    game.cooldown = false;
    refreshGameControls();
  }, FIRE_DELAY);
  refreshGameControls();
}
function clearFireCooldown(){
  if (fireCooldownTimer){ clearTimeout(fireCooldownTimer); fireCooldownTimer = null; }
  game.cooldown = false;
}
function refreshGameControls(){
  var live = game.active && !game.over;
  /* FIRE is SEPARATE per mortar: each mortar has its own FIRE
     button, and a button is judged only on THAT mortar — its own
     magazine for the selected shell and its own reload. Firing
     Mortar 1 never fires Mortar 2 and vice versa. Each button is
     paced by the shared 0.5 s delay between shots, and stays
     disabled when the round is over, while THAT mortar is
     reloading, or when THAT mortar's magazine is empty. */
  function reloadingThis(idx){ return isReloading(idx); }
  $("gameFireBtn").disabled = !live || game.cooldown || reloadingThis(0) || ammoOf(0, game.shell) <= 0;
  var fb2 = $("gameFire2Btn");
  if (fb2){
    fb2.style.display = mortars[1] ? "" : "none";
    fb2.disabled = !live || !mortars[1] || game.cooldown || reloadingThis(1) || ammoOf(1, game.shell) <= 0;
    var fbs = $("fireBtns"); if (fbs) fbs.classList.toggle("single", !mortars[1]);
  }
  $("wsUpBtn").disabled = !live;
  $("wsDownBtn").disabled = !live;
  $("gameNextBtn").disabled = live || !game.active;
  $("gameSkipBtn").disabled = !live;
  /* RELOAD is SEPARATE per mortar: each mortar has its own RELOAD
     button, judged only on THAT mortar — disabled while THAT
     mortar is already reloading or its magazine for the selected
     shell is full. Reloading Mortar 1 never blocks Mortar 2's
     RELOAD and vice versa; both can run at once. */
  $("gameReloadBtn").disabled = !game.active || isReloading(0) || ammoOf(0, game.shell) >= 5;
  var rb2 = $("gameReload2Btn");
  if (rb2) rb2.disabled = !game.active || !mortars[1] || isReloading(1) || ammoOf(1, game.shell) >= 5;
  var rc2 = $("reloadCol2");
  if (rc2) rc2.style.display = mortars[1] ? "" : "none";
  var rbs = $("reloadBtns"); if (rbs) rbs.classList.toggle("single", !mortars[1]);
  /* the shell switch stays free while a reload runs: each reload
     captured its mortar and shell when it started, so switching
     shell now only changes which magazine the NEXT reload (or
     FIRE) uses — it can never credit the wrong magazine */
  $("shellHeBtn").disabled = !game.active;
  $("shellSmokeBtn").disabled = !game.active;
  /* Skip next batch is separate per mortar too: each mortar's
     button is live only while THAT mortar is mid-reload, and it
     stops that reload at the shells already loaded (2–4) */
  $("gameSkipBatchBtn").disabled = !isReloading(0);
  var sb2 = $("gameSkipBatch2Btn"); if (sb2) sb2.disabled = !isReloading(1);
  /* the spotter can only correct from a fall of shot: the button
     wakes up once a round has actually landed this round. A
     commander UAV still en route has no eyes yet and an RTB'd
     UAV has none left, so the button stays dead in those two
     states — but LOW FUEL is not one of them: even on low fuel
     the UAV can still see from the sky, so it keeps correcting
     until it actually RTBs. A ground spotter who has been
     SPOTTED BY THE ENEMY (killed or fled) also leaves the
     button dead for the rest of the round. A mark from a
     PASSING SQUAD or a SQUAD MARK leaves it dead for the whole
     round too: neither source is a spotter watching the fall of
     shot. DANGER CLOSE is the one exception to that: its mark is
     a squad mark, but the pinned squad stays on the radio for a
     limited check — Ask spotter there only says whether the last
     round landed in the right place or not. Labels say why. */
  var sb = $("gameSpotterBtn");
  var uavOut = game.markSrc && game.markSrc.id === "uav" && game.uavState !== "station" && game.uavState !== "low";
  var smokeMission = game.type && game.type.id === "smoke";   /* no spotter correction on a smoke mission */
  var dcMission = game.type && game.type.id === "dangerClose";   /* squad mark, but the limited right-place check stays live */
  var noSpotterMark = isNoSpotterMarkSrc(game.markSrc) && !dcMission;   /* PASSING SQUAD / SQUAD MARK: Ask spotter disabled all round (danger close excepted) */
  /* the spotter corrects the SELECTED / ACTIVE mortar, from THAT
     mortar's OWN last landed round: the button is live only when
     the active mortar itself has a fall of shot this round — the
     other mortar's rounds never unlock or feed its correction —
     and its label names the mortar it will correct */
  var sAi = activeMortar();
  var sHas = !!lastImpactFor(sAi);
  sb.disabled = !live || !sHas || !!uavOut || !!smokeMission || !!game.spotterCompromised || !!noSpotterMark;
  sb.textContent = smokeMission ? "👁️ No spotter on a smoke mission"
    : dcMission
    ? "👁️ Ask spotter — pinned squad: right place or not · Mortar " + (sAi + 1) + (sHas ? "" : " (not fired yet)")
    : noSpotterMark
    ? (game.markSrc.id === "passing" ? "🚫 Ask spotter disabled — Passing Squad mark" : "🚫 Ask spotter disabled — Squad Mark")
    : game.spotterCompromised
    ? (game.spotterFate === "killed" ? "🚫 Spotter killed — no correction" : "🚫 Spotter fled — no correction")
    : (game.markSrc && game.markSrc.id === "uav")
    ? (game.uavState === "rtb" ? "👁️ UAV RTB — no spotter correction"
      : game.uavState === "travel" ? "👁️ UAV en route — no spotter yet"
      : game.uavState === "low" ? "👁️ Ask spotter — correct Mortar " + (sAi + 1) + " · UAV low fuel, still watching" + (sHas ? "" : " (not fired yet)")
      : "👁️ Ask spotter — correct Mortar " + (sAi + 1) + (sHas ? "" : " (not fired yet)"))
    : (game.markSrc && game.markSrc.id === "laser")
    ? "👁️ Ask spotter — laser designator · correct Mortar " + (sAi + 1) + (sHas ? "" : " (not fired yet)")
    : (game.markSrc && game.markSrc.id === "infantry")
    ? "👁️ Ask spotter — regular infantry · correct Mortar " + (sAi + 1) + (sHas ? "" : " (not fired yet)")
    : (game.markSrc && game.markSrc.id === "sniper")
    ? "👁️ Ask spotter — sniper team · correct Mortar " + (sAi + 1) + (sHas ? "" : " (not fired yet)")
    : "👁️ Ask spotter — correct Mortar " + (sAi + 1) + (sHas ? "" : " (not fired yet)");
  /* REQUEST CHECK ON MARK — the Squad Mark / Passing Squad
     rounds' own aid, sitting under Ask spotter: the button only
     SHOWS on those rounds (dedicated-spotter rounds use Ask
     spotter; smoke and danger close are excluded, see
     isCheckMarkRound). It is live from the round's start — a
     check of the mark needs no fall of shot — and dies once
     used: while the checker travels it names who is coming,
     and after the report it stays as the spent label. */
  var cbk = $("gameCheckBtn");
  if (cbk){
    var checkRound = isNoSpotterMarkSrc(game.markSrc) && game.type && game.type.id !== "smoke" && game.type.id !== "dangerClose";
    cbk.style.display = (game.active && checkRound) ? "" : "none";
    var chk = game.check;
    cbk.disabled = !live || !!game.checkUsed;
    cbk.textContent = !game.checkUsed
      ? "📡 Request check on mark — UAV / infantry / vehicle, once per round"
      : (chk && chk.phase === "travel")
      ? "📡 Check en route — " + chk.kind.label + " moving in to check the mark…"
      : "✓ Mark checked — " + (chk ? chk.kind.label : "") + " · one per round, used";
  }
}
function updateAmmoUI(){
  /* the pips show the SELECTED mortar's magazine for the SELECTED
     shell; the line under them lists every mortar x shell magazine
     (HE and Smoke are separate, and each mortar's are its own) */
  var ai = activeMortar(), cur = ammoOf(ai);
  var pips = "";
  for (var i = 0; i < 5; i++) pips += i < cur ? "●" : "○";
  $("gameAmmoPips").textContent = pips;
  $("gameAmmoLab").textContent = "Ammo — M" + (ai + 1) + " · " + shellName();
  $("gameAmmoText").textContent = cur + " / 5 " + shellName() + " rounds" +
    (isReloading(ai) ? " · reloading…" : (cur === 0 ? " · EMPTY" : ""));
  var both = "MORTAR 1 · HE " + ammoOf(0, "he") + " · SMOKE " + ammoOf(0, "smoke");
  if (mortars[1]) both += "\nMORTAR 2 · HE " + ammoOf(1, "he") + " · SMOKE " + ammoOf(1, "smoke");
  $("gameAmmoBoth").textContent = both;
  $("shellHeCount").textContent = "M" + (ai + 1) + ": " + ammoOf(ai, "he") + " / 5";
  $("shellSmokeCount").textContent = "M" + (ai + 1) + ": " + ammoOf(ai, "smoke") + " / 5";
  $("shellHeBtn").classList.toggle("active", game.shell === "he");
  $("shellSmokeBtn").classList.toggle("active", game.shell === "smoke");
  $("shellHeBtn").setAttribute("aria-pressed", game.shell === "he" ? "true" : "false");
  $("shellSmokeBtn").setAttribute("aria-pressed", game.shell === "smoke" ? "true" : "false");
  /* FIRE is separate per mortar: each button is labelled with
     its mortar, the selected shell and THAT mortar's own count
     for that shell — Mortar 2's button only appears when a
     second mortar is placed */
  $("gameFireBtn").textContent = "💥 FIRE MORTAR 1 · " + shellName().toUpperCase() + " " + ammoOf(0) + "/5";
  var fb2u = $("gameFire2Btn");
  if (fb2u){
    fb2u.style.display = mortars[1] ? "" : "none";
    fb2u.textContent = "💥 FIRE MORTAR 2 · " + shellName().toUpperCase() + " " + ammoOf(1) + "/5";
    var fbsu = $("fireBtns"); if (fbsu) fbsu.classList.toggle("single", !mortars[1]);
  }
  /* RELOAD is separate per mortar too: each RELOAD button is
     labelled with its mortar, the selected shell and THAT
     mortar's own count for that shell — Mortar 2's column only
     appears when a second mortar is placed */
  $("gameReloadBtn").textContent = "🔄 RELOAD MORTAR 1 · " + shellName().toUpperCase() + " " + ammoOf(0) + "/5";
  var rb2u = $("gameReload2Btn");
  if (rb2u) rb2u.textContent = "🔄 RELOAD MORTAR 2 · " + shellName().toUpperCase() + " " + ammoOf(1) + "/5";
  var rc2u = $("reloadCol2");
  if (rc2u) rc2u.style.display = mortars[1] ? "" : "none";
  var rbsu = $("reloadBtns"); if (rbsu) rbsu.classList.toggle("single", !mortars[1]);
}
function updateTargetStatus(){
  var t = game.type;
  if (!t){
    $("gameTypeLabel").textContent = "TARGET —";
    $("gameTypeDesc").textContent = "—";
    var _dsc0 = $("gameTypeDescCard"); if (_dsc0) _dsc0.textContent = "—";
    $("gameTimerRow").style.display = "none";
    $("gameHpRow").style.display = "none";
    var dcRow0 = $("gameDcRow"); if (dcRow0) dcRow0.style.display = "none";
    var dcDet0 = $("gameDcDetail"); if (dcDet0) dcDet0.style.display = "none";
    $("gameEmpRow").style.display = "none";
    var ed0 = $("gameEmpDetail"); if (ed0) ed0.style.display = "none";
    $("gameDefRow").style.display = "none";
    $("gameVehRow").style.display = "none";
    $("gameUavRow").style.display = "none";
    return;
  }
  $("gameTypeLabel").textContent = t.label;
  /* one glanceable line: who called the mark in (its accuracy
     varies by source — the exact error is never shown), the
     target's own note, plus this round's randomly rolled
     surroundings. The hit rings stay hidden — no metres quoted. */
  var sur = [emplacementText(), defendersText(), vehiclesText()].filter(function(x){ return x; }).join(" ");
  var scat = (t.id === "infantry" || t.id === "infantryHold") ? infantryScatterText() : "";
  var smokeNote = t.id === "smoke" ? smokeTimeoutText() : "";
  var dcNote = t.id === "dangerClose" ? (dangerCloseText() + " " + dcCallText()) : "";
  var _descText = markText() + " " + t.desc + (scat ? " " + scat : "") + (smokeNote ? " " + smokeNote : "") + (dcNote ? " " + dcNote : "") + (sur ? " " + sur : "");
  $("gameTypeDesc").textContent = _descText;
  var _dsc1 = $("gameTypeDescCard"); if (_dsc1) _dsc1.textContent = _descText;
  if (t.category === "dangerclose"){
    /* no timeout row and no shared HP row: the mission's clock
       is the friendly squads' own health, on the Friendlies row
       below */
    $("gameTimerRow").style.display = "none";
    $("gameHpRow").style.display = "none";
  } else if (t.category === "timed" || t.category === "smoke"){
    $("gameTimerRow").style.display = "";
    $("gameHpRow").style.display = "none";
    var bar = $("gameTimerBar");
    if (t.category === "smoke" && !game.smokeTimed){
      /* untimed smoke mission: no clock to drain — the row says so
         instead of counting down, and the bar stays full */
      bar.style.width = "100%";
      bar.style.background = "var(--green)";
      $("gameTimerText").textContent = "No timeout";
    } else {
      var pct = Math.max(0, game.timeLeft / game.timeMax * 100);
      bar.style.width = pct + "%";
      bar.style.background = game.timeLeft <= 5 ? "var(--red)" : (game.timeLeft <= 10 ? "var(--orange)" : "var(--green)");
      $("gameTimerText").textContent = game.timeLeft.toFixed(1) + " s left";
    }
  } else if (t.id === "infantryHold" || t.id === "vehicleStatic"){
    /* scattered health targets have NO shared HP row: an infantry
       target's state is its men still up (Defenders-style row
       below) and a stationary vehicle target's state is each
       vehicle's own HP (Vehicles row + per-vehicle list below) */
    $("gameTimerRow").style.display = "none";
    $("gameHpRow").style.display = "none";
  } else {
    $("gameTimerRow").style.display = "none";
    $("gameHpRow").style.display = "";
    $("gameHpBar").style.width = Math.max(0, game.hp / game.maxHp * 100) + "%";
    $("gameHpText").textContent = game.hp + " / " + game.maxHp + " HP";
  }
  /* danger close: the FRIENDLIES row — combined bar over every
     friendly squad's HP, the total as the value, and a detail
     line with each squad's own HP and the live drain rate, so
     the bleeding can be watched squad by squad */
  if (t.category === "dangerclose" && game.dcFriendlies && game.dcFriendlies.length){
    $("gameDcRow").style.display = "";
    var dcHp = 0, dcMax = 0, dcParts = [];
    for (var dci = 0; dci < game.dcFriendlies.length; dci++){
      dcHp += game.dcFriendlies[dci].hp; dcMax += game.dcFriendlies[dci].maxHp;
      dcParts.push("SQUAD " + (dci + 1) + " " + Math.max(0, Math.round(game.dcFriendlies[dci].hp)) + " HP");
    }
    $("gameDcBar").style.width = (dcMax > 0 ? Math.max(0, dcHp / dcMax * 100) : 0) + "%";
    $("gameDcText").textContent = Math.max(0, Math.round(dcHp)) + " / " + dcMax + " HP";
    var dcd = $("gameDcDetail");
    if (dcd){
      dcd.style.display = "";
      var eMen = dcEnemyMenAlive(), eSq = dcEnemySquadsAlive();
      dcd.textContent = dcParts.join(" · ") + (eMen > 0
        ? " · bleeding " + dcDrainRate().toFixed(2).replace(/\.?0+$/, "") + " HP/s — " + eMen + (eMen === 1 ? " enemy man" : " enemy men") + " up in " + eSq + (eSq === 1 ? " squad" : " squads") + " (0.02 HP/s per man)"
        : " · bleeding stopped");
    }
  } else {
    var dcRowX = $("gameDcRow"); if (dcRowX) dcRowX.style.display = "none";
    var dcDetX = $("gameDcDetail"); if (dcDetX) dcDetX.style.display = "none";
  }
  /* the emplacements dug in near a FOB / Hideout: combined HP bar
     plus a per-variant readout, so TOW / MANPAD / each Mortar pit
     can be tracked separately (two Mortar pits list individually) */
  if (game.emplacements && game.emplacements.length){
    $("gameEmpRow").style.display = "";
    var eHp = 0, eMax = 0, eParts = [], mSeen = 0, mTotal = 0;
    for (var ex = 0; ex < game.emplacements.length; ex++) if (game.emplacements[ex].variant.id === "mortar") mTotal++;
    for (var ei2 = 0; ei2 < game.emplacements.length; ei2++){
      var ee2 = game.emplacements[ei2];
      eHp += ee2.hp; eMax += ee2.maxHp;
      var lab = ee2.variant.short;
      if (ee2.variant.id === "mortar" && mTotal > 1){ mSeen++; lab = "MORTAR " + mSeen; }
      eParts.push(lab + " " + (ee2.hp > 0 ? ee2.hp : "down"));
    }
    $("gameEmpBar").style.width = (eMax > 0 ? Math.max(0, eHp / eMax * 100) : 0) + "%";
    $("gameEmpText").textContent = emplacementsAlive() + " / " + game.emplacements.length + " up";
    var ed = $("gameEmpDetail");
    if (ed){ ed.style.display = ""; ed.textContent = eParts.join(" · "); }
  } else {
    $("gameEmpRow").style.display = "none";
    var ed2 = $("gameEmpDetail"); if (ed2) ed2.style.display = "none";
  }
  /* surrounding squads: how many of this round's men are still up.
     An INFANTRY TARGET reuses this row for its own scattered men —
     its state IS the men still up, counted per man, not a shared
     HP pool (the row's label switches to Infantry for that) */
  var defLab = $("gameDefRow").querySelector(".gtlab");
  if (t.id === "dangerClose" && game.dcEnemySquads && game.dcEnemySquads.length){
    /* danger close reuses this row for the ENEMY: men still up
       across the surrounding squads, and how many squads are
       still pressing (each one keeps the friendlies bleeding) */
    if (defLab) defLab.textContent = "Enemy";
    $("gameDefRow").style.display = "";
    var deTot = dcEnemyMenTotal(), deUp = dcEnemyMenAlive();
    $("gameDefBar").style.width = (deTot > 0 ? deUp / deTot * 100 : 0) + "%";
    var deHalted = 0;
    for (var dhi = 0; dhi < game.dcEnemySquads.length; dhi++){
      if (!game.dcEnemySquads[dhi].halted) continue;
      var dhAny = false;
      for (var dhm = 0; dhm < game.dcEnemySquads[dhi].men.length; dhm++) if (game.dcEnemySquads[dhi].men[dhm].alive) dhAny = true;
      if (dhAny) deHalted++;
    }
    $("gameDefText").textContent = deUp + " / " + deTot + " men up · " +
      dcEnemySquadsAlive() + " / " + game.dcEnemySquads.length + (game.dcEnemySquads.length === 1 ? " squad" : " squads") + " pressing" +
      (deHalted ? " · " + deHalted + (deHalted === 1 ? " squad" : " squads") + " stopped — hit" : "");
  } else if (game.defenders && game.defenders.length){
    if (defLab) defLab.textContent = "Defenders";
    $("gameDefRow").style.display = "";
    var da = defendersAlive();
    $("gameDefBar").style.width = (da / game.defenders.length * 100) + "%";
    $("gameDefText").textContent = da + " / " + game.defenders.length + " men · " +
      game.defSquads.length + (game.defSquads.length === 1 ? " squad" : " squads") + " (" + game.defSquads.join(" + ") + ")";
  } else if (game.infMen && game.infMen.length && (t.id === "infantry" || t.id === "infantryHold")){
    if (defLab) defLab.textContent = "Infantry";
    $("gameDefRow").style.display = "";
    var ia = infTargetAlive();
    $("gameDefBar").style.width = (ia / game.infMen.length * 100) + "%";
    $("gameDefText").textContent = ia + " / " + game.infMen.length + " men up · " +
      (game.infSquads ? game.infSquads.length : 0) + ((game.infSquads && game.infSquads.length === 1) ? " squad" : " squads") +
      (game.infSquads ? " (" + game.infSquads.join(" + ") + ")" : "") +
      (t.id === "infantry" && game.infHalted ? " · stopped — hit by mortar" : "");
  } else $("gameDefRow").style.display = "none";
  /* parked vehicles (FOB / Cache / Hideout): how many are still up.
     A VEHICLE TARGET reuses this row for its own 1–3 vehicles —
     each stationary vehicle carries its own HP, listed per
     vehicle on the detail line under the row */
  if (game.vehicles && game.vehicles.length){
    $("gameVehRow").style.display = "";
    var va2 = vehiclesAlive(), nTr2 = 0, nCa2 = 0;
    for (var vix = 0; vix < game.vehicles.length; vix++){
      if (!game.vehicles[vix].alive) continue;
      if (game.vehicles[vix].kind === "truck") nTr2++; else nCa2++;
    }
    $("gameVehBar").style.width = (va2 / game.vehicles.length * 100) + "%";
    $("gameVehText").textContent = va2 + " / " + game.vehicles.length + " up · " + nTr2 + " truck · " + nCa2 + " car";
  } else if (game.vehTgt && game.vehTgt.length && t.id === "vehicleStatic"){
    $("gameVehRow").style.display = "";
    var vtUp = vehTargetAlive();
    var vtHp = 0, vtMax = 0, vtParts = [];
    for (var vtx = 0; vtx < game.vehTgt.length; vtx++){
      vtHp += game.vehTgt[vtx].hp; vtMax += game.vehTgt[vtx].maxHp;
      vtParts.push("VEHICLE " + (vtx + 1) + " " + (game.vehTgt[vtx].hp > 0 ? game.vehTgt[vtx].hp + " HP" : "down"));
    }
    $("gameVehBar").style.width = (vtMax > 0 ? Math.max(0, vtHp / vtMax * 100) : 0) + "%";
    $("gameVehText").textContent = vtUp + " / " + game.vehTgt.length + " up · own HP each";
    var ved = $("gameEmpDetail");
    if (ved){ ved.style.display = ""; ved.textContent = vtParts.join(" · "); }
  } else $("gameVehRow").style.display = "none";
  updateUavUI();
}
function stopGameTimer(){
  if (gameTimer){ clearInterval(gameTimer); gameTimer = null; }
}
/* cancel ONE mortar's reload (its batches already loaded stay in
   its magazine); cancelReload() cancels BOTH — used when a round
   ends or the game closes */
function cancelReloadFor(idx){
  var st = reloadStates[idx];
  if (st && st.timer){ clearInterval(st.timer); st.timer = null; }
  if (reloadTimers[idx]){ clearInterval(reloadTimers[idx]); reloadTimers[idx] = null; }
  reloadStates[idx] = null;
  var tx = reloadTxtEl(idx); if (tx) tx.textContent = "";
  syncReloadFlag();
}
function cancelReload(){
  cancelReloadFor(0); cancelReloadFor(1);
  var sb = $("gameSkipBatchBtn"); if (sb) sb.disabled = true;
  var sb2 = $("gameSkipBatch2Btn"); if (sb2) sb2.disabled = true;
}
/* reload, SEPARATE per mortar: RELOAD MORTAR 1 fills only Mortar
   1's magazine and RELOAD MORTAR 2 only Mortar 2's, each on its
   OWN timer — both can be reloading at the same time, and neither
   blocks the other's FIRE or RELOAD. Shells load 2 AT A TIME;
   every batch of 2 takes 5–10 s (rolled per batch) and the pair
   lands in that mortar's magazine together when its batch
   finishes. A full reload from empty is 3 batches (2 + 2 + 1),
   roughly 15–30 s. A moving target's timeout keeps running. */
function startReloadFor(rIdx){
  if (!game.active || isReloading(rIdx) || !mortars[rIdx] || ammoOf(rIdx, game.shell) >= 5) return;
  /* this reload belongs to THIS mortar's magazine for the shell
     selected NOW — captured here, so switching mortar, dial tab
     or shell afterwards can never credit the wrong magazine */
  var rShell = game.shell;
  var needed = 5 - ammoOf(rIdx, rShell);
  var batchesTotal = Math.ceil(needed / 2);
  var loaded = 0, batchIdx = 0;
  var st = { needed: needed, loaded: 0, batchesTotal: batchesTotal, mIdx: rIdx, shell: rShell, timer: null };
  reloadStates[rIdx] = st; syncReloadFlag();
  var txtEl = reloadTxtEl(rIdx);
  refreshGameControls(); updateAmmoUI();
  function nextBatch(){
    if (reloadStates[rIdx] !== st) return;
    if (loaded >= needed){
      reloadStates[rIdx] = null; syncReloadFlag();
      txtEl.textContent = "Reload complete — Mortar " + (rIdx + 1) + " " + shellName(rShell) + ": " + needed + (needed === 1 ? " round" : " rounds") + " loaded in " + batchesTotal + (batchesTotal === 1 ? " batch" : " batches") + " (2 shells per 5–10 s).";
      updateAmmoUI(); refreshGameControls();
      return;
    }
    batchIdx++; st.batchIdx = batchIdx;
    var batchSize = Math.min(2, needed - loaded);
    var total = RELOAD_MIN + Math.random() * (RELOAD_MAX - RELOAD_MIN);
    var left = total;
    txtEl.textContent = "RELOADING Mortar " + (rIdx + 1) + " " + shellName(rShell) + "… batch " + batchIdx + "/" + batchesTotal + " · " + batchSize + (batchSize === 1 ? " shell" : " shells") + " in " + left.toFixed(1) + " s · " + loaded + "/" + needed + " rounds in";
    st.timer = setInterval(function(){
      if (reloadStates[rIdx] !== st){ clearInterval(st.timer); st.timer = null; return; }
      left -= 0.1;
      if (left <= 0){
        clearInterval(st.timer); st.timer = null; reloadTimers[rIdx] = null;
        setAmmoOf(rIdx, rShell, ammoOf(rIdx, rShell) + batchSize);
        loaded += batchSize;
        st.loaded = loaded;
        updateAmmoUI();
        nextBatch();
      } else {
        txtEl.textContent = "RELOADING Mortar " + (rIdx + 1) + " " + shellName(rShell) + "… batch " + batchIdx + "/" + batchesTotal + " · " + batchSize + (batchSize === 1 ? " shell" : " shells") + " in " + left.toFixed(1) + " s · " + loaded + "/" + needed + " rounds in";
      }
    }, 100);
    reloadTimers[rIdx] = st.timer;
  }
  nextBatch();
}
/* the R key keeps its old meaning: reload the SELECTED mortar */
function startReload(){ startReloadFor(activeMortar()); }
/* Skip next batch, SEPARATE per mortar: stops ONLY that mortar's
   reload HERE, at the shells already loaded, instead of always
   topping its magazine up to 5. After one finished batch the
   magazine holds 2 shells, after two it holds 4 — a partial 2–4
   round magazine that mortar can fire with straight away; its own
   RELOAD can be pressed again later to top up. The other mortar's
   reload, if one is running, keeps going untouched. */
function skipNextBatchFor(sIdx){
  if (!game.active || !isReloading(sIdx)) return;
  var st = reloadStates[sIdx];
  if (st && st.timer){ clearInterval(st.timer); st.timer = null; }
  reloadTimers[sIdx] = null;
  var sShell = st ? st.shell : game.shell;
  var skipped = st ? (st.needed - st.loaded) : 0;
  reloadStates[sIdx] = null; syncReloadFlag();
  var nowN = ammoOf(sIdx, sShell);
  reloadTxtEl(sIdx).textContent = "Reload stopped — Mortar " + (sIdx + 1) + " skipped the next batch (" + skipped + (skipped === 1 ? " shell" : " shells") +
    " not loaded). Mortar " + (sIdx + 1) + "'s " + shellName(sShell) + " magazine holds " + nowN + " / 5 rounds — FIRE with what's loaded, or RELOAD MORTAR " + (sIdx + 1) + " again to top up to 5.";
  updateAmmoUI(); refreshGameControls();
  if (game.active && !game.over)
    setGameFeedback("", "Reload stopped at <b>" + nowN + " / 5 " + shellName(sShell) + " rounds</b> on Mortar " + (sIdx + 1) + " — no need to always wait for a full 5. Dial and FIRE with what's loaded.");
}
function skipNextBatch(){ skipNextBatchFor(activeMortar()); }
/* ================= RANGE HINT — FROM THE RED TARGET MARK =================
   The game's range is ALWAYS measured from the active mortar to the
   RED TARGET mark the player placed on the map (the shared `target`
   marker) — NOT to the orange game target (game.targetFrac). That is
   the range shown on the status card, stored in game.range, and used
   for game.correctMils — the range to DIAL for the target line: the
   mortars themselves fire where their arrows face, so this hint is
   the range that lands the round on the mark only once the arrow is
   lined up on it. Moving the red mark (tap, drag, typed ref or Swap),
   moving the mortar, or changing map/scale re-measures it, because
   every one of those goes through render(), which calls this. The
   orange diamond's own position never feeds the hint: if the red
   mark sits off the diamond, the hint follows the red mark. */
function refreshGameHintFromMark(){
  if (currentMap[1] === 0) return;
  var ai = activeMortar();
  var mp = posMeters(mortars[ai]), tp = posMeters(targetFor(ai));
  /* in game the range is entered in steps of 10, so the hint is
     rounded to the nearest 10 — the last digit is always 0
     (544 m shows as 540), and the correct elevation is worked out
     from that same stepped range so hint and dial check agree */
  var r = Math.round(Math.hypot(tp.x - mp.x, tp.y - mp.y) / 10) * 10;
  game.range = r;
  var e = elevation(r, 0);
  if (e) game.correctMils = e.mils;
  $("gameRangeHint").textContent = fmt(r);
  $("gameTargetInfo").textContent = (ai === 1 ? "TARGET 2 mark: " : "red mark: ") + fracToRef(targetFor(ai)).compact + " · from " +
    (mortars[1] ? "Mortar " + (ai + 1) : "Mortar") + " " + fracToRef(mortars[ai]).compact;
}
/* one tick of a moving-target round: the target moves, the range (and
   so the correct elevation) is worked out again from where it is now,
   and the timeout counts down — at zero the target escapes */
/* one tick of a danger-close mission: the clock is the friendly
   squads' health. Each friendly squad bleeds at dcDrainRate() —
   DC_DRAIN_PER_MAN (0.02) HP per second for EACH enemy MAN still
   up, spread over the tick — so 3 men up drain only 0.06 HP/s
   (about 1,670 s to overrun), one full 8-man squad drains 0.16
   HP/s (about 625 s) and 16 men drain 0.32 HP/s (about 310 s).
   Every man killed slows the bleeding a little. The enemy
   squads keep pressing in toward the friendlies meanwhile, and
   if any friendly squad's HP reaches 0 it is overrun and the
   mission fails. */
function dcTick(dt){
  game.dcElapsed += dt;
  if (game.dcFriendlies && game.dcFriendlies.length){
    var drain = dcDrainRate() * dt;   /* 0.02 HP/s per enemy man still up — fewer men pressing, slower bleed */
    for (var dti = 0; dti < game.dcFriendlies.length; dti++)
      game.dcFriendlies[dti].hp = Math.max(0, game.dcFriendlies[dti].hp - drain);
  }
  updateMarkerTransforms();   /* the enemy squads press in; friendly men fade as their squad bleeds */
  updateTargetStatus();
  for (var dtj = 0; dtj < game.dcFriendlies.length; dtj++){
    if (game.dcFriendlies[dtj].hp <= 0){
      stopGameTimer();
      game.over = true; game.fired = true; game.streak = 0;
      setGameFeedback("miss", "SQUAD OVERRUN — friendly squad " + (dtj + 1) + " was wiped out where it stood, with " +
        dcEnemyMenAlive() + " enemy still up around the position. The bleeding only stops when the enemy squads go down — work faster, and closer. Streak reset — press <b>Next target</b>.");
      gameScoreText(); refreshGameControls();
      return;
    }
  }
}
function gameTick(){
  if (!game.active || game.over || !game.type) return;
  if (game.type.category === "dangerclose"){ dcTick(0.2); return; }
  if (game.type.category !== "timed" && game.type.category !== "smoke") return;
  if (game.type.category === "smoke" && !game.smokeTimed) return;   /* untimed smoke: no clock, nothing moves */
  var dt = 0.2;
  game.timeLeft -= dt;
  if (game.timeLeft <= 0){
    game.timeLeft = 0;
    /* the escape distance is the ORANGE target's own distance — the
       hint (game.range) is the red-mark range and must not be used here */
    var escR = game.targetFrac ? Math.round(Math.hypot(
      posMeters(game.targetFrac).x - posMeters(mortars[activeMortar()]).x,
      posMeters(game.targetFrac).y - posMeters(mortars[activeMortar()]).y)) : game.range;
    refreshGameHintFromMark();
    updateTargetStatus();
    updateMarkerTransforms();   /* a timed-out smoke squad has reached the smoke point (factor 0) */
    stopGameTimer();
    game.over = true; game.fired = true; game.streak = 0;
    setGameFeedback("miss", game.type.id === "smoke"
      ? "TIME OUT — the green squad reached the point and advanced without its smoke screen. The point was at " +
        fmt(escR) + " m. Streak reset — press <b>Next target</b>."
      : "TIME OUT — the " + game.type.short.toLowerCase() + " got away. It escaped at " +
        fmt(escR) + " m. Streak reset — press <b>Next target</b>.");
    gameScoreText(); refreshGameControls();
    return;
  }
  /* a moving infantry target that has been HIT by a mortar burst
     (game.infHalted, set in resolveImpact) stops moving here:
     its dots stay where the burst caught them for the rest of
     the round — the timeout above still counts down */
  if (game.velM && game.targetFrac && !game.infHalted){
    var B = boardMeters(), ai = activeMortar();
    var tp = posMeters(game.targetFrac);
    tp.x += game.velM.x * dt; tp.y += game.velM.y * dt;
    if (tp.x < B * 0.02 || tp.x > B * 0.98){ game.velM.x = -game.velM.x; tp.x = Math.min(B * 0.98, Math.max(B * 0.02, tp.x)); }
    if (tp.y < B * 0.02 || tp.y > B * 0.98){ game.velM.y = -game.velM.y; tp.y = Math.min(B * 0.98, Math.max(B * 0.02, tp.y)); }
    game.targetFrac = { x: tp.x / B, y: tp.y / B };
    /* the mover bounces to stay in mortar reach of the ORANGE target's
       own position — measured locally here, because game.range is the
       red-mark range and does not move with the orange target. The
       hint itself only changes when the red mark or the mortar moves. */
    var mpT = posMeters(mortars[ai]);
    var moverR = Math.hypot(tp.x - mpT.x, tp.y - mpT.y);
    if (moverR > 1450 || moverR < 120){ game.velM.x = -game.velM.x; game.velM.y = -game.velM.y; }
    updateMarkerTransforms();
  }
  /* timed smoke: the friendly green squad advances toward the
     smoke icon with the clock — reposition it every tick */
  if (game.type.category === "smoke" && game.smokeSquad && game.smokeSquad.length)
    updateMarkerTransforms();
  updateTargetStatus();
}
function startGameTimer(){
  stopGameTimer();
  /* an untimed smoke mission starts no timer at all: no clock to
     count down and no squad moving on one. A danger-close
     mission always ticks: its clock is the friendly health
     drain and the enemy closing in. */
  if (game.type && (game.type.category === "timed" || (game.type.category === "smoke" && game.smokeTimed) || game.type.category === "dangerclose"))
    gameTimer = setInterval(gameTick, 200);
}
function newGameRound(){
  stopGameTimer();
  stopUavTimer();
  cancelReload();
  clearFireCooldown();
  shotSeq++; salvoSeq++; gameGen++; game.flying = false; hideFx();   /* any shell or salvo still going belongs to the old round */
  game.revealed = false; game.laserShown = false; clearLaserTimer(); clearLastImpacts();   /* fresh round: no reveal, no lased mark, no fall of shot to correct from yet — for either mortar */
  resetCheck();   /* fresh round: no checker travelling, no checked mark, and the one check per round is unspent again */
  if (currentMap[1] === 0){
    game.active = false; game.targetFrac = null; game.type = null; game.defenders = []; game.defSquads = []; game.vehicles = [];
    game.emplacements = []; game.markSrc = null; game.markDx = 0; game.markDy = 0; game.spotterDx = 0; game.spotterDy = 0;
    game.uavState = null; game.uavFuel = 0;
    game.smokeTimed = false; clearSmokeSquad();
    clearDangerClose();
    gameTgtG.style.display = "none"; gameRingsG.style.display = "none"; gameDefG.style.display = "none"; gameVehG.style.display = "none"; gameEmpG.style.display = "none"; gameUavG.style.display = "none"; gameLaserG.style.display = "none"; gameSpotterLine.style.display = "none"; gameLasedG.style.display = "none"; gameLasedLine.style.display = "none"; gameInfG.style.display = "none"; gameVehTgtG.style.display = "none"; gameSmokeSquadG.style.display = "none"; gameDcFriendG.style.display = "none"; gameDcEnemyG.style.display = "none";
    $("gameRangeHint").textContent = "—";
    $("gameTargetInfo").textContent = "red mark: —";
    $("gameCalcRange").value = ""; updateGameCalc();
    setGameFeedback("miss", "This map has no grid scale, so there is no range to train on — pick a scaled map first.");
    $("gameFireBtn").disabled = true; $("wsUpBtn").disabled = true; $("wsDownBtn").disabled = true;
    $("gameReloadBtn").disabled = true; $("gameSkipBtn").disabled = true;
    var nrb2 = $("gameReload2Btn"); if (nrb2) nrb2.disabled = true;
    $("gameSkipBatchBtn").disabled = true; $("gameSpotterBtn").disabled = true;
    var nsb2 = $("gameSkipBatch2Btn"); if (nsb2) nsb2.disabled = true;
    updateTargetStatus(); updateAmmoUI();
    return;
  }
  var ai = activeMortar();
  var mp = posMeters(mortars[ai]), B = boardMeters();
  var frac = null, range = 0, tries = 0;
  while (!frac && tries < 40){
    tries++;
    range = (Math.floor(Math.random() * 121) + 20) * 10;   /* 200–1400 m, in the game's 10 m steps */
    var brg = Math.random() * 2 * Math.PI;
    var tx = mp.x + range * Math.sin(brg), ty = mp.y - range * Math.cos(brg);
    if (tx > B * 0.02 && tx < B * 0.98 && ty > B * 0.02 && ty < B * 0.98)
      frac = { x: tx / B, y: ty / B };
  }
  if (!frac){ frac = { x: Math.min(.97, mortars[ai].x + .1), y: mortars[ai].y }; }
  /* the proposed `range` above only places the orange diamond and is
     then discarded — the game's shown/used range is measured from
     the mortar to the RED TARGET mark (refreshGameHintFromMark) */
  game.targetFrac = frac;
  game.fired = false;
  game.over = false;
  game.infHalted = false;   /* fresh round: a moving infantry target moves again until a burst hits it */
  /* a random target type each round: a mover on a timeout, or a hard
     target with health. Moving targets get a velocity on the board. */
  var type = GAME_TYPES[Math.floor(Math.random() * GAME_TYPES.length)];
  game.type = type;
  game.smokeTimed = false; clearSmokeSquad();   /* only a timed smoke round below re-rolls these */
  clearDangerClose();                            /* only a danger-close round below re-rolls these */
  if (type.category === "timed"){
    game.timeMax = type.time; game.timeLeft = type.time;
    game.hp = 0; game.maxHp = 0;
    var va = Math.random() * 2 * Math.PI;
    game.velM = { x: type.speed * Math.cos(va), y: type.speed * Math.sin(va) };
  } else if (type.category === "smoke"){
    /* smoke mission: a fixed point — the point never moves and
       there is no HP. Its clock is VARIED, rolled right here:
       some smoke missions have NO timeout at all (the squad
       holds and waits, no timer, no moving squad), the rest run
       on a varied timed advance — and a timed mission gets the
       friendly squad on the map as green dots moving toward
       the smoke point as the clock runs down */
    if (Math.random() < SMOKE_NO_TIMEOUT_CHANCE){
      game.smokeTimed = false;
      game.timeMax = 0; game.timeLeft = 0;
    } else {
      game.smokeTimed = true;
      var smokeDur = SMOKE_DURATIONS[Math.floor(Math.random() * SMOKE_DURATIONS.length)];
      game.timeMax = smokeDur; game.timeLeft = smokeDur;
      makeSmokeSquad();
    }
    game.hp = 0; game.maxHp = 0; game.velM = null;
  } else if (type.category === "dangerclose"){
    /* danger-close mission: the position itself never moves and
       there is no shared HP and no timeout — the clock is the
       friendly squads' own health (100 HP each, draining per
       enemy man still up) and the enemy closing in. Roll both
       sides now: 1–2 friendly squads of 1–5 men in the centre,
       2–5 enemy squads surrounding them. */
    game.hp = 0; game.maxHp = 0;
    game.timeLeft = 0; game.timeMax = 0; game.velM = null;
    makeDangerClose();
  } else {
    game.hp = type.hp; game.maxHp = type.hp;
    game.timeLeft = 0; game.timeMax = 0; game.velM = null;
  }
  /* surroundings are rolled fresh for EVERY round — random 1–2
     squads of a random 1–8 men at random positions around a built
     position, and (FOB / Cache / Hideout only) a random 1–2 trucks
     + 1–2 cars / jeeps parked at a random side — so no two rounds
     around the same target type look the same. A FOB / Hideout
     also usually gets a VARIED set of emplacements dug in near
     it: 2–5 of them from a rolled loadout (max 5 — TOW, AA MANPAD, MG
     Nest and Mortar pit, with up to two Mortar pits; the 5-max
     roll is TOW + AA + MG + 2× Mortar) — but sometimes NONE at
     all (about 1 round in 4 rolls a bare FOB / Hideout). And the mark itself is
     rolled too: who
     called the target in sets how far the orange diamond can sit
     from the real target this round. */
  makeDefenders(type);
  makeVehicles(type);
  makeEmplacements(type);
  rollMark();
  if (type.id === "smoke"){
    /* a smoke mission is always the requesting squad's own mark:
       the squad marked the point it wants smoked itself — a squad
       mark, never a commander UAV, so no UAV ring / fuel overhead,
       and no spotter correction on this mission */
    var sqSrc = MARK_SOURCES.filter(function(s){ return s.id === "squad"; })[0];
    game.markSrc = sqSrc;
    var sDist = Math.min(sqSrc.max, MARK_MAX_OFF_M) * Math.sqrt(Math.random()), sAng = Math.random() * Math.PI * 2;
    game.markDx = Math.cos(sAng) * sDist; game.markDy = Math.sin(sAng) * sDist;
  }
  if (type.id === "dangerClose"){
    /* a danger-close mission is always the surrounded friendlies'
       own mark: they marked their own position and are calling
       the fire in themselves — a squad mark, never a commander
       UAV, so no UAV ring / fuel overhead. A squad mark normally
       disables Ask spotter, but danger close is the ONE exception
       — in a limited form: the pinned squad only calls ONE
       coordinate to shoot (picked by how many enemy squads they
       face, see dcCallTarget) and Ask spotter only confirms
       whether a round landed in the right place or not — never a
       metre correction (see askSpotter's danger-close branch). */
    var fSrc = MARK_SOURCES.filter(function(s){ return s.id === "squad"; })[0];
    game.markSrc = fSrc;
    var fDist = Math.min(fSrc.max, MARK_MAX_OFF_M) * Math.sqrt(Math.random()), fAng = Math.random() * Math.PI * 2;
    game.markDx = Math.cos(fAng) * fDist; game.markDy = Math.sin(fAng) * fDist;
  }
  if (type.id === "smoke" || type.id === "dangerClose"){
    /* these two missions never roll the enemy-spotted event:
       smoke has no correcting spotter at all, and the danger-close
       friendlies are the pinned target themselves — their limited
       right-place / not radio check is never spotted away */
    game.spotterRiskAt = Infinity; game.spotterCompromised = false; game.spotterFate = null; game.spotterShots = 0;
    game.spotterDx = 0; game.spotterDy = 0;
  }
  startUav();   /* commander-called round: the UAV launches with whatever fuel it refuelled to */
  var gl = $("gameTgtLabel"); if (gl) gl.textContent = type.short;
  setGameTargetVisual(type);   /* infantry: scattered dots like a defending squad; vehicle: the vehicle icon; structures: the orange diamond */
  /* scattered targets carry NO shared health pool: an infantry
     target's men are each alive on their own (alive flags set in
     the scatter), and a stationary vehicle target's HP lives on
     each vehicle — the type's HP per vehicle, not one pool for
     all of them — so zero the shared pool for both */
  if (type.id === "infantry" || type.id === "infantryHold"){ game.hp = 0; game.maxHp = 0; }
  if (type.id === "vehicleStatic"){
    game.hp = 0; game.maxHp = 0;
    for (var vhp = 0; vhp < game.vehTgt.length; vhp++){ game.vehTgt[vhp].hp = type.hp; game.vehTgt[vhp].maxHp = type.hp; game.vehTgt[vhp].alive = true; }
  }
  /* keep the player's dial exactly where they left it — Next target
     must not move the elevation; they adjust from the current setting */
  gameTgtG.style.display = "";
  /* the range hint is measured mortar → RED TARGET mark as the red
     mark currently sits — not to the orange diamond just placed */
  refreshGameHintFromMark();
  /* range calculator starts blank every round — the player types
     the range in manually, like the in-game calculator */
  $("gameCalcRange").value = "";
  updateGameCalc();
  updateTargetStatus();
  updateAmmoUI();
  refreshGameControls();
  if (type.category === "timed"){
    setGameFeedback("", "<b>" + type.label + "</b> · <b>" + type.time + " s</b> · " + markText() +
      (type.id === "infantry" ? " " + infantryScatterText() : "") +
      (type.id === "infantry" ? " A round landing on them <b>stops them moving</b> for the rest of the round — hit them once and they go to ground where they stand." : "") +
      " Red mark on the diamond, dial, FIRE — and walk the rounds in from the fall of shot." + checkBriefNote() +
      (ammoOf(activeMortar()) === 0 ? " <b>RELOAD MORTAR " + (activeMortar() + 1) + "</b> first — Mortar " + (activeMortar() + 1) + "'s own " + shellName() + " magazine is empty (2 shells per 5–10 s)." : ""));
  } else if (type.category === "smoke"){
    setGameFeedback("", "<b>" + type.label + "</b> · " + (game.smokeTimed ? "<b>" + Math.round(game.timeMax) + " s</b>" : "<b>no timeout</b>") + " · " + markText() +
      (game.smokeTimed
        ? " The friendly squad is on a timed advance — watch the <b>green dots</b>: they start short of the point and move toward the smoke marker as the clock runs down, and if they reach it before the screen is up they advance without it."
        : " <b>No timeout this time</b> — smoke clocks vary, and this squad is holding short and will wait for its screen however long you take, so no green squad is moving on the point.") +
      " An infantry squad has asked for <b>smoke</b> on the smoke marker so it can advance behind the screen. Red mark on the marker, dial, FIRE — a round landing inside the point's blast ring puts the screen up; smoke needs no direct hit. There is <b>no spotter correction</b> on a smoke mission, and <b>Skip target</b> just calls it off — no true position." +
      (game.smokeTimed ? " When the clock runs out, the squad advances with or without your smoke." : " With no timeout, the mission ends only when the screen is up or you call it off.") +
      (ammoOf(activeMortar()) === 0 ? " <b>RELOAD MORTAR " + (activeMortar() + 1) + "</b> first — Mortar " + (activeMortar() + 1) + "'s own " + shellName() + " magazine is empty (2 shells per 5–10 s)." : ""));
  } else if (type.category === "dangerclose"){
    setGameFeedback("", "<b>" + type.label + "</b> · " + markText() + " " + dangerCloseText() +
      " The friendlies are the <b>green dots</b> in the centre and the enemy are the <b>orange squads</b> pressing in around them — they keep closing while you work, but a squad that <b>takes a burst stops closing in</b> where it stands. " + dcCallText() +
      " Put the red mark on the <b>called coordinate</b>, never on the friendlies, dial, FIRE. Every moment an enemy squad stays up, the friendlies bleed." +
      (ammoOf(activeMortar()) === 0 ? " <b>RELOAD MORTAR " + (activeMortar() + 1) + "</b> first — Mortar " + (activeMortar() + 1) + "'s own " + shellName() + " magazine is empty (2 shells per 5–10 s)." : ""));
  } else {
    var surFb = [emplacementText(), defendersText(), vehiclesText()].filter(function(x){ return x; }).join(" ");
    setGameFeedback("", "<b>" + type.label + "</b> · " +
      (type.id === "infantryHold"
        ? "<b>no shared HP</b> — every man is down only when a round lands close to him. "
        : type.id === "vehicleStatic"
        ? "<b>" + type.hp + " HP per vehicle</b> · 50/25/10 HP per hit band, measured to each vehicle. "
        : "<b>" + type.hp + " HP</b> · 50/25/10 HP per hit band. ") + markText() +
      (type.id === "infantryHold" ? " " + infantryScatterText() : "") +
      (type.id === "vehicleStatic" ? " " + vehicleTargetText() : "") +
      (surFb ? " " + surFb + " The " + type.short.toLowerCase() + " itself is the PRIMARY target — focus on it: destroy it and the mission is done, even if" + (game.emplacements.length ? " its emplacements," : "") + " its defenders" + (game.vehicles.length ? " and its parked vehicles" : "") + " are still up around it. Everything around it is BONUS only: each emplacement destroyed, defender down or parked vehicle destroyed counts +1 targets down in the score, but none of it ends the mission — not one piece, and not all of it together — while the " + type.short.toLowerCase() + " itself still stands." : "") +
      " Red mark on the diamond, dial, keep firing." + checkBriefNote() +
      (ammoOf(activeMortar()) === 0 ? " <b>RELOAD MORTAR " + (activeMortar() + 1) + "</b> first — Mortar " + (activeMortar() + 1) + "'s own " + shellName() + " magazine is empty (2 shells per 5–10 s)." : ""));
  }
  if (mortars[1])
    $("gameFeedback").innerHTML += " Separate everything: each mortar has its <b>own dial</b> (M1 → TARGET · M2 → TARGET 2 — neither dial's mils are shown, read each off its scale), its <b>own FIRE button</b> and its <b>own RELOAD button</b> — dial, fire and reload each mortar separately for its own target, and Ask spotter (when this round's mark has a spotter — it is disabled on a Squad Mark or Passing Squad mark, where Request check on mark takes its place once per round, and on danger close it only confirms right place or not) corrects the selected mortar from its own last round.";
  gameScoreText();
  updateTrainDial();
  updateMarkerTransforms();
  startGameTimer();
}
function adjustGame(delta){
  if (!game.active || game.over) return;
  /* W / S turns ONLY the selected mortar's dial — the other
     mortar's dial angle for its own target stays exactly where
     it was left */
  var ai = activeMortar();
  setDialOf(ai, dialOf(ai) + delta);
  updateTrainDial();
}
/* ================= SHOT ANIMATION + DISPERSION =================
   Firing is animated on the board like the in-game map: a shell in
   flight with a DASHED trail in the air following it — the dashes
   grow behind the shell from the muzzle and only reach the impact
   when the shell does, nothing is drawn ahead of it (no solid line
   to the impact) — the shell swelling then shrinking, faking the
   arc's height, then a burst where the round lands and an impact
   mark that lingers.
   The shot flies WHERE THE MORTAR'S ARROW FACES (its compass
   facing, turned with A / D), like in game — the mortar does not
   aim itself at its target mark or at the orange game target, so
   an arrow that is not lined up on the target line throws every
   round off to the side of it; hits are still scored against the
   game target. And like in game the round does NOT land exactly where the dial
   points: every shot gets a random dispersion offset, growing a
   little with range, so even a perfect elevation can land a few
   metres long, short or wide — a firing is not always a direct hit.
   Scoring is judged on where the round ACTUALLY lands against the
   current target's OWN hit rings (direct / close / blast, different
   for every type and sized to the target itself — small for a FOB
   tent or a Cache box, a little wider for a squad or a vehicle) —
   and against the target's REAL position: the orange diamond is
   only a mark, offset from the real target by this round's mark
   error (varied by source, see MARK_SOURCES), and the rings are
   never drawn or quoted. The fall-of-shot report is measured
   against the real target, so the player walks rounds in. */
var REDUCED = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
var shotSeq = 0;   /* legacy counter, bumped on round change / close */
var gameGen = 0;   /* round generation: bumped ONLY when a round ends or the game
                      closes — never by a new shot, so back-to-back shots fired in
                      the same round never cancel each other */
function gauss(){ return (Math.random() + Math.random() + Math.random() - 1.5) * 2; }   /* ≈ normal, ±3 */
/* each shot builds its OWN effect elements inside its own group, so
   several shells can be in the air at once (FIRE stays enabled between
   shots) and every one of them still lands and is scored */
function animateShot(fromPx, toPx, aimRange, blastM, shellType, done){
  var gen = gameGen;
  var dur = REDUCED ? 60 : Math.min(3200, 1300 + aimRange * 1.2);
  var grp = el("g", {"class": "shotfx", style: "pointer-events:none"}, gFx);
  /* Dashed flight trail FOLLOWING the shell: NOT a solid line drawn
     all the way to the impact from the moment of firing. The line
     starts at zero length at the muzzle and its far end is the
     shell's own current position, so the dashes grow behind the
     shell as it flies and only reach the impact when the shell does.
     Nothing is drawn ahead of the shell. */
  var sLine  = el("line", {stroke: "#ffffff", "stroke-width": 2, opacity: .9, "stroke-linecap": "round",
    "stroke-dasharray": "7 5",
    x1: fromPx.x, y1: fromPx.y, x2: fromPx.x, y2: fromPx.y}, grp);
  /* the burst disc: a generic explosion visual at a fixed
     on-screen size — deliberately NOT the target's blast radius,
     which stays hidden like in game */
  var sBlast = el("circle", {fill: "rgba(255,138,60,.14)", stroke: "var(--orange)", "stroke-width": 1.5, opacity: 0,
    cx: toPx.x, cy: toPx.y, r: 0}, grp);
  if (shellType === "smoke"){   /* a Smoke shell bursts pale grey — a screen, not an explosion */
    sBlast.setAttribute("fill", "rgba(205,212,218,.32)");
    sBlast.setAttribute("stroke", "#dfe3e6");
  }
  /* the shell itself: a real mortar bomb, not a glowing meteor ball —
     rounded nose, tapered body and the tail-fin assembly at the back.
     Drawn pointing +x (nose first); the frame loop rotates it onto
     its line of travel, fin-stabilised like the real round */
  var sShell = el("g", {opacity: 1}, grp);
  el("path", {d: "M8.5,0 C6.5,-2.9 2,-3.7 -3,-3.5 L-5.5,-3.5 L-5.5,3.5 L-3,3.5 C2,3.7 6.5,2.9 8.5,0 Z",
    fill: "#3b4034", stroke: "#ece9df", "stroke-width": 1.1, "stroke-linejoin": "round"}, sShell);
  var sFins = el("g", {stroke: "#ece9df", "stroke-width": 1.1, "stroke-linecap": "round", fill: "none"}, sShell);
  el("line", {x1: -5.5, y1: 0, x2: -9.5, y2: -4.2}, sFins);
  el("line", {x1: -5.5, y1: 0, x2: -9.5, y2: 4.2}, sFins);
  el("line", {x1: -5.5, y1: 0, x2: -10, y2: 0}, sFins);
  var sAng = Math.atan2(toPx.y - fromPx.y, toPx.x - fromPx.x) * 180 / Math.PI;
  var sFlash = el("circle", {r: 6, fill: "#ffb52e", opacity: 0}, grp);
  var sRing  = el("circle", {fill: "none", stroke: "var(--orange)", "stroke-width": 3, opacity: 0}, grp);
  var sSmoke = [];
  for (var si = 0; si < 4; si++) sSmoke.push(el("circle", {r: 5, fill: "#cbbfa5", opacity: 0}, grp));
  var sMark = el("g", {style: "display:none"}, grp);
  var sm = el("g", {stroke: "#ffffff", "stroke-width": 2.2, "stroke-linecap": "round"}, sMark);
  el("line", {x1: -7, y1: -7, x2: 7, y2: 7}, sm);
  el("line", {x1: -7, y1: 7, x2: 7, y2: -7}, sm);
  el("circle", {r: 11, fill: "none", stroke: "var(--orange)", "stroke-width": 1.6}, sMark);
  function drop(){ if (grp.parentNode) grp.parentNode.removeChild(grp); }
  var t0 = null;
  function frame(ts){
    if (gen !== gameGen){ drop(); return; }      /* round ended or game closed mid-flight */
    if (t0 === null) t0 = ts;
    var t = Math.min(1, (ts - t0) / dur);
    var kk = 1 / view.s;
    var cx = fromPx.x + (toPx.x - fromPx.x) * t;
    var cy = fromPx.y + (toPx.y - fromPx.y) * t;
    /* the dashed trail follows the shell: its head IS the shell —
       start stays at the muzzle, end moves with the shell each frame */
    sLine.setAttribute("stroke-width", 2 * kk);
    sLine.setAttribute("stroke-dasharray", (7 * kk) + " " + (5 * kk));
    sLine.setAttribute("x1", fromPx.x); sLine.setAttribute("y1", fromPx.y);
    sLine.setAttribute("x2", cx); sLine.setAttribute("y2", cy);
    /* the bomb rides at the head of its dashed trail nose-first,
       swelling a little mid-flight as it crests the arc, then
       settling back to size on the way down */
    var sSc = (0.8 + 0.5 * Math.sin(Math.PI * t)) * kk;
    sShell.setAttribute("transform", "translate(" + cx + "," + cy + ") rotate(" + sAng + ") scale(" + sSc + ")");
    if (t < 1){ requestAnimationFrame(frame); return; }
    sShell.setAttribute("opacity", 0);
    var blastPx = 26 * kk;   /* generic burst size, screen-constant — not a measured radius */
    explodeAt(toPx, gen, { line: sLine, flash: sFlash, ring: sRing, smoke: sSmoke, mark: sMark, drop: drop, blast: sBlast, blastPx: blastPx });
    done();
  }
  requestAnimationFrame(frame);
}
function explodeAt(p, gen, fx){
  fx.mark.setAttribute("transform", "translate(" + p.x + "," + p.y + ") scale(" + (1 / view.s) + ")");
  fx.mark.style.display = "";
  var dur = REDUCED ? 120 : 850, t0 = null;
  function frame(ts){
    if (gen !== gameGen) return;                 /* group already cleared by hideFx */
    if (t0 === null) t0 = ts;
    var t = Math.min(1, (ts - t0) / dur), kk = 1 / view.s;
    fx.flash.setAttribute("cx", p.x); fx.flash.setAttribute("cy", p.y);
    fx.flash.setAttribute("r", (6 + 22 * t) * kk);
    fx.flash.setAttribute("opacity", .9 * (1 - t));
    /* the shock ring expands to a generic burst size — an effect,
       not the target's hidden blast radius */
    fx.ring.setAttribute("cx", p.x); fx.ring.setAttribute("cy", p.y);
    fx.ring.setAttribute("r", Math.max(8 * kk, fx.blastPx * (0.2 + 0.8 * t)));
    fx.ring.setAttribute("stroke-width", Math.max(.4, 3 * kk * (1 - t)));
    fx.ring.setAttribute("opacity", .95 * (1 - t));
    fx.blast.setAttribute("r", fx.blastPx * (0.2 + 0.8 * t));
    fx.blast.setAttribute("stroke-width", Math.max(.35, 1.5 * kk));
    fx.blast.setAttribute("opacity", .9);
    for (var i = 0; i < fx.smoke.length; i++){
      var a = i * 1.9 + .6;
      fx.smoke[i].setAttribute("cx", p.x + Math.cos(a) * 14 * t * kk);
      fx.smoke[i].setAttribute("cy", p.y + (Math.sin(a) * 10 - 6) * t * kk);
      fx.smoke[i].setAttribute("r", (5 + 9 * t) * kk);
      fx.smoke[i].setAttribute("opacity", .45 * (1 - t));
    }
    if (t < 1){ requestAnimationFrame(frame); return; }
    fx.line.setAttribute("opacity", 0);
    fx.flash.setAttribute("opacity", 0);
    fx.ring.setAttribute("opacity", 0);
    /* the burst disc stays at full size with the impact mark
       until the whole shot group is dropped, so the fall of shot
       can be read against the target */
    fx.blast.setAttribute("r", fx.blastPx);
    fx.blast.setAttribute("opacity", .55);
    for (var j = 0; j < fx.smoke.length; j++) fx.smoke[j].setAttribute("opacity", 0);
    /* the impact mark stays a couple of seconds so the fall of shot can be read,
       then this shot's whole effect group is removed */
    setTimeout(function(){ if (gen === gameGen) fx.drop(); }, 2200);
  }
  requestAnimationFrame(frame);
}
/* score a round where it actually came down: distance from the target
   (which may have moved while the shell was in the air), split into
   long/short and left/right along the mortar→target line */
function resolveImpact(impactFrac, shot){
  var mp = posMeters(mortars[shot.mIdx]), tp = posMeters(game.targetFrac), ip = posMeters(impactFrac);
  var dx = tp.x - mp.x, dy = tp.y - mp.y, d0 = Math.hypot(dx, dy) || 1;
  var ux = dx / d0, uy = dy / d0;
  var rx = ip.x - tp.x, ry = ip.y - tp.y;
  var dist = Math.hypot(rx, ry);
  var along = rx * ux + ry * uy;            /* + long (past the target), − short */
  var cross = rx * -uy + ry * ux;           /* + right of the line, − left */
  /* remember this fall of shot under the mortar that FIRED it:
     the spotter correction is worked out per mortar, from that
     mortar's OWN last landed round — Mortar 2's fall of shot must
     never produce Mortar 1's correction or vice versa, because
     the two mortars sit at different ranges from the target */
  game.lastImpact = { along: along, cross: cross, dist: dist, mIdx: shot.mIdx,
                      playerMils: shot.playerMils, correctMils: shot.correctMils };
  if (!game.lastImpacts) game.lastImpacts = [null, null];
  game.lastImpacts[shot.mIdx] = game.lastImpact;
  var where = dist < 1 ? "dead on the target"
    : fmt(Math.round(dist)) + " m from the target — " + fmt(Math.abs(Math.round(along))) + " m " +
      (along >= 0 ? "long" : "short") + ", " + fmt(Math.abs(Math.round(cross))) + " m " +
      (cross >= 0 ? "right" : "left");
  /* this round's dynamic hit variant, from the target's own rings —
     the rings are hidden, so the feedback names the band only,
     never its metres */
  var tt = game.type || { direct:5, close:10, blast:16, kill:16, short:"target", label:"TARGET" };
  var band = hitBand(dist, tt);
  var bandWhere = band.id === "miss"
    ? where + " — outside its blast"
    : where + " — inside the " + band.id + " band";
  /* the dial was right AND the arrow was lined up, but the round
     scattered anyway — say so. (If the arrow was off the target
     line, the miss is the facing, not scatter — the facingNote
     below names it instead, so the dial is not blamed or praised
     for a shot that was never pointed at the target.) */
  var dialNote = Math.abs(shot.diff) <= 5 && dist > tt.direct && (shot.facingErr == null || Math.abs(shot.facingErr) <= 2)
    ? (shot.auto
        ? " Mortar " + (shot.mIdx + 1) + "'s gunner had the range dialled — the round just scattered. Mortar fire isn't always a direct hit."
        : " Your dial was on — the round just scattered. Mortar fire isn't always a direct hit.")
    : "";
  /* rounds fly WHERE THE ARROW FACES, not to the target mark: if
     the firing mortar's arrow was well off the line to the target,
     name it — no dial setting can fix a mortar pointing the wrong
     way. The error is measured against the real target's line,
     which the player approximates with their own target mark. */
  var facingNote = (shot.facingErr != null && Math.abs(shot.facingErr) >= 3 && dist > tt.direct)
    ? " Mortar " + (shot.mIdx + 1) + "'s <b>arrow was " + fmt(Math.abs(Math.round(shot.facingErr))) + "° off the target line</b> — fire follows the arrow, not the mark, so the round went where the mortar faces. Turn it with <b>A / D</b> until the compass strip reads STRAIGHT ON TARGET LINE."
    : "";
  /* the red TARGET mark is the reference for the target line and
     the range hint: if it sits well off the ORANGE DIAMOND (the
     called-in mark), name it — the line the player lines the
     arrow up on, and the range they dial, both come from that
     mark. The diamond itself may sit off the real target by this
     round's mark error, which is never revealed: the fall of shot
     above is measured against the real target, so walk the
     rounds in. */
  var rp2 = posMeters(targetFor(shot.mIdx));
  var markPos = { x: tp.x + (game.markDx || 0), y: tp.y + (game.markDy || 0) };
  var markOff = Math.hypot(rp2.x - markPos.x, rp2.y - markPos.y);
  var markNote = (markOff > 15
    ? " Mortar " + (shot.mIdx + 1) + "'s own <b>" + (shot.mIdx === 1 ? "TARGET 2 mark" : "red TARGET mark") + "</b> sits " + fmt(Math.round(markOff)) + " m off the orange diamond — the target line and range hint are measured to that mark, so move it onto the diamond and line the arrow up on it."
    : "") + facingNote;
  var emptyNote = ammoOf(shot.mIdx, shot.shell) === 0
    ? " That was Mortar " + (shot.mIdx + 1) + "'s last " + shellName(shot.shell) + " round in its own magazine — press <b>RELOAD MORTAR " + (shot.mIdx + 1) + "</b> with " + shellName(shot.shell) + " selected (2 shells per 5–10 s)."
    : "";
  var who = mortars[1] ? "<b>Mortar " + (shot.mIdx + 1) + "</b> · " : "";   /* salvo: say which mortar's round this was */
  /* SHELL TYPE: a Smoke shell never damages anything — away from a
     smoke mission it just puts a screen up where it lands and the
     round plays on. (On a smoke mission the Smoke shell is the
     right shell and is scored by the smoke branch below; an HE
     shell there bursts and puts NO screen up.) */
  if (shot.shell === "smoke" && !(game.type && game.type.id === "smoke")){
    updateTargetStatus();
    setGameFeedback("near", who + "SMOKE SCREEN UP — impact " + bandWhere + ". Smoke does no damage, so nothing was hurt by that round. Switch to <b>HE</b> to damage the target, or keep Smoke to screen a position." +
      (ammoOf(shot.mIdx, "smoke") === 0 ? " That was Mortar " + (shot.mIdx + 1) + "'s last Smoke shell — press <b>RELOAD MORTAR " + (shot.mIdx + 1) + "</b> with Smoke selected to refill its own Smoke magazine." : ""));
    maybeSpotterSpottedAfterShot();   /* even a smoke round is a round the spotter watched fall */
    gameScoreText(); refreshGameControls();
    return;
  }
  /* surroundings take casualties from THIS impact, wherever it fell:
     a man within DEF_KILL_M of the burst goes down, and a parked
     vehicle within its own kill radius (truck 13 m, car 11 m) is
     destroyed — a round can miss the structure and still clear
     squads or vehicles, and vice versa */
  var defTotal = game.defenders ? game.defenders.length : 0, defKilled = 0;
  if (defTotal){
    for (var dfi = 0; dfi < game.defenders.length; dfi++){
      var dfd = game.defenders[dfi];
      if (dfd.alive && Math.hypot(ip.x - (tp.x + dfd.dx), ip.y - (tp.y + dfd.dy)) <= DEF_KILL_M){ dfd.alive = false; defKilled++; }
    }
  }
  var defLeft = defendersAlive();
  var defNote = !defTotal ? "" : (defKilled > 0
    ? " <b>" + defKilled + (defKilled === 1 ? " defender" : " defenders") + " down</b> — " + defLeft + " of " + defTotal + " men still up."
    : (defLeft > 0 ? " Defenders still up: " + defLeft + " / " + defTotal + "." : " All defenders cleared."));
  var vehTotal = game.vehicles ? game.vehicles.length : 0, vehKilled = 0, vehKinds = [];
  if (vehTotal){
    for (var vfi = 0; vfi < game.vehicles.length; vfi++){
      var vfv = game.vehicles[vfi];
      if (vfv.alive && Math.hypot(ip.x - (tp.x + vfv.dx), ip.y - (tp.y + vfv.dy)) <= vfv.killM){
        vfv.alive = false; vehKilled++; vehKinds.push(vfv.kind === "truck" ? "truck" : "car/jeep");
      }
    }
  }
  var vehLeft = vehiclesAlive();
  var vehNote = !vehTotal ? "" : (vehKilled > 0
    ? " <b>" + vehKilled + (vehKilled === 1 ? " vehicle" : " vehicles") + " destroyed</b> (" + vehKinds.join(", ") + ") — " + vehLeft + " of " + vehTotal + " still up."
    : (vehLeft > 0 ? " Parked vehicles still up: " + vehLeft + " / " + vehTotal + "." : " All parked vehicles destroyed."));
  /* every emplacement near a FOB / Hideout takes graded damage
     from THIS impact too, each inside its own hidden rings — a
     round can wreck one emplacement (or, if two sit close, nick
     both) and miss the structure, or the reverse. Two Mortar pits
     are tracked and reported separately. */
  var empTotal = game.emplacements ? game.emplacements.length : 0, empDmg = 0, empHits = [], empKilled = 0;
  if (empTotal){
    var mSeenR = 0, mTotR = 0;
    for (var emc = 0; emc < game.emplacements.length; emc++) if (game.emplacements[emc].variant.id === "mortar") mTotR++;
    for (var emi = 0; emi < game.emplacements.length; emi++){
      var emd = game.emplacements[emi];
      var emLab = emd.variant.label;
      if (emd.variant.id === "mortar" && mTotR > 1){ mSeenR++; emLab = "MORTAR PIT " + mSeenR; }
      if (emd.hp <= 0) continue;
      var emBand = hitBand(Math.hypot(ip.x - (tp.x + emd.dx), ip.y - (tp.y + emd.dy)), emd.variant);
      if (emBand.dmg > 0){
        emd.hp = Math.max(0, emd.hp - emBand.dmg);
        empDmg += emBand.dmg;
        if (emd.hp <= 0) empKilled++;   /* an emplacement destroyed by THIS impact — a bonus target down (see the hard branch) */
        empHits.push("<b>" + emLab + " −" + emBand.dmg + " HP</b>" + (emd.hp <= 0 ? " — destroyed" : " — " + emd.hp + " / " + emd.maxHp + " HP left"));
      }
    }
  }
  var empLeft = emplacementsAlive();
  var empNote = !empTotal ? "" : (empHits.length
    ? " Emplacements hit: " + empHits.join("; ") + ". " + (empLeft > 0 ? empLeft + " of " + empTotal + " emplacements still up." : "All emplacements destroyed.")
    : (empLeft > 0 ? " Emplacements still up: " + empLeft + " / " + empTotal + "." : " All emplacements destroyed."));
  /* THE SCATTERED TARGET ITSELF takes casualties PER MAN /
     PER VEHICLE, from this impact's distance to each man /
     vehicle where he / it actually stands (around the MARK —
     that is where the dots and icons are drawn). This replaces
     the old shared pool measured to one centre point, which
     felt wrong exactly because the squads and vehicles are
     scattered: a shell bursting between two squads now hurts
     nobody, a shell on one squad leaves the other untouched,
     and a shell on one vehicle does nothing to the next. */
  var isInfTgt = !!(game.type && (game.type.id === "infantry" || game.type.id === "infantryHold") && game.infMen && game.infMen.length);
  var infKilled = 0, infLeft = 0, infBlastHit = false, infJustHalted = false;
  var markPosX = tp.x + (game.markDx || 0), markPosY = tp.y + (game.markDy || 0);
  if (isInfTgt){
    for (var imi = 0; imi < game.infMen.length; imi++){
      var imd = game.infMen[imi];
      if (!imd.alive) continue;
      var imDist = Math.hypot(ip.x - (markPosX + imd.dx), ip.y - (markPosY + imd.dy));
      if (imDist <= tt.blast) infBlastHit = true;   /* the burst landed on the men, kill or not */
      if (imDist <= INF_KILL_M){ imd.alive = false; infKilled++; }
    }
    infLeft = infTargetAlive();
    /* HIT BY MORTAR = STOP MOVING: a burst landing on a MOVING
       infantry target (a man down, or any man inside the blast)
       stops it dead — the squads go to ground where they stand
       and the dots no longer move for the rest of the round
       (gameTick honours game.infHalted; the clock still runs) */
    if (infBlastHit && game.type.id === "infantry" && !game.infHalted){ game.infHalted = true; infJustHalted = true; }
  }
  var infHaltNote = infJustHalted
    ? " <b>Stopped</b> — that burst hit them and the squads have gone to ground: the dots are no longer moving."
    : "";
  var infNote = !isInfTgt ? "" : (infKilled > 0
    ? " <b>" + infKilled + (infKilled === 1 ? " man" : " men") + " down</b> — " + infLeft + " of " + game.infMen.length + " still up."
    : (infLeft > 0 ? " No man close enough to that burst went down — " + infLeft + " of " + game.infMen.length + " men still up." : " All men down."));
  var isVehTgt = !!(game.type && game.type.id === "vehicleStatic" && game.vehTgt && game.vehTgt.length);
  var vehTKilled = 0, vehTDmg = 0, vehTHits = [], vehTLeft = 0, vehTClosest = Infinity;
  if (isVehTgt){
    for (var vti = 0; vti < game.vehTgt.length; vti++){
      var vtv = game.vehTgt[vti];
      if (!vtv.alive) continue;
      var vtDist = Math.hypot(ip.x - (markPosX + vtv.dx), ip.y - (markPosY + vtv.dy));
      if (vtDist < vehTClosest) vehTClosest = vtDist;
      var vtBand = hitBand(vtDist, tt);
      if (vtBand.dmg > 0){
        vtv.hp = Math.max(0, vtv.hp - vtBand.dmg);
        vehTDmg += vtBand.dmg;
        vehTHits.push("<b>VEHICLE " + (vti + 1) + " −" + vtBand.dmg + " HP</b>" + (vtv.hp <= 0 ? " — destroyed" : " — " + vtv.hp + " / " + vtv.maxHp + " HP left on that vehicle"));
        if (vtv.hp <= 0){ vtv.alive = false; vehTKilled++; }
      }
    }
    vehTLeft = vehTargetAlive();
  }
  var vehTNote = !isVehTgt ? "" : (vehTHits.length
    ? " Per-vehicle damage: " + vehTHits.join("; ") + ". " + (vehTLeft > 0 ? vehTLeft + " of " + game.vehTgt.length + " vehicles still up." : "All vehicles destroyed.")
    : (vehTKilled > 0
      ? " <b>" + vehTKilled + (vehTKilled === 1 ? " vehicle" : " vehicles") + " destroyed</b> — " + vehTLeft + " of " + game.vehTgt.length + " still up."
      : (vehTLeft > 0 ? " Vehicles still up: " + vehTLeft + " / " + game.vehTgt.length + " — that burst was not close enough to any one of them." : " All vehicles destroyed.")));
  if (defKilled > 0 || vehKilled > 0 || empDmg > 0 || infKilled > 0 || vehTKilled > 0 || vehTDmg > 0) updateMarkerTransforms();
  var hard = game.type && game.type.category === "health";
  var scatteredHard = hard && (game.type.id === "infantryHold" || game.type.id === "vehicleStatic") && (isInfTgt || isVehTgt);
  if (scatteredHard){
    /* scattered health targets: NO shared pool at all. Holding
       infantry is cleared man by man; a stationary vehicle
       target is cleared vehicle by vehicle, each on its own HP.
       Nothing here touches game.hp — a burst in the empty
       middle, however close to the mark's centre, does nothing. */
    updateTargetStatus();
    if (isInfTgt){
      if (infLeft === 0){
        game.over = true; game.fired = true;
        game.hits++; game.streak++;
        stopGameTimer();
        setGameFeedback("hit", who + "◎ SQUADS CLEARED — that round took down the last of the holding infantry." + infNote + " Impact " + bandWhere + "." + dialNote);
      } else if (infKilled > 0){
        setGameFeedback("near", who + "Men down where that round landed —" + infNote + " The rest are scattered elsewhere and untouched: each squad is only hurt by a round landing close to IT. Fire on the men still up." + dialNote + emptyNote);
      } else {
        setGameFeedback("miss", who + "Miss — impact " + bandWhere + ", but the centre distance means nothing here:" + infNote + " Put the round on a squad itself — the men are the target, not the middle of them." + dialNote + markNote + emptyNote);
      }
    } else {
      if (vehTLeft === 0){
        game.over = true; game.fired = true;
        game.hits++; game.streak++;
        stopGameTimer();
        setGameFeedback("hit", who + "◎ ALL VEHICLES DESTROYED — the last vehicle's own HP ran out." + vehTNote + " Impact " + bandWhere + "." + dialNote);
      } else if (vehTDmg > 0){
        setGameFeedback(vehTKilled > 0 ? "hit" : "near", who + "Damage where that round landed —" + vehTNote + " Each vehicle keeps its own HP: work the damaged one, or shift onto another. Fire again." + dialNote + emptyNote);
      } else {
        setGameFeedback("miss", who + "Miss — impact " + bandWhere + ", but no vehicle was inside that burst:" + vehTNote + " Damage is measured to each vehicle itself, so aim at a vehicle, not the middle of the group." + dialNote + markNote + emptyNote);
      }
    }
  } else if (hard){
    /* health system: graded damage by hit band inside THIS target's
       hidden blast rings (50 direct / 25 close / 10 shrapnel at the
       edge). For a FOB / Hideout / Cache the STRUCTURE ITSELF is the
       PRIMARY target — and the ONLY thing that ends the mission:
       destroying the FOB / Hideout / Cache (0 HP) is target down,
       DONE, even if defenders, parked vehicles or emplacements
       around it are still up. Everything AROUND it — each
       emplacement destroyed, each defender down, each parked
       vehicle destroyed — is a BONUS: every one of them counts
       +1 in the TARGETS DOWN score (game.hits, tallied separately
       in game.bonus), but NONE of them ends the mission — not one
       of them alone, and not all of them together: while the
       structure stands, the round plays on. */
    var dmg = band.dmg;
    if (dmg > 0) game.hp = Math.max(0, game.hp - dmg);
    updateTargetStatus();
    var structureDown = game.hp <= 0;
    /* BONUS targets down from THIS impact: surroundings destroyed
       by this round count toward the TARGETS DOWN score right
       away, whether or not the structure fell with them */
    var bonusThis = empKilled + defKilled + vehKilled;
    var bonusParts = [];
    if (empKilled > 0) bonusParts.push(empKilled + (empKilled === 1 ? " emplacement" : " emplacements"));
    if (defKilled > 0) bonusParts.push(defKilled + (defKilled === 1 ? " defender" : " defenders"));
    if (vehKilled > 0) bonusParts.push(vehKilled + (vehKilled === 1 ? " parked vehicle" : " parked vehicles"));
    if (bonusThis > 0){ game.hits += bonusThis; game.bonus += bonusThis; }
    var bonusNote = bonusThis > 0
      ? " <b>BONUS +" + bonusThis + " target" + (bonusThis === 1 ? "" : "s") + " down</b> — " + bonusParts.join(", ") + " destroyed around the " + game.type.short.toLowerCase() + ", counted in TARGETS DOWN."
      : "";
    var surroundingsTotal = empTotal + defTotal + vehTotal;
    var surroundingsCleared = surroundingsTotal > 0 && empLeft === 0 && defLeft === 0 && vehLeft === 0;
    var cleared = structureDown;
    if (cleared){
      game.over = true; game.fired = true;
      game.hits++; game.streak++;
      stopGameTimer();
      var stillUp = [];
      if (empLeft > 0) stillUp.push(empLeft + " of " + empTotal + " emplacements");
      if (defLeft > 0) stillUp.push(defLeft + " of " + defTotal + " defenders");
      if (vehLeft > 0) stillUp.push(vehLeft + " of " + vehTotal + " parked vehicles");
      var stillNote = stillUp.length
        ? " Mission done — " + stillUp.join(", ") + " still up around it don't matter: the " + game.type.short.toLowerCase() + " was the primary target."
        : (surroundingsCleared ? " Everything around it is down too — all counted as bonus targets down." : "");
      setGameFeedback("hit", who + "◎ TARGET DESTROYED — " + (dmg > 0 ? band.label + " (−" + dmg + " HP) destroyed the " + game.type.short.toLowerCase() + "." : "that round destroyed the " + game.type.short.toLowerCase() + ".") +
        stillNote + bonusNote + empNote + defNote + vehNote + " Impact " + bandWhere + "." + dialNote);
    } else if (dmg === 0 && defKilled === 0 && vehKilled === 0 && empDmg === 0){
      setGameFeedback("miss", who + "Miss — impact " + bandWhere + ". No damage — the " + game.type.short.toLowerCase() +
        " is still at <b>" + game.hp + " / " + game.maxHp + " HP</b>. It only takes damage on a close fall of shot. The " + game.type.short.toLowerCase() + " itself is the primary target — only destroying it ends the mission; anything destroyed around it is bonus targets down." + empNote + defNote + vehNote + dialNote + markNote + emptyNote);
    } else if (dmg > 0){
      setGameFeedback(band.id === "direct" ? "hit" : "near", who + band.label + " — −" + dmg + " HP. " +
        game.type.label + " is at <b>" + game.hp + " / " + game.maxHp + " HP</b>. Impact " + bandWhere +
        "." + empNote + defNote + vehNote + bonusNote + " Keep firing on the " + game.type.short.toLowerCase() + " itself — it is the primary target: destroy it and the mission is done." + (surroundingsCleared ? " Everything around it is already down — all bonus, banked — but the mission is NOT done until the " + game.type.short.toLowerCase() + " itself is destroyed." : "") + dialNote + emptyNote);
    } else {
      setGameFeedback("near", who + "No damage to the " + game.type.short.toLowerCase() + " (still <b>" + game.hp + " / " + game.maxHp + " HP</b>) — impact " + bandWhere + ", but the round worked the surroundings:" +
        empNote + defNote + vehNote + bonusNote + (surroundingsCleared
          ? " Everything around the " + game.type.short.toLowerCase() + " is now down — all of it bonus targets down, banked in the score. But the mission is NOT done: the " + game.type.short.toLowerCase() + " itself is the primary target and it is still standing — destroy it to finish."
          : " Bonus only, though — the " + game.type.short.toLowerCase() + " itself is the primary target, and the mission runs until you destroy it.") + dialNote + emptyNote);
    }
  } else if (game.type && game.type.category === "smoke"){
    /* smoke mission: no damage and nothing to kill — the screen
       is up if the round lands inside the point's own (generous)
       rings; outside them the squad gets no screen and the clock
       keeps running. No spotter correction and no true position
       on a smoke mission — the fall of shot is all you get. */
    if (shot.shell !== "smoke"){
      setGameFeedback("miss", who + "HE BURST — impact " + bandWhere + ", but HE puts up no screen: the squad asked for <b>SMOKE</b>. Switch the shell to <b>Smoke</b> and fire again." + dialNote + markNote + emptyNote);
    } else if (band.id !== "miss"){
      game.over = true; game.fired = true;
      game.hits++; game.streak++;
      stopGameTimer();
      var smokeLabel = band.id === "direct" ? "◎ SMOKE RIGHT ON THE POINT"
        : (band.id === "close" ? "◎ SMOKE SCREEN UP" : "◎ SMOKE UP — at the edge of the point, but the screen covers the advance");
      setGameFeedback("hit", who + smokeLabel + " — impact " + bandWhere +
        (game.smokeTimed
          ? ", with <b>" + game.timeLeft.toFixed(1) + " s</b> to spare. The green squad advances behind the screen."
          : ". No timeout was running on this mission — the squad was holding for exactly this. It advances behind the screen now.") + dialNote);
    } else {
      setGameFeedback("miss", who + "Smoke away from the point — impact " + bandWhere + ". No screen where the squad needs it — " +
        (game.smokeTimed
          ? "<b>" + game.timeLeft.toFixed(1) + " s</b> left and the green squad is still moving on the point."
          : "no timeout on this mission, so the squad is still holding — take your time.") +
        " Adjust from the fall of shot and fire again — there is no spotter correction on a smoke mission." +
        dialNote + markNote + emptyNote);
    }
  } else if (game.type && game.type.category === "dangerclose"){
    /* DANGER CLOSE: this round is scored against BOTH sides,
       where they actually stand. Enemy men go down per man —
       a shell only takes down the men within INF_KILL_M of the
       burst, at that squad's CURRENT position (they have been
       closing in since the mission started). And the burst can
       wound the FRIENDLIES: a round landing inside the
       friendly-fire bands of a friendly squad's centre takes
       graded HP off that squad — danger close cuts both ways.
       The mission is won when every enemy man is down, and
       lost the moment a friendly squad reaches 0 HP. */
    var dcKilled = 0, dcHaltedNow = 0, dcAnyHit = false;
    if (game.dcEnemySquads){
      for (var dsi = 0; dsi < game.dcEnemySquads.length; dsi++){
        var dsq = game.dcEnemySquads[dsi], dcen = dcSquadCentre(dsq);
        var sqHit = false;
        for (var dsm = 0; dsm < dsq.men.length; dsm++){
          var dmn = dsq.men[dsm];
          if (!dmn.alive) continue;
          var dmDist = Math.hypot(ip.x - (tp.x + dcen.x + dmn.dx), ip.y - (tp.y + dcen.y + dmn.dy));
          if (dmDist <= tt.blast) sqHit = true;   /* the burst landed on this squad, kill or not */
          if (dmDist <= INF_KILL_M){ dmn.alive = false; dcKilled++; }
        }
        /* HIT BY MORTAR = STOP MOVING: a squad this burst landed
           on stops closing in — freeze it at the distance it had
           reached when the shell caught it; the squads that were
           not hit keep pressing in */
        if (sqHit) dcAnyHit = true;
        if (sqHit && !dsq.halted){
          dsq.halted = true;
          dsq.frozenDist = Math.hypot(dcen.x, dcen.y);
          dcHaltedNow++;
        }
      }
    }
    var dcHaltNote = dcHaltedNow
      ? " <b>" + (dcHaltedNow === 1 ? "That squad has" : "Those squads have") + " stopped closing in</b> — hit by the burst, gone to ground where they stand."
      : "";
    var dcFf = [];
    if (game.dcFriendlies){
      for (var dfi3 = 0; dfi3 < game.dcFriendlies.length; dfi3++){
        var fsq3 = game.dcFriendlies[dfi3];
        var fd = Math.hypot(ip.x - (tp.x + fsq3.cx), ip.y - (tp.y + fsq3.cy));
        for (var dfb = 0; dfb < DC_FF_BANDS.length; dfb++){
          if (fd <= DC_FF_BANDS[dfb][0]){
            fsq3.hp = Math.max(0, fsq3.hp - DC_FF_BANDS[dfb][1]);
            dcFf.push("<b>FRIENDLY SQUAD " + (dfi3 + 1) + " −" + DC_FF_BANDS[dfb][1] + " HP</b> — your own round landed " + fmt(Math.round(fd)) + " m from them (" + Math.max(0, Math.round(fsq3.hp)) + " / 100 HP left)");
            break;
          }
        }
      }
    }
    /* remember, on THIS mortar's fall of shot, whether the round
       landed in the RIGHT PLACE — burst on an enemy squad and NOT
       inside the friendly-fire bands — because that is the ONLY
       thing the pinned squad will confirm on Ask spotter for this
       mission (see askSpotter's danger-close branch) */
    if (game.lastImpact){
      game.lastImpact.dcRight = dcAnyHit && dcFf.length === 0;
      game.lastImpact.dcFfHit = dcFf.length > 0;
    }
    if (dcKilled > 0 || dcFf.length || dcHaltedNow > 0) updateMarkerTransforms();
    updateTargetStatus();
    var dcLeft = dcEnemyMenAlive();
    var dcDown = false;
    if (game.dcFriendlies) for (var dck = 0; dck < game.dcFriendlies.length; dck++) if (game.dcFriendlies[dck].hp <= 0) dcDown = true;
    var dcFfNote = dcFf.length ? " " + dcFf.join("; ") + "." : "";
    if (dcDown){
      game.over = true; game.fired = true; game.streak = 0;
      stopGameTimer();
      setGameFeedback("miss", who + "SQUAD DOWN — a friendly squad was wiped out at the position." + dcFfNote +
        " The mission is lost: danger-close fire has to walk onto the enemy, not the men calling it in. Streak reset — press <b>Next target</b>.");
    } else if (dcLeft === 0){
      game.over = true; game.fired = true;
      game.hits++; game.streak++;
      stopGameTimer();
      var dcHpLeft = [];
      if (game.dcFriendlies) for (var dcl = 0; dcl < game.dcFriendlies.length; dcl++) dcHpLeft.push("squad " + (dcl + 1) + " at " + Math.max(0, Math.round(game.dcFriendlies[dcl].hp)) + " HP");
      setGameFeedback("hit", who + "◎ POSITION HELD — the last enemy man is down and the bleeding has stopped." +
        (dcKilled > 0 ? " That round took <b>" + dcKilled + (dcKilled === 1 ? " man" : " men") + "</b>." : "") + dcFfNote +
        " Friendlies still standing: " + dcHpLeft.join(", ") + ". Like Long Tan — the guns saved the position." + dialNote);
    } else if (dcKilled > 0){
      setGameFeedback("near", who + "<b>" + dcKilled + (dcKilled === 1 ? " enemy man" : " enemy men") + " down</b> where that round landed — " + dcLeft + " still up in " +
        dcEnemySquadsAlive() + (dcEnemySquadsAlive() === 1 ? " squad" : " squads") + " pressing in, and the friendlies are still bleeding." + dcFfNote + dcHaltNote +
        " Shift onto the next squad — the ones still moving are closer than when you started." + dialNote + emptyNote);
    } else if (dcFf.length){
      setGameFeedback("miss", who + "That round hurt your own men and no enemy:" + dcFfNote + dcHaltNote +
        " The enemy is AROUND the friendlies, not on them — put the burst on an orange squad and keep it off the green dots." + dialNote + markNote + emptyNote);
    } else {
      setGameFeedback(dcHaltedNow ? "near" : "miss", who + "Miss — impact " + bandWhere + ", and no enemy man was close enough to that burst to go down." + dcHaltNote +
        " The squads are separate and closing in — aim at an orange squad itself, and keep the burst off the friendlies in the centre." + dialNote + markNote + emptyNote);
    }
  } else if (isInfTgt){
    /* scattered mover on a timeout: no shared kill at the centre
       either. Moving infantry go down MAN BY MAN — the round only
       ends when every man is down before the clock does. A burst
       at the mark's centre with nobody there kills nothing,
       however the old centre distance read. */
    updateTargetStatus();
    if (infLeft === 0){
      game.over = true; game.fired = true;
      game.hits++; game.streak++;
      stopGameTimer();
      setGameFeedback("hit", who + "◎ ALL MEN DOWN — the last scattered squad is cleared, with <b>" + game.timeLeft.toFixed(1) + " s</b> to spare." + infNote + dialNote);
    } else if (infKilled > 0){
      setGameFeedback("near", who + "Men down where that round landed —" + infNote + infHaltNote + " The other squads are tens of metres away and untouched — walk the next round onto them. <b>" + game.timeLeft.toFixed(1) + " s</b> left." + dialNote + emptyNote);
    } else if (infJustHalted){
      setGameFeedback("near", who + "No man down, but that burst landed on them — <b>they have stopped moving</b> and gone to ground where they stand." + infNote + " Walk the next round onto the men still up. <b>" + game.timeLeft.toFixed(1) + " s</b> left." + dialNote + emptyNote);
    } else {
      setGameFeedback("miss", who + "Miss — impact " + bandWhere + ", but no man was close enough to that burst:" + infNote + " The squads are scattered — aim at a squad, not the middle of them. <b>" + game.timeLeft.toFixed(1) + " s</b> left" +
        (game.infHalted ? ", and they are stopped where the earlier hit pinned them, so the range hint still holds." : ", and they have moved, so check the range hint again.") + dialNote + markNote + emptyNote);
    }
  } else {
    /* timeout system: a mover goes down only inside its own kill
       radius — infantry die anywhere inside their blast ring; a
       round that only clips the blast edge is a near variant, not
       a kill */
    if (dist <= tt.kill){
      game.over = true; game.fired = true;
      game.hits++; game.streak++;
      stopGameTimer();
      var killLabel = band.id === "direct" ? "◎ DIRECT HIT" : (band.id === "blast" ? "◎ BLAST KILL — caught in the open inside the blast ring" : "◎ " + band.label + " — target down");
      setGameFeedback(band.id === "direct" ? "hit" : "near", who + killLabel +
        " — impact " + bandWhere + ", with <b>" + game.timeLeft.toFixed(1) + " s</b> to spare." + dialNote);
    } else if (band.id !== "miss"){
      setGameFeedback("near", who + "BLAST EDGE — impact " + bandWhere + ", but this " +
        game.type.short.toLowerCase() + " only goes down on a near-direct fall — the blast clipped it and it kept going. <b>" +
        game.timeLeft.toFixed(1) + " s</b> left — check the range hint and fire again." + dialNote + markNote + emptyNote);
    } else {
      setGameFeedback("miss", who + "Miss — impact " + bandWhere + ". The target is still moving — <b>" +
        game.timeLeft.toFixed(1) + " s</b> left, and it has moved, so check the range hint again before the next round." +
        dialNote + markNote + emptyNote);
    }
  }
  maybeSpotterSpottedAfterShot();   /* a landed round can be the one the enemy traces back to the spotter */
  gameScoreText();
  refreshGameControls();
}
/* ================= PER-MORTAR FIRE — each mortar has its OWN FIRE button =================
   FIRE is separate from each mortar: FIRE MORTAR 1 fires only
   Mortar 1, FIRE MORTAR 2 fires only Mortar 2 — never a combined
   salvo. Each mortar fires WHERE ITS OWN ARROW FACES (its own
   compass facing), not at its target mark: the mark only gives
   the target line to line the arrow up on and the range to dial.
   Each press spends one round from THAT mortar's own magazine
   for the selected shell, on the player's current dial, so the
   player dials for one mortar, fires it, then re-dials for the
   other mortar's different range and fires that one separately.
   The two mortars do NOT share an angle or a range: each has its
   own range to its own target mark. */
var SALVO_GAP = 900;   /* legacy — no longer used by the separate FIRE buttons, kept for old counters */
var salvoSeq = 0;      /* legacy counter, bumped on round change / close (chains now key off gameGen) */
function launchGameShot(mIdx, mils, auto, shellType, done){
  /* where this mortar fires: WHERE ITS ARROW FACES — the mortar's
     own compass facing (mortarFacing[mIdx], turned with A / D on
     the Mini Game compass strip), NOT along the line to its target
     mark. The target mark no longer steers the shot at all: it is
     only the player's reference for the target line (the bearing
     to line the arrow up on, via the compass strip) and for the
     range hint. The elevation gives a range along the FACING
     direction, then dispersion scatters the round around that aim
     point, a little more at longer ranges. Scoring (resolveImpact)
     is still judged against the game target, so a mortar whose
     arrow is not lined up on the target line throws every round
     off to the side of it, however good the dial is — the arrow
     has to point down the target line to hit. */
  var mp = posMeters(mortars[mIdx]), B = boardMeters();
  var facing = mortarFacing[mIdx];
  var fRad = facing * Math.PI / 180;
  var ux = Math.sin(fRad), uy = -Math.cos(fRad);   /* facing unit vector: x east, y south — 0° = north, clockwise, same convention as solution().brg and the icon arrow's rotate() */
  /* reference bearings for the feedback: the target line (mortar
     → its own target mark) and the line to the real game target */
  var tp = posMeters(targetFor(mIdx));
  var markBrg = (Math.atan2(tp.x - mp.x, -(tp.y - mp.y)) * 180 / Math.PI + 360) % 360;
  var gt = game.targetFrac ? posMeters(game.targetFrac) : tp;
  var trueBrg = (Math.atan2(gt.x - mp.x, -(gt.y - mp.y)) * 180 / Math.PI + 360) % 360;
  var facingErr = brgDiff(facing, trueBrg);   /* signed: + = target line lies to the right of the arrow */
  /* the "correct" elevation for this shot is the elevation for the
     range at which the FACING line passes the real target — the
     target's distance projected onto the facing direction — so a
     player who dials that range in counts as having the dial on
     for the line they are actually firing along, and any miss is
     then scatter or an arrow not lined up on the target. If the
     target sits behind the facing (projection ≤ 0), fall back to
     the red-mark range so the dial check still has a reference. */
  var proj = (gt.x - mp.x) * ux + (gt.y - mp.y) * uy;
  var markRange = Math.hypot(tp.x - mp.x, tp.y - mp.y);
  var refRange = proj > 1 ? proj : markRange;
  var eNow = refRange >= 1 ? elevation(refRange, 0) : null;
  var aimRange = rangeForMils(mils);
  var offR = gauss() * (6 + aimRange * 0.008) * 0.8;   /* along the facing: long / short */
  var offL = gauss() * (5 + aimRange * 0.006) * 0.8;   /* across the facing: left / right */
  var mag = Math.hypot(offR, offL);
  if (mag > 45){ offR *= 45 / mag; offL *= 45 / mag; }
  var ix = mp.x + ux * (aimRange + offR) + -uy * offL;
  var iy = mp.y + uy * (aimRange + offR) +  ux * offL;
  var impactFrac = { x: Math.min(.999, Math.max(.001, ix / B)), y: Math.min(.999, Math.max(.001, iy / B)) };
  var shot = { mIdx: mIdx, auto: auto, shell: shellType,
               facing: facing, markBrg: markBrg, facingErr: facingErr,
               diff: Math.round(mils - (eNow ? eNow.mils : mils)),
               playerMils: mils, correctMils: eNow ? eNow.mils : mils };
  animateShot(fracToPx(mortars[mIdx]), fracToPx(impactFrac), aimRange, game.type ? game.type.blast : 16, shellType, function(){
    if (game.active && !game.over) resolveImpact(impactFrac, shot);   /* not if closed, or the target escaped mid-flight */
    done();
  });
}
function fireMortar(mIdx){
  /* Separate FIRE per mortar, on that mortar's OWN dial and OWN
     facing: this press fires ONLY mortar mIdx, in the direction
     ITS OWN arrow faces (mortarFacing[mIdx] — line it up on that
     mortar's own target line with A / D on the compass strip),
     with dialOf(mIdx) — the angle stored for THAT mortar — and
     spends one round from THAT mortar's own magazine for the
     selected shell. The other mortar does not fire, its dial and
     facing are not used and its ammo is not spent. There is no
     facing gate: a mortar fires wherever its arrow points, lined
     up or not — lining it up is the player's job. */
  if (!game.active || game.over || game.cooldown) return;
  if (!mortars[mIdx]) return;
  var shell = game.shell;
  if (isReloading(mIdx)){
    setGameFeedback("near", "<b>Mortar " + (mIdx + 1) + "</b> is still reloading — shells load 2 at a time, 5–10 s per pair; wait until that mortar's own reload finishes, or skip its next batch. The other mortar can still fire and reload on its own.");
    return;
  }
  if (ammoOf(mIdx, shell) <= 0){
    setGameFeedback("near", "<b>Mortar " + (mIdx + 1) + "</b> has no " + shellName(shell) + " shells left in its own " + shellName(shell) + " magazine — press <b>RELOAD MORTAR " + (mIdx + 1) + "</b> to refill that mortar's magazine (2 shells per 5–10 s).");
    return;
  }
  var fRange = solution(mortars[mIdx]).range;
  if (fRange > MAX_RANGE){
    setGameFeedback("near", "<b>Mortar " + (mIdx + 1) + "</b> is out of range of its own target (" + (mIdx === 1 ? "TARGET 2" : "TARGET") + ") at " + fmt(Math.round(fRange)) + " m and held fire. Move that mortar or its own target mark closer.");
    return;
  }
  setAmmoOf(mIdx, shell, ammoOf(mIdx, shell) - 1);
  updateAmmoUI();
  startFireCooldown();
  var myGen = gameGen;
  var milsUsed = dialOf(mIdx);
  setGameFeedback("", shellName(shell) + " round away from <b>Mortar " + (mIdx + 1) + "</b> — firing where its arrow faces (<b>" + deg3(mortarFacing[mIdx]) + "°</b>) on <b>Mortar " + (mIdx + 1) + "'s own dial</b>, not along the line to " + (mIdx === 1 ? "TARGET 2" : "TARGET") + " — watch where it lands…");
  game.shots++;
  gameScoreText();
  launchGameShot(mIdx, milsUsed, false, shell, function(){
    if (myGen !== gameGen) return;
    refreshGameControls();
  });
}
function fireGame(){ fireMortar(activeMortar()); }
/* ================= SKIP TARGET — reveal the true position =================
   Gives the round up and shows where the target ACTUALLY was: the
   green TRUE POSITION marker appears at the real spot (drawn by
   updateMarkerTransforms off game.revealed), with the dashed line
   back to the orange mark, and the feedback gives the true grid
   ref, the mark error, the true range and the angle that would
   have hit. Streak resets, no score — then Next target. */
function skipGameRound(){
  if (!game.active || game.over || !game.targetFrac || !game.type) return;
  stopGameTimer();
  stopUavTimer();
  if (game.type.id === "smoke"){
    /* smoke mission: skipping just calls the mission off — the
       squad advances unscreened. NO true position is revealed:
       there is no reveal on a smoke mission. */
    game.over = true; game.fired = true; game.streak = 0;
    setGameFeedback("near", "⏭ MISSION CALLED OFF — the squad advances without its smoke screen. No true position on a smoke mission: the fall of shot was all you had. Streak reset — press <b>Next target</b>.");
    gameScoreText(); refreshGameControls(); updateMarkerTransforms();
    return;
  }
  game.revealed = true;
  game.over = true; game.fired = true; game.streak = 0;
  var tp = posMeters(game.targetFrac), mp = posMeters(mortars[activeMortar()]);
  var trueRange = Math.round(Math.hypot(tp.x - mp.x, tp.y - mp.y) / 10) * 10;
  var e = elevation(trueRange, 0);
  var markDist = Math.hypot(game.markDx || 0, game.markDy || 0);
  var dxT = -(game.markDx || 0), dyT = -(game.markDy || 0);   /* mark → true, metres, y south */
  var brgT = (Math.atan2(dxT, -dyT) * 180 / Math.PI + 360) % 360;
  var markTxt = markDist < 1
    ? "the orange mark was right on it — the fall of shot was the problem, not the mark"
    : "the orange mark sat <b>" + fmt(Math.round(markDist)) + " m</b> off it — from the mark, the true target lies at bearing <b>" + fmt(Math.round(brgT)) + "°</b>";
  setGameFeedback("near", "⏭ SKIPPED — true position revealed (green marker on the map). The real " +
    game.type.short.toLowerCase() + " was at <b>" + fracToRef(game.targetFrac).compact + "</b> — " + markTxt +
    ". True range from your mortar: <b>" + fmt(trueRange) + " m</b>" +
    (e ? ", and the angle that would have hit is <b>" + fmt(Math.round(e.mils)) + " mils</b>" : "") +
    ". Streak reset — press <b>Next target</b>.");
  gameScoreText(); refreshGameControls(); updateMarkerTransforms();
}
/* ================= SPOTTER CORRECTION =================
   After a shot, radio whoever called the target in this round
   (the commander on the UAV, or a dedicated ground spotter) —
   and they call back a correction from the fall of shot.
   EXCEPTION: a mark from a PASSING SQUAD or a SQUAD MARK has
   nobody watching the fall of shot — the passing squad has
   moved on and a squad mark is just a mark — so Ask spotter is
   DISABLED for those two sources (button dead in
   refreshGameControls, and askSpotter refuses below). Those
   rounds get REQUEST CHECK ON MARK instead (see CHECK ON
   MARK): a varied checker comes in from far away, checks
   the mark from a standoff (ground checkers stop well short
   of it) and reports the checked target position, once per
   round. DANGER
   CLOSE is the one carve-out: its squad mark keeps a limited
   Ask spotter that only confirms right place / not (handled
   before the refusal below, and it gives no correction):
   which way the last round fell, IN METRES measured FROM
   THE TARGET both ways — long/short and left/right (e.g.
   "40 m long, 30 m right of the target") — and a RELATIVE
   correction IN METRES off the mark you already have
   ("add 40 m from the mark" / "drop 40 m from the mark"),
   plus the left/right correction in metres from the target,
   applied by TURNING the mortar's arrow (fire follows the
   facing): the metres at the target are converted to the
   A / D turn in degrees that cancels them. They never call
   an exact range and never call an exact dial setting in
   mils — the spotter speaks only in metres, so anyone can
   follow it without knowing the mil scale. Like the mark, the call's
   precision varies with the source: the UAV commander, the laser
   spotter and the sniper team call it tight (nearest 5 m), and a
   regular infantry spotter to the nearest 15 m. (Squad and passing
   entries in SPOTTER_WHO are only the no-source fallback — a real
   squad / passing mark never reaches a correction, see above.)
   Needs at least one
   landed round this round — there is nothing to correct from
   before that. The correction is PER MORTAR: it is worked out
   for the SELECTED / ACTIVE mortar from that mortar's OWN last
   landed round (kept separately in game.lastImpacts), because
   the two mortars sit at different ranges from the target — the
   other mortar's fall of shot would give the wrong range. */
var SPOTTER_WHO = {
  laser:   { who: "Friendly spotter — laser designator binoculars", step: 5 },
  sniper:  { who: "Sniper team spotter — spotting scope", step: 5 },
  uav:     { who: "Commander on the UAV", step: 5 },
  infantry:{ who: "Regular infantry spotter — binoculars", step: 15 },
  squad:   { who: "The squad that marked it", step: 10 },
  passing: { who: "The passing squad that found it", step: 25 }
};
function askSpotter(){
  if (!game.active || game.over || !game.type) return;
  /* the correction is for the SELECTED / ACTIVE mortar, worked
     out from THAT mortar's OWN last landed round — not from
     whichever mortar happened to fire last. Mortar 2's fall of
     shot gives a range for Mortar 2's position; handed to Mortar
     1 (which sits at a different range) it would be wrong. */
  var ai = activeMortar();
  var liOwn = lastImpactFor(ai);
  if (!liOwn){
    var other = lastImpactFor(1 - ai);
    setGameFeedback("near", other
      ? "<b>Mortar " + (ai + 1) + "</b> has no fall of shot of its own to correct from yet — the last round down was <b>Mortar " + ((1 - ai) + 1) + "'s</b>, and its correction belongs to Mortar " + ((1 - ai) + 1) + "'s position and dial. FIRE Mortar " + (ai + 1) + " first, then ask the spotter to correct Mortar " + (ai + 1) + "."
      : "No fall of shot yet — FIRE a round first, then the spotter can correct the mortar that fired it.");
    return;
  }
  /* no spotter correction on a smoke mission — the squad that
     asked for the smoke is advancing, not correcting */
  if (game.type.id === "smoke"){
    setGameFeedback("near", "No spotter correction on a smoke mission — the squad is advancing behind whatever smoke it gets. Read the fall of shot and adjust yourself.");
    return;
  }
  /* DANGER CLOSE — the limited radio check: the pinned squad
     gives NO correction on this mission. All Ask spotter tells
     you is whether the ACTIVE mortar's last round landed in the
     RIGHT PLACE or NOT: right place = the burst landed on an
     enemy squad and outside the friendly-fire bands. The verdict
     stored at impact time (li.dcRight, set in resolveImpact) is
     used when there is one; otherwise it is re-judged from the
     fall of shot against where the squads stand now. No metres,
     no add / drop, no left / right — that is all they can say
     while they are fighting for their lives. */
  if (game.type.id === "dangerClose"){
    var dcRight, dcFfHit = false;
    if (liOwn.dcRight !== undefined){
      dcRight = !!liOwn.dcRight; dcFfHit = !!liOwn.dcFfHit;
    } else {
      var dmp = posMeters(mortars[ai]), dtp = posMeters(game.targetFrac);
      var ddx = dtp.x - dmp.x, ddy = dtp.y - dmp.y, dd0 = Math.hypot(ddx, ddy) || 1;
      var dux = ddx / dd0, duy = ddy / dd0;
      var dip = { x: dtp.x + liOwn.along * dux + liOwn.cross * -duy,
                  y: dtp.y + liOwn.along * duy + liOwn.cross * dux };
      var dBlast = game.type.blast || 22, dHit = false, di2, dj2;
      if (game.dcEnemySquads) for (di2 = 0; di2 < game.dcEnemySquads.length; di2++){
        var dsq2 = game.dcEnemySquads[di2], dcen2 = dcSquadCentre(dsq2);
        for (dj2 = 0; dj2 < dsq2.men.length; dj2++){
          var dmn2 = dsq2.men[dj2];
          if (dmn2.alive && Math.hypot(dip.x - (dtp.x + dcen2.x + dmn2.dx), dip.y - (dtp.y + dcen2.y + dmn2.dy)) <= dBlast) dHit = true;
        }
      }
      if (game.dcFriendlies) for (di2 = 0; di2 < game.dcFriendlies.length; di2++){
        var dfsq = game.dcFriendlies[di2];
        if (Math.hypot(dip.x - (dtp.x + dfsq.cx), dip.y - (dtp.y + dfsq.cy)) <= DC_FF_BANDS[DC_FF_BANDS.length - 1][0]) dcFfHit = true;
      }
      dcRight = dHit && !dcFfHit;
    }
    setGameFeedback(dcRight ? "hit" : "miss",
      "PINNED SQUAD for <b>Mortar " + (ai + 1) + "</b>: “" +
      (dcRight
        ? "<b>RIGHT PLACE</b> — that round landed in the right place."
        : dcFfHit
        ? "<b>NOT THE RIGHT PLACE</b> — that round fell too close to the friendlies. Check your fire."
        : "<b>NOT THE RIGHT PLACE</b> — that round did not land on an enemy squad.") +
      "” That is all they can tell you — no range, no correction: shoot the coordinate they called and judge the rest from the fall of shot.");
    return;
  }
  /* no spotter to ask when the mark came from a PASSING SQUAD or
     a SQUAD MARK: nobody from either is watching the fall of shot
     — the button is already disabled for these sources, and this
     guard keeps a direct call honest too (danger close above is
     the one exception, and it never reaches this guard) */
  if (isNoSpotterMarkSrc(game.markSrc)){
    setGameFeedback("miss", game.markSrc.id === "passing"
      ? "No answer — this mark came from a <b>passing squad</b> that has moved on. <b>Ask spotter is disabled on a Passing Squad mark</b>: walk the rounds in from the fall of shot yourself — or use <b>Request check on mark</b>: a checker (commander UAV, infantry or vehicle) will come from far away to check the target position, once per round."
      : "No answer — this is a <b>squad mark</b>, just a mark on the map with no spotter watching the fall of shot. <b>Ask spotter is disabled on a Squad Mark</b>: walk the rounds in from the fall of shot yourself — or use <b>Request check on mark</b>: a checker (commander UAV, infantry or vehicle) will come from far away to check the target position, once per round.");
    return;
  }
  /* a commander UAV that never arrived or has RTB'd has no eyes
     on the target — no correction, however good the fall of shot
     was. LOW FUEL is different: even on low fuel the UAV can
     still see from the sky, so a low-fuel UAV still answers —
     only travel and RTB block it. Ground sources are unaffected
     by fuel, but they can be spotted by the enemy (next check). */
  if (game.markSrc && game.markSrc.id === "uav" && game.uavState !== "station" && game.uavState !== "low"){
    setGameFeedback("miss", game.uavState === "rtb"
      ? "No answer — the UAV is RTB and the commander has no eyes on the target any more. This round's corrections are done; walk the rounds in yourself."
      : "No answer — the UAV is still travelling to the target and has no eyes on it yet.");
    return;
  }
  /* a ground spotter the enemy has already spotted gives no
     correction any more this round — he is dead or has run */
  if (game.spotterCompromised){
    setGameFeedback("miss", "No answer — your spotter was <b>spotted by the enemy</b> and " +
      (game.spotterFate === "killed" ? "killed where he sat" : "ran away from the target to survive") +
      ". He can't give corrections any more this round: walk the rounds in from the fall of shot yourself.");
    return;
  }
  /* calling him at all carries a risk: the radio call (and for
     the laser man, a lase that can glint) can give him away —
     sometimes the enemy spots him the moment you ask, and this
     correction never comes */
  if (isGroundSpotterSrc(game.markSrc) && game.type.id !== "dangerClose" && Math.random() < SPOTTER_ASK_RISK){
    compromiseSpotter();
    setGameFeedback("miss", spotterSpottedMsg());
    return;
  }
  var li = liOwn;   /* the ACTIVE mortar's own fall of shot, measured along its own line to the target */
  var sp = SPOTTER_WHO[game.markSrc ? game.markSrc.id : "squad"] || SPOTTER_WHO.squad;
  function rnd(v){ return Math.round(v / sp.step) * sp.step; }
  var alongR = rnd(li.along), crossR = rnd(li.cross);
  /* The spotter speaks ONLY IN METRES — not everyone knows the
     mil scale, and a real spotter calls corrections in metres
     anyway. He never calls an exact range and never calls an
     exact dial setting in mils: he only says how the round fell,
     IN METRES measured from the target both ways (long/short
     and left/right), and how many METRES to come off the mark
     you already have — "add 40 m from the mark" (the round fell
     short, so add that much range) / "drop 40 m from the mark"
     (it fell long, so drop that much range) — plus the left/right
     correction in metres from the target: a round that fell X m
     right of the target is corrected by TURNING that mortar's
     arrow left (fire follows the arrow, not the mark), by the
     angle that moves the fall X m at the target's range — the
     one place a spotter figure is turned into degrees, because
     the compass the player turns with reads in degrees.
     Both metre figures are the impact's offset FROM THE TARGET
     (alongR along the line of fire, crossR across it), rounded
     to the spotter's precision step — never measured from the
     mortar, and never an exact range or dial setting. */
  var fallParts = [];
  if (alongR !== 0) fallParts.push(fmt(Math.abs(alongR)) + " m " + (alongR > 0 ? "long" : "short"));
  if (crossR !== 0) fallParts.push(fmt(Math.abs(crossR)) + " m " + (crossR > 0 ? "right" : "left"));
  var fallTxt = li.dist < 1
    ? "Mortar " + (ai + 1) + "'s last round was dead on the target"
    : "Mortar " + (ai + 1) + "'s last round fell <b>" + (fallParts.length ? fallParts.join(", ") : "just off") + "</b> of the target";
  var adjTxt;
  if (alongR === 0 && Math.abs(crossR) < sp.step)
    adjTxt = "no correction needed — <b>same again from the mark</b>";
  else {
    var parts = [];
    if (alongR < 0)
      parts.push("<b>Add " + fmt(Math.abs(alongR)) + " m</b> from the mark");
    else if (alongR > 0)
      parts.push("<b>Drop " + fmt(Math.abs(alongR)) + " m</b> from the mark");
    if (Math.abs(crossR) >= sp.step){
      /* left/right is corrected by TURNING the arrow (A / D),
         since fire follows the facing: convert the metre offset
         at the target into the turn that cancels it there */
      var spMp = posMeters(mortars[ai]), spTp = posMeters(game.targetFrac);
      var spRange = Math.max(50, Math.hypot(spTp.x - spMp.x, spTp.y - spMp.y));
      var turnDeg = Math.max(1, Math.round(Math.atan(Math.abs(crossR) / spRange) * 180 / Math.PI));
      parts.push("<b>turn Mortar " + (ai + 1) + "'s arrow " + turnDeg + "° " + (crossR > 0 ? "left (A)" : "right (D)") + "</b> — that moves the fall " + fmt(Math.abs(crossR)) + " m " + (crossR > 0 ? "left" : "right") + " at the target");
    }
    adjTxt = parts.join(", ");
  }
  /* laser designator: the squad leader lases the target, so his
     correction is accurate AND shown on the grid map — the cyan
     LASED POSITION marker appears at the true position (drawn by
     updateMarkerTransforms off game.laserShown). Every other
     source stays text-only here; they still report the fall of
     shot after every shell dropped in the post-shot feedback. */
  var isLaser = !!(game.markSrc && game.markSrc.id === "laser");
  if (isLaser) showLasedTemporarily();   /* square + centre dot on the grid, for a few seconds only */
  setGameFeedback("near", "SPOTTER for <b>Mortar " + (ai + 1) + "</b> — " + sp.who + ": “" +
    fallTxt + " — " + adjTxt + ".”" +
    (isLaser ? " <b>LASED — the friendly spotter's designator binoculars have the target lased, so the accurate lased position is now shown on the grid map (cyan square with a centre dot, LASED POSITION) — but only temporarily, for a few seconds: put Mortar " + (ai + 1) + "'s mark on it now, or Ask spotter again to re-lase.</b>" : "") +
    (mortars[1] ? " This correction is Mortar " + (ai + 1) + "'s only — it does not apply to Mortar " + ((1 - ai) + 1) + ", which sits at its own range." : "") +
    (game.markSrc && game.markSrc.id === "uav" && game.uavState === "low" ? " The UAV is on <b>low fuel</b> but still watching from the sky — corrections keep coming until it RTBs at 0%." : "") +
    (sp.step >= 25 ? " Rough call — they're estimating from where they stand." : ""));
}
/* ================= MINI GAME — FRAME THE VIEW ON THE RED MARK =================
   Opening the game also pans + zooms the map: the red TARGET mark
   (centre of the grid, G7-5-5) is put at the CENTRE of the VISIBLE
   grid area — the map's own column in the split layout, above the
   Controls panel — not in the middle of the board. In the split
   layout the game panel sits in its own column beside the map,
   so it can never cover the mark or the mortar; the status card
   floats at the top left of the grid as before, and both rects
   are passed as obstacles, and the
   Controls panel counts as an obstacle too, so neither the mark
   nor the mortar ends up underneath it.
   The zoom is the gentlest one that can put the mark there while
   the mortar still stays on screen, clear of every panel. The view
   the player had before is restored when the game closes, unless
   they panned or zoomed themselves while playing. */
var gameSavedView = null, gameFramedView = null;
function panelRect(id){
  var e = $(id); if (!e) return null;
  if (window.getComputedStyle(e).display === "none") return null;
  var r = e.getBoundingClientRect();
  return (r.width < 2 || r.height < 2) ? null : r;
}
function pointInRect(x, y, r, pad){
  return x > r.left - pad && x < r.right + pad && y > r.top - pad && y < r.bottom + pad;
}
function frameGameView(){
  gameFramedView = null;
  var sr = svg.getBoundingClientRect();
  if (sr.width < 50 || sr.height < 50) return;
  var R = Math.min(sr.width, sr.height);   /* the rendered view square is R x R, centred in the svg (meet) */
  var ox = sr.left + (sr.width - R) / 2, oy = sr.top + (sr.height - R) / 2;
  var gp = panelRect("gamePanel"), cp = panelRect("controlsPanel"), ip = panelRect("infoPanel"), tb = panelRect("gameTargetBox"), gi = panelRect("gameInfoPanel");
  /* visible grid area: the map square clipped left of the game panel, above the Controls panel */
  var V = { left: ox + 6, top: oy + 6, right: ox + R - 6, bottom: oy + R - 6 };
  if (gp && gp.left > V.left + 240) V.right = Math.min(V.right, gp.left - 10);
  if (cp && cp.right > V.left && cp.left < V.right && cp.top > V.top + 240) V.bottom = Math.min(V.bottom, cp.top - 10);
  if (V.right - V.left < 200){ V.left = ox + 6; V.right = ox + R - 6; }   /* narrow screen: panel spans the width — use the whole square */
  if (V.bottom - V.top < 200){ V.top = oy + 6; V.bottom = oy + R - 6; }
  /* aim point: the CENTRE of the visible grid area — centred in the
     open map left of the docked game panel, never under it, and
     never under the floating status card at the top left */
  var C = { x: (V.left + V.right) / 2, y: (V.top + V.bottom) / 2 };
  var obstacles = [];
  if (gp) obstacles.push(gp); if (cp) obstacles.push(cp); if (ip) obstacles.push(ip); if (tb) obstacles.push(tb); if (gi) obstacles.push(gi);
  var T = fracToPx(target), M = fracToPx(mortars[0]);
  var M2 = mortars[1] ? fracToPx(mortars[1]) : null;
  function search(obs){
    function blocked(x, y, pad){
      for (var i = 0; i < obs.length; i++) if (pointInRect(x, y, obs[i], pad)) return true;
      return false;
    }
    var best = null;
    for (var si = 0; si <= 100; si++){
      var s = 1 + si * 0.02, w = 800 / s, scale = R * s / 800;
      var cMin = w / 2 - 20, cMax = 820 - w / 2;   /* the pan clamp applyView() enforces */
      if (cMax < cMin) continue;
      /* screen range the red mark can reach at this zoom */
      var sx0 = ox + R / 2 + (T.x - cMax) * scale, sx1 = ox + R / 2 + (T.x - cMin) * scale;
      var sy0 = oy + R / 2 + (T.y - cMax) * scale, sy1 = oy + R / 2 + (T.y - cMin) * scale;
      function clampP(px, py){
        return { x: Math.min(sx1, Math.max(sx0, px)), y: Math.min(sy1, Math.max(sy0, py)) };
      }
      var cands = [clampP(C.x, C.y)];
      if (cp){
        /* variants that tuck the mortar just above the Controls panel, or just right of it */
        cands.push(clampP(C.x, cp.top - 16 - (M.y - T.y) * scale));
        cands.push(clampP(cp.right + 16 - (M.x - T.x) * scale, C.y));
        cands.push(clampP(cp.right + 16 - (M.x - T.x) * scale, cp.top - 16 - (M.y - T.y) * scale));
      }
      for (var ci = 0; ci < cands.length; ci++){
        var P = cands[ci];
        if (P.x < ox + 14 || P.x > ox + R - 14 || P.y < oy + 14 || P.y > oy + R - 14) continue;
        if (blocked(P.x, P.y, 12)) continue;
        var mx = P.x + (M.x - T.x) * scale, my = P.y + (M.y - T.y) * scale;
        if (mx < sr.left + 10 || mx > sr.right - 10 || my < sr.top + 10 || my > sr.bottom - 10) continue;
        if (blocked(mx, my, 16)) continue;   /* the mortar must stay visible, clear of every panel */
        var score = Math.hypot(P.x - C.x, P.y - C.y) + (s - 1) * 18;   /* closest to the visible centre, gentlest zoom */
        if (M2){
          var m2x = P.x + (M2.x - T.x) * scale, m2y = P.y + (M2.y - T.y) * scale;
          if (blocked(m2x, m2y, 16) || m2x < sr.left || m2x > sr.right || m2y < sr.top || m2y > sr.bottom) score += 30;
        }
        if (!best || score < best.score) best = { score: score, s: s, px: P.x, py: P.y, scale: scale };
      }
    }
    return best;
  }
  /* on a narrow screen the game panel spans nearly the whole width,
     so no spot is clear of every panel — then frame against the
     Controls panel only, and finally against nothing at all, so the
     mark still ends up at the centre of the square */
  var best = search(obstacles);
  if (!best && cp) best = search([cp]);
  if (!best) best = search([]);
  if (!best) return;
  view.s = best.s;
  view.cx = T.x - (best.px - ox - R / 2) / best.scale;
  view.cy = T.y - (best.py - oy - R / 2) / best.scale;
  applyView();
  gameFramedView = { s: view.s, cx: view.cx, cy: view.cy };
}
function openGame(){
  game.active = true;
  game.shell = "he";   /* fresh session: HE selected, and EVERY mortar's magazine for EACH shell type is full */
  game.ammoStore = [{ he: 5, smoke: 5 }, { he: 5, smoke: 5 }];
  game.ammo = 5;
  gameSavedView = { s: view.s, cx: view.cx, cy: view.cy };   /* restored on close if the player doesn't move the view */
  /* the Mini Game's red TARGET mark goes to the CENTRE of the grid
     every time the game opens (G7-5-5 — about 620 m from the F11
     mortar, in range), even if the mark was moved or the Example
     was used beforehand — like a typed ref or Swap, this deliberate
     move ignores the lock */
  target = refToFrac("G", 7, 5, 5);
  if (target2) target2 = refToFrac("H", 7, 5, 5);   /* Mortar 2's own mark sits one square east of Mortar 1's in the game */
  document.body.classList.add("game-open");
  $("gamePanel").classList.add("open");
  setGameCardHidden(false); setGameSummaryHidden(true);   /* status card itself stays VISIBLE on open (range + bars readable at a glance); only the Summary prose under the target type starts HIDDEN every session so it does not cover the grid — Show summary on the card brings it back, and Hide on the card still hides the whole card behind the Show Target Information pill */
  closeGameInfo();   /* the Summary panel starts closed every session — it is opened from the game panel, never docked */
  $("gameBtn").setAttribute("aria-pressed", "true");
  /* opening the Mini Game MINIMIZES the Controls panel: it folds
     down to just its header at the bottom left so the grid stays
     clear while playing — its – button becomes + , and the player
     can open it again any time (Reset layout reopens it too).
     Closing the game does not force it back open. */
  var cpG = $("controlsPanel");
  if (cpG && !cpG.classList.contains("collapsed")){
    cpG.classList.add("collapsed");
    var cbG = cpG.querySelector("[data-collapse]");
    if (cbG) cbG.textContent = "+";
  }
  $("gamePanel").style.zIndex = ++panelZ;
  newGameRound();
  frameGameView();   /* pan + zoom so the red mark sits at the centre of the visible grid area, mortar still in view */
}
function closeGame(){
  game.active = false;
  stopGameTimer();
  stopUavTimer();
  cancelReload();
  clearFireCooldown();
  shotSeq++; salvoSeq++; gameGen++; game.flying = false; hideFx();
  game.targetFrac = null;
  game.revealed = false; game.laserShown = false; clearLaserTimer(); clearLastImpacts();
  game.defenders = []; game.defSquads = []; game.vehicles = []; game.emplacements = [];
  game.infMen = []; game.infSquads = []; game.vehTgt = []; game.vehCount = 0;
  game.smokeTimed = false; clearSmokeSquad();
  clearDangerClose();
  game.markSrc = null; game.markDx = 0; game.markDy = 0; game.spotterDx = 0; game.spotterDy = 0;
  game.spotterCompromised = false; game.spotterFate = null; game.spotterShots = 0; game.spotterRiskAt = Infinity;
  resetCheck();   /* closing the game calls any travelling checker off and takes its icons off the grid */
  game.uavState = null; game.uavFuel = 0;
  gameTgtG.style.display = "none"; gameDefG.style.display = "none"; gameVehG.style.display = "none"; gameEmpG.style.display = "none"; gameUavG.style.display = "none"; gameLaserG.style.display = "none"; gameSpotterLine.style.display = "none"; gameLasedG.style.display = "none"; gameLasedLine.style.display = "none"; gameInfG.style.display = "none"; gameVehTgtG.style.display = "none"; gameSmokeSquadG.style.display = "none"; gameDcFriendG.style.display = "none"; gameDcEnemyG.style.display = "none";
  gameTrueG.style.display = "none"; gameTrueLine.style.display = "none";
  document.body.classList.remove("game-open");
  $("gamePanel").classList.remove("open");
  setGameCardHidden(false); setGameSummaryHidden(true);   /* clear the card-hidden state so the Show pill never lingers after the game closes, and reset the Summary to its hidden-by-default state for the next open */
  closeGameInfo();   /* closing the game takes its Summary panel with it */
  $("gameBtn").setAttribute("aria-pressed", "false");
  /* put the pre-game view back, but only if the player left the
     framed view alone — a pan / zoom of their own during the game
     is theirs to keep */
  if (gameSavedView && gameFramedView &&
      Math.abs(view.s - gameFramedView.s) < 0.001 &&
      Math.abs(view.cx - gameFramedView.cx) < 0.05 &&
      Math.abs(view.cy - gameFramedView.cy) < 0.05){
    view.s = gameSavedView.s; view.cx = gameSavedView.cx; view.cy = gameSavedView.cy;
    applyView();
  }
  gameSavedView = null; gameFramedView = null;
  updateMarkerTransforms();
}
$("gameBtn").addEventListener("click", function(){ game.active ? closeGame() : openGame(); });
$("gameCloseBtn").addEventListener("click", closeGame);
/* Hideable status card: the card docked top-left covers the grid,
   so it can be hidden two ways — Hide summary folds just the
   prose under the target type (range + bars stay), Hide
   removes the whole card and leaves only the small
   "Show Target Information" pill docked top-left to bring it back.
   Both states are in-memory only for this session; the CARD itself
   stays visible every time the Mini Game opens, but the Summary
   prose starts HIDDEN by default (Show summary brings it back),
   and closing the game clears the card-hidden state so the
   pill never lingers. */
function setGameSummaryHidden(hidden){
  var d = $("gameTypeDescCard"); if (d) d.hidden = !!hidden;
  var b = $("gameSummaryToggleBtn");
  if (b){ b.textContent = hidden ? "👁 Show summary" : "👁 Hide summary"; b.setAttribute("aria-expanded", hidden ? "false" : "true"); }
}
function setGameCardHidden(hidden){
  var box = $("gameTargetBox"); if (box) box.classList.toggle("card-hidden", !!hidden);
  document.body.classList.toggle("card-hidden", !!hidden);
  var s = $("gameTargetShowBtn"); if (s) s.classList.toggle("visible", !!hidden);
}
var _sumBtn = $("gameSummaryToggleBtn");
if (_sumBtn) _sumBtn.addEventListener("click", function(){ var d = $("gameTypeDescCard"); setGameSummaryHidden(!(d && d.hidden)); });
var _hideBtn = $("gameCardHideBtn");
if (_hideBtn) _hideBtn.addEventListener("click", function(){ setGameCardHidden(true); });
var _showBtn = $("gameTargetShowBtn");
if (_showBtn) _showBtn.addEventListener("click", function(){ setGameCardHidden(false); });
/* The target Summary lives on the status card again (under the
   target type label, hideable with the card's Hide summary /
   Hide buttons) AND
   in the separate Mini Game info panel, together with the aim notes
   and the How it works rules. That panel is NOT docked (its old
   bottom-left dock overlapped the Controls panel): it floats
   centred on the grid, drags by its header, and its Close button
   hides it completely. The "Summary & How it works" button in the
   Mini Game panel reopens it; closing also resets its position so
   it reopens centred next time. */
function openGameInfo(){
  var p = $("gameInfoPanel"); if (!p) return;
  p.classList.add("open");
  p.style.zIndex = ++panelZ;
}
function closeGameInfo(){
  var p = $("gameInfoPanel"); if (!p) return;
  p.classList.remove("open");
  p.style.left = ""; p.style.top = ""; p.style.right = ""; p.style.bottom = "";
  p.style.width = ""; p.style.transform = "";
}
$("gameInfoOpenBtn").addEventListener("click", openGameInfo);
$("gameInfoCloseBtn").addEventListener("click", closeGameInfo);
/* HE / Smoke shell switch: picks the shell every placed mortar
   fires; each mortar keeps its own magazine for each shell type */
function setShell(sh){
  /* switching shell mid-reload is safe now: each mortar's reload
     captured its shell when it started, so the switch only picks
     what the NEXT reload / FIRE uses */
  if (game.shell === sh) { updateAmmoUI(); return; }
  game.shell = sh;
  updateAmmoUI(); refreshGameControls();
}
$("shellHeBtn").addEventListener("click", function(){ setShell("he"); });
$("shellSmokeBtn").addEventListener("click", function(){ setShell("smoke"); });
$("gameFireBtn").addEventListener("click", function(){ fireMortar(0); });
$("gameFire2Btn").addEventListener("click", function(){ fireMortar(1); });
$("dialM1Btn").addEventListener("click", function(){ setMode("m1"); });
$("dialM2Btn").addEventListener("click", function(){ if (mortars[1]) setMode("m2"); });
$("gameReloadBtn").addEventListener("click", function(){ startReloadFor(0); });
$("gameReload2Btn").addEventListener("click", function(){ startReloadFor(1); });
$("gameSkipBatchBtn").addEventListener("click", function(){ skipNextBatchFor(0); });
$("gameSkipBatch2Btn").addEventListener("click", function(){ skipNextBatchFor(1); });
$("gameSkipBtn").addEventListener("click", skipGameRound);
$("gameSpotterBtn").addEventListener("click", askSpotter);
$("gameCheckBtn").addEventListener("click", requestCheckOnMark);
$("gameNextBtn").addEventListener("click", function(){ game.round++; newGameRound(); });
/* W / S on the keyboard, like in game: W raises, S lowers.
   Ignored while typing in a field, and only while the game is open. */
document.addEventListener("keydown", function(evt){
  if (!game.active) return;   /* held-key auto-repeat is welcome: it steps the dial */
  var tag = document.activeElement && document.activeElement.tagName;
  if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return;
  var step = evt.shiftKey ? 25 : 1;
  if (evt.key === "w" || evt.key === "W"){ adjustGame(step); evt.preventDefault(); }
  else if (evt.key === "s" || evt.key === "S"){ adjustGame(-step); evt.preventDefault(); }
  else if (evt.key === "r" || evt.key === "R"){ startReload(); evt.preventDefault(); }
});
/* on-screen W / S buttons for mouse / touch: tap = one step,
   press-and-hold keeps moving like holding the key */
function bindHold(btn, delta){
  var t1 = null, t2 = null;
  function clearTimers(){
    if (t1) clearTimeout(t1);
    if (t2) clearInterval(t2);
    t1 = t2 = null;
    btn.classList.remove("held");
  }
  btn.addEventListener("pointerdown", function(evt){
    if (btn.disabled) return;
    evt.preventDefault();
    btn.classList.add("held");
    adjustGame(delta);
    t1 = setTimeout(function(){ t2 = setInterval(function(){ adjustGame(delta); }, 30); }, 380);
  });
  btn.addEventListener("pointerup", clearTimers);
  btn.addEventListener("pointerleave", clearTimers);
  btn.addEventListener("pointercancel", clearTimers);
  btn.addEventListener("click", function(evt){ evt.preventDefault(); });   /* the pointerdown already stepped */
}
bindHold($("wsUpBtn"), 1);
bindHold($("wsDownBtn"), -1);

/* ================= SHARE MY STATS — name + ALL stats in one link =================
   The player types a name / callsign in the Mini Game panel and
   copies a link whose ?s=… QUERY part carries that name and EVERY
   stat: map, date, round reached, targets down, rounds fired,
   current streak, best streak and accuracy (targets down ÷ rounds
   fired). The query part is deliberate: a #… fragment never leaves
   the browser, so link previews used to miss the stats entirely
   and fall back to the one generic template image for everyone.
   The stats ride in the link itself as a short plain code
   (compact v3 packing — see encodeShare; old v2 and v1
   base64url links still decode), so anyone opening it lands on the shared-results
   card (#shareView) rebuilt from the link alone — no account, no
   server, nothing stored.
   When a share link is opened (and while the owner types a name),
   the head's Open Graph / Twitter tags are rewritten to THAT
   player: the title and description carry the name and every
   stat, and og:image / twitter:image point at the hosted card
   PNG as a full http(s) URL — preview crawlers reject data:
   URLs, so the player's canvas-rendered card is shown on the
   page itself (results card, in-panel preview, downloadable
   PNG), never in the image tags. The results card also renders
   the same numbers as an on-page 1200×630 PNG.
   assets/og-image.png remains only as the fallback image for the
   bare page address with no stats in it. Old #s=… links still
   open: the reader checks the query first, then the fragment.
   The only action in the panel is Select link to copy. */
function shareAccuracy(down, fired){ return fired > 0 ? Math.min(100, Math.round(down / fired * 100)) + "%" : "—"; }   /* capped at 100%: one shell can bank several bonus targets down around a FOB / Hideout / Cache */
function collectShareStats(){
  var name = "";
  var ni = $("shareNameInput");
  if (ni) name = (ni.value || "").replace(/[\r\n]+/g, " ").trim().slice(0, 40);
  return {
    n: name || "Anonymous mortar",
    m: currentMap ? currentMap[0] : "Kokan",
    r: game.round, d: game.hits, f: game.shots,
    s: game.streak, b: Math.max(game.bestStreak || 0, game.streak),
    dt: new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
  };
}
function shareStatRows(st){
  return [
    ["Round", st.r], ["Targets down", st.d], ["Rounds fired", st.f],
    ["Streak", st.s], ["Best streak", st.b], ["Accuracy", shareAccuracy(st.d, st.f)]
  ];
}
/* Short share code (v3): the v1 code was base64 of the full JSON
   ({"n":…,"m":"Kokan","r":…,"dt":"17 Nov 2026"}) — 98–114 chars for
   the ?s= part alone, which made the link feel like a long salt.
   v2 packed the stats positionally but kept the base64url wrap
   (~28–48 chars). v3 drops the base64 wrap entirely — base64
   inflates everything by a third for no benefit here, because
   every field is already URL-safe on its own. The v3 code is
   plain text: "3-<map>-<nums>-<date>-<name>" where the map is
   its index in MAPS in base36 (Kokan = "h", not "Kokan"), the
   five stats are base36 joined by ".", the date is days since
   2020-01-01 in base36 ("1xs" for 17 Nov 2026, not the full
   text), and the name comes last (so a "-" inside it is safe),
   with a space written as a single "_" instead of "%20". The
   default name "Anonymous mortar" is left out entirely — the
   decoder puts it back. A typical code is now ~18 chars with
   no name typed and ~22–30 chars with one, e.g.
   "3-h-1.0.0.0.0-1xs" or "3-h-5.a.k.2.5-1xs-Reei".
   Unknown maps / unparseable dates fall back to the v2 code so
   nothing is lost. Old v2 and v1 codes still decode below. */
var SHARE_EPOCH = Date.UTC(2020, 0, 1);
var SHARE_MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
function shareDateToCode(dt){
  if (!dt) return "";
  var t = Date.parse(dt);
  if (isNaN(t)) return "!" + encodeURIComponent(String(dt).slice(0, 30));
  var d = new Date(t);
  var days = Math.round((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - SHARE_EPOCH) / 86400000);
  if (days < 0) return "!" + encodeURIComponent(String(dt).slice(0, 30));
  return days.toString(36);
}
function shareDateFromCode(code){
  if (!code) return "";
  if (code.charAt(0) === "!"){ try { return decodeURIComponent(code.slice(1)).slice(0, 30); } catch (e) { return ""; } }
  var days = parseInt(code, 36);
  if (isNaN(days) || days < 0) return "";
  var d = new Date(SHARE_EPOCH + days * 86400000);
  return d.getUTCDate() + " " + SHARE_MONTHS[d.getUTCMonth()] + " " + d.getUTCFullYear();
}
/* v3 name packing: a space is one "_" (not "%20"); a literal
   "_" in the name is escaped to "%5F" first so the two never
   collide. Everything else keeps encodeURIComponent's escapes. */
function shareNameToCode(name){
  var enc = encodeURIComponent(String(name).slice(0, 40));
  return enc.replace(/_/g, "%5F").replace(/%20/g, "_");
}
function shareNameFromCode(code){
  if (!code) return "Anonymous mortar";
  try {
    var dec = decodeURIComponent(String(code).replace(/_/g, " ")).slice(0, 40);
    return dec || "Anonymous mortar";
  } catch (e) { return "Anonymous mortar"; }
}
/* the old v2 code, kept only as the fallback for the rare stats
   v3 cannot pack plainly (a map name outside MAPS, or a date
   that will not parse) — and so its shape stays in one place */
function encodeShareV2(st){
  var mapCode = "!" + encodeURIComponent(String(st.m || "Kokan").slice(0, 60));
  for (var i = 0; i < MAPS.length; i++){ if (MAPS[i][0] === st.m){ mapCode = i.toString(36); break; } }
  var nums = [st.r, st.d, st.f, st.s, st.b].map(function(v){ v = parseInt(v, 10); return (isNaN(v) || v < 0 ? 0 : v).toString(36); }).join(".");
  var payload = "2|" + encodeURIComponent(String(st.n || "Anonymous mortar").slice(0, 40)) + "|" + mapCode + "|" + nums + "|" + shareDateToCode(st.dt);
  var b64 = btoa(unescape(encodeURIComponent(payload)));
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function encodeShare(st){
  var dateCode = shareDateToCode(st.dt);
  var mapIdx = -1;
  for (var i = 0; i < MAPS.length; i++){ if (MAPS[i][0] === st.m){ mapIdx = i; break; } }
  if (mapIdx < 0 || (dateCode && dateCode.charAt(0) === "!")) return encodeShareV2(st);
  var nums = [st.r, st.d, st.f, st.s, st.b].map(function(v){ v = parseInt(v, 10); return (isNaN(v) || v < 0 ? 0 : v).toString(36); }).join(".");
  var code = "3-" + mapIdx.toString(36) + "-" + nums + "-" + dateCode;
  var name = String(st.n || "Anonymous mortar").slice(0, 40);
  if (name && name !== "Anonymous mortar") code += "-" + shareNameToCode(name);
  return code;
}
function decodeShare(code){
  if (!code) return null;
  /* v3: plain "3-<map>-<nums>-<date>-<name>" — the name is the
     remainder after the third "-", so "-" inside it is safe */
  if (code.slice(0, 2) === "3-"){
    var rest = code.slice(2);
    var i1 = rest.indexOf("-");
    var i2 = i1 < 0 ? -1 : rest.indexOf("-", i1 + 1);
    if (i1 < 0 || i2 < 0) return null;
    var i3 = rest.indexOf("-", i2 + 1);
    var datePart = i3 < 0 ? rest.slice(i2 + 1) : rest.slice(i2 + 1, i3);
    var namePart = i3 < 0 ? "" : rest.slice(i3 + 1);
    var mi3 = parseInt(rest.slice(0, i1), 36);
    var ns3 = rest.slice(i1 + 1, i2).split(".");
    var num36v3 = function(v){ v = parseInt(v, 36); return isNaN(v) || v < 0 ? 0 : v; };
    return {
      n: namePart ? shareNameFromCode(namePart) : "Anonymous mortar",
      m: (!isNaN(mi3) && MAPS[mi3]) ? MAPS[mi3][0] : "Kokan",
      r: num36v3(ns3[0]), d: num36v3(ns3[1]), f: num36v3(ns3[2]),
      s: num36v3(ns3[3]), b: num36v3(ns3[4]),
      dt: shareDateFromCode(datePart)
    };
  }
  try {
    var b64 = code.replace(/-/g, "+").replace(/_/g, "/");
    while (b64.length % 4) b64 += "=";
    var raw = decodeURIComponent(escape(atob(b64)));
    var num = function(v){ v = parseInt(v, 10); return isNaN(v) || v < 0 ? 0 : v; };
    if (raw.charAt(0) === "2" && raw.charAt(1) === "|"){
      var parts = raw.split("|");
      if (parts.length !== 5) return null;
      var name = "Anonymous mortar";
      try { name = decodeURIComponent(parts[1]).slice(0, 40) || name; } catch (e) {}
      var map = "Kokan";
      if (parts[2].charAt(0) === "!"){ try { map = decodeURIComponent(parts[2].slice(1)).slice(0, 60) || map; } catch (e) {} }
      else { var mi = parseInt(parts[2], 36); if (!isNaN(mi) && MAPS[mi]) map = MAPS[mi][0]; }
      var ns = parts[3].split(".");
      var num36 = function(v){ v = parseInt(v, 36); return isNaN(v) || v < 0 ? 0 : v; };
      return {
        n: name, m: map,
        r: num36(ns[0]), d: num36(ns[1]), f: num36(ns[2]),
        s: num36(ns[3]), b: num36(ns[4]),
        dt: shareDateFromCode(parts[4])
      };
    }
    var st = JSON.parse(raw);
    if (!st || typeof st !== "object") return null;
    return {
      n: String(st.n || "Anonymous mortar").slice(0, 40),
      m: String(st.m || "Kokan").slice(0, 60),
      r: num(st.r), d: num(st.d), f: num(st.f),
      s: num(st.s), b: num(st.b),
      dt: String(st.dt || "").slice(0, 30)
    };
  } catch (e) { return null; }
}
function buildShareLink(st){
  var code = encodeShare(st || collectShareStats());
  try {
    var url = new URL(window.location.href);
    url.hash = "";
    url.searchParams.set("s", code);
    return url.href;
  } catch (e) {
    var base = window.location.href.split("#")[0].split("?")[0];
    return base + "?s=" + code;
  }
}
function statGridHTML(st){
  var rows = shareStatRows(st), out = "";
  for (var i = 0; i < rows.length; i++)
    out += "<div class=\"ss\"><div class=\"sl\">" + rows[i][0] + "</div><div class=\"sv\">" + rows[i][1] + "</div></div>";
  return out;
}
function updateSharePreview(){
  var st = collectShareStats();
  var prev = $("shareStatsPreview");
  if (prev) prev.innerHTML = statGridHTML(st);
  var out = $("shareLinkOut");
  if (out) out.value = buildShareLink(st);
  /* keep the head's preview tags describing THIS player's card
     while they play — but never overwrite the tags of a shared
     card that is currently open in front of them */
  var view = $("shareView");
  if (st.n !== "Anonymous mortar" && (!view || view.hidden)) applyShareMeta(st);
}
/* the 1200×630 share card — same layout as assets/og-image.png,
   with this player's name and stats filled in */
function drawShareCard(st){
  var cv = document.createElement("canvas");
  cv.width = 1200; cv.height = 630;
  var c = cv.getContext("2d");
  c.fillStyle = "#101214"; c.fillRect(0, 0, 1200, 630);
  c.strokeStyle = "#ffb52e"; c.lineWidth = 6; c.strokeRect(3, 3, 1194, 624);
  c.fillStyle = "#0c0e10"; c.fillRect(36, 30, 1128, 90);
  c.strokeStyle = "#3a4048"; c.lineWidth = 2; c.strokeRect(36, 30, 1128, 90);
  c.fillStyle = "#ffb52e"; c.font = "700 34px 'Saira Condensed', sans-serif";
  c.fillText("PR MORTAR CALCULATOR", 60, 70);
  c.fillStyle = "#a9a698"; c.font = "500 22px 'Saira Condensed', sans-serif";
  c.fillText("MINI GAME — DIAL TRAINING RESULTS", 60, 102);
  c.fillStyle = "#a9a698"; c.font = "700 20px 'Saira Condensed', sans-serif";
  c.fillText("SHARED BY", 60, 158);
  c.fillStyle = "#ece9df";
  var nm = st.n, fs = 64;
  c.font = "700 " + fs + "px 'Saira Condensed', sans-serif";
  while (c.measureText(nm).width > 1080 && fs > 30){ fs -= 4; c.font = "700 " + fs + "px 'Saira Condensed', sans-serif"; }
  c.fillText(nm, 60, 158 + fs);
  c.fillStyle = "#a9a698"; c.font = "500 24px 'Saira Condensed', sans-serif";
  c.fillText("Map: " + st.m + (st.dt ? "  •  " + st.dt : ""), 60, 268);
  var rows = shareStatRows(st);
  for (var i = 0; i < rows.length; i++){
    var x = 60 + (i % 3) * 360, y = 300 + Math.floor(i / 3) * 138;
    c.fillStyle = "#1b1e22"; c.fillRect(x, y, 340, 120);
    c.strokeStyle = "#3a4048"; c.lineWidth = 2; c.strokeRect(x, y, 340, 120);
    c.fillStyle = "#a9a698"; c.font = "700 20px 'Saira Condensed', sans-serif";
    c.fillText(rows[i][0].toUpperCase(), x + 20, y + 38);
    c.fillStyle = "#ffb52e"; c.font = "700 46px 'IBM Plex Mono', monospace";
    c.fillText(String(rows[i][1]), x + 20, y + 92);
  }
  c.fillStyle = "#a9a698"; c.font = "500 19px 'Saira Condensed', sans-serif";
  c.fillText("Fan-made tool for Project Reality: BF2 — not affiliated with the PR Team.", 60, 596);
  return cv;
}
function refreshShareCardPreview(){
  var st = collectShareStats();
  var img = $("shareCardPreview");
  if (img){ img.src = drawShareCard(st).toDataURL("image/png"); img.hidden = false; }
}
function setShareMsg(t){ var m = $("shareMsg"); if (m) m.textContent = t; }
function selectShareLink(doneMsg){
  var out = $("shareLinkOut");
  updateSharePreview();
  if (out){ out.focus(); out.select(); try { out.setSelectionRange(0, out.value.length); } catch (e) {} }
  setShareMsg(doneMsg);
}
var _shareNameEl = $("shareNameInput");
if (_shareNameEl) _shareNameEl.addEventListener("input", function(){ updateSharePreview(); refreshShareCardPreview(); });
var _shareCopyBtn = $("shareCopyBtn");
if (_shareCopyBtn) _shareCopyBtn.addEventListener("click", function(){
  refreshShareCardPreview();
  applyShareMeta(collectShareStats());
  selectShareLink("Link selected above — copy it (Ctrl+C, or long-press → Copy) and paste it anywhere; whoever opens it lands on your full results card with your name and all your stats.");
});
/* opened from a share link: rebuild the results card from the
   link's own data, and point the Open Graph / Twitter tags at
   this player's name and stats */
function setMeta(id, val){
  var m = document.getElementById(id);
  if (m) m.setAttribute("content", val);
}
/* point every preview tag at this player: title and description
   carry the name and ALL stats. The image tags point at the
   hosted card PNG as a full http(s) URL on this origin — they
   used to be set to this player's canvas card as a data: URL,
   which Discord and the other preview crawlers reject outright,
   so shared links showed no image at all; the player's own
   rendered card still appears on the page itself (the results
   card and the in-panel preview). NOTE: a preview crawler that
   fetches only the static HTML still cannot see these per-player
   tags; serving a per-player preview in the initial response
   needs a server route for ?s=… — this static page cannot do
   that. */
function applyShareMeta(st){
  var title = st.n + " — Mini Game stats · PR Mortar Calculator";
  var desc = st.n + " · Round " + st.r + " · Targets down " + st.d + " · Rounds fired " + st.f +
    " · Streak " + st.s + " · Best streak " + st.b + " · Accuracy " + shareAccuracy(st.d, st.f) +
    " · Map: " + st.m + (st.dt ? " · " + st.dt : "");
  setMeta("ogTitle", title); setMeta("twTitle", title);
  setMeta("ogDesc", desc); setMeta("twDesc", desc); setMeta("metaDesc", desc);
  /* the image tags always keep the canonical hosted PNG address —
     the same absolute URL hardcoded in the static head tags, which
     is the only form preview crawlers (raw HTML, no JS) can use */
  setMeta("ogImage", OG_IMAGE_URL); setMeta("twImage", OG_IMAGE_URL); setMeta("ogImgSecure", OG_IMAGE_URL);
  setMeta("ogImgW", "1200"); setMeta("ogImgH", "630");
}
function showSharedStats(st){
  var view = $("shareView");
  if (!view) return;
  $("shareViewName").textContent = st.n;
  $("shareViewMeta").textContent = "Map: " + st.m + (st.dt ? "  •  " + st.dt : "");
  $("shareViewStats").innerHTML = statGridHTML(st);
  document.title = st.n + " — Mini Game stats · PR Mortar Calculator";
  applyShareMeta(st);
  view.hidden = false;
}
function sharedStatsFromURL(){
  var code = null;
  try { code = new URL(window.location.href).searchParams.get("s"); } catch (e) {}
  if (!code){
    var h = window.location.hash || "";
    var m = /(?:^#|&)s=([^&]+)/.exec(h);
    if (m) code = m[1];
  }
  return code ? decodeShare(code) : null;
}
/* the canonical hosted card image: the GitHub Pages address
   hardcoded in the static head tags in index.html. Preview
   crawlers read only that raw HTML (no JS), so the static tags
   are what Discord actually uses; this constant just keeps the
   JS rewrites below pointing at the exact same absolute URL
   instead of resolving against whatever host served the page. */
var OG_IMAGE_URL = "https://reei2.github.io/Project-Reality-Mortar-Calculator/assets/og-image.png";
/* backstop for the bare page address: keep the image tags on the
   canonical hosted PNG — applyShareMeta does the same whenever
   stats are in the link or a name is typed */
setMeta("ogImage", OG_IMAGE_URL); setMeta("twImage", OG_IMAGE_URL); setMeta("ogImgSecure", OG_IMAGE_URL);
var _sharedSt = sharedStatsFromURL();
if (_sharedSt){
  showSharedStats(_sharedSt);
  var ni2 = $("shareNameInput");
  if (ni2 && _sharedSt.n !== "Anonymous mortar") ni2.value = _sharedSt.n;
}
window.addEventListener("hashchange", function(){
  var st = sharedStatsFromURL();
  if (st) showSharedStats(st);
});
function hideShareView(){ var v = $("shareView"); if (v) v.hidden = true; }
var _svClose = $("shareViewCloseBtn");
if (_svClose) _svClose.addEventListener("click", hideShareView);
var _svImg = $("shareViewImgBtn");
if (_svImg) _svImg.addEventListener("click", function(){
  var st = sharedStatsFromURL() || collectShareStats();
  var cv = drawShareCard(st);
  if (cv.toBlob){
    cv.toBlob(function(blob){
      if (!blob) return;
      var a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "pr-mini-game-stats.png";
      document.body.appendChild(a); a.click();
      setTimeout(function(){ URL.revokeObjectURL(a.href); a.remove(); }, 400);
    }, "image/png");
  }
});
var _svPlay = $("shareViewPlayBtn");
if (_svPlay) _svPlay.addEventListener("click", function(){
  hideShareView();
  if (!game.active) openGame();
});
updateSharePreview();

render();
})();
