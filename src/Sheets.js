// ============================================================
// sheets.js — Google Sheets API 연동
// ============================================================
import { google } from "googleapis";

const SPREADSHEET_ID = process.env.SPREADSHEET_ID;
const KEY_PATH       = process.env.GOOGLE_KEY_PATH ?? "./google-key.json";
const CACHE_TTL      = 5 * 60 * 1000;

let _sheets = null;

async function getClient() {
  if (_sheets) return _sheets;
  const auth = new google.auth.GoogleAuth({
    keyFile: KEY_PATH,
    scopes:  ["https://www.googleapis.com/auth/spreadsheets"],
  });
  _sheets = google.sheets({ version: "v4", auth });
  return _sheets;
}

async function readRange(range) {
  const sheets = await getClient();
  const res    = await sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range });
  return res.data.values ?? [];
}

async function writeRange(range, values) {
  const sheets = await getClient();
  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID, range,
    valueInputOption: "RAW",
    requestBody: { values },
  });
}

async function appendRow(sheetName, values) {
  const sheets = await getClient();
  await sheets.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID,
    range:         `${sheetName}!A1`,
    valueInputOption:  "RAW",
    insertDataOption:  "INSERT_ROWS",
    requestBody: { values: [values] },
  });
}

// ================================================================
// 효과 텍스트 파싱 — "지능+3,스트레스+2,체력-1" → { 지능: 3, 스트레스: 2, 체력: -1 }
// ================================================================
function parseEffects(str) {
  if (!str || !str.trim()) return {};
  const result = {};
  for (const part of str.split(",")) {
    const m = part.trim().match(/^(.+?)([+-]\d+)$/);
    if (m) result[m[1].trim()] = parseInt(m[2], 10);
  }
  return result;
}

// ================================================================
// Actions 시트
// ================================================================
// 헤더: 행동명 | 카테고리 | 최소나이 | 골드 | 효과 | 설명
// 효과 예시: 지능+3,스트레스+2,체력-1

let _actionsCache   = null;
let _actionsCacheAt = 0;

export async function getActions() {
  if (_actionsCache && Date.now() - _actionsCacheAt < CACHE_TTL) return _actionsCache;

  const rows   = await readRange("Actions!A2:F");
  const result = {};

  for (const row of rows) {
    if (!row[0]) continue;
    const [name, category, minAge, gold, effectsStr, desc] = row;
    result[name] = {
      category,
      minAge:  Number(minAge ?? 0),
      gold:    Number(gold   ?? 0),
      effects: parseEffects(effectsStr),
      desc:    desc ?? "",
    };
  }

  _actionsCache   = result;
  _actionsCacheAt = Date.now();
  return result;
}

export function clearActionsCache() { _actionsCache = null; }

// ================================================================
// Items 시트
// ================================================================
// 헤더: 아이템명 | 상점 | 가격 | 판매비율 | 슬롯 | 최소나이 | 효과 | 설명
// 슬롯: 무기 / 의상 / 악세서리 / 방패 / 소비 / 음식
// 효과 예시: 매력+3,평판+1

let _itemsCache   = null;
let _itemsCacheAt = 0;

export async function getItems() {
  if (_itemsCache && Date.now() - _itemsCacheAt < CACHE_TTL) return _itemsCache;

  const rows   = await readRange("Items!A2:H");
  const result = {};

  for (const row of rows) {
    if (!row[0]) continue;
    const [name, shop, price, sellRate, slot, minAge, effectsStr, desc] = row;
    result[name] = {
      shop,
      price:    Number(price    ?? 0),
      sellRate: Number(sellRate ?? 0.5),
      slot:     slot ?? "소비",
      minAge:   Number(minAge   ?? 0),
      effects:  parseEffects(effectsStr),
      desc:     desc ?? "",
    };
  }

  _itemsCache   = result;
  _itemsCacheAt = Date.now();
  return result;
}

export function clearItemsCache() { _itemsCache = null; }

// ================================================================
// Monsters 시트
// ================================================================
// 헤더: 마물명 | 장소 | 종류 | 최소나이 | HP | 공격력 | 방어력 | 골드최소 | 골드최대 | 대화텍스트 | 설명
// 종류: monster / boss / villager

let _monstersCache   = null;
let _monstersCacheAt = 0;

