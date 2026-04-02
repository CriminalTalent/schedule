// ============================================================
// sessions.js — 전투 세션 관리 (로컬 JSON)
// ============================================================
import fs   from "fs";
import path from "path";

const SESSIONS_PATH = process.env.SESSIONS_PATH ?? "./data/sessions.json";
const RAIDS_PATH    = process.env.RAIDS_PATH    ?? "./data/raids.json";
const DUELS_PATH    = process.env.DUELS_PATH    ?? "./data/duels.json";

function ensureDir(p) {
  const dir = path.dirname(p);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function loadJson(p) {
  ensureDir(p);
  if (!fs.existsSync(p)) return {};
  try { return JSON.parse(fs.readFileSync(p, "utf-8")); }
  catch { return {}; }
}

function saveJson(p, data) {
  ensureDir(p);
  fs.writeFileSync(p, JSON.stringify(data, null, 2), "utf-8");
}

// ================================================================
// 던전 세션 (DM 전투)
// ================================================================
// 세션 구조:
// {
//   accountId, phase: "location" | "battle" | "explore",
//   location, monster: { name, hp, maxHp, attack, defense, goldMin, goldMax },
//   playerHp, playerMaxHp, goldEarned, turnCount
// }

export function getDungeonSession(accountId) {
  const data = loadJson(SESSIONS_PATH);
  return data[accountId] ?? null;
}

export function setDungeonSession(accountId, session) {
  const data          = loadJson(SESSIONS_PATH);
  data[accountId]     = session;
  saveJson(SESSIONS_PATH, data);
}

export function clearDungeonSession(accountId) {
  const data = loadJson(SESSIONS_PATH);
  delete data[accountId];
  saveJson(SESSIONS_PATH, data);
}

export function createDungeonSession(accountId, playerHp) {
  const session = {
    accountId,
    phase:        "location",
    location:     null,
    monster:      null,
    playerHp,
    playerMaxHp:  playerHp,
    goldEarned:   0,
    turnCount:    0,
  };
  setDungeonSession(accountId, session);
  return session;
}

// ================================================================
// 레이드
// ================================================================
// 레이드 구조:
// {
//   id, bossName, bossHp, bossMaxHp, bossAttack, bossDefense,
//   phase: "recruiting" | "battle" | "ended",
//   participants: { accountId: { name, damage } },
//   reward, createdAt
// }

export function getActiveRaid() {
  const data = loadJson(RAIDS_PATH);
  return Object.values(data).find((r) => r.phase !== "ended") ?? null;
}

export function getRaid(id) {
  return loadJson(RAIDS_PATH)[id] ?? null;
}

export function setRaid(raid) {
  const data    = loadJson(RAIDS_PATH);
  data[raid.id] = raid;
  saveJson(RAIDS_PATH, data);
}

export function createRaid(bossName, bossData) {
  const raid = {
    id:          `raid_${Date.now()}`,
    bossName,
    bossHp:      bossData.hp,
    bossMaxHp:   bossData.hp,
    bossAttack:  bossData.attack,
    bossDefense: bossData.defense,
    reward:      bossData.reward,
    phase:       "recruiting",
    participants: {},
    createdAt:   new Date().toISOString(),
  };
  setRaid(raid);
  return raid;
}

// ================================================================
// 1:1 결투
// ================================================================
// 결투 구조:
// {
//   id, challengerId, challengerName, challengerHp,
//   targetAcct, targetId, targetName, targetHp,
//   phase: "waiting" | "battle" | "ended",
//   currentTurn: challengerId | targetId,
//   createdAt
// }

export function getDuel(id) {
  return loadJson(DUELS_PATH)[id] ?? null;
}

export function getDuelByAccount(accountId) {
  const data = loadJson(DUELS_PATH);
  return Object.values(data).find(
    (d) => d.phase !== "ended" &&
           (d.challengerId === accountId || d.targetId === accountId)
  ) ?? null;
}

export function setDuel(duel) {
  const data    = loadJson(DUELS_PATH);
  data[duel.id] = duel;
  saveJson(DUELS_PATH, data);
}

export function createDuel(challenger, targetAcct) {
  const duel = {
    id:              `duel_${Date.now()}`,
    challengerId:    challenger.accountId,
    challengerName:  challenger.name,
    challengerAcct:  challenger.acct,
    challengerHp:    calcHp(challenger.stats.체력),
    targetAcct,
    targetId:        null,
    targetName:      null,
    targetHp:        null,
    phase:           "waiting",
    currentTurn:     challenger.accountId,
    createdAt:       new Date().toISOString(),
  };
  setDuel(duel);
  return duel;
}

// ================================================================
// 공통 유틸
// ================================================================
export function calcHp(체력) {
  return Math.max(10, 체력);
}

export function calcDamage(attackStat, defStat) {
  const base    = Math.max(1, attackStat - defStat);
  const variance = Math.floor(base * 0.2);
  return base + Math.floor(Math.random() * (variance * 2 + 1)) - variance;
}

export function randomBetween(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
