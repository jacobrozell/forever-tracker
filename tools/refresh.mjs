// Reads WoW: Forever SavedVariables and rewrites the scan block in index.html.
// Log out of the game (or /reload) first so the save files are current.
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pagePath = path.join(root, "index.html");
const dry = process.argv.includes("--dry");

const ROSTER = [
  ["leif", "Leif Ericsky", ["Skinning", "Leatherworking"]],
  ["murus", "Murus Ularis", ["Mining", "Blacksmithing"]],
  ["rum", "Rum Weasley", ["Herbalism", "Alchemy"]],
  ["fatal", "Fatal Segfault", ["Skinning", "Enchanting"]],
  ["libertty", "Libertty Bibertty", ["Mining", "Engineering"]],
  ["corwyn", "Corwyn Shadowalker", ["Mining", "Tailoring"]],
  ["redstone", "Redstone Creditunion", ["Herbalism", null]],
  ["warrior", "Keg Kenobi", ["Mining", "Skinning"]],
  ["rogue", "Sneaky Gnomes", ["Herbalism", "Skinning"]],
];
const GATHER = new Set(["Mining", "Herbalism", "Skinning"]);
const CRAFT = new Set(["Blacksmithing", "Leatherworking", "Alchemy", "Enchanting", "Engineering", "Tailoring", "Jewelcrafting", "Inscription"]);
const BAG_NAME = /\b(bag|pouch|quiver|satchel|pack)\b/i;
const PROF_BAG = /\b(mining pack|skinning satchel|herb pouch)\b/i;

function findSavedDir() {
  const fromEnv = process.env.WOW_SAVED;
  const roots = [
    fromEnv,
    "C:\\Program Files (x86)\\World of Warcraft\\_forever_\\WTF\\Account",
    "C:\\Program Files\\World of Warcraft\\_forever_\\WTF\\Account",
  ].filter(Boolean);
  let best = null;
  for (const dir of roots) {
    if (!fs.existsSync(dir)) continue;
    if (fs.existsSync(path.join(dir, "DataStore_Characters.lua"))) return dir;
    for (const name of fs.readdirSync(dir)) {
      const sv = path.join(dir, name, "SavedVariables");
      const file = path.join(sv, "DataStore_Characters.lua");
      if (!fs.existsSync(file)) continue;
      const mtime = fs.statSync(file).mtimeMs;
      if (!best || mtime > best.mtime) best = { dir: sv, mtime };
    }
  }
  if (!best) throw new Error("Couldn't find WoW Forever SavedVariables. Set WOW_SAVED to that folder.");
  return best.dir;
}

class Lua {
  constructor(text) { this.s = text; this.i = 0; }
  skip() {
    const s = this.s;
    while (this.i < s.length) {
      const c = s[this.i];
      if (c === " " || c === "\t" || c === "\r" || c === "\n") { this.i++; continue; }
      if (c === "-" && s[this.i + 1] === "-") {
        if (s[this.i + 2] === "[" && s[this.i + 3] === "[") {
          const end = s.indexOf("]]", this.i + 4);
          this.i = end < 0 ? s.length : end + 2;
        } else {
          const nl = s.indexOf("\n", this.i);
          this.i = nl < 0 ? s.length : nl + 1;
        }
        continue;
      }
      break;
    }
  }
  peek(n = 0) { return this.s[this.i + n]; }
  expect(ch) {
    this.skip();
    if (this.s[this.i] !== ch) throw new Error(`Expected ${ch} at ${this.i}, saw ${JSON.stringify(this.s.slice(this.i, this.i + 40))}`);
    this.i++;
  }
  ident() {
    this.skip();
    const m = this.s.slice(this.i).match(/^[A-Za-z_][A-Za-z0-9_]*/);
    if (!m) throw new Error(`Expected name at ${this.i}`);
    this.i += m[0].length;
    return m[0];
  }
  string() {
    const q = this.s[this.i++];
    let out = "";
    while (this.i < this.s.length) {
      const c = this.s[this.i++];
      if (c === "\\") {
        const n = this.s[this.i++] ?? "";
        out += n === "n" ? "\n" : n === "r" ? "\r" : n === "t" ? "\t" : n;
      } else if (c === q) break;
      else out += c;
    }
    return out;
  }
  value() {
    this.skip();
    const c = this.peek();
    if (c === "{") return this.table();
    if (c === '"' || c === "'") return this.string();
    if (this.s.startsWith("nil", this.i) && !/[A-Za-z0-9_]/.test(this.peek(3) || "")) { this.i += 3; return null; }
    if (this.s.startsWith("true", this.i) && !/[A-Za-z0-9_]/.test(this.peek(4) || "")) { this.i += 4; return true; }
    if (this.s.startsWith("false", this.i) && !/[A-Za-z0-9_]/.test(this.peek(5) || "")) { this.i += 5; return false; }
    const m = this.s.slice(this.i).match(/^-?(?:\d+\.\d+|\d+)(?:[eE][+-]?\d+)?/);
    if (!m) throw new Error(`Bad value at ${this.i}: ${JSON.stringify(this.s.slice(this.i, this.i + 40))}`);
    this.i += m[0].length;
    return Number(m[0]);
  }
  table() {
    this.expect("{");
    const obj = {};
    let idx = 1;
    this.skip();
    while (this.peek() !== "}") {
      this.skip();
      if (this.peek() === "}") break;
      if (this.peek() === "[") {
        this.i++;
        const key = this.value();
        this.skip();
        this.expect("]");
        this.skip();
        this.expect("=");
        obj[key] = this.value();
      } else if (/[A-Za-z_]/.test(this.peek())) {
        const save = this.i;
        const id = this.ident();
        this.skip();
        if (this.peek() === "=") { this.i++; obj[id] = this.value(); }
        else { this.i = save; obj[idx++] = this.value(); }
      } else obj[idx++] = this.value();
      this.skip();
      if (this.peek() === ",") { this.i++; this.skip(); }
    }
    this.expect("}");
    return obj;
  }
  file() {
    const out = {};
    this.skip();
    while (this.i < this.s.length) {
      const name = this.ident();
      this.skip();
      this.expect("=");
      out[name] = this.value();
      this.skip();
    }
    return out;
  }
}

