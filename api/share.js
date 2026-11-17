/* Server-rendered share page for the PR Mortar Calculator Mini Game.
   Edge Function (Vercel Hobby, free): GET /?s=<share code> is rewritten
   here by vercel.json (only when the request has ?s= and no &play=).
   Discord / social crawlers fetch this URL and read the Open Graph tags
   in the FIRST response — no JavaScript involved — so the tags are built
   here, on the server, from the decoded share code: the title and
   description carry the player's name and every stat, and og:image
   points at /api/og?s=<same code>, the per-player PNG.
   Humans get the same numbers as a readable results card, with a Play
   button that opens the real calculator at /?s=<code>&play=1 — the
   &play=1 is what keeps vercel.json from rewriting that click back
   here again. */

export const config = { runtime: 'edge' };

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

/* Port of decodeShare() in assets/app.js — keep in sync with it. */
function decodeShare(code) {
  if (!code) return null;
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

function esc(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

export default async function handler(req) {
  const url = new URL(req.url);
  const code = url.searchParams.get('s') || '';
  const st = decodeShare(code);
  const origin = url.origin;
  const playUrl = origin + '/?s=' + encodeURIComponent(code) + '&play=1';

  if (!st) {
    const img = origin + '/assets/og-image.png';
    const html = '<!doctype html><html lang="en"><head><meta charset="utf-8" />'
      + '<meta name="viewport" content="width=device-width, initial-scale=1" />'
      + '<title>PR Mortar Calculator — Mini Game Results</title>'
      + '<meta property="og:type" content="website" />'
      + '<meta property="og:url" content="' + esc(url.href) + '" />'
      + '<meta property="og:title" content="PR Mortar Calculator — Mini Game Results" />'
      + '<meta property="og:description" content="Mini Game dial-training stats: round, targets down, rounds fired, streak, best streak and accuracy. Open the link to see the player\'s full card." />'
      + '<meta property="og:image" content="' + esc(img) + '" />'
      + '<meta property="og:image:type" content="image/png" />'
      + '<meta property="og:image:width" content="1200" /><meta property="og:image:height" content="630" />'
      + '<meta name="twitter:card" content="summary_large_image" />'
      + '<meta name="twitter:title" content="PR Mortar Calculator — Mini Game Results" />'
      + '<meta name="twitter:image" content="' + esc(img) + '" />'
      + '</head><body style="background:#101214;color:#ece9df;font-family:sans-serif;text-align:center;padding:48px 16px">'
      + '<h1>PR Mortar Calculator</h1><p>That share link could not be read.</p>'
      + '<p><a href="' + esc(origin) + '/" style="color:#ffb52e">Open the calculator</a></p>'
      + '</body></html>';
    return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  }

  const title = st.n + ' — Mini Game stats · PR Mortar Calculator';
  const desc = st.n + ' · Round ' + st.r + ' · Targets down ' + st.d + ' · Rounds fired ' + st.f
    + ' · Streak ' + st.s + ' · Best streak ' + st.b + ' · Accuracy ' + shareAccuracy(st.d, st.f)
    + ' · Map: ' + st.m + (st.dt ? ' · ' + st.dt : '');
  const img = origin + '/api/og?s=' + encodeURIComponent(code);
  const rows = [
    ['Round', st.r], ['Targets down', st.d], ['Rounds fired', st.f],
    ['Streak', st.s], ['Best streak', st.b], ['Accuracy', shareAccuracy(st.d, st.f)]
  ].map(([l, v]) =>
    '<div style="background:#1b1e22;border:2px solid #3a4048;padding:16px 20px;text-align:left">'
    + '<div style="color:#a9a698;font-size:13px;font-weight:700;letter-spacing:1px">' + l.toUpperCase() + '</div>'
    + '<div style="color:#ffb52e;font-size:36px;font-weight:700;margin-top:4px">' + esc(v) + '</div></div>'
  ).join('');

  const html = '<!doctype html><html lang="en"><head><meta charset="utf-8" />'
    + '<meta name="viewport" content="width=device-width, initial-scale=1" />'
    + '<title>' + esc(title) + '</title>'
    + '<meta name="description" content="' + esc(desc) + '" />'
    + '<meta property="og:type" content="website" />'
    + '<meta property="og:url" content="' + esc(url.href) + '" />'
    + '<meta property="og:title" content="' + esc(title) + '" />'
    + '<meta property="og:description" content="' + esc(desc) + '" />'
    + '<meta property="og:image" content="' + esc(img) + '" />'
    + '<meta property="og:image:secure_url" content="' + esc(img) + '" />'
    + '<meta property="og:image:type" content="image/png" />'
    + '<meta property="og:image:width" content="1200" /><meta property="og:image:height" content="630" />'
    + '<meta property="og:image:alt" content="' + esc(desc) + '" />'
    + '<meta name="twitter:card" content="summary_large_image" />'
    + '<meta name="twitter:title" content="' + esc(title) + '" />'
    + '<meta name="twitter:description" content="' + esc(desc) + '" />'
    + '<meta name="twitter:image" content="' + esc(img) + '" />'
    + '</head><body style="background:#101214;color:#ece9df;font-family:sans-serif;margin:0;padding:32px 16px">'
    + '<main style="max-width:720px;margin:0 auto">'
    + '<div style="border:2px solid #3a4048;background:#0c0e10;padding:16px 20px">'
    + '<div style="color:#ffb52e;font-weight:700;font-size:22px">PR MORTAR CALCULATOR</div>'
    + '<div style="color:#a9a698;font-size:14px;margin-top:2px">MINI GAME — DIAL TRAINING RESULTS</div></div>'
    + '<p style="color:#a9a698;font-size:13px;font-weight:700;margin:24px 0 4px">SHARED BY</p>'
    + '<h1 style="font-size:44px;margin:0">' + esc(st.n) + '</h1>'
    + '<p style="color:#a9a698">Map: ' + esc(st.m) + (st.dt ? ' &nbsp;•&nbsp; ' + esc(st.dt) : '') + '</p>'
    + '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px">' + rows + '</div>'
    + '<p style="margin-top:28px"><a href="' + esc(playUrl) + '" style="display:inline-block;background:#ffb52e;color:#101214;font-weight:700;text-decoration:none;padding:14px 28px;border-radius:6px">▶ Play the Mini Game</a></p>'
    + '<p style="color:#a9a698;font-size:13px">Fan-made tool for Project Reality: BF2 — not affiliated with the PR Team.</p>'
    + '</main></body></html>';

  return new Response(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, max-age=3600'
    }
  });
}
