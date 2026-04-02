// ============================================================
// combat-bot.js — 왕립 계승 아카데미 무사수행 봇
// ============================================================
import "dotenv/config";
import { createRestAPIClient, createStreamingAPIClient } from "masto";
import { getMonstersByLocation, getItems }               from "./sheets.js";
import { getPlayer, updatePlayer }                       from "./storage.js";
import { getAge }                                        from "./game.js";
import {
  getDungeonSession, clearDungeonSession,
  createDungeonSession, advanceEvent, updateSession,
  getActiveRaid, setRaid, createRaid,
  getDuelByAccount, getDuelByTargetAcct, setDuel, createDuel,
  calcHp, calcDamage, randomBetween,
} from "./sessions.js";

const GM_ID        = process.env.GM_ACCOUNT_ID ?? "";
const BOT_TOKEN    = process.env.COMBAT_BOT_TOKEN;
const INSTANCE_URL = process.env.MASTODON_URL;
const TOTAL_EVENTS = 5;

if (!BOT_TOKEN || !INSTANCE_URL) {
  console.error(".env 설정 필요: MASTODON_URL, COMBAT_BOT_TOKEN");
  process.exit(1);
}

const rest      = createRestAPIClient({ url: INSTANCE_URL, accessToken: BOT_TOKEN });
const streaming = createStreamingAPIClient({
  streamingApiUrl: INSTANCE_URL.replace(/\/$/, "") + "/api/v1/streaming",
  accessToken: BOT_TOKEN,
});

let BOT_HANDLE = "";

async function init() {
  const me   = await rest.v1.accounts.verifyCredentials();
  BOT_HANDLE = me.username;
  console.log("무사수행 봇 시작: @" + BOT_HANDLE);
}

// ================================================================
// 전송 유틸
// ================================================================
async function sendDM(acct, text) {
  const chunks = splitText(text, 480);
  let replyId  = null;
  for (const chunk of chunks) {
    const s = await rest.v1.statuses.create({
      status:      `@${acct} ${chunk}`,
      inReplyToId: replyId,
      visibility:  "direct",
    });
    replyId = s.id;
  }
}

async function reply(notification, text) {
  const vis    = notification.status?.visibility ?? "unlisted";
  const chunks = splitText(text, 480);
  let replyId  = notification.status?.id;
  for (const chunk of chunks) {
    const s = await rest.v1.statuses.create({
      status:      `@${notification.account.acct} ${chunk}`,
      inReplyToId: replyId,
      visibility:  vis,
    });
    replyId = s.id;
  }
}

async function postPublic(text) {
  return rest.v1.statuses.create({ status: text.slice(0, 490), visibility: "public" });
}

function splitText(text, limit) {
  if (text.length <= limit) return [text];
  const chunks = [];
  while (text.length > 0) {
    chunks.push(text.slice(0, limit));
    text = text.slice(limit);
  }
  return chunks;
}

function parseTokens(content) {
  const plain   = content.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  const matches = [...plain.matchAll(/\[([^\]]+)\]/g)];
  return matches.map((m) => {
    const parts = m[1].split("/");
    return {
      key:   parts[0].trim(),
      value: parts[1]?.trim() ?? null,
      sub:   parts[2]?.replace(/[()]/g, "").trim() ?? null,
    };
  });
}

// ================================================================
// 선택지 출력 헬퍼
// ================================================================
function choices(...options) {
  return "\n\n어떻게 하시겠습니까?\n" + options.map((o) => `  ${o}`).join("\n");
}