function parseLuaFile(file) {
  const buf = fs.readFileSync(file);
  if (buf.includes(0)) throw new Error("binary");
  const text = buf.toString("utf8").replace(/^\uFEFF/, "");
  return new Lua(text).file();
}

function load(dir, name) {
  const file = path.join(dir, name);
  try { return parseLuaFile(file); }
  catch (err) { throw new Error(`${name}: ${err.message}`); }
}

function nums(t) {
  if (!t || typeof t !== "object") return [];
  const keys = Object.keys(t).map(Number).filter(n => Number.isInteger(n) && n > 0);
  if (!keys.length) return [];
  const max = Math.max(...keys);
  const out = [];
  for (let i = 1; i <= max; i++) out.push(t[i] ?? null);
  return out;
}

function bits(n, offset, length) {
  let b = BigInt(n);
  if (offset) b >>= BigInt(offset);
  if (length != null) b &= (1n << BigInt(length)) - 1n;
  return Number(b);
}

function knownSkills(craftChar) {
  const known = {};
  if (!craftChar) return known;
  const profs = nums(craftChar.Professions);
  const ranks = nums(craftChar.Ranks);
  profs.forEach((prof, i) => {
    if (!prof?.Name) return;
    const packed = ranks[i];
    let rank = 0;
    let max = 0;
    if (packed) { rank = bits(packed, 0, 16); max = bits(packed, 16, 16); }
    if (!rank && prof.CategoryInfo) {
      let r = 0, m = 0;
      for (const n of nums(prof.CategoryInfo)) {
        if (!n) continue;
        r += bits(n, 0, 10);
        m += bits(n, 10, 10);
      }
      if (r) { rank = r; max = m || max; }
    }
    if (!rank && prof.Rank) rank = prof.Rank;
    if (!max && prof.MaxRank) max = prof.MaxRank;
    if (!rank) return;
    known[prof.Name] = { rank, max: max || (rank <= 75 ? 75 : 150) };
  });
  return known;
}

function occupied(bag) {
  if (!bag?.items) return 0;
  return Object.keys(bag.items).filter(k => /^\d+$/.test(k)).length;
}

function kindOf(name) {
  if (GATHER.has(name)) return "g";
  if (CRAFT.has(name)) return "c";
  return "s";
}

function linkName(link) {
  if (typeof link !== "string") return null;
  const m = link.match(/\|h\[([^\]]+)\]\|h/);
  return m ? m[1] : null;
}

function decodeSlot(n) {
  if (n == null || typeof n !== "number") return null;
  const pos = bits(n, 13, 3) === 0 ? 16 : 10;
  const count = bits(n, 0, pos) || 1;
  const itemID = bits(n, pos, 40);
  return { count, itemID };
}

function bagItemId(link) {
  if (link == null) return null;
  const m = String(link).match(/^(\d+)/);
  return m ? Number(m[1]) : null;
}

function harvestPrices(html) {
  const book = new Map();
  const take = (name, price, listed) => {
    if (price == null || Number.isNaN(price)) return;
    const prev = book.get(name);
    if (!prev || (listed && !prev.listed)) book.set(name, { price, listed: listed || 0 });
  };
  const inv = html.match(/const INV=\{[\s\S]*?\};/);
  if (inv) {
    const re = /\["((?:\\.|[^"\\])*)",\d+,"(?:bags|bank|mail)",(null|\d+),(\d+)/g;
    let m;
    while ((m = re.exec(inv[0]))) take(JSON.parse(`"${m[1]}"`), m[2] === "null" ? null : Number(m[2]), Number(m[3]));
  }
  const prices = html.match(/const PRICES=\[[\s\S]*?\];/);
  if (prices) {
    const re = /\["((?:\\.|[^"\\])*)",(\d+),(\d+)\]/g;
    let m;
    while ((m = re.exec(prices[0]))) take(JSON.parse(`"${m[1]}"`), Number(m[2]), Number(m[3]));
  }
  const gen = html.match(/const GENERATED = (\{[\s\S]*?\});\r?\n\/\* END GENERATED SCAN \*\//);
  if (gen) {
    try {
      const prev = JSON.parse(gen[1]);
      for (const [name, pair] of Object.entries(prev.prices || {})) {
        if (!book.has(name)) take(name, pair[0], pair[1]);
      }
    } catch { /* the page still has the handwritten price lists */ }
  }
  return book;
}

