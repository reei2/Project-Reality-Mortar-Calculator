/* Per-player OG image for the PR Mortar Calculator Mini Game.
   Edge Function (Vercel Hobby, free): GET /api/og?s=<share code>
   renders the same 1200x630 results card the page draws on canvas
   (drawShareCard in assets/app.js), with THIS player's name and stats
   filled in — so Discord / social crawlers, which never run JS, get a
   real PNG with the player's numbers on it instead of the generic
   template. The share-code decoder is a port of decodeShare() from
   assets/app.js: v3 plain text, plus v2 and v1 base64 fallbacks. */

import { ImageResponse } from '@vercel/og';
import React from 'react';

export const config = { runtime: 'edge' };

/* Map names in the same order as MAPS in assets/app.js — the share
   code only carries the map's index in base36 (Kokan = "h" = 17). */
const MAPS = [
  "Al Basrah","Assault on Grozny","Battle of Debrecen","Battle of Ia Drang",
  "Beirut","Brecourt Assault","Carentan","Charlies Point","Donbas",
  "Dovre","Dovre Winter","Dragon Fly","Fools Road","Goose Green",
  "Iron Ridge","Kafr Halab","Karbala","Kokan","Kozelsk","Krivaja Valley",
  "Lashkar Valley","Musa Qala - BETA","Muttrah City","Nuijamaa","Omaha Beach",
  "Operation Barracuda","Operation Brunswick","Operation Falcon","Operation Marlin",
  "Outpost","Ramiel","Ras el Masri","Route E-106","Rzhev","Sahel",
  "Sbeneh Outskirts","Shahadah","Stalingrad","Stalingrad Summer","Talbisah",
  "Ulyanovsk","Zakho - BETA",
  "Adak - BETA","Ascheberg","Bamyan","Battle of Kerch","Belyaevo",
  "Black Gold","Burning Sands","Fields of Kassel","Hades Peak","Icebreaker",
  "Kashan Desert","Khamisiyah","Korbach Offensive - BETA","Kunar Province - BETA",
  "Masirah","Operation Bobcat","Operation Soul Rebel","Operation Thunder - BETA",
  "Pavlovsk Bay","Road to Damascus - BETA","Saaremaa","Shijia Valley",
  "Silent Eagle","Vadso City","Vung Ro","Wanda Shan","Xiangshan","Yamalia",
  "The Falklands"
];

const SHARE_EPOCH = Date.UTC(2020, 0, 1);
const SHARE_MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function shareDateFromCode(code) {
  if (!code) return "";
  if (code.charAt(0) === "!") {
    try { return decodeURIComponent(code.slice(1)).slice(0, 30); } catch (e) { return ""; }
  }
  const days = parseInt(code, 36);
  if (isNaN(days) || days < 0) return "";
  const d = new Date(SHARE_EPOCH + days * 86400000);
  return d.getUTCDate() + " " + SHARE_MONTHS[d.getUTCMonth()] + " " + d.getUTCFullYear();
}

function shareNameFromCode(code) {
  if (!code) return "Anonymous mortar";
  try {
    const dec = decodeURIComponent(String(code).replace(/_/g, " ")).slice(0, 40);
    return dec || "Anonymous mortar";
  } catch (e) { return "Anonymous mortar"; }
}