// ================================================================
// 이벤트 큐 생성
// ================================================================
async function buildEventQueue(location) {
  const all      = await getMonstersByLocation(location);
  const bosses   = all.filter((m) => m.type === "boss");
  const normals  = all.filter((m) => m.type === "monster");
  const villagers = all.filter((m) => m.type === "villager");

  const queue = [];

  for (let i = 0; i < TOTAL_EVENTS; i++) {
    if (i === TOTAL_EVENTS - 1 && bosses.length > 0) {
      const b = bosses[Math.floor(Math.random() * bosses.length)];
      queue.push({ type: "boss", data: { ...b, hp: b.hp, maxHp: b.hp } });
      continue;
    }

    const roll = Math.random();
    if (roll < 0.35 && normals.length > 0) {
      const m = normals[Math.floor(Math.random() * normals.length)];
      queue.push({ type: "monster", data: { ...m, hp: m.hp, maxHp: m.hp } });
    } else if (roll < 0.55) {
      queue.push({ type: "treasure", data: { hasItem: Math.random() < 0.3 } });
    } else if (roll < 0.70 && villagers.length > 0) {
      const v = villagers[Math.floor(Math.random() * villagers.length)];
      queue.push({ type: "villager", data: { ...v } });
    } else {
      queue.push({ type: "treasure", data: { hasItem: false } });
    }
  }

  return queue;
}

// ================================================================
// 이벤트 텍스트 생성 — 서사체
// ================================================================
function buildEventPrompt(event, session) {
  const prog = `[ ${session.eventsDone} / ${session.totalEvents} ]`;

  switch (event.type) {
    case "treasure": {
      const desc = event.data.hasItem
        ? "안에 무언가 들어 있는 듯한 느낌이 납니다."
        : "먼지가 쌓인 자물쇠가 오랜 세월을 말해주는 듯합니다.";
      return [
        `${prog}`,
        "",
        "수풀 사이, 낡은 보물상자 하나가 조용히 자리를 지키고 있습니다.",
        desc,
        choices("[열기] 상자를 열어본다.", "[지나간다.] 그냥 지나친다."),
      ].join("\n");
    }

    case "villager": {
      const d = event.data;
      return [
        `${prog}`,
        "",
        `길목에 ${d.name}이(가) 서 있습니다.`,
        d.desc ? d.desc : "눈이 마주쳤습니다.",
        d.dialogue ? `\n"${d.dialogue}"` : "",
        choices("[대화] 말을 걸어본다.", "[공격] 덮쳐 길을 연다.", "[숨기] 들키지 않게 지나친다."),
      ].filter(Boolean).join("\n");
    }

    case "monster": {
      const d = event.data;
      return [
        `${prog}`,
        "",
        `발소리가 멈추는 순간, ${d.name}이(가) 그림자 속에서 모습을 드러냈습니다.`,
        d.desc ? d.desc : "",
        `적의 상태 — 체력 ${d.hp}/${d.maxHp}  공격력 ${d.attack}`,
        d.dialogue ? `\n"${d.dialogue}"` : "",
        choices("[공격] 먼저 덤벼든다.", "[대화] 말을 걸어본다.", "[숨기] 몸을 낮추고 숨는다."),
      ].filter(Boolean).join("\n");
    }

    case "boss": {
      const d = event.data;
      return [
        `${prog}`,
        "",
        `길이 끊기는 곳에, ${d.name}이(가) 버티고 서 있습니다.`,
        d.desc ? d.desc : "압도적인 기운이 사방을 짓누릅니다.",
        `적의 상태 — 체력 ${d.hp}/${d.maxHp}  공격력 ${d.attack}`,
        d.dialogue ? `\n"${d.dialogue}"` : "",
        choices("[공격] 정면으로 맞선다.", "[대화] 협상을 시도한다.", "[숨기] 기회를 엿본다."),
      ].filter(Boolean).join("\n");
    }

    default:
      return "알 수 없는 상황이 펼쳐집니다.";
  }
}