function cborLen(buf, st, info) {
  if (info < 24) return info;
  if (info === 24) return buf[st.i++];
  if (info === 25) { const n = buf.readUInt16BE(st.i); st.i += 2; return n; }
  if (info === 26) { const n = buf.readUInt32BE(st.i); st.i += 4; return n; }
  if (info === 27) { const n = Number(buf.readBigUInt64BE(st.i)); st.i += 8; return n; }
  throw new Error("unsupported cbor length");
}

function cbor(buf, st = { i: 0 }) {
  const b = buf[st.i++];
  const major = b >> 5;
  const info = b & 31;
  if (major === 0) return cborLen(buf, st, info);
  if (major === 1) return -1 - cborLen(buf, st, info);
  if (major === 2 || major === 3) {
    const n = cborLen(buf, st, info);
    const slice = buf.subarray(st.i, st.i + n);
    st.i += n;
    return major === 3 ? slice.toString("utf8") : slice;
  }
  if (major === 4) {
    const n = cborLen(buf, st, info);
    const out = [];
    for (let i = 0; i < n; i++) out.push(cbor(buf, st));
    return out;
  }
  if (major === 5) {
    const n = cborLen(buf, st, info);
    const out = {};
    for (let i = 0; i < n; i++) out[cbor(buf, st)] = cbor(buf, st);
    return out;
  }
  if (major === 6) { cborLen(buf, st, info); return cbor(buf, st); }
  if (major === 7) {
    if (info === 20) return false;
    if (info === 21) return true;
    if (info === 22 || info === 23) return null;
    if (info === 25) { st.i += 2; return null; }
    if (info === 26) { const n = buf.readFloatBE(st.i); st.i += 4; return n; }
    if (info === 27) { const n = buf.readDoubleBE(st.i); st.i += 8; return n; }
    return null;
  }
  throw new Error("bad cbor");
}

function prettyZone(key) {
  const small = new Set(["of", "the", "and", "in", "a"]);
  return key.split("_").map((word, i) => {
    const lower = word.toLowerCase();
    if (i > 0 && small.has(lower)) return lower;
    return lower.charAt(0).toUpperCase() + lower.slice(1);
  }).join(" ");
}

function foreverRoot(savedDir) {
  return path.resolve(savedDir, "..", "..", "..", "..");
}

function loadZoneNames(root) {
  const file = path.join(root, "Interface", "AddOns", "QuestieDB", "src", "corrections", "enum", "zones.lua");
  const names = new Map();
  if (!fs.existsSync(file)) return names;
  const re = /^\s*([A-Z0-9_]+)\s*=\s*(\d+)\s*,/gm;
  let m;
  const text = fs.readFileSync(file, "utf8");
  while ((m = re.exec(text))) if (!names.has(Number(m[2]))) names.set(Number(m[2]), prettyZone(m[1]));
  return names;
}

function loadParents(root) {
  const file = path.join(root, "Interface", "AddOns", "QuestieDB", "support", "Forever", "Zones", "subZoneToParentZone.lua");
  const parents = new Map();
  if (!fs.existsSync(file)) return parents;
  const re = /\[(\d+)\]\s*=\s*(\d+)/g;
  let m;
  const text = fs.readFileSync(file, "utf8");
  while ((m = re.exec(text))) parents.set(Number(m[1]), Number(m[2]));
  return parents;
}

function loadCategories(root) {
  const file = path.join(root, "Interface", "AddOns", "Questie", "Localization", "lookups", "lookupQuestCategories.lua");
  const cats = new Map();
  if (!fs.existsSync(file)) return cats;
  const re = /\[(-?\d+)\]\s*=\s*"([^"]+)"/g;
  let m;
  const text = fs.readFileSync(file, "utf8");
  while ((m = re.exec(text))) cats.set(Number(m[1]), m[2]);
  return cats;
}

function rootZone(id, parents) {
  const seen = new Set();
  while (parents.has(id) && !seen.has(id)) { seen.add(id); id = parents.get(id); }
  return id;
}

function asText(value) {
  if (typeof value === "string") return value;
  if (Buffer.isBuffer(value)) return value.toString("utf8");
  return "";
}

function questBlurb(value) {
  const lines = [];
  const walk = (v) => {
    if (typeof v === "string" || Buffer.isBuffer(v)) {
      const text = asText(v).replace(/\|c[0-9a-fA-F]{8}|\|r/g, "").replace(/\s+/g, " ").trim();
      if (text) lines.push(text);
    } else if (Array.isArray(v)) v.forEach(walk);
  };
  walk(value);
  const text = lines.join(" ");
  return text.length > 240 ? `${text.slice(0, 237).trimEnd()}…` : text;
}