function b64ToUtf8(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

function shareHash(s) {
  // FNV-1a, 32-bit, as 6 base36 chars — same function as assets/app.js.
  // A checksum, not a signature: anyone who recomputes it after editing
  // can still fake a link; it only stops casual editing in the URL bar.
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return ("000000" + h.toString(36)).slice(-6);
}

/* Port of decodeShare() in assets/app.js — keep in sync with it. */
function decodeShare(code) {
  if (!code) return null;
  if (code.slice(0, 2) === "5-") {
    // v5: "5-<map>-<nums>-<date>-<salt>-<name>-<hash>" — the hash is the
    // last field and covers map, stats, date, salt and the encoded name;
    // a mismatch means the link was edited by hand, so reject it (null).
    const p5 = code.slice(2).split("-");
    if (p5.length < 5) return null;
    const hash5 = p5[p5.length - 1];
    const nameCode5 = p5.slice(4, p5.length - 1).join("-");
    if (shareHash(p5[0] + "|" + p5[1] + "|" + p5[2] + "|" + p5[3] + "|" + nameCode5) !== hash5) return null;
    const mi = parseInt(p5[0], 36);
    const ns = p5[1].split(".");
    const n36 = (v) => { v = parseInt(v, 36); return isNaN(v) || v < 0 ? 0 : v; };
    return {
      n: nameCode5 ? shareNameFromCode(nameCode5) : "Anonymous mortar",
      m: (!isNaN(mi) && MAPS[mi]) ? MAPS[mi] : "Kokan",
      r: n36(ns[0]), d: n36(ns[1]), f: n36(ns[2]),
      s: n36(ns[3]), b: n36(ns[4]),
      dt: shareDateFromCode(p5[2])
    };
  }
  if (code.slice(0, 2) === "4-") {
    // v4: "4-<map>-<nums>-<date>-<salt>-<name>" — the salt is the
    // fifth field, rolled once per page load so every share link is a
    // new address Discord cannot serve a stale cached preview for;
    // it is ignored here and the name is everything after it.
    const parts = code.slice(2).split("-");
    if (parts.length < 4) return null;
    const mi = parseInt(parts[0], 36);
    const ns = parts[1].split(".");
    const n36 = (v) => { v = parseInt(v, 36); return isNaN(v) || v < 0 ? 0 : v; };
    return {
      n: parts.length > 4 ? shareNameFromCode(parts.slice(4).join("-")) : "Anonymous mortar",
      m: (!isNaN(mi) && MAPS[mi]) ? MAPS[mi] : "Kokan",
      r: n36(ns[0]), d: n36(ns[1]), f: n36(ns[2]),
      s: n36(ns[3]), b: n36(ns[4]),
      dt: shareDateFromCode(parts[2])
    };
  }
  if (code.slice(0, 2) === "3-") {
    const rest = code.slice(2);
    const i1 = rest.indexOf("-");
    const i2 = i1 < 0 ? -1 : rest.indexOf("-", i1 + 1);
    if (i1 < 0 || i2 < 0) return null;
    const i3 = rest.indexOf("-", i2 + 1);
    const datePart = i3 < 0 ? rest.slice(i2 + 1) : rest.slice(i2 + 1, i3);
    const namePart = i3 < 0 ? "" : rest.slice(i3 + 1);
    const mi = parseInt(rest.slice(0, i1), 36);
    const ns = rest.slice(i1 + 1, i2).split(".");
    const n36 = (v) => { v = parseInt(v, 36); return isNaN(v) || v < 0 ? 0 : v; };
    return {
      n: namePart ? shareNameFromCode(namePart) : "Anonymous mortar",
      m: (!isNaN(mi) && MAPS[mi]) ? MAPS[mi] : "Kokan",
      r: n36(ns[0]), d: n36(ns[1]), f: n36(ns[2]),
      s: n36(ns[3]), b: n36(ns[4]),
      dt: shareDateFromCode(datePart)
    };
  }
  try {
    let b64 = code.replace(/-/g, "+").replace(/_/g, "/");
    while (b64.length % 4) b64 += "=";
    const raw = b64ToUtf8(b64);
    const num = (v) => { v = parseInt(v, 10); return isNaN(v) || v < 0 ? 0 : v; };
    if (raw.charAt(0) === "2" && raw.charAt(1) === "|") {
      const parts = raw.split("|");
      if (parts.length !== 5) return null;
      let name = "Anonymous mortar";
      try { name = decodeURIComponent(parts[1]).slice(0, 40) || name; } catch (e) {}
      let map = "Kokan";
      if (parts[2].charAt(0) === "!") {
        try { map = decodeURIComponent(parts[2].slice(1)).slice(0, 60) || map; } catch (e) {}
      } else {
        const mi = parseInt(parts[2], 36);
        if (!isNaN(mi) && MAPS[mi]) map = MAPS[mi];
      }
      const ns = parts[3].split(".");
      const n36 = (v) => { v = parseInt(v, 36); return isNaN(v) || v < 0 ? 0 : v; };
      return {
        n: name, m: map,
        r: n36(ns[0]), d: n36(ns[1]), f: n36(ns[2]),
        s: n36(ns[3]), b: n36(ns[4]),
        dt: shareDateFromCode(parts[4])
      };
    }
    const st = JSON.parse(raw);
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

function shareAccuracy(down, fired) {
  return fired > 0 ? Math.min(100, Math.round(down / fired * 100)) + "%" : "—";
}

/* Same layout as drawShareCard() in assets/app.js (and assets/og-image.png):
   dark card, amber border, header bar, name, map + date, six stat boxes. */
function card(st) {
  const rows = [
    ["Round", String(st.r)], ["Targets down", String(st.d)], ["Rounds fired", String(st.f)],
    ["Streak", String(st.s)], ["Best streak", String(st.b)], ["Accuracy", shareAccuracy(st.d, st.f)]
  ];
  const nameSize = st.n.length <= 12 ? 64 : st.n.length <= 18 ? 52 : st.n.length <= 26 ? 44 : 36;
  const boxes = rows.map(([label, value], i) => {
    const x = 60 + (i % 3) * 360, y = 300 + Math.floor(i / 3) * 138;
    return React.createElement('div', {
      key: label,
      style: {
        position: 'absolute', left: x, top: y, width: 340, height: 120,
        background: '#1b1e22', border: '2px solid #3a4048',
        display: 'flex', flexDirection: 'column', justifyContent: 'center', paddingLeft: 20
      }
    },
      React.createElement('div', { style: { color: '#a9a698', fontSize: 20, fontWeight: 700 } }, label.toUpperCase()),
      React.createElement('div', { style: { color: '#ffb52e', fontSize: 46, fontWeight: 700, marginTop: 6 } }, value)
    );
  });
  return React.createElement('div', {
    style: {
      position: 'relative', width: '1200px', height: '630px',
      background: '#101214', color: '#ece9df', fontFamily: 'sans-serif',
      border: '6px solid #ffb52e', boxSizing: 'border-box', display: 'flex', flexDirection: 'column'
    }
  },
    React.createElement('div', {
      style: { position: 'absolute', left: 36, top: 30, width: 1128, height: 90, background: '#0c0e10', border: '2px solid #3a4048' }
    }),
    React.createElement('div', { style: { position: 'absolute', left: 60, top: 42, color: '#ffb52e', fontSize: 34, fontWeight: 700 } }, 'PR MORTAR CALCULATOR'),
    React.createElement('div', { style: { position: 'absolute', left: 60, top: 82, color: '#a9a698', fontSize: 22, fontWeight: 500 } }, 'MINI GAME — DIAL TRAINING RESULTS'),
    React.createElement('div', { style: { position: 'absolute', left: 60, top: 140, color: '#a9a698', fontSize: 20, fontWeight: 700 } }, 'SHARED BY'),
    React.createElement('div', { style: { position: 'absolute', left: 60, top: 158, color: '#ece9df', fontSize: nameSize, fontWeight: 700 } }, st.n),
    React.createElement('div', { style: { position: 'absolute', left: 60, top: 244, color: '#a9a698', fontSize: 24, fontWeight: 500 } },
      'Map: ' + st.m + (st.dt ? '  •  ' + st.dt : '')),
    ...boxes,
    React.createElement('div', { style: { position: 'absolute', left: 60, top: 578, color: '#a9a698', fontSize: 19, fontWeight: 500 } },
      'Fan-made tool for Project Reality: BF2 — not affiliated with the PR Team.')
  );
}

/* No (or bad) code: the same generic template as assets/og-image.png. */
function genericCard() {
  const rows = ["Round", "Targets down", "Rounds fired", "Streak", "Best streak", "Accuracy"];
  const boxes = rows.map((label, i) => {
    const x = 60 + (i % 3) * 360, y = 300 + Math.floor(i / 3) * 138;
    return React.createElement('div', {
      key: label,
      style: {
        position: 'absolute', left: x, top: y, width: 340, height: 120,
        background: '#1b1e22', border: '2px solid #3a4048',
        display: 'flex', flexDirection: 'column', justifyContent: 'center', paddingLeft: 20
      }
    },
      React.createElement('div', { style: { color: '#a9a698', fontSize: 20, fontWeight: 700 } }, label.toUpperCase()),
      React.createElement('div', { style: { color: '#ffb52e', fontSize: 46, fontWeight: 700, marginTop: 6 } }, '—')
    );
  });
  return React.createElement('div', {
    style: {
      position: 'relative', width: '1200px', height: '630px',
      background: '#101214', color: '#ece9df', fontFamily: 'sans-serif',
      border: '6px solid #ffb52e', boxSizing: 'border-box', display: 'flex', flexDirection: 'column'
    }
  },
    React.createElement('div', {
      style: { position: 'absolute', left: 36, top: 30, width: 1128, height: 90, background: '#0c0e10', border: '2px solid #3a4048' }
    }),
    React.createElement('div', { style: { position: 'absolute', left: 60, top: 42, color: '#ffb52e', fontSize: 34, fontWeight: 700 } }, 'PR MORTAR CALCULATOR'),
    React.createElement('div', { style: { position: 'absolute', left: 60, top: 82, color: '#a9a698', fontSize: 22, fontWeight: 500 } }, 'MINI GAME — DIAL TRAINING RESULTS'),
    React.createElement('div', { style: { position: 'absolute', left: 60, top: 150, color: '#ece9df', fontSize: 56, fontWeight: 700 } }, 'Mini Game Results'),
    React.createElement('div', { style: { position: 'absolute', left: 60, top: 228, color: '#a9a698', fontSize: 24, fontWeight: 500 } },
      "Open a player's share link to see their name and full stats card."),
    ...boxes,
    React.createElement('div', { style: { position: 'absolute', left: 60, top: 578, color: '#a9a698', fontSize: 19, fontWeight: 500 } },
      'Fan-made tool for Project Reality: BF2 — not affiliated with the PR Team.')
  );
}

export default async function handler(req) {
  const url = new URL(req.url);
  const code = url.searchParams.get('s');
  const st = decodeShare(code);
  const res = new ImageResponse(st ? card(st) : genericCard(), { width: 1200, height: 630 });
  /* The image is fully determined by the ?s= code, so it is safe to
     cache it for a week — Discord caches previews anyway. */
  res.headers.set('Cache-Control', 'public, max-age=604800, immutable');
  return res;
}
