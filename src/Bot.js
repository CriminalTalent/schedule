// ============================================================
// bot.js — 왕립 계승 아카데미 스케줄 봇
// ============================================================
import "dotenv/config";
import { createRestAPIClient, createStreamingAPIClient } from "masto";
import { applyActions, buildStatusLine, validateSchedule, getAge } from "./game.js";
import { getPlayer, updatePlayer, getAllPlayers, processPlayer, hasSubmittedThisTurn, isEnded } from "./storage.js";
import { getActions }        from "./sheets.js";
import { startAdventure }    from "./combat-bot.js";

const GM_ID        = process.env.GM_ACCOUNT_ID ?? "";
const BOT_TOKEN    = process.env.MASTODON_TOKEN;
const INSTANCE_URL = process.env.MASTODON_URL;
const MAX_TURNS    = Number(process.env.MAX_TURNS ?? 24);

if (!BOT_TOKEN || !INSTANCE_URL) {
  console.error(".env 설정 필요: MASTODON_URL, MASTODON_TOKEN");
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
  console.log("스케줄 봇 시작: @" + BOT_HANDLE);
}

// -- 답글 전송 (500자 초과 시 분할) --------------------------------
async function reply(notification, text) {
  const chunks = splitText(text, 480);
  let replyId  = notification.status?.id;
  for (const chunk of chunks) {
    const status = await rest.v1.statuses.create({
      status:      `@${notification.account.acct} ${chunk}`,
      inReplyToId: replyId,
      visibility:  notification.status?.visibility ?? "unlisted",
    });
    replyId = status.id;
  }
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

// -- 파싱: [키워드] / [키워드/값] / [키워드/값/(서브)] -------------
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

// -- 명령 처리 -----------------------------------------------------
async function handleNotification(notification) {
  if (notification.type !== "mention")               return;
  if (!notification.status || !notification.account) return;

  const accountId   = notification.account.id;
  const acct        = notification.account.acct;
  const displayName = notification.account.displayName || acct;
  const isGM        = accountId === GM_ID;
  const tokens      = parseTokens(notification.status.content);

  if (tokens.length === 0) return;

  // -- [상태] -------------------------------------------------------
  if (tokens.some((t) => t.key === "상태")) {
    const player = await getPlayer(accountId, displayName);
    await reply(notification, buildStatusLine(player));
    return;
  }

  // -- [스케줄/행동명] x3 -------------------------------------------
  // 무사수행은 [스케줄/무사수행/(지역명)] 형식
  const scheduleTokens = tokens.filter((t) => t.key === "스케줄");

  if (scheduleTokens.length > 0) {
    if (await isEnded(accountId, displayName)) {
      await reply(notification, "커뮤니티가 이미 종료되었습니다.");
      return;
    }
    if (await hasSubmittedThisTurn(accountId, displayName)) {
      await reply(notification, "이번 턴 행동을 이미 제출했습니다.");
      return;
    }

    const player  = await getPlayer(accountId, displayName);
    const age     = getAge(player.turn);

    // 행동명 추출 (무사수행은 value로, 지역은 sub로 분리 보관)
    const actions       = scheduleTokens.map((t) => t.value).filter(Boolean);
    const adventureToken = scheduleTokens.find((t) => t.value === "무사수행");
    const adventureLocation = adventureToken?.sub ?? null;

    // 무사수행에 지역이 없으면 거부
    if (actions.includes("무사수행") && !adventureLocation) {
      await reply(notification, "무사수행은 지역을 지정해야 합니다.\n예) [스케줄/무사수행/(서부사막)]");
      return;
    }

    // 유효성 검사
    const errors = await validateSchedule(actions, age);
    if (errors.length > 0) {
      await reply(notification, `제출 실패\n${errors.join("\n")}`);
      return;
    }

    // 즉시 처리
    const updated     = await processPlayer(accountId, (p) => applyActions(p, actions));
    if (!updated) return;

    const lastHistory = updated.history.at(-1);
    const ACTIONS     = await getActions();

    const actionLines = lastHistory.log.map((entry) => {
      const parts = [];
      if (entry.changes.length > 0) parts.push(entry.changes.join(", "));
      if (entry.goldDelta !== 0)    parts.push(`골드${entry.goldDelta > 0 ? "+" : ""}${entry.goldDelta}G`);
      if (entry.note)               parts.push(`(${entry.note})`);
      return `  ${entry.action}: ${parts.join(" / ") || entry.note || "-"}`;
    }).join("\n");

    const resultText = [
      `[${player.name}] ${lastHistory.turn}턴 결과`,
      actionLines,
      "",
      buildStatusLine(updated),
    ].join("\n");

    await rest.v1.statuses.create({
      status:     resultText.slice(0, 490),
      visibility: "public",
    });

    await reply(notification, `${lastHistory.turn}턴 처리 완료. 결과가 공개 게시되었습니다.`);

    // 무사수행 선택 시 DM 자동 발신
    if (actions.includes("무사수행") && adventureLocation) {
      await startAdventure(accountId, acct, displayName, adventureLocation);
    }

    return;
  }

  // -- GM 전용 명령 --------------------------------------------------
  if (!isGM) {
    await reply(notification, "알 수 없는 명령입니다.");
    return;
  }

  // [현황]
  if (tokens.some((t) => t.key === "현황")) {
    const players = await getAllPlayers();
    if (players.length === 0) {
      await reply(notification, "등록된 플레이어가 없습니다.");
      return;
    }
    const lines = players.map((p) => {
      const lastTurn = p.history.at(-1)?.turn ?? 0;
      const flag     = lastTurn === p.turn - 1 ? "[완료]" : "[대기]";
      return `${flag} ${p.name} / ${p.turn - 1}턴 완료 / 스트레스:${p.hidden.스트레스} 위험:${p.hidden.위험도}`;
    });
    await reply(notification, `[전체 현황]\n${lines.join("\n")}`);
    return;
  }

  // [상세] / [상세/이름]
  if (tokens.some((t) => t.key === "상세")) {
    const targetName = tokens.find((t) => t.key === "상세")?.value;
    const players    = await getAllPlayers();
    const list       = targetName
      ? players.filter((p) => p.name === targetName)
      : players;

    if (targetName && list.length === 0) {
      await reply(notification, `'${targetName}' 플레이어를 찾을 수 없습니다.`);
      return;
    }

    for (const p of list) {
      const pub    = Object.entries(p.stats).map(([k, v])  => `${k}:${v}`).join(" ");
      const hidden = Object.entries(p.hidden).map(([k, v]) => `${k}:${v}`).join(" ");
      await reply(notification,
        `[${p.name} 상세]\n공개: ${pub}\n숨김: ${hidden}\n골드: ${p.gold}G\n\n${buildStatusLine(p)}`
      );
    }
    return;
  }

  // [강제진행]
  if (tokens.some((t) => t.key === "강제진행")) {
    const players = await getAllPlayers();
    const targets = players.filter((p) => {
      const lastTurn = p.history.at(-1)?.turn ?? 0;
      return lastTurn < p.turn;
    });

    if (targets.length === 0) {
      await reply(notification, "처리할 플레이어가 없습니다.");
      return;
    }

    for (const p of targets) {
      await updatePlayer({ ...p, turn: p.turn + 1 });
    }
    await reply(notification, `${targets.length}명을 강제로 다음 턴으로 넘겼습니다.`);
    return;
  }

  await reply(notification, "알 수 없는 명령입니다.");
}

// -- 스트리밍 루프 --------------------------------------------------
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
