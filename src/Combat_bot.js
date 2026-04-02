// ============================================================
// combat-bot.js — 왕립 계승 아카데미 무사수행 봇
// ============================================================
import "dotenv/config";
import { createRestAPIClient, createStreamingAPIClient } from "masto";
import { getMonstersByLocation, getItems }               from "./sheets.js";
import { getPlayer, updatePlayer }                       from "./storage.js";
import { getAge }                                        from "./game.js";
import {
  getDungeonSession,
  clearDungeonSession,
  createDungeonSession,
  advanceEvent,
  updateSession,
  getActiveRaid,
  setRaid,
  createRaid,
  getDuelByAccount,
  getDuelByTargetAcct,
  setDuel,
  createDuel,
  calcHp,
  calcDamage,
  randomBetween,
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
// 이벤트 큐 생성
// ================================================================
async function buildEventQueue(location, age) {
  const all      = await getMonstersByLocation(location);
  const bosses   = all.filter((m) => m.type === "boss");
  const normals  = all.filter((m) => m.type === "monster");
  const villagers = all.filter((m) => m.type === "villager");

  const queue = [];

  for (let i = 0; i < TOTAL_EVENTS; i++) {
    const isFinal = i === TOTAL_EVENTS - 1;

    if (isFinal && bosses.length > 0) {
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
// 이벤트 텍스트 생성
// ================================================================
function buildEventPrompt(event, session) {
  const prog = `[${session.eventsDone}/${session.totalEvents}]`;

  switch (event.type) {
    case "treasure":
      return [
        `${prog} 보물상자를 발견했습니다!`,
        "",
        "  [열기]",
        "  [지나간다.]",
      ].join("\n");

    case "villager": {
      const d = event.data;
      return [
        `${prog} ${d.name}을(를) 만났습니다.`,
        `"${d.dialogue ?? "..."}"`,
        "",
        "  [대화]",
        "  [공격]",
        "  [숨기]",
      ].join("\n");
    }

    case "monster": {
      const d = event.data;
      return [
        `${prog} ${d.name}이(가) 나타났습니다!`,
        `HP: ${d.hp}/${d.maxHp}  공격력: ${d.attack}`,
        d.dialogue ? `"${d.dialogue}"` : "",
        "",
        "  [공격]",
        "  [대화]",
        "  [숨기]",
      ].filter(Boolean).join("\n");
    }

    case "boss": {
      const d = event.data;
      return [
        `${prog} [보스] ${d.name}이(가) 앞을 가로막습니다!`,
        `HP: ${d.hp}/${d.maxHp}  공격력: ${d.attack}`,
        d.dialogue ? `"${d.dialogue}"` : "",
        "",
        "  [공격]",
        "  [대화]",
        "  [숨기]",
      ].filter(Boolean).join("\n");
    }

    default:
      return "알 수 없는 이벤트입니다.";
  }
}

// 탐험 종료 요약
async function finishDungeon(accountId, acct, session, player) {
  const summary = [
    `[무사수행 완료] ${session.location}`,
    `획득 골드: ${session.goldEarned}G`,
    session.itemsFound.length > 0
      ? `획득 아이템: ${session.itemsFound.join(", ")}`
      : "",
    `HP: ${session.playerHp}/${session.playerMaxHp}`,
  ].filter(Boolean).join("\n");

  const newGold     = player.gold + session.goldEarned;
  const newInventory = [...(player.inventory ?? []), ...session.itemsFound];
  await updatePlayer({ ...player, gold: newGold, inventory: newInventory });
  clearDungeonSession(accountId);

  await sendDM(acct, summary);
  await postPublic(
    `[무사수행 완료] ${player.name}이(가) ${session.location} 탐험을 마쳤습니다. 획득 골드: ${session.goldEarned}G`
  );
}

// 다음 이벤트 전송 또는 탐험 종료
async function sendNextEvent(accountId, acct, player) {
  const session = getDungeonSession(accountId);
  if (!session) return;

  if (session.eventQueue.length === 0) {
    await finishDungeon(accountId, acct, session, player);
    return;
  }

  const next = advanceEvent(accountId);
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
    await sendDM(acct, `'${location}'은(는) 등록되지 않은 장소입니다.`);
    return;
  }

  const minAge = Math.min(...allMonsters.map((m) => m.minAge ?? 0));
  if (age < minAge) {
    await sendDM(acct, `'${location}'은(는) ${minAge}세 이상만 진입할 수 있습니다.`);
    return;
  }

  const playerHp   = calcHp(player.stats.체력);
  const eventQueue = await buildEventQueue(location, age);
  const session    = createDungeonSession(accountId, location, playerHp, eventQueue);

  await sendDM(acct, [
    `[무사수행 시작] ${location}`,
    `HP: ${playerHp}/${playerHp}  소지금: ${player.gold}G`,
    `탐험 이벤트: ${TOTAL_EVENTS}개`,
  ].join("\n"));

  // 첫 이벤트 전송
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

  const player  = await getPlayer(accountId, displayName);
  const session = getDungeonSession(accountId);

  // ================================================================
  // DM 탐험 명령
  // ================================================================
  if (isDM) {
    if (!session) {
      await reply(notification, "진행 중인 무사수행이 없습니다.");
      return;
    }

    const event = session.currentEvent;

    // -- 전투 중 ---------------------------------------------------
    if (session.phase === "battle") {
      const battle = session.currentBattle;

      // [공격]
      if (tokens.some((t) => t.key === "공격")) {
        const playerAtk = player.hidden.전투;
        const playerDmg = calcDamage(playerAtk, battle.defense ?? 0);
        battle.hp       = Math.max(0, battle.hp - playerDmg);

        const lines = [`내가 공격! ${battle.name}에게 ${playerDmg} 데미지`];

        // 적 사망
        if (battle.hp <= 0) {
          const gold = randomBetween(battle.goldMin ?? 0, battle.goldMax ?? 0);
          const updated = updateSession(accountId, (s) => ({
            ...s,
            goldEarned:   s.goldEarned + gold,
            phase:        "event",
            currentBattle: null,
          }));
          lines.push(`${battle.name}을(를) 쓰러뜨렸습니다!`, `${gold}G 획득`);
          await sendDM(acct, lines.join("\n"));
          await sendNextEvent(accountId, acct, player);
          return;
        }

        // 적 반격
        const enemyDmg = calcDamage(battle.attack ?? 5, 0);
        const newHp    = Math.max(0, session.playerHp - enemyDmg);
        lines.push(`${battle.name}의 반격! ${enemyDmg} 데미지`);
        lines.push(`내 HP: ${newHp}/${session.playerMaxHp}  ${battle.name} HP: ${battle.hp}/${battle.maxHp}`);

        // 플레이어 사망
        if (newHp <= 0) {
          const penalty = Math.floor(player.gold * 0.1);
          await updatePlayer({ ...player, gold: Math.max(0, player.gold - penalty) });
          clearDungeonSession(accountId);
          lines.push(`쓰러졌습니다. ${penalty}G 손실.`);
          await sendDM(acct, lines.join("\n"));
          return;
        }

        updateSession(accountId, (s) => ({
          ...s,
          playerHp:     newHp,
          currentBattle: { ...battle },
        }));
        lines.push("\n  [공격]\n  [도망]");
        await sendDM(acct, lines.join("\n"));
        return;
      }

      // [도망]
      if (tokens.some((t) => t.key === "도망")) {
        const success = Math.random() < 0.55;
        if (success) {
          updateSession(accountId, (s) => ({ ...s, phase: "event", currentBattle: null }));
          await sendDM(acct, "도망에 성공했습니다.");
          await sendNextEvent(accountId, acct, player);
        } else {
          const enemyDmg = calcDamage(battle.attack ?? 5, 0);
          const newHp    = Math.max(0, session.playerHp - enemyDmg);

          if (newHp <= 0) {
            const penalty = Math.floor(player.gold * 0.1);
            await updatePlayer({ ...player, gold: Math.max(0, player.gold - penalty) });
            clearDungeonSession(accountId);
            await sendDM(acct, `도망 실패! ${enemyDmg} 데미지를 입고 쓰러졌습니다. ${penalty}G 손실.`);
            return;
          }

          updateSession(accountId, (s) => ({
            ...s,
            playerHp:     newHp,
            currentBattle: { ...battle },
          }));
          await sendDM(acct, [
            `도망 실패! ${enemyDmg} 데미지`,
            `HP: ${newHp}/${session.playerMaxHp}`,
            "",
            "  [공격]",
            "  [도망]",
          ].join("\n"));
        }
        return;
      }

      await reply(notification, "전투 중입니다.\n  [공격]\n  [도망]");
      return;
    }

    // -- 이벤트 단계 -----------------------------------------------
    if (!event) {
      await reply(notification, "현재 이벤트가 없습니다.");
      return;
    }

    // [열기] — 보물상자
    if (tokens.some((t) => t.key === "열기")) {
      if (event.type !== "treasure") {
        await reply(notification, "보물상자가 없습니다.");
        return;
      }

      const lines = ["보물상자를 열었습니다!"];

      if (event.data.hasItem) {
        const ITEMS    = await getItems();
        const itemPool = Object.entries(ITEMS)
          .filter(([, v]) => v.shop === "잡화점")
          .map(([name]) => name);

        if (itemPool.length > 0) {
          const found = itemPool[Math.floor(Math.random() * itemPool.length)];
          updateSession(accountId, (s) => ({
            ...s,
            itemsFound: [...s.itemsFound, found],
          }));
          lines.push(`아이템 획득: ${found}`);
        } else {
          const gold = randomBetween(20, 80);
          updateSession(accountId, (s) => ({ ...s, goldEarned: s.goldEarned + gold }));
          lines.push(`${gold}G 획득`);
        }
      } else {
        const gold = randomBetween(10, 60);
        updateSession(accountId, (s) => ({ ...s, goldEarned: s.goldEarned + gold }));
        lines.push(`${gold}G 획득`);
      }

      await sendDM(acct, lines.join("\n"));
      await sendNextEvent(accountId, acct, player);
      return;
    }

    // [지나간다.] — 보물상자 무시
    if (tokens.some((t) => t.key === "지나간다.")) {
      if (event.type !== "treasure") {
        await reply(notification, "지나칠 것이 없습니다.");
        return;
      }
      await sendDM(acct, "보물상자를 지나쳤습니다.");
      await sendNextEvent(accountId, acct, player);
      return;
    }

    // [대화] — 주민 / 몬스터 / 보스
    if (tokens.some((t) => t.key === "대화")) {
      if (!["villager", "monster", "boss"].includes(event.type)) {
        await reply(notification, "대화할 상대가 없습니다.");
        return;
      }
      const d        = event.data;
      const response = d.dialogue ?? "...말이 없습니다.";

      if (event.type === "villager") {
        const gold = randomBetween(0, 30);
        const lines = [`${d.name}: "${response}"`];
        if (gold > 0) {
          updateSession(accountId, (s) => ({ ...s, goldEarned: s.goldEarned + gold }));
          lines.push(`${d.name}이(가) ${gold}G를 건네줍니다.`);
        }
        await sendDM(acct, lines.join("\n"));
        await sendNextEvent(accountId, acct, player);
      } else {
        // 몬스터/보스와 대화 — 성공 시 전투 회피, 실패 시 기습
        const success = Math.random() < 0.4;
        if (success) {
          await sendDM(acct, `${d.name}: "${response}"\n대화에 성공해 위기를 넘겼습니다.`);
          await sendNextEvent(accountId, acct, player);
        } else {
          const enemyDmg = calcDamage(d.attack ?? 5, 0);
          const newHp    = Math.max(0, session.playerHp - enemyDmg);

          if (newHp <= 0) {
            const penalty = Math.floor(player.gold * 0.1);
            await updatePlayer({ ...player, gold: Math.max(0, player.gold - penalty) });
            clearDungeonSession(accountId);
            await sendDM(acct, `${d.name}: "${response}"\n기습을 받아 쓰러졌습니다! ${penalty}G 손실.`);
            return;
          }

          updateSession(accountId, (s) => ({
            ...s,
            phase:        "battle",
            playerHp:     newHp,
            currentBattle: { ...d },
          }));
          await sendDM(acct, [
            `${d.name}: "${response}"`,
            `대화 실패! 기습을 받았습니다. ${enemyDmg} 데미지`,
            `HP: ${newHp}/${session.playerMaxHp}`,
            "",
            "  [공격]",
            "  [도망]",
          ].join("\n"));
        }
      }
      return;
    }

    // [공격] — 이벤트 단계에서 바로 공격 (주민 포함)
    if (tokens.some((t) => t.key === "공격")) {
      if (!["villager", "monster", "boss"].includes(event.type)) {
        await reply(notification, "공격할 대상이 없습니다.");
        return;
      }

      const d = event.data;

      // 주민 공격 — 전투 없이 즉시 처리
      if (event.type === "villager") {
        const stolen = randomBetween(10, 50);
        updateSession(accountId, (s) => ({ ...s, goldEarned: s.goldEarned + stolen }));
        // 숨김 수치 도덕성 감소
        await updatePlayer({
          ...player,
          hidden: {
            ...player.hidden,
            도덕성: Math.max(0, player.hidden.도덕성 - 5),
          },
        });
        await sendDM(acct, [
          `${d.name}을(를) 공격해 ${stolen}G를 빼앗았습니다.`,
          `도덕성이 하락합니다.`,
        ].join("\n"));
        await sendNextEvent(accountId, acct, player);
        return;
      }

      // 몬스터 / 보스 — 전투 시작
      updateSession(accountId, (s) => ({
        ...s,
        phase:        "battle",
        currentBattle: { ...d },
      }));

      const playerAtk = player.hidden.전투;
      const playerDmg = calcDamage(playerAtk, d.defense ?? 0);
      d.hp            = Math.max(0, d.hp - playerDmg);

      const lines = [`${d.name}을(를) 선제공격! ${playerDmg} 데미지`];

      if (d.hp <= 0) {
        const gold = randomBetween(d.goldMin ?? 0, d.goldMax ?? 0);
        updateSession(accountId, (s) => ({
          ...s,
          goldEarned:    s.goldEarned + gold,
          phase:         "event",
          currentBattle: null,
        }));
        lines.push(`${d.name}을(를) 쓰러뜨렸습니다!`, `${gold}G 획득`);
        await sendDM(acct, lines.join("\n"));
        await sendNextEvent(accountId, acct, player);
        return;
      }

      const enemyDmg = calcDamage(d.attack ?? 5, 0);
      const newHp    = Math.max(0, session.playerHp - enemyDmg);
      lines.push(`${d.name}의 반격! ${enemyDmg} 데미지`);
      lines.push(`내 HP: ${newHp}/${session.playerMaxHp}  ${d.name} HP: ${d.hp}/${d.maxHp}`);

      if (newHp <= 0) {
        const penalty = Math.floor(player.gold * 0.1);
        await updatePlayer({ ...player, gold: Math.max(0, player.gold - penalty) });
        clearDungeonSession(accountId);
        lines.push(`쓰러졌습니다. ${penalty}G 손실.`);
        await sendDM(acct, lines.join("\n"));
        return;
      }

      updateSession(accountId, (s) => ({
        ...s,
        playerHp:     newHp,
        currentBattle: { ...d },
      }));
      lines.push("\n  [공격]\n  [도망]");
      await sendDM(acct, lines.join("\n"));
      return;
    }

    // [숨기] — 주민 / 몬스터 / 보스
    if (tokens.some((t) => t.key === "숨기")) {
      if (!["villager", "monster", "boss"].includes(event.type)) {
        await reply(notification, "숨을 필요가 없습니다.");
        return;
      }

      const d       = event.data;
      const success = Math.random() < 0.65;

      if (success) {
        await sendDM(acct, `${d.name}의 눈을 피해 숨는 데 성공했습니다.`);
        await sendNextEvent(accountId, acct, player);
      } else {
        const enemyDmg = calcDamage(d.attack ?? 5, 0);
        const newHp    = Math.max(0, session.playerHp - enemyDmg);

        if (newHp <= 0) {
          const penalty = Math.floor(player.gold * 0.1);
          await updatePlayer({ ...player, gold: Math.max(0, player.gold - penalty) });
          clearDungeonSession(accountId);
          await sendDM(acct, `숨기 실패! ${d.name}에게 발각되어 ${enemyDmg} 데미지를 입고 쓰러졌습니다. ${penalty}G 손실.`);
          return;
        }

        updateSession(accountId, (s) => ({
          ...s,
          phase:        "battle",
          playerHp:     newHp,
          currentBattle: { ...d },
        }));
        await sendDM(acct, [
          `숨기 실패! ${d.name}에게 발각되었습니다. ${enemyDmg} 데미지`,
          `HP: ${newHp}/${session.playerMaxHp}`,
          "",
          "  [공격]",
          "  [도망]",
        ].join("\n"));
      }
      return;
    }

    await reply(notification, "알 수 없는 명령입니다.");
    return;
  }

  // ================================================================
  // 퍼블릭 — 레이드
  // ================================================================

  const raidToken = tokens.find((t) => t.key === "레이드");
  if (raidToken) {
    if (!isGM) {
      await reply(notification, "레이드 개설은 GM만 가능합니다.");
      return;
    }

    const bossName = raidToken.value;
    if (!bossName) {
      await reply(notification, "사용법: [레이드/보스명]");
      return;
    }

    const existing = getActiveRaid();
    if (existing) {
      await reply(notification, `이미 진행 중인 레이드가 있습니다: ${existing.bossName}`);
      return;
    }

    const bossData = { hp: 500, attack: 20, defense: 10, reward: 300 };
    const raid     = createRaid(bossName, bossData);

    await postPublic(
      `[레이드 모집] ${bossName}\nHP: ${raid.bossHp}\n\n[참가] 로 레이드에 참여하세요!`
    );
    await reply(notification, `레이드 '${bossName}' 개설 완료.`);
    return;
  }

  if (tokens.some((t) => t.key === "참가")) {
    const raid = getActiveRaid();
    if (!raid) {
      await reply(notification, "현재 모집 중인 레이드가 없습니다.");
      return;
    }
    if (raid.phase !== "recruiting") {
      await reply(notification, "레이드가 이미 시작되었습니다.");
      return;
    }
    if (raid.participants[accountId]) {
      await reply(notification, "이미 참가했습니다.");
      return;
    }
    raid.participants[accountId] = { name: displayName, damage: 0 };
    setRaid(raid);
    await reply(notification, `레이드 참가 완료. 현재 참가자: ${Object.keys(raid.participants).length}명`);
    return;
  }

  if (tokens.some((t) => t.key === "레이드시작")) {
    if (!isGM) {
      await reply(notification, "GM 전용 명령입니다.");
      return;
    }
    const raid = getActiveRaid();
    if (!raid || raid.phase !== "recruiting") {
      await reply(notification, "모집 중인 레이드가 없습니다.");
      return;
    }
    const count = Object.keys(raid.participants).length;
    if (count === 0) {
      await reply(notification, "참가자가 없습니다.");
      return;
    }
    raid.phase = "battle";
    setRaid(raid);
    await postPublic(
      `[레이드 시작] ${raid.bossName}\n참가자: ${count}명\nHP: ${raid.bossHp}/${raid.bossMaxHp}\n\n[공격] 으로 보스를 공격하세요!`
    );
    return;
  }

  if (tokens.some((t) => t.key === "레이드종료") && isGM) {
    const raid = getActiveRaid();
    if (!raid) {
      await reply(notification, "진행 중인 레이드가 없습니다.");
      return;
    }
    raid.phase = "ended";
    setRaid(raid);
    await reply(notification, `레이드 '${raid.bossName}' 강제 종료.`);
    return;
  }

  // 레이드 공격 (퍼블릭 [공격])
  if (tokens.some((t) => t.key === "공격")) {
    const raid = getActiveRaid();
    if (raid && raid.phase === "battle" && raid.participants[accountId]) {
      const dmg   = calcDamage(player.hidden.전투, raid.bossDefense);
      raid.bossHp = Math.max(0, raid.bossHp - dmg);
      raid.participants[accountId].damage += dmg;

      const lines = [
        `${displayName}이(가) ${raid.bossName}에게 ${dmg} 데미지!`,
        `${raid.bossName} HP: ${raid.bossHp}/${raid.bossMaxHp}`,
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
          .map((p, i) => `  ${i + 1}위 ${p.name}: ${p.damage} 데미지`)
          .join("\n");

        lines.push(`\n${raid.bossName} 처치!`, `참가자 1인당 ${share}G 지급`, `\n[피해 순위]\n${rankLines}`);
        await postPublic(lines.join("\n"));
        return;
      }

      const bossDmg = calcDamage(raid.bossAttack, 0);
      lines.push(`${raid.bossName}의 반격! 전원에게 ${bossDmg} 데미지`);
      setRaid(raid);
      await postPublic(lines.join("\n"));
      return;
    }

    // 결투 공격으로 이어짐
  }

  // ================================================================
  // 퍼블릭 — 1:1 결투
  // ================================================================

  const duelToken = tokens.find((t) => t.key === "결투");
  if (duelToken) {
    const targetAcct = duelToken.value;
    if (!targetAcct) {
      await reply(notification, "사용법: [결투/상대계정]");
      return;
    }
    if (getDuelByAccount(accountId)) {
      await reply(notification, "이미 진행 중인 결투가 있습니다.");
      return;
    }

    const challenger = { accountId, name: displayName, acct, stats: player.stats };
    createDuel(challenger, targetAcct);
    await postPublic(
      `[결투 신청]\n${displayName}이(가) @${targetAcct}에게 결투를 신청했습니다!\n\n@${targetAcct} [수락] 으로 응하세요.`
    );
    return;
  }

  if (tokens.some((t) => t.key === "수락")) {
    const pending = getDuelByTargetAcct(acct);
    if (!pending) {
      await reply(notification, "수락할 결투 신청이 없습니다.");
      return;
    }
    pending.targetId   = accountId;
    pending.targetName = displayName;
    pending.targetHp   = calcHp(player.stats.체력);
    pending.phase      = "battle";
    setDuel(pending);
    await postPublic(
      `[결투 시작]\n${pending.challengerName} vs ${displayName}\n\n${pending.challengerName}의 선공! [공격] 을 입력하세요.`
    );
    return;
  }

  // 결투 공격
  if (tokens.some((t) => t.key === "공격")) {
    const duel = getDuelByAccount(accountId);
    if (!duel || duel.phase !== "battle") {
      await reply(notification, "진행 중인 결투가 없습니다.");
      return;
    }
    if (duel.currentTurn !== accountId) {
      await reply(notification, "상대방의 차례입니다.");
      return;
    }

    const isChallenger = duel.challengerId === accountId;
    const myHpKey      = isChallenger ? "challengerHp" : "targetHp";
    const oppHpKey     = isChallenger ? "targetHp"     : "challengerHp";
    const myName       = isChallenger ? duel.challengerName : duel.targetName;
    const oppName      = isChallenger ? duel.targetName     : duel.challengerName;
    const oppAcct      = isChallenger ? duel.targetAcct     : duel.challengerAcct;
    const oppId        = isChallenger ? duel.targetId       : duel.challengerId;

    const dmg        = calcDamage(player.hidden.전투, 0);
    duel[oppHpKey]   = Math.max(0, duel[oppHpKey] - dmg);

    const lines = [
      `${myName}의 공격! ${dmg} 데미지`,
      `${oppName} HP: ${duel[oppHpKey]}`,
    ];

    if (duel[oppHpKey] <= 0) {
      duel.phase = "ended";
      setDuel(duel);
      lines.push(`\n${myName} 승리!`);
      await postPublic(lines.join("\n"));
      return;
    }

    duel.currentTurn = oppId;
    setDuel(duel);
    lines.push(`\n@${oppAcct} [공격] 차례입니다.`);
    await postPublic(lines.join("\n"));
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
