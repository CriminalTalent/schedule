// ============================================================
// sessions.js — 전투/탐험 세션 관리
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
// 던전 세션 (DM 탐험)
// ================================================================
// phase: "event" | "battle"
// currentEvent.type: "treasure" | "villager" | "monster" | "boss"

export function getDungeonSession(accountId) {
  return loadJson(SESSIONS_PATH)[accountId] ?? null;
}

export function setDungeonSession(accountId, session) {
  const data      = loadJson(SESSIONS_PATH);
  data[accountId] = session;
  saveJson(SESSIONS_PATH, data);
}

export function clearDungeonSession(accountId) {
  const data = loadJson(SESSIONS_PATH);
  delete data[accountId];
  saveJson(SESSIONS_PATH, data);
}

export function createDungeonSession(accountId, location, playerHp, eventQueue) {
  const session = {
    accountId,
    location,
    phase:        "event",
    playerHp,
    playerMaxHp:  playerHp,
    goldEarned:   0,
    itemsFound:   [],
    eventQueue,
    currentEvent: null,
    currentBattle: null,
    eventsDone:   0,
    totalEvents:  eventQueue.length,
  };
  setDungeonSession(accountId, session);
  return session;
}

export function advanceEvent(accountId) {
  const data    = loadJson(SESSIONS_PATH);
  const session = data[accountId];
  if (!session) return null;

  if (session.eventQueue.length === 0) {
    session.currentEvent  = null;
    session.currentBattle = null;
    data[accountId]       = session;
    saveJson(SESSIONS_PATH, data);
    return null;
  }

  const next            = session.eventQueue.shift();
  session.currentEvent  = next;
  session.currentBattle = null;
  session.phase         = "event";
  session.eventsDone   += 1;
  data[accountId]       = session;
  saveJson(SESSIONS_PATH, data);
  return next;
}

export function updateSession(accountId, updater) {
  const data    = loadJson(SESSIONS_PATH);
  const session = data[accountId];
  if (!session) return null;
  const updated   = updater(session);
  data[accountId] = updated;
  saveJson(SESSIONS_PATH, data);
  return updated;
}

// ================================================================
// 레이드
// ================================================================
export function getActiveRaid() {
  const data = loadJson(RAIDS_PATH);
  return Object.values(data).find((r) => r.phase !== "ended") ?? null;
}

export function setRaid(raid) {
  const data    = loadJson(RAIDS_PATH);
  data[raid.id] = raid;
  saveJson(RAIDS_PATH, data);
}

export function createRaid(bossName, bossData) {
  const raid = {
    id:           `raid_${Date.now()}`,
    bossName,
    bossHp:       bossData.hp,
    bossMaxHp:    bossData.hp,
    bossAttack:   bossData.attack,
    bossDefense:  bossData.defense,
    reward:       bossData.reward,
    phase:        "recruiting",
    participants: {},
    createdAt:    new Date().toISOString(),
  };
  setRaid(raid);
  return raid;
}

// ================================================================
// 1:1 결투
// ================================================================
export function getDuelByAccount(accountId) {
  const data = loadJson(DUELS_PATH);
  return Object.values(data).find(
    (d) => d.phase !== "ended" &&
           (d.challengerId === accountId || d.targetId === accountId)
  ) ?? null;
}

export function getDuelByTargetAcct(acct) {
  const data = loadJson(DUELS_PATH);
  return Object.values(data).find(
    (d) => d.phase === "waiting" && d.targetAcct === acct
  ) ?? null;
}

export function setDuel(duel) {
  const data    = loadJson(DUELS_PATH);
  data[duel.id] = duel;
  saveJson(DUELS_PATH, data);
}

export function createDuel(challenger, targetAcct) {
  const duel = {
    id:             `duel_${Date.now()}`,
    challengerId:   challenger.accountId,
    challengerName: challenger.name,
    challengerAcct: challenger.acct,
    challengerHp:   calcHp(challenger.stats.체력),
    targetAcct,
    targetId:       null,
    targetName:     null,
    targetHp:       null,
    phase:          "waiting",
    currentTurn:    challenger.accountId,
    createdAt:      new Date().toISOString(),
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
  const base     = Math.max(1, attackStat - defStat);
  const variance = Math.max(1, Math.floor(base * 0.2));
  return base + Math.floor(Math.random() * (variance * 2 + 1)) - variance;
}

export function randomBetween(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
