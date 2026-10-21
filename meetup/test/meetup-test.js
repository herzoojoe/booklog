// 모임 안내 페이지(meetup/index.html) 자동 테스트
//
// 기대값은 페이지 맨 위 "내용 모음"에서 읽어 온다.
// 그래서 모임 날짜·장소·요일을 바꿔도 이 테스트는 고칠 필요가 없다.
//
// 실행 (Playwright 1.45 이상 필요):
//   macOS/Linux : NODE_PATH=<playwright 설치 폴더>/node_modules node meetup/test/meetup-test.js
//   Windows     : $env:NODE_PATH="<playwright 설치 폴더>\node_modules"; node meetup\test\meetup-test.js
// 결과 맨 끝에 "N개 중 M개 통과"가 나오고, 하나라도 실패하면 종료 코드 1을 돌려준다.

const fs = require("fs");
const os = require("os");
const path = require("path");
const { pathToFileURL } = require("url");

let chromium;
try {
  ({ chromium } = require("playwright"));
} catch (e) {
  console.error("playwright를 찾을 수 없어요. 파일 맨 위 '실행' 안내대로 NODE_PATH를 지정해 주세요.");
  process.exit(2);
}

const PAGE = path.resolve(__dirname, "..", "index.html");
const SRC = fs.readFileSync(PAGE, "utf8");
const WEEKDAYS = "일월화수목금토";
const DAY = 86400000;

// ---------- 내용 모음 읽기 (페이지와 같은 규칙: 첫 번째 콜론 기준) ----------

function configBlock(src) {
  return src.match(/<script type="text\/plain" id="meeting">([\s\S]*?)<\/script>/)[1];
}

function readConfig(src) {
  return configBlock(src).split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const i = line.search(/[:：]/);
      return { title: line.slice(0, i).trim(), value: line.slice(i + 1).trim() };
    });
}

function findRow(rows, word) {
  return rows.find((r) => r.title.replace(/\s+/g, "").includes(word));
}

// 내용 모음의 한 줄만 바꾼 페이지 소스를 만든다
function withLine(src, word, newLine) {
  return src.replace(configBlock(src), (block) =>
    block.split("\n").map((line) => {
      const i = line.search(/[:：]/);
      return i > 0 && line.slice(0, i).replace(/\s+/g, "").includes(word) ? newLine : line;
    }).join("\n"));
}

function parseDate(text) {
  const m = text.match(/(\d{4})\s*[년.\-\/]\s*(\d{1,2})\s*[월.\-\/]\s*(\d{1,2})/);
  return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null;
}

const clean = (s) => String(s || "").replace(/ /g, " ").replace(/\s+/g, " ").trim();
const at = (date, h, m) => new Date(date.getFullYear(), date.getMonth(), date.getDate(), h, m || 0);
const fmt = (d) => `${d.getMonth() + 1}월 ${d.getDate()}일 (${WEEKDAYS[d.getDay()]})`;

// 규칙 "둘째 주 O요일"의 날짜를 달력을 하루씩 세어서 구한다 (페이지와 다른 방식으로 계산해 교차 확인)
function secondWeekday(year, month, weekday) {
  let count = 0;
  for (let d = 1; d <= 31; d++) {
    const date = new Date(year, month, d);
    if (date.getMonth() !== month) break;
    if (date.getDay() === weekday && ++count === 2) return date;
  }
  return null;
}

// ---------- 테스트 도구 ----------

const results = [];
const tmpFiles = [];
let browser;

async function check(group, name, fn) {
  try {
    const r = await fn();
    results.push({ group, name, ok: r === true, why: r === true ? "" : r });
  } catch (e) {
    results.push({ group, name, ok: false, why: e.message.split("\n")[0] });
  }
}

async function open({ now, width = 375, src = SRC } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height: 800 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  if (now) await page.clock.setFixedTime(now);
  let file = PAGE;
  if (src !== SRC) {
    file = path.join(os.tmpdir(), `meetup-test-${process.pid}-${tmpFiles.length}.html`);
    fs.writeFileSync(file, src);
    tmpFiles.push(file);
  }
  await page.goto(pathToFileURL(file).href);
  return { page, ctx, errors };
}

// 제목(label)이 같은 카드의 내용 글자
function cardValue(page, title) {
  return page.evaluate((t) => {
    const card = [...document.querySelectorAll("#cards .item")]
      .find((c) => c.querySelector(".label") && c.querySelector(".label").textContent === t);
    const v = card && card.querySelector(".value");
    return v && v.offsetParent !== null ? v.textContent : null;
  }, title);
}

function badgeText(page) {
  return page.evaluate(() => {
    const b = document.querySelector(".badge");
    return b ? b.textContent : null;
  });
}

// ---------- 테스트 ----------

