// ============================================================
// tarot.js — 타로카드 78장 정의
// ============================================================

export const TAROT_DECK = [
  // -- 메이저 아르카나 (22장) ------------------------------------
  { id: 0,  name: "바보",           suit: "major", upright: "새로운 시작, 순수한 가능성, 자유로운 영혼", reversed: "무모함, 준비 부족, 경솔한 판단" },
  { id: 1,  name: "마법사",         suit: "major", upright: "의지력, 창조, 기술과 재능의 발현",         reversed: "재능 낭비, 속임수, 의지 부족" },
  { id: 2,  name: "여사제",         suit: "major", upright: "직관, 숨겨진 지식, 내면의 목소리",         reversed: "비밀 노출, 표면적인 지식, 직관 무시" },
  { id: 3,  name: "여황제",         suit: "major", upright: "풍요, 모성, 창조적 성장",                  reversed: "의존, 창의력 차단, 과잉 보호" },
  { id: 4,  name: "황제",           suit: "major", upright: "권위, 안정, 질서와 구조",                  reversed: "독재, 경직, 지배욕" },
  { id: 5,  name: "교황",           suit: "major", upright: "전통, 신념, 정신적 지도",                  reversed: "인습 타파, 비정통적 방법, 독단" },
  { id: 6,  name: "연인",           suit: "major", upright: "사랑, 조화, 선택의 기로",                  reversed: "불화, 잘못된 선택, 불균형" },
  { id: 7,  name: "전차",           suit: "major", upright: "승리, 의지, 강인한 추진력",                reversed: "통제 상실, 좌절, 분산된 에너지" },
  { id: 8,  name: "힘",             suit: "major", upright: "용기, 내면의 힘, 인내",                    reversed: "의심, 나약함, 자기 불신" },
  { id: 9,  name: "은둔자",         suit: "major", upright: "성찰, 내면 탐구, 고독 속의 지혜",          reversed: "고립, 고독 두려움, 내면 회피" },
  { id: 10, name: "운명의 수레바퀴", suit: "major", upright: "운명, 전환점, 흐름을 타는 행운",            reversed: "불운, 거스르는 흐름, 외부 통제" },
  { id: 11, name: "정의",           suit: "major", upright: "공정함, 진실, 균형 잡힌 결과",             reversed: "불공평, 편향, 책임 회피" },
  { id: 12, name: "매달린 사람",     suit: "major", upright: "희생, 새로운 시각, 기다림의 지혜",          reversed: "쓸모없는 희생, 지연, 완고함" },
  { id: 13, name: "죽음",           suit: "major", upright: "변화, 끝과 새 시작, 필연적 전환",           reversed: "변화 저항, 침체, 두려움" },
  { id: 14, name: "절제",           suit: "major", upright: "균형, 인내, 조화로운 흐름",                reversed: "불균형, 과도함, 조급함" },
  { id: 15, name: "악마",           suit: "major", upright: "집착, 욕망, 물질적 족쇄",                  reversed: "해방, 자각, 족쇄를 끊음" },
  { id: 16, name: "탑",             suit: "major", upright: "갑작스러운 변화, 붕괴, 진실의 충격",        reversed: "내부 변화, 위기 회피, 느린 붕괴" },
  { id: 17, name: "별",             suit: "major", upright: "희망, 영감, 회복과 치유",                  reversed: "절망, 불신, 방향 상실" },
  { id: 18, name: "달",             suit: "major", upright: "무의식, 환상, 불안과 혼란",                reversed: "혼란 해소, 억압된 공포 직면" },
  { id: 19, name: "태양",           suit: "major", upright: "기쁨, 성공, 활기찬 긍정",                  reversed: "과도한 낙관, 에너지 소진" },
  { id: 20, name: "심판",           suit: "major", upright: "부활, 각성, 과거 청산",                    reversed: "자기 의심, 후회, 변화 거부" },
  { id: 21, name: "세계",           suit: "major", upright: "완성, 통합, 여정의 완결",                  reversed: "미완성, 목표 결여, 정체" },

  // -- 완드 수트 (14장) -----------------------------------------
  { id: 22, name: "완드 에이스",     suit: "wands", upright: "새로운 열정, 창조의 씨앗, 영감의 시작",    reversed: "지연, 동기 부족, 창의력 차단" },
  { id: 23, name: "완드 2",         suit: "wands", upright: "계획, 대담한 비전, 미래 설계",             reversed: "두려움, 계획 없는 행동, 우유부단" },
  { id: 24, name: "완드 3",         suit: "wands", upright: "확장, 탐험, 성과의 예고",                  reversed: "계획 지연, 좌절, 제한된 시야" },
  { id: 25, name: "완드 4",         suit: "wands", upright: "축하, 안정, 공동체의 기쁨",                reversed: "불안정, 가정 불화, 불완전한 성공" },
  { id: 26, name: "완드 5",         suit: "wands", upright: "갈등, 경쟁, 에너지 충돌",                  reversed: "내부 갈등, 회피, 억압된 경쟁심" },
  { id: 27, name: "완드 6",         suit: "wands", upright: "승리, 인정, 공개적 성공",                  reversed: "자존심 상처, 실패 두려움, 불인정" },
  { id: 28, name: "완드 7",         suit: "wands", upright: "도전, 방어, 입장 고수",                    reversed: "압도감, 포기, 방어 포기" },
  { id: 29, name: "완드 8",         suit: "wands", upright: "빠른 전개, 행동, 신속한 결과",             reversed: "지연, 혼란, 성급한 행동" },
  { id: 30, name: "완드 9",         suit: "wands", upright: "회복력, 끈기, 한계까지의 방어",            reversed: "탈진, 경계심 과도, 무너지는 방어" },
  { id: 31, name: "완드 10",        suit: "wands", upright: "짐, 책임 과부하, 완수에 대한 헌신",        reversed: "짐 내려놓기, 위임, 책임 회피" },
  { id: 32, name: "완드 시종",       suit: "wands", upright: "열정적 메신저, 새 아이디어, 모험심",       reversed: "충동, 나쁜 소식, 미성숙한 에너지" },
  { id: 33, name: "완드 기사",       suit: "wands", upright: "대담함, 충동적 행동, 에너지 넘치는 추구",  reversed: "무모함, 분산, 지속성 부족" },
  { id: 34, name: "완드 여왕",       suit: "wands", upright: "자신감, 카리스마, 독립적 창조력",          reversed: "질투, 자기 의심, 에너지 과소비" },
  { id: 35, name: "완드 왕",         suit: "wands", upright: "비전, 지도력, 기업가 정신",               reversed: "오만, 충동, 독단적 리더십" },

  // -- 컵 수트 (14장) -------------------------------------------
  { id: 36, name: "컵 에이스",       suit: "cups", upright: "감정의 새 시작, 사랑의 선물, 직관 개방",    reversed: "억압된 감정, 사랑 차단, 공허함" },
  { id: 37, name: "컵 2",           suit: "cups", upright: "연대, 상호 끌림, 관계의 조화",             reversed: "불균형, 오해, 관계 단절" },
  { id: 38, name: "컵 3",           suit: "cups", upright: "우정, 축하, 공동체 기쁨",                  reversed: "과도함, 고립, 삼각관계" },
  { id: 39, name: "컵 4",           suit: "cups", upright: "명상, 무관심, 기회를 놓침",                reversed: "동기 부여, 새로운 관점, 행동" },
  { id: 40, name: "컵 5",           suit: "cups", upright: "상실, 후회, 슬픔에 집중",                  reversed: "수용, 치유, 앞으로 나아감" },
  { id: 41, name: "컵 6",           suit: "cups", upright: "향수, 순수함, 과거의 즐거움",              reversed: "과거 집착, 성숙 거부, 비현실" },
  { id: 42, name: "컵 7",           suit: "cups", upright: "환상, 선택의 혼란, 꿈과 소망",             reversed: "현실 직면, 명확한 선택, 환상 해소" },
  { id: 43, name: "컵 8",           suit: "cups", upright: "포기, 더 깊은 것을 향한 탐색, 이탈",       reversed: "떠나지 못함, 지체, 의미 없는 지속" },
  { id: 44, name: "컵 9",           suit: "cups", upright: "만족, 소원 성취, 감사",                    reversed: "불만족, 과도한 욕심, 물질주의" },
  { id: 45, name: "컵 10",          suit: "cups", upright: "행복, 정서적 충만, 완전한 조화",            reversed: "불화, 가족 갈등, 행복의 차단" },
  { id: 46, name: "컵 시종",         suit: "cups", upright: "창의적 시작, 직관적 메시지, 순수한 감성",   reversed: "감정 미성숙, 비현실적 꿈, 창의력 차단" },
  { id: 47, name: "컵 기사",         suit: "cups", upright: "낭만, 이상주의, 부드러운 제안",             reversed: "기만, 감정 조작, 비현실적 기대" },
  { id: 48, name: "컵 여왕",         suit: "cups", upright: "공감, 돌봄, 직관적 지혜",                  reversed: "감정 불안정, 의존성, 자기 방치" },
  { id: 49, name: "컵 왕",           suit: "cups", upright: "감정적 성숙, 외교, 관대함",                reversed: "조종, 감정 억압, 변덕" },

  // -- 소드 수트 (14장) -----------------------------------------
  { id: 50, name: "소드 에이스",     suit: "swords", upright: "명확함, 진실, 새로운 아이디어의 돌파",   reversed: "혼란, 잔인한 진실, 명확성 부족" },
  { id: 51, name: "소드 2",         suit: "swords", upright: "교착 상태, 회피, 결정의 어려움",         reversed: "혼란 해소, 정보 과부하, 선택 압박" },
  { id: 52, name: "소드 3",         suit: "swords", upright: "가슴 아픈 상처, 슬픔, 분리의 아픔",      reversed: "회복, 용서, 상처 치유" },
  { id: 53, name: "소드 4",         suit: "swords", upright: "휴식, 회복, 내면 성찰",                  reversed: "불안, 회복 거부, 강제된 침묵" },
  { id: 54, name: "소드 5",         suit: "swords", upright: "갈등, 자존심 싸움, 속 빈 승리",          reversed: "화해, 패배 수용, 타협" },
  { id: 55, name: "소드 6",         suit: "swords", upright: "전환, 여정, 어려움을 벗어남",            reversed: "저항, 지연, 과거로의 귀환" },
  { id: 56, name: "소드 7",         suit: "swords", upright: "속임수, 전략, 은밀한 행동",              reversed: "폭로, 양심의 가책, 전략 실패" },
  { id: 57, name: "소드 8",         suit: "swords", upright: "제약, 두려움에 의한 자기 구속, 무력함",  reversed: "해방, 자기 인식, 제한 극복" },
  { id: 58, name: "소드 9",         suit: "swords", upright: "불안, 악몽, 최악을 상상하는 공포",       reversed: "우려 완화, 비밀 폭로, 회복" },
  { id: 59, name: "소드 10",        suit: "swords", upright: "완전한 패배, 결말, 고통스러운 끝",        reversed: "재기, 회복력, 최악 이후의 상승" },
  { id: 60, name: "소드 시종",       suit: "swords", upright: "예리한 사고, 새 아이디어, 호기심",        reversed: "경솔한 말, 나쁜 소식, 무례함" },
  { id: 61, name: "소드 기사",       suit: "swords", upright: "직접적 행동, 야망, 빠른 전진",           reversed: "무모함, 충동, 공격성" },
  { id: 62, name: "소드 여왕",       suit: "swords", upright: "명석함, 독립, 냉철한 판단",              reversed: "냉혹함, 비판적 태도, 고립" },
  { id: 63, name: "소드 왕",         suit: "swords", upright: "지적 권위, 진실, 공정한 판단",           reversed: "조종, 독단, 잔혹한 정직" },

  // -- 펜타클 수트 (14장) ---------------------------------------
  { id: 64, name: "펜타클 에이스",   suit: "pentacles", upright: "물질적 새 시작, 기회, 번영의 씨앗",   reversed: "기회 낭비, 물질적 손실, 계획 부재" },
  { id: 65, name: "펜타클 2",       suit: "pentacles", upright: "균형, 적응, 여러 일 동시 처리",        reversed: "과부하, 재정 불균형, 혼란" },
  { id: 66, name: "펜타클 3",       suit: "pentacles", upright: "협력, 숙련, 팀워크의 성과",            reversed: "갈등, 비협조, 품질 저하" },
  { id: 67, name: "펜타클 4",       suit: "pentacles", upright: "안정, 소유욕, 재정 보호",              reversed: "집착 해소, 아낌없이 나눔, 해방" },
  { id: 68, name: "펜타클 5",       suit: "pentacles", upright: "결핍, 역경, 버려진 느낌",              reversed: "회복, 도움의 손길, 역경 극복" },
  { id: 69, name: "펜타클 6",       suit: "pentacles", upright: "관대함, 나눔, 자원의 흐름",            reversed: "이기심, 불공정한 거래, 빚" },
  { id: 70, name: "펜타클 7",       suit: "pentacles", upright: "인내, 장기적 투자, 성과 검토",         reversed: "조급함, 수확 없는 노력, 방향 재고" },
  { id: 71, name: "펜타클 8",       suit: "pentacles", upright: "숙련, 성실함, 기술 연마",              reversed: "게으름, 완벽주의, 동기 부족" },
  { id: 72, name: "펜타클 9",       suit: "pentacles", upright: "자립, 풍요, 세련된 삶의 향유",         reversed: "과소비, 물질 의존, 자립 부족" },
  { id: 73, name: "펜타클 10",      suit: "pentacles", upright: "세습, 유산, 오래 지속되는 성공",        reversed: "가족 불화, 유산 문제, 재정 손실" },
  { id: 74, name: "펜타클 시종",     suit: "pentacles", upright: "학습, 새로운 기술, 실용적 메시지",     reversed: "나태함, 기회 낭비, 비현실적 목표" },
  { id: 75, name: "펜타클 기사",     suit: "pentacles", upright: "근면, 책임감, 꾸준한 전진",            reversed: "지루함, 완고함, 변화 거부" },
  { id: 76, name: "펜타클 여왕",     suit: "pentacles", upright: "실용적 지혜, 돌봄, 풍요로운 삶",       reversed: "과보호, 일 중독, 물질주의" },
  { id: 77, name: "펜타클 왕",       suit: "pentacles", upright: "번영, 안정, 현실적 성공",              reversed: "물질만능주의, 완고함, 부의 오남용" },
];

// 3장 뽑기 (정방향/역방향 랜덤)
export function drawThree() {
  const deck    = [...TAROT_DECK];
  const drawn   = [];
  const used    = new Set();

  while (drawn.length < 3) {
    const idx = Math.floor(Math.random() * deck.length);
    if (used.has(idx)) continue;
    used.add(idx);
    const card     = deck[idx];
    const reversed = Math.random() < 0.35;
    drawn.push({ ...card, reversed });
  }

  return drawn;
}

// 카드 위치 라벨
const POSITIONS = ["과거 / 원인", "현재 / 핵심", "미래 / 결과"];

// 운세 텍스트 생성
export function buildTarotReading(cards) {
  const lines = ["[타로 리딩]", ""];

  cards.forEach((card, i) => {
    const direction = card.reversed ? "(역방향)" : "(정방향)";
    const meaning   = card.reversed ? card.reversed : card.upright;
    lines.push(`${POSITIONS[i]}`);
    lines.push(`  ${card.name} ${direction}`);
    lines.push(`  ${meaning}`);
    lines.push("");
  });

  return lines.join("\n").trimEnd();
}