function questLookup(root, needed) {
  const toc = path.join(root, "Interface", "AddOns", "QuestieDB", "QuestieDB_Forever.toc");
  const found = new Map();
  if (!needed.size || !fs.existsSync(toc)) return found;
  const text = fs.readFileSync(toc, "utf8");
  const re = /^## X-Quest-(\d+)-(S|8): (\S+)/gm;
  let m;
  while ((m = re.exec(text))) {
    const id = Number(m[1]);
    if (!needed.has(id)) continue;
    let row;
    try { row = cbor(Buffer.from(m[3], "base64")); } catch { continue; }
    const entry = found.get(id) || { name: "", zone: null, level: null, desc: "" };
    if (m[2] === "S") {
      entry.name = asText(row[1]);
      entry.zone = typeof row[17] === "number" ? row[17] : null;
      entry.level = typeof row[5] === "number" && row[5] > 0 ? row[5] : null;
    } else {
      entry.desc = questBlurb(row);
    }
    found.set(id, entry);
  }
  return found;
}

function buildQuests(savedDir) {
  const file = path.join(savedDir, "Questie.lua");
  const byChar = {};
  if (!fs.existsSync(file)) return byChar;
  let parsed;
  try { parsed = parseLuaFile(file); } catch { return byChar; }
  const chars = parsed.QuestieConfig?.char || {};
  const needed = new Set();
  const done = new Map();
  for (const [id, name] of ROSTER) {
    const complete = chars[name]?.complete;
    if (!complete) continue;
    const ids = Object.keys(complete).map(Number).filter(n => Number.isInteger(n) && complete[n] === true);
    done.set(id, ids);
    ids.forEach(n => needed.add(n));
  }
  const root = foreverRoot(savedDir);
  const rows = questLookup(root, needed);
  const zones = loadZoneNames(root);
  const parents = loadParents(root);
  const categories = loadCategories(root);
  for (const [id, ids] of done) {
    const groups = new Map();
    for (const qid of ids) {
      const row = rows.get(qid);
      const rawName = row?.name;
      const title = (typeof rawName === "string" ? rawName : Buffer.isBuffer(rawName) ? rawName.toString("utf8") : "") || `Quest ${qid}`;
      let zone = "Other";
      if (typeof row?.zone === "number") {
        if (row.zone < 0) zone = categories.get(row.zone) || "Other";
        else {
          const area = rootZone(row.zone, parents);
          zone = zones.get(area) || zones.get(row.zone) || `Zone ${area}`;
        }
      }
      if (!groups.has(zone)) groups.set(zone, new Map());
      const bag = groups.get(zone);
      const prev = bag.get(title) || { n: 0, lo: null, hi: null, desc: "" };
      prev.n += 1;
      if (typeof row?.level === "number") {
        prev.lo = prev.lo == null ? row.level : Math.min(prev.lo, row.level);
        prev.hi = prev.hi == null ? row.level : Math.max(prev.hi, row.level);
      }
      if (!prev.desc && row?.desc) prev.desc = row.desc;
      bag.set(title, prev);
    }
    const lists = new Map();
    for (const [zone, bag] of groups) {
      lists.set(zone, [...bag.entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([title, q]) => [title, q.lo == null ? "" : q.lo === q.hi ? String(q.lo) : `${q.lo}–${q.hi}`, q.desc, q.n]));
    }
    byChar[id] = [...lists.entries()].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));
  }
  return byChar;
}

const REP_THRESHOLDS = [-42000, -6000, -3000, 0, 3000, 9000, 21000, 42000, 43000];
const REP_STANDINGS = ["Hated", "Hostile", "Unfriendly", "Neutral", "Friendly", "Honored", "Revered", "Exalted", "Paragon"];
const REP_NAMES = { 469: "Alliance", 72: "Stormwind", 47: "Ironforge", 69: "Darnassus", 54: "Gnomeregan", 909: "Darkmoon Faire" };
const REP_ORDER = [469, 72, 47, 69, 54, 909];
const GEAR_SLOTS = ["Head", "Neck", "Shoulder", "Shirt", "Chest", "Waist", "Legs", "Feet", "Wrist", "Hands", "Ring", "Ring", "Trinket", "Trinket", "Back", "Main hand", "Off hand", "Ranged", "Tabard"];

function charSlots(dir) {
  const ids = load(dir, "DataStore.lua");
  const byName = new Map();
  nums(ids.DataStore_CharacterIDs?.List).forEach((full, i) => byName.set(String(full).split(".").pop(), i));
  return byName;
}

function decodeRep(packed) {
  if (bits(packed, 0, 3) !== 0) return null;
  const negative = bits(packed, 3, 1) === 1;
  const standing = bits(packed, 4, 4);
  let earned = Number(BigInt(packed) >> 8n);
  if (negative) earned = -earned;
  let top = REP_THRESHOLDS[REP_THRESHOLDS.length - 1] + 1000;
  let index = REP_THRESHOLDS.length - 1;
  while (index > 0 && earned < REP_THRESHOLDS[index]) { top = REP_THRESHOLDS[index]; index -= 1; }
  const bottom = REP_THRESHOLDS[index];
  const span = Math.max(1, top - bottom);
  return [REP_STANDINGS[standing - 1] || REP_STANDINGS[index] || "Unknown", Math.max(0, earned - bottom), span];
}