export async function getMonsters() {
  if (_monstersCache && Date.now() - _monstersCacheAt < CACHE_TTL) return _monstersCache;

  const rows   = await readRange("Monsters!A2:K");
  const result = {};

  for (const row of rows) {
    if (!row[0]) continue;
    const [name, location, type, minAge, hp, attack, defense, goldMin, goldMax, dialogue, desc] = row;
    result[name] = {
      name,
      location,
      type:     type     ?? "monster",
      minAge:   Number(minAge  ?? 0),
      hp:       Number(hp      ?? 10),
      maxHp:    Number(hp      ?? 10),
      attack:   Number(attack  ?? 3),
      defense:  Number(defense ?? 1),
      goldMin:  Number(goldMin ?? 10),
      goldMax:  Number(goldMax ?? 30),
      dialogue: dialogue ?? "",
      desc:     desc     ?? "",
    };
  }

  _monstersCache   = result;
  _monstersCacheAt = Date.now();
  return result;
}

export async function getMonstersByLocation(location) {
  const monsters = await getMonsters();
  return Object.values(monsters).filter((m) => m.location === location);
}

export async function getLocations(age) {
  const monsters = await getMonsters();
  const locs     = new Set();
  for (const m of Object.values(monsters)) {
    if (age >= (m.minAge ?? 0)) locs.add(m.location);
  }
  return [...locs];
}

// ================================================================
// Players 시트
// ================================================================
// 헤더: accountId | name | 지능 | 매력 | 체력 | 감성 | 사회성
//       도덕성 | 야망 | 위험도 | 의존성 | 스트레스 | 평판 | 전투
//       골드 | 턴 | 인벤토리 | 장착

export const PUBLIC_STATS = ["지능", "매력", "체력", "감성", "사회성"];
export const HIDDEN_STATS = ["도덕성", "야망", "위험도", "의존성", "스트레스", "평판", "전투"];

function rowToPlayer(row) {
  const stats  = {};
  const hidden = {};
  PUBLIC_STATS.forEach((s, i) => { stats[s]  = Number(row[2 + i] ?? 20); });
  HIDDEN_STATS.forEach((s, i) => { hidden[s] = Number(row[7 + i] ?? 0);  });

  let inventory = [];
  let equipped  = {};
  try { inventory = JSON.parse(row[16] || "[]"); } catch { inventory = []; }
  try { equipped  = JSON.parse(row[17] || "{}"); } catch { equipped  = {}; }

  return {
    accountId: row[0],
    name:      row[1],
    stats,
    hidden,
    gold:      Number(row[14] ?? 500),
    turn:      Number(row[15] ?? 1),
    inventory,
    equipped,
  };
}

function playerToRow(player) {
  return [
    player.accountId,
    player.name,
    ...PUBLIC_STATS.map((s) => player.stats[s]  ?? 0),
    ...HIDDEN_STATS.map((s) => player.hidden[s] ?? 0),
    player.gold,
    player.turn,
    JSON.stringify(player.inventory ?? []),
    JSON.stringify(player.equipped  ?? {}),
  ];
}

export async function sheetGetAllPlayers() {
  const rows = await readRange("Players!A2:R");
  return rows.filter((r) => r[0]).map(rowToPlayer);
}

export async function sheetGetPlayer(accountId, displayName) {
  const rows = await readRange("Players!A2:R");
  const idx  = rows.findIndex((r) => r[0] === accountId);

  if (idx === -1) {
    const newPlayer = makeDefaultPlayer(accountId, displayName);
    await appendRow("Players", playerToRow(newPlayer));
    return newPlayer;
  }
  return rowToPlayer(rows[idx]);
}

export async function sheetUpdatePlayer(player) {
  const rows = await readRange("Players!A2:R");
  const idx  = rows.findIndex((r) => r[0] === player.accountId);

  if (idx === -1) {
    await appendRow("Players", playerToRow(player));
  } else {
    const rowNum = idx + 2;
    await writeRange(`Players!A${rowNum}:R${rowNum}`, [playerToRow(player)]);
  }
}

function makeDefaultPlayer(accountId, name) {
  return {
    accountId,
    name,
    stats:     { 지능: 20, 매력: 20, 체력: 20, 감성: 20, 사회성: 20 },
    hidden:    { 도덕성: 50, 야망: 10, 위험도: 0, 의존성: 0, 스트레스: 10, 평판: 20, 전투: 0 },
    gold:      Number(process.env.INITIAL_GOLD ?? 500),
    turn:      1,
    inventory: [],
    equipped:  {},
  };
}