async function main() {
  const rows = readConfig(SRC);
  const nameRow = findRow(rows, "모임이름");
  const dateRow = findRow(rows, "다음모임");
  const ruleRow = findRow(rows, "정기모임");
  const meeting = parseDate(dateRow.value);
  const ruleWeekday = WEEKDAYS.indexOf(ruleRow.value.match(/([일월화수목금토])요일/)[1]);
  const faqs = [];
  rows.forEach((r) => {
    if (/^q$|^질문$/i.test(r.title)) faqs.push({ q: r.value, a: [] });
    else if (/^a$|^답변?$/i.test(r.title) && faqs.length) faqs[faqs.length - 1].a.push(r.value);
  });
  const before = at(new Date(meeting - 20 * DAY), 10); // '오늘'을 모임 20일 전으로 고정

  browser = await chromium.launch();

  // 1. 기본 정보 표시
  const G1 = "1. 모임 정보가 화면에 나오는지";
  {
    const { page, ctx, errors } = await open({ now: before });
    await check(G1, `모임 이름 "${nameRow.value}"`, async () => {
      const h1 = clean(await page.textContent("h1"));
      return h1 === clean(nameRow.value) || `화면 제목이 "${h1}"`;
    });
    for (const word of ["다음모임", "장소", "회비", "연락처"]) {
      const row = findRow(rows, word);
      await check(G1, `${row.title} "${row.value}"`, async () => {
        const shown = await cardValue(page, row.title);
        if (shown === null) return "화면에 이 칸이 없거나 숨겨져 있음";
        return clean(shown) === clean(row.value) || `화면에는 "${clean(shown)}"`;
      });
    }
    await check(G1, "페이지 오류·노란 경고 안내 없음", async () => {
      if (errors.length) return "스크립트 오류: " + errors[0];
      return (await page.isHidden("#notice")) || "경고: " + clean(await page.textContent("#notice"));
    });
    await ctx.close();
  }

  // 2. 카운트다운
  const G2 = "2. 카운트다운";
  const badgeCases = [
    ["모임 7일 전 아침 → D-7", at(new Date(meeting - 7 * DAY), 9), "D-7"],
    ["모임 7일 전 밤 11시 50분 → D-7", at(new Date(meeting - 7 * DAY), 23, 50), "D-7"],
    ["모임 당일 아침 → 오늘 모임이 있습니다", at(meeting, 8), "오늘 모임이 있습니다"],
    ["모임 당일 밤 11시 50분 → 오늘 모임이 있습니다", at(meeting, 23, 50), "오늘 모임이 있습니다"],
  ];
  for (const [name, now, want] of badgeCases) {
    await check(G2, name, async () => {
      const { page, ctx } = await open({ now });
      const got = await badgeText(page);
      await ctx.close();
      return got === want || `"${got}"(으)로 나옴`;
    });
  }

  // 3. 일정표
  const G3 = "3. 정기 모임 일정표";
  async function scheduleRows(src, now) {
    const { page, ctx } = await open({ src, now });
    const list = await page.$$eval(".schedule li", (lis) => lis.map((li) => ({
      when: li.querySelector(".when").textContent,
      cls: li.className,
      opacity: +getComputedStyle(li).opacity,
    })));
    await ctx.close();
    return list;
  }
  function checkSecondWeekday(list, year, weekday) {
    if (list.length !== 12) return `일정이 ${list.length}줄 (12줄이어야 함)`;
    const wrong = list.filter((row, month) => row.when !== fmt(secondWeekday(year, month, weekday)));
    return wrong.length === 0 ||
      `틀린 날짜: ${wrong.map((r) => r.when).join(", ")}`;
  }

  const current = await scheduleRows(SRC, before);
  await check(G3, `설정한 규칙(${ruleRow.value})대로 12달 날짜가 나옴`, async () =>
    checkSecondWeekday(current, before.getFullYear(), ruleWeekday));

  await check(G3, "요일을 바꿔도 맞게 계산됨 (예: 둘째 주 토요일로 바꿔 보기)", async () => {
    const sat = secondWeekday(meeting.getFullYear(), meeting.getMonth(), 6);
    let src = withLine(SRC, "정기모임", `${ruleRow.title}: 매달 둘째 주 토요일`);
    src = withLine(src, "다음모임", `${dateRow.title}: ${sat.getFullYear()}년 ${fmt(sat)} 오후 2시`);
    return checkSecondWeekday(await scheduleRows(src, before), before.getFullYear(), 6);
  });

  await check(G3, "지난 모임은 흐리게, 다음 모임은 강조", async () => {
    const problems = [];
    let nextSeen = false;
    current.forEach((row, month) => {
      const date = secondWeekday(before.getFullYear(), month, ruleWeekday);
      const past = date < at(before, 0);
      if (past && !(row.cls.includes("past") && row.opacity < 1)) problems.push(`${row.when} 흐리지 않음`);
      if (!past && !nextSeen) {
        if (!row.cls.includes("next")) problems.push(`${row.when} 다음 모임 표시 없음`);
        nextSeen = true;
      } else if (row.cls.includes("next")) problems.push(`${row.when} 잘못 강조됨`);
    });
    return problems.length === 0 || problems.join(", ");
  });

  // 4. 자주 묻는 질문
  const G4 = "4. 자주 묻는 질문";
  {
    const { page, ctx } = await open({ now: before });
    const details = page.locator(".faq details");
    await check(G4, `질문 ${faqs.length}개가 처음엔 모두 접혀 있음`, async () => {
      const count = await details.count();
      if (count !== faqs.length) return `질문이 ${count}개 (내용 모음에는 ${faqs.length}개)`;
      const opened = await details.evaluateAll((ds) => ds.filter((d) => d.open).length);
      return opened === 0 || `${opened}개가 이미 펼쳐져 있음`;
    });
    await check(G4, "질문을 누르면 그 질문의 답이 펼쳐짐", async () => {
      const problems = [];
      for (let i = 0; i < faqs.length; i++) {
        await details.nth(i).locator("summary").click();
        const answer = details.nth(i).locator("p").first();
        if (!(await answer.isVisible())) problems.push(`"${faqs[i].q}" 답이 안 보임`);
        else if (clean(await answer.textContent()) !== clean(faqs[i].a[0])) problems.push(`"${faqs[i].q}" 답 내용이 다름`);
      }
      return problems.length === 0 || problems.join(", ");
    });
    await check(G4, "다시 누르면 답이 접힘", async () => {
      const problems = [];
      for (let i = 0; i < faqs.length; i++) {
        await details.nth(i).locator("summary").click();
        if (await details.nth(i).locator("p").first().isVisible()) problems.push(`"${faqs[i].q}"`);
      }
      return problems.length === 0 || `안 접힘: ${problems.join(", ")}`;
    });
    await ctx.close();
  }

  // 5. 스마트폰 화면에서 글자 잘림
  const G5 = "5. 스마트폰 화면에서 글자가 잘리지 않는지";
  async function clipping(width, src) {
    const { page, ctx } = await open({ now: before, width, src });
    await page.$$eval(".faq details", (ds) => ds.forEach((d) => { d.open = true; })); // 답까지 모두 펼쳐서 검사
    const found = await page.evaluate(() => {
      const out = [];
      const vw = document.documentElement.clientWidth;
      if (document.documentElement.scrollWidth > vw) out.push(`화면이 옆으로 ${document.documentElement.scrollWidth - vw}px 밀림`);
      document.querySelectorAll("h1, header p, .label, .value, .badge, .btn, .schedule-year, .schedule li span, .faq summary, .faq p, #notice")
        .forEach((el) => {
          if (el.offsetParent === null && el.id !== "notice") return;
          const r = el.getBoundingClientRect();
          const text = el.textContent.trim().slice(0, 15);
          if (el.scrollWidth > el.clientWidth + 1) out.push(`"${text}" 글자가 칸보다 넓음`);
          else if (r.left < -0.5 || r.right > vw + 0.5) out.push(`"${text}" 화면 밖으로 나감`);
        });
      return out;
    });
    await ctx.close();
    return found.length === 0 || found.slice(0, 3).join(", ");
  }
  for (const width of [320, 360, 375, 390, 412]) {
    await check(G5, `폭 ${width}px`, () => clipping(width));
  }
  await check(G5, "폭 320px + 띄어쓰기 없는 아주 긴 장소·질문", () => {
    let src = withLine(SRC, "장소", "📍 장소: https://example.com/AbCdEfGhIjKlMnOpQrStUvWxYz0123456789AbCdEfGhIj");
    src = src.replace(configBlock(src), (b) => b + "Q: 아주긴질문아주긴질문아주긴질문아주긴질문아주긴질문아주긴질문?\nA: 답\n");
    return clipping(320, src);
  });

  await browser.close();
}

function report() {
  let group = "";
  for (const r of results) {
    if (r.group !== group) {
      group = r.group;
      console.log(`\n[${group}]`);
    }
    console.log(`  ${r.ok ? "✅" : "❌"} ${r.name}${r.ok ? "" : "\n       → " + r.why}`);
  }
  const passed = results.filter((r) => r.ok).length;
  console.log(`\n결과: ${results.length}개 중 ${passed}개 통과`);
  return passed === results.length;
}

main()
  .catch((e) => {
    console.error("테스트를 끝까지 실행하지 못했어요:", e.message);
    if (browser) browser.close();
  })
  .then(() => {
    tmpFiles.forEach((f) => { try { fs.unlinkSync(f); } catch (e) { /* 이미 지워짐 */ } });
    process.exit(report() ? 0 : 1);
  });