function itemLookup(root, needed) {
  const found = new Map();
  const toc = path.join(root, "Interface", "AddOns", "QuestieDB", "QuestieDB_Forever.toc");
  if (!needed.size || !fs.existsSync(toc)) return found;
  const text = fs.readFileSync(toc, "utf8");
  const re = /^## X-Item-(\d+)-S: (\S+)/gm;
  let m;
  while ((m = re.exec(text))) {
    const id = Number(m[1]);
    if (!needed.has(id) || found.has(id)) continue;
    try {
      const row = cbor(Buffer.from(m[2], "base64"));
      const name = asText(row[1]);
      if (name) found.set(id, name);
    } catch { /* unnamed reward */ }
    if (found.size === needed.size) break;
  }
  return found;
}

function rewardText(raw, names) {
  if (!raw) return "";
  const parts = [];
  for (const piece of String(raw).split(",")) {
    const [kind, id, count] = piece.split("|");
    if (kind === "s") { parts.push("Spell"); continue; }
    const name = names.get(Number(id));
    if (!name) continue;
    const n = Number(count) || 1;
    parts.push(n > 1 ? `${name} ×${n}` : name);
  }
  return parts.join(", ");
}

function buildLog(dir, knownNames) {
  const byChar = {};
  const file = path.join(dir, "DataStore_Quests.lua");
  if (!fs.existsSync(file)) return byChar;
  let parsed;
  try { parsed = load(dir, "DataStore_Quests.lua"); } catch { return byChar; }
  const slots = charSlots(dir);
  const rows = nums(parsed.DataStore_Quests_Characters);
  const pending = [];
  const questIds = new Set();
  const itemIds = new Set();
  for (const [id, name] of ROSTER) {
    const index = slots.get(name);
    const row = index == null ? null : rows[index];
    if (!row?.Quests) continue;
    const headers = nums(row.QuestHeaders);
    const list = [];
    nums(row.Quests).forEach((value, i) => {
      if (value == null) return;
      const questID = bits(value, 6, 18);
      const header = headers[bits(value, 1, 5) - 1] || "Log";
      const ready = bits(value, 0, 1) === 1;
      const money = Number(BigInt(value) >> 24n);
      const rewardIds = [];
      for (const piece of String(row.Rewards?.[i + 1] || "").split(",")) {
        const [kind, item] = piece.split("|");
        if ((kind === "r" || kind === "c") && item) {
          const itemID = Number(item);
          if (!knownNames.has(itemID)) itemIds.add(itemID);
          rewardIds.push(piece);
        } else if (kind === "s") rewardIds.push(piece);
      }
      questIds.add(questID);
      list.push({ header, questID, ready, money, rewardIds });
    });
    if (list.length) pending.push([id, list]);
  }
  const root = foreverRoot(dir);
  const quests = questLookup(root, questIds);
  const items = itemLookup(root, itemIds);
  const names = new Map([...knownNames, ...items]);
  for (const [id, list] of pending) {
    const groups = new Map();
    for (const q of list) {
      const row = quests.get(q.questID);
      const title = row?.name || `Quest ${q.questID}`;
      const level = typeof row?.level === "number" ? String(row.level) : "";
      const money = q.money ? `${Math.floor(q.money / 100)}s` : "";
      const reward = [rewardText(q.rewardIds.join(","), names), money].filter(Boolean).join(", ");
      if (!groups.has(q.header)) groups.set(q.header, []);
      groups.get(q.header).push([title, level, row?.desc || "", 1, reward, q.ready ? 1 : 0]);
    }
    byChar[id] = [...groups.entries()];
  }
  return byChar;
}

function buildGear(dir) {
  const byChar = {};
  const file = path.join(dir, "DataStore_Inventory.lua");
  if (!fs.existsSync(file)) return byChar;
  let parsed;
  try { parsed = load(dir, "DataStore_Inventory.lua"); } catch { return byChar; }
  const slots = charSlots(dir);
  const rows = nums(parsed.DataStore_Inventory_Characters);
  for (const [id, name] of ROSTER) {
    const row = slots.has(name) ? rows[slots.get(name)] : null;
    if (!row?.Inventory) continue;
    const worn = nums(row.Inventory).map((link, i) => {
      if (typeof link !== "string") return null;
      const label = linkName(link);
      if (!label) return null;
      const quality = Number((link.match(/IQ(\d)/) || [])[1] || 1);
      return [GEAR_SLOTS[i] || "Slot", label, quality];
    }).filter(Boolean);
    if (!worn.length && !row.averageItemLvl) continue;
    byChar[id] = [row.averageItemLvl ? Math.round(row.averageItemLvl * 10) / 10 : 0, worn];
  }
  return byChar;
}

function buildRep(dir) {
  const byChar = {};
  const file = path.join(dir, "DataStore_Reputations.lua");
  if (!fs.existsSync(file)) return byChar;
  let parsed;
  try { parsed = load(dir, "DataStore_Reputations.lua"); } catch { return byChar; }
  const slots = charSlots(dir);
  const rows = nums(parsed.DataStore_Reputations_Characters);
  for (const [id, name] of ROSTER) {
    const row = slots.has(name) ? rows[slots.get(name)] : null;
    if (!row?.Factions) continue;
    const have = new Map(Object.entries(row.Factions).map(([k, v]) => [Number(k), v]));
    const order = [...REP_ORDER.filter(fid => have.has(fid)), ...[...have.keys()].filter(fid => !REP_ORDER.includes(fid)).sort((a, b) => a - b)];
    const factions = [];
    for (const fid of order) {
      const decoded = decodeRep(have.get(fid));
      if (!decoded) continue;
      factions.push([REP_NAMES[fid] || `Faction ${fid}`, ...decoded]);
    }
    if (factions.length) byChar[id] = [row.guildName || "", factions];
  }
  return byChar;
}

