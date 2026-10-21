# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project: BookLog

단일 HTML 파일 독서 기록 웹앱. 외부 라이브러리 없음 — 순수 HTML + CSS + JavaScript.

**Entry point:** `booklog/index.html` (브라우저에서 직접 열기, 서버 불필요)
루트의 `index.html`은 GitHub Pages용 리다이렉트(`→ booklog/`)일 뿐이다.

**별도 페이지:** `meetup/index.html` — BookLog와 무관한 모임 안내 단일 페이지.
- 내용은 파일 맨 위 `<script type="text/plain" id="meeting">` 안에 「제목: 내용」 한 줄씩 적는다 (JS 문법이 아니라 따옴표 실수로 페이지가 깨지지 않음). 각 줄이 카드 하나가 되고, 내용이 빈 줄은 숨긴다.
- 특별한 제목: `모임 이름`(헤더, 필수) · `한 줄 소개` · `지도 링크`('장소'가 들어간 카드에 버튼). '연락처/전화' 카드는 첫 전화번호로 `tel:` 버튼, 연도가 있는 첫 날짜는 D-day/'오늘 모임이 있습니다'/지난 모임 표시.
- 제목에 '정기 모임'이 들어간 줄(예: `매달 둘째 주 토요일`)은 `scheduleSection()`이 오늘 이후 `UPCOMING_COUNT`(6)번의 일정표로 그린다 (지난 모임은 표시하지 않음, 해가 바뀌면 연도 제목 추가). 첫 줄이 다음 모임 `.next`. 제목에 '일정 알림'이 들어간 줄은 규칙 아래 `.schedule-tip`으로 들어간다. '다음 모임' 날짜가 규칙과 다르면 그 달만 바꿔 '날짜 변경' 표시. '다음 모임' 날짜가 지나면 배지가 규칙상 다음 날짜를 안내한다.
- `Q:`/`A:` 줄 쌍은 카드가 아니라 `faqSection()`이 맨 아래 '자주 묻는 질문'(`<details>`/`<summary>`, 스크립트 없이 펼침)으로 그린다. 제목에 '자주 묻는 질문'이 들어간 줄이 코너 제목. 연속 `A:`는 문단 추가, 답 없는 질문·질문 없는 답은 안내.
- 잘못된 줄은 `#notice` 노란 안내로 보여 준다. 단톡방 미리보기용 `<title>`/`og:` 태그는 정적이라 따로 적는다.
- 오래된 모바일 브라우저 호환을 위해 `??`, `?.`, lookbehind 정규식 등은 쓰지 않는다. 점검 보고서는 `meetup/REVIEW.md`.

## Architecture

모든 코드가 `booklog/index.html` 한 파일에 존재한다. 구조:

```
<style>   CSS (변수, 레이아웃, 컴포넌트, 통계 화면)
<body>    header(.header-actions: #btn-stats, #btn-add)
          .container > #form-section / #list-section / #empty-state / #stats-section
<script>  데이터 레이어 + 목록 렌더링 + 이벤트 핸들러 + 독서 통계
```

**데이터 흐름:** `localStorage("booklog")` ↔ DOM. 메모리에 배열을 들고 있지 않고, 매번 `loadBooks()`로 읽어 `saveBooks()`로 쓴다. 화면은 `render()`가 카드 HTML 전체를 재생성.

**Book 스키마:**
```js
{ id, title, author, date, rating, review, genre }
// id:     Date.now() + 카운터 (number)
// date:   "YYYY-MM-DD" 또는 "" (읽은 날짜)
// rating: 1~5 (별점을 골라야 저장 버튼이 활성화됨)
// review: 한 줄 감상 (선택)
// genre:  GENRES 중 하나 또는 "" — 이 필드가 없는 예전 기록도 있으므로 항상 optional로 취급
```

**핵심 함수:**
- `loadBooks()` / `saveBooks(books)` — localStorage 읽기/쓰기 (용량 초과 시 alert)
- `addBook(formData)` — 객체 생성 → `unshift()` → 저장
- `updateBookGenre(id, genre)` — 기존 책의 장르만 수정
- `deleteBook(id)` — filter → 저장
- `sortBooks(books, mode)` — 복사본 정렬 반환 (`"date"` 최근순, 날짜 없는 책은 뒤로 / `"rating"` 별점순)
- `render()` — `renderCards(sortBooks(loadBooks(), sortMode))`
- `computeStats(books, year)` / `renderStats()` — 독서 통계 계산·표시
- `showStats(on)` — 목록 ↔ 통계 화면 전환

## 화면 동작

- **목록 화면:** '책 추가' 버튼이 폼을 토글. 카드 클릭은 `#card-grid` 이벤트 위임으로 처리 (삭제 → 인라인 확인, 장르 태그 → 인라인 `<select>`로 교체, 선택 즉시 저장 / Esc·focusout 시 `render()`로 취소).
- **통계 화면:** `.container`에 `stats-mode` 클래스를 붙이면 CSS가 폼·목록·빈 화면을 숨기고 `#stats-section`만 표시한다. 통계 모드에서 '책 추가'를 누르면 목록으로 돌아가며 폼이 열린다.
- **통계 규칙:**
  - 올해 권수·월별 막대그래프는 `date` 기준 (날짜 없는 책은 제외하고 제외 권수를 표시)
  - 장르 Top 3는 **전체 기록** 기준, 동점이면 `GENRES` 배열 순서
  - 월별 막대는 가장 많은 달을 100% 높이로, 막대 위 권수 + hover/focus 말풍선(`data-tip`)

## Key Constraints

- **XSS 방어:** 사용자 입력(제목·저자·감상·장르)은 반드시 `escapeHtml()`을 거쳐 DOM에 삽입
- **기존 데이터 호환:** 새 필드를 추가할 때는 그 필드가 없는 예전 기록이 있어도 깨지지 않게 할 것
- **디자인:** `:root`의 CSS 변수(`--primary`, `--accent`, `--bg`, `--border` 등)를 재사용. 그래프 막대도 `--accent` 한 색
- **별점 UI:** CSS `direction: rtl` + 형제 선택자 트릭으로 좌→우 채움 구현. 라디오 인풋은 `display:none` — label 클릭으로 선택
- **반응형:** 520px 이하에서 폼 2열 → 1열 전환, 월별 그래프 라벨 축소. 768px 이상에서 카드·통계 카드 2열

## Testing

테스트는 Playwright로 수행한다 (서버 없이 `file://` URL 직접 로드).

```powershell
# 테스트 환경 임시 구성 (저장소 밖 임시 폴더 권장)
npm init -y
npm install playwright
node_modules\.bin\playwright install chromium
```

- 별점 라디오 인풋은 `display:none`이므로 Playwright에서 `.check()` 대신 `label[for="rN"]`을 `.click()` 해야 한다.
- 테스트 데이터는 `localStorage.setItem('booklog', JSON.stringify([...]))` 후 `reload()`로 주입한다.
- 장르 편집은 `.card-genre` 클릭 → `.card-genre-select`에 `selectOption()`.

**모임 안내 페이지 테스트:** `meetup/test/meetup-test.js` (Playwright 1.45+, `page.clock`으로 날짜 고정).
`NODE_PATH=<playwright 설치 폴더>/node_modules node meetup/test/meetup-test.js` → "N개 중 M개 통과", 실패 시 종료 코드 1.
기대값은 내용 모음에서 읽으므로 모임 내용을 바꿔도 테스트를 고칠 필요가 없다.