// ================================================================
// 탐험 정상 종료
// ================================================================
async function finishDungeon(accountId, acct, session, player) {
  const newGold      = player.gold + session.goldEarned;
  const newInventory = [...(player.inventory ?? []), ...session.itemsFound];
  await updatePlayer({ ...player, gold: newGold, inventory: newInventory });
  clearDungeonSession(accountId);

  const itemNote = session.itemsFound.length > 0
    ? `\n획득한 아이템: ${session.itemsFound.join(", ")}`
    : "";

  await sendDM(acct, [
    `[ 탐험 완료 — ${session.location} ]`,
    "",
    "험난한 여정을 무사히 마치고 아카데미로 돌아왔습니다.",
    `이번 탐험에서 ${session.goldEarned}G를 손에 넣었습니다.${itemNote}`,
    `남은 체력: ${session.playerHp}/${session.playerMaxHp}`,
  ].join("\n"));

  await postPublic(
    `[ 무사수행 완료 ] ${player.name}이(가) ${session.location} 탐험을 마쳤습니다. 획득 골드: ${session.goldEarned}G`
  );
}

// ================================================================
// 강제 귀환 — 체력 0
// ================================================================
async function forceReturn(accountId, acct, session, player, reason) {
  const penalty = Math.floor(player.gold * 0.1);
  await updatePlayer({ ...player, gold: Math.max(0, player.gold - penalty) });
  clearDungeonSession(accountId);

  await sendDM(acct, [
    `[ 강제 귀환 — ${session.location} ]`,
    "",
    reason,
    "힘이 빠진 몸으로 아카데미까지 간신히 돌아왔습니다.",
    `소지금의 일부를 잃었습니다. (-${penalty}G)`,
    "",
    "무사수행이 종료되었습니다.",
  ].join("\n"));
}

// ================================================================
// 다음 이벤트 전송
// ================================================================
async function sendNextEvent(accountId, acct, player) {
  const session = getDungeonSession(accountId);
  if (!session) return;

  if (session.eventQueue.length === 0) {
    await finishDungeon(accountId, acct, session, player);
    return;
  }

  const next    = advanceEvent(accountId);
  const updated = getDungeonSession(accountId);
  await sendDM(acct, buildEventPrompt(next, updated));
}

// ================================================================
// 무사수행 시작 — bot.js에서 호출
// ================================================================
export async function startAdventure(accountId, acct, displayName, location) {
  const player = await getPlayer(accountId, displayName);
  const age    = getAge(player.turn);

  const allMonsters = await getMonstersByLocation(location);
  if (allMonsters.length === 0) {
    await sendDM(acct, `'${location}'은(는) 지도에 없는 장소입니다.`);
    return;
  }

  const minAge = Math.min(...allMonsters.map((m) => m.minAge ?? 0));
  if (age < minAge) {
    await sendDM(acct, `'${location}'은(는) ${minAge}세가 되어야 발을 들일 수 있습니다.`);
    return;
  }

  const playerHp   = calcHp(player.stats.체력);
  const eventQueue = await buildEventQueue(location);
  createDungeonSession(accountId, location, playerHp, eventQueue);

  await sendDM(acct, [
    `[ 무사수행 — ${location} ]`,
    "",
    "짐을 꾸린 채 아카데미의 문을 나섭니다.",
    "바람이 불어오는 방향으로, 새로운 여정이 시작됩니다.",
    "",
    `체력: ${playerHp}/${playerHp}  소지금: ${player.gold}G`,
    `총 ${TOTAL_EVENTS}개의 이벤트가 기다리고 있습니다.`,
  ].join("\n"));

  await sendNextEvent(accountId, acct, player);
}