function build(dir, priceBook) {
  const characters = load(dir, "DataStore_Characters.lua");
  const ids = load(dir, "DataStore.lua");
  const crafts = load(dir, "DataStore_Crafts.lua");
  const containers = load(dir, "DataStore_Containers.lua");
  let brother = {};
  try { brother = load(dir, "BagBrother.lua"); } catch { /* bags stay unscanned */ }

  const idToName = new Map();
  for (const name of fs.readdirSync(dir)) {
    if (!name.endsWith(".lua") || name.endsWith(".bak")) continue;
    const buf = fs.readFileSync(path.join(dir, name));
    if (buf.includes(0)) continue;
    const text = buf.toString("utf8");
    const re = /item:(\d+)[^|\r\n]*\|h\[([^\]]+)\]\|h/g;
    let m;
    while ((m = re.exec(text))) idToName.set(Number(m[1]), m[2]);
  }

  const names = nums(ids.DataStore_CharacterIDs.List);
  const info = nums(characters.DataStore_Characters_Info);
  const craftChars = nums(crafts.DataStore_Crafts_Characters);
  const contChars = nums(containers.DataStore_Containers_Characters);
  const byName = new Map();
  names.forEach((full, i) => {
    const name = String(full).split(".").pop();
    byName.set(name, { info: info[i], crafts: craftChars[i], cont: contChars[i] });
  });

  const bagsByName = new Map();
  for (const realm of Object.values(brother.BrotherBags || {})) {
    if (!realm || typeof realm !== "object") continue;
    for (const [name, data] of Object.entries(realm)) {
      if (data && typeof data === "object" && data.class) bagsByName.set(name, data);
    }
  }

  const chars = {};
  const scan = {};
  const gold = [];
  const bags = [];
  const inv = {};
  let latest = 0;

  for (const [id, name, planned] of ROSTER) {
    const row = byName.get(name);
    if (!row?.info) {
      bags.push([id, null, null]);
      continue;
    }
    const infoRow = row.info;
    const level = bits(infoRow.BaseInfo, 0, 7);
    const logout = infoRow.lastLogoutTimestamp || infoRow.lastUpdate || 0;
    if (logout > latest) latest = logout;
    const known = knownSkills(row.crafts);
    const bro = bagsByName.get(name);
    let used = 0;
    let total = 0;
    if (bro) {
      used += occupied(bro[0]);
      total += bro[0]?.size || 0;
      for (const slot of [1, 2, 3, 4]) {
        const b = bro[slot];
        const itemID = bagItemId(b?.link);
        if (!itemID) continue;
        const label = idToName.get(itemID) || "";
        if (/quiver|ammo pouch/i.test(label)) continue;
        used += occupied(b);
        total += b.size || 0;
      }
    } else if (row.cont?.bagInfo) {
      total = bits(row.cont.bagInfo, 0, 10);
      used = Math.max(0, total - Number(BigInt(row.cont.bagInfo) >> 10n));
    }
    const sk = planned.map(prof => (prof && known[prof] ? known[prof].rank : null));
    const repl = {};
    for (const prof of planned) if (prof && known[prof]) repl[prof] = "";
    if (planned.includes("Mining") && !known.Mining && known.Skinning) repl.Mining = `Has Skinning ${known.Skinning.rank} instead`;
    let flag = "";
    if (id === "corwyn" && known.Tailoring && known.Skinning && !known.Mining) {
      flag = "Tailoring is trained. He still has Skinning instead of Mining, so swap Skinning for Mining when you can.";
    }
    chars[id] = {
      lvl: level,
      zone: infoRow.zone || "",
      sub: infoRow.subZone && infoRow.subZone !== infoRow.zone ? infoRow.subZone : "",
      xp: infoRow.XP || 0,
      maxXP: infoRow.maxXP || 0,
      rest: infoRow.restXP || 0,
      logout,
      gold: infoRow.money || 0,
      played: infoRow.played || 0,
      playedLevel: infoRow.playedThisLevel || 0,
      sk,
      repl,
      flag,
      profs: Object.entries(known).map(([n, s]) => [n, s.rank, s.max, "", kindOf(n)]),
    };
    scan[id] = [used, total, chars[id].xp, chars[id].maxXP, chars[id].rest, chars[id].zone, chars[id].sub, logout];
    gold.push([id, chars[id].gold]);

    const equipped = new Set();
    const reg = [1, 2, 3, 4].map(slot => {
      const b = bro?.[slot];
      const itemID = bagItemId(b?.link);
      if (!itemID) return null;
      equipped.add(itemID);
      const label = idToName.get(itemID) || `Item ${itemID}`;
      return [label, b.size || 0];
    });
    const profBag = bro?.[5];
    const profID = bagItemId(profBag?.link);
    let prof = null;
    if (profID) {
      equipped.add(profID);
      prof = [idToName.get(profID) || `Item ${profID}`, profBag.size || 0];
    }
    const loose = [];
    const pack = bro?.[0]?.items || {};
    for (const raw of Object.values(pack)) {
      const itemID = bagItemId(raw);
      if (!itemID || equipped.has(itemID)) continue;
      const label = idToName.get(itemID);
      if (label && BAG_NAME.test(label)) loose.push(label);
    }
    const profLoose = loose.filter(label => PROF_BAG.test(label));
    const plainLoose = loose.filter(label => !PROF_BAG.test(label));
    const empty = reg.findIndex(b => !b || !b[0]);
    if (plainLoose.length && empty >= 0) reg[empty] = [null, 0, `Equip ${plainLoose[0]}`];
    if (profLoose.length && prof && prof[0] !== profLoose[0]) prof[2] = `swap for ${profLoose[0].replace(/^Apprentice's /, "")}`;
    bags.push([id, bro ? reg : null, bro ? prof : null]);

    const totals = new Map();
    for (const [bagID, container] of Object.entries(row.cont?.Containers || {})) {
      if (!container || typeof container !== "object") continue;
      const idNum = Number(bagID);
      const holder = linkName(container.link) || "";
      const where = (Number.isFinite(idNum) && idNum >= 0 && idNum <= 5 && !/bank/i.test(holder)) ? "bags" : "bank";
      const itemMap = container.items || {};
      const linkMap = container.links || {};
      const slots = new Set([...Object.keys(itemMap), ...Object.keys(linkMap)].filter(k => /^-?\d+$/.test(k)));
      for (const slot of slots) {
        const decoded = decodeSlot(itemMap[slot]);
        const named = linkName(linkMap[slot]);
        const itemName = named || (decoded ? idToName.get(decoded.itemID) : null);
        if (!itemName || /bank tab bag/i.test(itemName)) continue;
        const qty = decoded?.count || 1;
        const key = `${itemName}|${where}`;
        totals.set(key, (totals.get(key) || 0) + qty);
      }
    }
    inv[id] = [...totals.entries()].map(([key, qty]) => {
      const [itemName, where] = key.split("|");
      const price = priceBook.get(itemName);
      return [itemName, qty, where, price ? price.price : null, price ? price.listed : 0];
    }).sort((a, b) => ((b[3] || 0) * b[1]) - ((a[3] || 0) * a[1]) || b[1] - a[1] || a[0].localeCompare(b[0]));
  }

  gold.sort((a, b) => b[1] - a[1]);
  const missing = ROSTER.filter(([id, name]) => !chars[id]).map(([, name]) => name);
  const label = new Date(latest * 1000).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  return {
    label,
    latestLogout: latest,
    scannedCount: Object.keys(scan).length,
    missingNote: missing.length ? `${missing.join(" and ")} ${missing.length > 1 ? "haven't" : "hasn't"} been scanned yet.` : "Every roster character has been scanned.",
    prices: Object.fromEntries([...priceBook.entries()].filter(([, v]) => v.price != null).map(([n, v]) => [n, [v.price, v.listed]])),
    quests: buildQuests(dir),
    log: buildLog(dir, idToName),
    gear: buildGear(dir),
    rep: buildRep(dir),
    chars, scan, gold, bags, inv,
  };
}

function js(value) {
  return JSON.stringify(value, null, 2).replace(/</g, "\\u003c");
}

function patch(html, generated) {
  const block = `/* BEGIN GENERATED SCAN */\nconst GENERATED = ${js(generated)};\n/* END GENERATED SCAN */`;
  if (html.includes("/* BEGIN GENERATED SCAN */")) {
    html = html.replace(/\/\* BEGIN GENERATED SCAN \*\/[\s\S]*?\/\* END GENERATED SCAN \*\//, block);
  } else {
    html = html.replace("<script>\n", `<script>\n${block}\n`);
  }
  if (!html.includes("function applyRoster(")) {
    html = html.replace("const roleName={tank:\"Tank\",heal:\"Healer\",dps:\"DPS\"};",
      `const roleName={tank:"Tank",heal:"Healer",dps:"DPS"};
function applyRoster(){
  if(!GENERATED.chars) return;
  chars.forEach(c=>{
    const s=GENERATED.chars[c.id]; if(!s) return;
    if(s.lvl!=null) c.lvl=s.lvl;
    if(s.zone!=null) c.zone=s.zone;
    if(s.sk){c.sk=(c.sk||[0,0]).slice(); s.sk.forEach((v,i)=>{if(v!=null) c.sk[i]=v})}
    if(s.repl) c.p.forEach(p=>{if(!p||s.repl[p[0]]==null) return; p[2]=s.repl[p[0]]?p[2]:false; p[3]=s.repl[p[0]]||""});
  });
  const bar=document.querySelector(".scanbar span");
  if(bar&&GENERATED.label) bar.textContent="Levels, zones and skills were last filled in from the addon scan on "+GENERATED.label+". Anything you type here overrides them.";
  const sk=document.querySelector("#skills .sh p");
  if(sk&&GENERATED.label) sk.textContent="Read from the Altoholic scan on "+GENERATED.label+". "+(GENERATED.missingNote||"");
  const bagsP=document.querySelector("#bags .sh p");
  if(bagsP&&GENERATED.label) bagsP.textContent="Who has an empty bag slot, from the Bagnon save on "+GENERATED.label+". Send new bags to the gold rows first.";
  const scanned=document.getElementById("mkScanned");
  if(scanned&&GENERATED.scannedCount!=null) scanned.innerHTML=GENERATED.scannedCount+"<small> / "+chars.length+"</small>";
  const freshText=GENERATED.label?"Scanned "+GENERATED.label:"";
  const fresh=document.getElementById("fresh"); if(fresh) fresh.textContent=freshText;
  const footFresh=document.getElementById("footFresh"); if(footFresh) footFresh.textContent=freshText;
  const learned=new Set(Object.values(GENERATED.chars).flatMap(c=>(c.profs||[]).map(p=>p[0])));
  document.querySelectorAll("#mats h3").forEach(h=>{
    const name=h.childNodes[0]&&h.childNodes[0].textContent.trim();
    if(learned.has(name)) h.querySelector(".todo")?.remove();
  });
}
applyRoster();`);
  }
  if (!html.includes("function applySkills(")) {
    html = html.replace("const recWord=", `function applySkills(){
  if(!GENERATED.chars) return;
  SK.forEach(s=>{
    const g=GENERATED.chars[s.id]; if(!g||!g.profs) return;
    g.profs.forEach(p=>{
      let row=s.profs.find(x=>x[0]===p[0]);
      if(!row){s.profs.push(p.slice()); return}
      if(p[1]){row[1]=p[1]; row[2]=p[2]; row[3]=""; row[4]=p[4]}
    });
    if(g.flag) s.flag=g.flag;
  });
}
applySkills();
const recWord=`);
  }
  html = html.replace(/const SCAN=\{[\s\S]*?\};/, "const SCAN=GENERATED.scan;");
  html = html.replace(/const GOLD=\[[\s\S]*?\];/, "const GOLD=GENERATED.gold;");
  html = html.replace(/const BAGS=\[[\s\S]*?\];/, "const BAGS=GENERATED.bags;");
  html = html.replace(/const INV=\{[\s\S]*?\};/, "const INV=GENERATED.inv;");
  html = html.replace(
    'new Date(1794505403e3)',
    'new Date((GENERATED.latestLogout||0)*1000)'
  );
  html = html.replace(
    "Log out or /reload in game to refresh the save files, then ask Claude to rescan.",
    "Log out or /reload in game, run tools/refresh.bat, then click Reset to scan values."
  );
  html = html.replace(
    '<div class="stat"><b>7<small> / 9</small></b><span>Characters scanned</span></div>',
    '<div class="stat"><b id="mkScanned">7<small> / 9</small></b><span>Characters scanned</span></div>'
  );
  return html;
}

const dir = findSavedDir();
const html = fs.existsSync(pagePath) ? fs.readFileSync(pagePath, "utf8") : "";
const generated = build(dir, harvestPrices(html));

if (dry) {
  for (const [id, name] of ROSTER) {
    const c = generated.chars[id];
    if (!c) { console.log(`${name}: not scanned`); continue; }
    const profs = c.profs.map(p => `${p[0]} ${p[1]}/${p[2]}`).join(", ") || "no professions";
    const playedH = Math.round((c.played || 0) / 360) / 10;
    console.log(`${name}  lv ${c.lvl}  ${c.zone}${c.sub ? " / " + c.sub : ""}  ${c.gold}c  played ${playedH}h  bags ${generated.scan[id][0]}/${generated.scan[id][1]}  ${profs}`);
  }
  console.log(`scan ${generated.label}  gold rows ${generated.gold.length}  missing: ${generated.missingNote}`);
  for (const [id, name] of ROSTER) {
    const zones = generated.quests[id];
    if (!zones) continue;
    const n = zones.reduce((a, z) => a + z[1].length, 0);
    console.log(`quests ${name}: ${n} across ${zones.length} zones (${zones.slice(0, 3).map(z => z[0] + " " + z[1].length).join(", ")})`);
  }
  const leif = generated.inv.leif?.find(r => r[0] === "Light Leather");
  console.log("Leif Light Leather:", leif ? leif.join(" ") : "not found");
  for (const [id, name] of ROSTER) {
    const log = generated.log[id];
    const gear = generated.gear[id];
    const rep = generated.rep[id];
    const logN = log ? log.reduce((n, z) => n + z[1].length, 0) : 0;
    const repBit = rep ? rep[1].slice(0, 2).map(f => `${f[0]} ${f[1]}`).join(", ") : "no rep";
    console.log(`extra ${name}: log ${logN}  ilvl ${gear ? gear[0] : "—"} (${gear ? gear[1].length : 0} slots)  ${repBit}`);
  }
  process.exit(0);
}

if (!html) throw new Error("index.html is missing");
fs.writeFileSync(pagePath, patch(html, generated));
console.log(`Updated ${pagePath}`);
console.log(`${generated.scannedCount} characters, scan ${generated.label}. ${generated.missingNote}`);