// ================================================================
// 명령 처리
// ================================================================
async function handleNotification(notification) {
  if (notification.type !== "mention")               return;
  if (!notification.status || !notification.account) return;

  const accountId   = notification.account.id;
  const acct        = notification.account.acct;
  const displayName = notification.account.displayName || acct;
  const isGM        = accountId === GM_ID;
  const isDM        = notification.status.visibility === "direct";
  const tokens      = parseTokens(notification.status.content);

  if (tokens.length === 0) return;

  // ================================================================
  // DM 탐험
  // ================================================================
  if (isDM) {
    const session = getDungeonSession(accountId);
    if (!session) return; // 세션 없으면 무응답 (강제 귀환 후 포함)

    const player = await getPlayer(accountId, displayName);
    const event  = session.currentEvent;

    // -- 전투 중 ---------------------------------------------------
    if (session.phase === "battle") {
      const battle = { ...session.currentBattle };

      if (tokens.some((t) => t.key === "공격")) {
        const playerDmg = calcDamage(player.hidden.전투, battle.defense ?? 0);
        battle.hp       = Math.max(0, battle.hp - playerDmg);

        const lines = [`검을 치켜들어 ${battle.name}을(를) 공격했습니다. (${playerDmg} 피해)`];

        if (battle.hp <= 0) {
          const gold = randomBetween(battle.goldMin ?? 0, battle.goldMax ?? 0);
          updateSession(accountId, (s) => ({
            ...s, goldEarned: s.goldEarned + gold, phase: "event", currentBattle: null,
          }));
          lines.push(
            `${battle.name}이(가) 쓰러졌습니다.`,
            `숨을 고르며 주변을 살피자, ${gold}G가 눈에 띄었습니다.`
          );
          await sendDM(acct, lines.join("\n"));
          await sendNextEvent(accountId, acct, player);
          return;
        }

        const enemyDmg = calcDamage(battle.attack ?? 5, 0);
        const newHp    = Math.max(0, session.playerHp - enemyDmg);
        lines.push(`${battle.name}의 반격이 빗발쳤습니다. (${enemyDmg} 피해)`);
        lines.push(`체력: ${newHp}/${session.playerMaxHp}  적 체력: ${battle.hp}/${battle.maxHp}`);

        if (newHp <= 0) {
          await sendDM(acct, lines.join("\n"));
          await forceReturn(accountId, acct, session, player, `${battle.name}의 공격을 끝내 버티지 못하고 쓰러졌습니다.`);
          return;
        }

        updateSession(accountId, (s) => ({
          ...s, playerHp: newHp, currentBattle: battle,
        }));
        lines.push(choices("[공격] 계속 싸운다.", "[도망] 물러선다."));
        await sendDM(acct, lines.join("\n"));
        return;
      }

      if (tokens.some((t) => t.key === "도망")) {
        if (Math.random() < 0.55) {
          updateSession(accountId, (s) => ({ ...s, phase: "event", currentBattle: null }));
          await sendDM(acct, "발길을 돌려 어둠 속으로 몸을 숨겼습니다. 도망에 성공했습니다.");
          await sendNextEvent(accountId, acct, player);
        } else {
          const enemyDmg = calcDamage(battle.attack ?? 5, 0);
          const newHp    = Math.max(0, session.playerHp - enemyDmg);

          if (newHp <= 0) {
            await sendDM(acct, `도망치려 했으나 ${battle.name}의 공격이 먼저였습니다. (${enemyDmg} 피해)`);
            await forceReturn(accountId, acct, session, player, `도망에 실패한 채 쓰러졌습니다.`);
            return;
          }

          updateSession(accountId, (s) => ({ ...s, playerHp: newHp, currentBattle: battle }));
          await sendDM(acct, [
            `도망치려 했으나 ${battle.name}의 공격을 피하지 못했습니다. (${enemyDmg} 피해)`,
            `체력: ${newHp}/${session.playerMaxHp}`,
            choices("[공격] 계속 싸운다.", "[도망] 다시 물러선다."),
          ].join("\n"));
        }
        return;
      }

      return; // 전투 중 다른 키워드 무시
    }

    // -- 이벤트 단계 -----------------------------------------------
    if (!event) return;

    // [열기] — 보물상자
    if (tokens.some((t) => t.key === "열기")) {
      if (event.type !== "treasure") return;

      const lines = ["조심스럽게 뚜껑을 열자"];

      if (event.data.hasItem) {
        const ITEMS    = await getItems();
        const itemPool = Object.entries(ITEMS).filter(([, v]) => v.slot === "소비").map(([name]) => name);

        if (itemPool.length > 0) {
          const found = itemPool[Math.floor(Math.random() * itemPool.length)];
          updateSession(accountId, (s) => ({ ...s, itemsFound: [...s.itemsFound, found] }));
          lines.push(`먼지 사이로 ${found}이(가) 모습을 드러냈습니다.`);
        } else {
          const gold = randomBetween(20, 80);
          updateSession(accountId, (s) => ({ ...s, goldEarned: s.goldEarned + gold }));
          lines.push(`반짝이는 금화 더미가 쏟아졌습니다. ${gold}G를 손에 넣었습니다.`);
        }
      } else {
        const gold = randomBetween(10, 60);
        updateSession(accountId, (s) => ({ ...s, goldEarned: s.goldEarned + gold }));
        lines.push(`낡은 천 사이로 금화 몇 닢이 굴러 나왔습니다. ${gold}G를 얻었습니다.`);
      }

      await sendDM(acct, lines.join(" "));
      await sendNextEvent(accountId, acct, player);
      return;
    }

    // [지나간다.]
    if (tokens.some((t) => t.key === "지나간다.")) {
      if (event.type !== "treasure") return;
      await sendDM(acct, "발걸음을 멈추지 않고 상자 곁을 지나쳤습니다.");
      await sendNextEvent(accountId, acct, player);
      return;
    }

    // [대화]
    if (tokens.some((t) => t.key === "대화")) {
      if (!["villager", "monster", "boss"].includes(event.type)) return;

      const d        = event.data;
      const response = d.dialogue ?? "...말이 없습니다.";

      if (event.type === "villager") {
        const gold  = randomBetween(0, 30);
        const lines = [`${d.name}: "${response}"`];
        if (gold > 0) {
          updateSession(accountId, (s) => ({ ...s, goldEarned: s.goldEarned + gold }));
          lines.push(`${d.name}이(가) 고마움의 표시로 ${gold}G를 건네주었습니다.`);
        } else {
          lines.push("대화를 마치고 조용히 발걸음을 옮겼습니다.");
        }
        await sendDM(acct, lines.join("\n"));
        await sendNextEvent(accountId, acct, player);
      } else {
        if (Math.random() < 0.4) {
          await sendDM(acct, `${d.name}: "${response}"\n\n예상치 못한 협상이 성사되었습니다. 위기를 넘겼습니다.`);
          await sendNextEvent(accountId, acct, player);
        } else {
          const enemyDmg = calcDamage(d.attack ?? 5, 0);
          const newHp    = Math.max(0, session.playerHp - enemyDmg);

          if (newHp <= 0) {
            await sendDM(acct, `${d.name}: "${response}"\n\n말이 채 끝나기도 전에 기습을 받았습니다. (${enemyDmg} 피해)`);
            await forceReturn(accountId, acct, session, player, `${d.name}의 기습에 쓰러졌습니다.`);
            return;
          }

          const enemy = { ...d };
          updateSession(accountId, (s) => ({
            ...s, phase: "battle", playerHp: newHp, currentBattle: enemy,
          }));
          await sendDM(acct, [
            `${d.name}: "${response}"`,
            `\n협상이 실패로 끝났습니다. 기습 공격이 들이닥쳤습니다. (${enemyDmg} 피해)`,
            `체력: ${newHp}/${session.playerMaxHp}  적 체력: ${enemy.hp}/${enemy.maxHp}`,
            choices("[공격] 맞서 싸운다.", "[도망] 물러선다."),
          ].join("\n"));
        }
      }
      return;
    }

    // [공격] — 이벤트 단계 (주민 포함)
    if (tokens.some((t) => t.key === "공격")) {
      if (!["villager", "monster", "boss"].includes(event.type)) return;

      const d = event.data;

      if (event.type === "villager") {
        const stolen = randomBetween(10, 50);
        updateSession(accountId, (s) => ({ ...s, goldEarned: s.goldEarned + stolen }));
        await updatePlayer({
          ...player,
          hidden: { ...player.hidden, 도덕성: Math.max(0, player.hidden.도덕성 - 5) },
        });
        await sendDM(acct, [
          `${d.name}을(를) 제압하고 ${stolen}G를 빼앗았습니다.`,
          "양심에 작은 흠집이 생긴 것 같습니다. (도덕성 하락)",
        ].join("\n"));
        await sendNextEvent(accountId, acct, player);
        return;
      }

      const enemy     = { ...d };
      const playerDmg = calcDamage(player.hidden.전투, enemy.defense ?? 0);
      enemy.hp        = Math.max(0, enemy.hp - playerDmg);

      const lines = [`먼저 선제공격을 가했습니다. ${enemy.name}에게 ${playerDmg}의 피해를 입혔습니다.`];

      if (enemy.hp <= 0) {
        const gold = randomBetween(enemy.goldMin ?? 0, enemy.goldMax ?? 0);
        updateSession(accountId, (s) => ({
          ...s, goldEarned: s.goldEarned + gold, phase: "event", currentBattle: null,
        }));
        lines.push(`${enemy.name}이(가) 쓰러졌습니다.`, `${gold}G를 획득했습니다.`);
        await sendDM(acct, lines.join("\n"));
        await sendNextEvent(accountId, acct, player);
        return;
      }

      const enemyDmg = calcDamage(enemy.attack ?? 5, 0);
      const newHp    = Math.max(0, session.playerHp - enemyDmg);
      lines.push(`${enemy.name}의 반격. (${enemyDmg} 피해)`);
      lines.push(`체력: ${newHp}/${session.playerMaxHp}  적 체력: ${enemy.hp}/${enemy.maxHp}`);

      if (newHp <= 0) {
        await sendDM(acct, lines.join("\n"));
        await forceReturn(accountId, acct, session, player, `${enemy.name}의 반격을 버티지 못했습니다.`);
        return;
      }

      updateSession(accountId, (s) => ({
        ...s, phase: "battle", playerHp: newHp, currentBattle: enemy,
      }));
      lines.push(choices("[공격] 계속 싸운다.", "[도망] 물러선다."));
      await sendDM(acct, lines.join("\n"));
      return;
    }

    // [숨기]
    if (tokens.some((t) => t.key === "숨기")) {
      if (!["villager", "monster", "boss"].includes(event.type)) return;

      const d = event.data;

      if (Math.random() < 0.65) {
        await sendDM(acct, `숨을 죽이고 몸을 낮췄습니다. ${d.name}이(가) 알아채지 못한 채 지나갔습니다.`);
        await sendNextEvent(accountId, acct, player);
      } else {
        const enemyDmg = calcDamage(d.attack ?? 5, 0);
        const newHp    = Math.max(0, session.playerHp - enemyDmg);

        if (newHp <= 0) {
          await sendDM(acct, `숨으려 했으나 ${d.name}에게 발각되었습니다. 기습을 받았습니다. (${enemyDmg} 피해)`);
          await forceReturn(accountId, acct, session, player, `${d.name}에게 발각되어 쓰러졌습니다.`);
          return;
        }

        const enemy = { ...d };
        updateSession(accountId, (s) => ({
          ...s, phase: "battle", playerHp: newHp, currentBattle: enemy,
        }));
        await sendDM(acct, [
          `숨으려 했으나 ${d.name}에게 들켜버렸습니다. (${enemyDmg} 피해)`,
          `체력: ${newHp}/${session.playerMaxHp}`,
          choices("[공격] 맞서 싸운다.", "[도망] 물러선다."),
        ].join("\n"));
      }
      return;
    }

    return;
  }

  // ================================================================
  // 퍼블릭 — 레이드
  // ================================================================
  const player = await getPlayer(accountId, displayName);

  const raidToken = tokens.find((t) => t.key === "레이드");
  if (raidToken) {
    if (!isGM) { await reply(notification, "레이드 개설은 GM만 가능합니다."); return; }
    const bossName = raidToken.value;
    if (!bossName) { await reply(notification, "사용법: [레이드/보스명]"); return; }

    const existing = getActiveRaid();
    if (existing) { await reply(notification, `이미 진행 중인 레이드가 있습니다: ${existing.bossName}`); return; }

    const bossData = { hp: 500, attack: 20, defense: 10, reward: 300 };
    const raid     = createRaid(bossName, bossData);

    await postPublic([
      `[ 레이드 모집 ]`,
      `강대한 ${bossName}이(가) 아카데미를 위협하고 있습니다!`,
      `체력: ${raid.bossHp}`,
      "",
      "[참가] 로 레이드에 함께하세요.",
    ].join("\n"));
    await reply(notification, `레이드 '${bossName}' 개설이 완료되었습니다.`);
    return;
  }

  if (tokens.some((t) => t.key === "참가")) {
    const raid = getActiveRaid();
    if (!raid) { await reply(notification, "현재 모집 중인 레이드가 없습니다."); return; }
    if (raid.phase !== "recruiting") { await reply(notification, "레이드가 이미 시작되었습니다."); return; }
    if (raid.participants[accountId]) { await reply(notification, "이미 참가 신청을 하셨습니다."); return; }

    raid.participants[accountId] = { name: displayName, damage: 0 };
    setRaid(raid);
    await reply(notification, `레이드 참가가 확정되었습니다. 현재 참가자: ${Object.keys(raid.participants).length}명`);
    return;
  }

  if (tokens.some((t) => t.key === "레이드시작")) {
    if (!isGM) { await reply(notification, "GM 전용 명령입니다."); return; }
    const raid = getActiveRaid();
    if (!raid || raid.phase !== "recruiting") { await reply(notification, "모집 중인 레이드가 없습니다."); return; }
    const count = Object.keys(raid.participants).length;
    if (count === 0) { await reply(notification, "참가자가 없습니다."); return; }

    raid.phase = "battle";
    setRaid(raid);

    await postPublic([
      `[ 레이드 시작 ] ${raid.bossName}`,
      `참가자 ${count}명이 전장에 나섰습니다.`,
      `적 체력: ${raid.bossHp}/${raid.bossMaxHp}`,
      "",
      "[공격] 으로 보스를 공격하세요!",
    ].join("\n"));
    return;
  }

  if (tokens.some((t) => t.key === "레이드종료") && isGM) {
    const raid = getActiveRaid();
    if (!raid) { await reply(notification, "진행 중인 레이드가 없습니다."); return; }
    raid.phase = "ended";
    setRaid(raid);
    await reply(notification, `레이드 '${raid.bossName}'가 강제 종료되었습니다.`);
    return;
  }

  // 레이드 [공격]
  if (tokens.some((t) => t.key === "공격")) {
    const raid = getActiveRaid();
    if (raid && raid.phase === "battle" && raid.participants[accountId]) {
      const dmg   = calcDamage(player.hidden.전투, raid.bossDefense);
      raid.bossHp = Math.max(0, raid.bossHp - dmg);
      raid.participants[accountId].damage += dmg;

      const lines = [
        `${displayName}이(가) ${raid.bossName}에게 ${dmg}의 피해를 입혔습니다.`,
        `적 체력: ${raid.bossHp}/${raid.bossMaxHp}`,
      ];

      if (raid.bossHp <= 0) {
        raid.phase = "ended";
        setRaid(raid);
        const participants = Object.values(raid.participants);
        const share        = Math.floor(raid.reward / participants.length);

        for (const [pid, pdata] of Object.entries(raid.participants)) {
          const p2 = await getPlayer(pid, pdata.name);
          await updatePlayer({ ...p2, gold: p2.gold + share });
        }

        const rankLines = participants
          .sort((a, b) => b.damage - a.damage)
          .map((p, i) => `  ${i + 1}위 ${p.name} — ${p.damage} 피해`)
          .join("\n");

        lines.push(
          `\n${raid.bossName}이(가) 쓰러졌습니다!`,
          `참가자 1인당 ${share}G가 지급되었습니다.`,
          `\n[ 피해량 순위 ]\n${rankLines}`
        );
        await postPublic(lines.join("\n"));
        return;
      }

      const bossDmg = calcDamage(raid.bossAttack, 0);
      lines.push(`${raid.bossName}의 반격! 참가자 전원이 ${bossDmg}의 피해를 받았습니다.`);
      setRaid(raid);
      await postPublic(lines.join("\n"));
      return;
    }

    // 결투 공격
    const duel = getDuelByAccount(accountId);
    if (duel && duel.phase === "battle") {
      if (duel.currentTurn !== accountId) {
        await reply(notification, "지금은 상대방의 차례입니다.");
        return;
      }

      const isChallenger = duel.challengerId === accountId;
      const oppHpKey     = isChallenger ? "targetHp"     : "challengerHp";
      const myName       = isChallenger ? duel.challengerName : duel.targetName;
      const oppName      = isChallenger ? duel.targetName     : duel.challengerName;
      const oppAcct      = isChallenger ? duel.targetAcct     : duel.challengerAcct;
      const oppId        = isChallenger ? duel.targetId       : duel.challengerId;

      const dmg      = calcDamage(player.hidden.전투, 0);
      duel[oppHpKey] = Math.max(0, duel[oppHpKey] - dmg);

      const lines = [
        `${myName}의 공격! ${oppName}에게 ${dmg}의 피해.`,
        `${oppName} 체력: ${duel[oppHpKey]}`,
      ];

      if (duel[oppHpKey] <= 0) {
        duel.phase = "ended";
        setDuel(duel);
        lines.push(`\n${myName}의 승리!`);
        await postPublic(lines.join("\n"));
        return;
      }

      duel.currentTurn = oppId;
      setDuel(duel);
      lines.push(`\n@${oppAcct} [공격] 차례입니다.`);
      await postPublic(lines.join("\n"));
      return;
    }

    await reply(notification, "참가 중인 레이드 또는 결투가 없습니다.");
    return;
  }

  // ================================================================
  // 퍼블릭 — 1:1 결투
  // ================================================================
  const duelToken = tokens.find((t) => t.key === "결투");
  if (duelToken) {
    const targetAcct = duelToken.value;
    if (!targetAcct) { await reply(notification, "사용법: [결투/상대계정]"); return; }
    if (getDuelByAccount(accountId)) { await reply(notification, "이미 진행 중인 결투가 있습니다."); return; }

    const challenger = { accountId, name: displayName, acct, stats: player.stats };
    createDuel(challenger, targetAcct);

    await postPublic([
      `[ 결투 신청 ]`,
      `${displayName}이(가) @${targetAcct}에게 정식으로 결투를 신청했습니다.`,
      "",
      `@${targetAcct} [수락] 으로 응하시겠습니까?`,
    ].join("\n"));
    return;
  }

  if (tokens.some((t) => t.key === "수락")) {
    const pending = getDuelByTargetAcct(acct);
    if (!pending) { await reply(notification, "수락할 결투 신청이 없습니다."); return; }

    pending.targetId   = accountId;
    pending.targetName = displayName;
    pending.targetHp   = calcHp(player.stats.체력);
    pending.phase      = "battle";
    setDuel(pending);

    await postPublic([
      `[ 결투 시작 ]`,
      `${pending.challengerName} 대 ${displayName}`,
      "두 사람이 마주 섰습니다.",
      "",
      `${pending.challengerName}의 선공입니다. [공격] 을 입력하세요.`,
    ].join("\n"));
    return;
  }

  await reply(notification, "알 수 없는 명령입니다.");
}

// ================================================================
// 스트리밍 루프
// ================================================================
async function main() {
  await init();
  console.log("스트리밍 연결 중...");

  const stream = await streaming.user.subscribe();

  for await (const event of stream) {
    if (event.event !== "notification") continue;
    const notification = event.payload;
    try {
      await handleNotification(notification);
      await rest.v1.notifications.dismiss({ id: notification.id });
    } catch (err) {
      console.error("알림 처리 오류:", err);
    }
  }
}

main().catch((err) => {
  console.error("봇 오류:", err);
  process.exit(1);
});
