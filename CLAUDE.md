# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project: BookLog

단일 HTML 파일 독서 기록 웹앱. 외부 라이브러리 없음 — 순수 HTML + CSS + JavaScript.

**Entry point:** `booklog/index.html` (브라우저에서 직접 열기, 서버 불필요)

## Architecture

모든 코드가 `booklog/index.html` 한 파일에 존재한다. 구조:

```
<style>   CSS (변수, 레이아웃, 컴포넌트)
<body>    header / #form-section / .list-controls / #book-list / #empty-state
<script>  데이터 레이어 + 이벤트 핸들러
```

**데이터 흐름:** `books` 배열(메모리) ↔ `localStorage("booklog_books")` ↔ DOM (`render()` 전체 재생성 방식)

**Book 스키마:**
```js
{ id, title, author, status, rating, memo, createdAt }
// status: "want" | "reading" | "done"
// rating: 1~5 (status === "done"일 때만 유효, 그 외 0)
```

**핵심 함수:**
- `saveBook(formData)` — 객체 생성 → `books.unshift()` → persist → render
- `deleteBook(id)` — filter → persist → render
- `render()` — `sortBooks()` 결과로 카드 HTML 전체 재생성
- `sortBooks(criteria)` — 원본 `books` 배열 불변, 복사본 정렬 반환

## Key Constraints

- **XSS 방어:** 사용자 입력은 반드시 `escapeHtml()`을 거쳐 DOM에 삽입
- **별점 UI:** CSS `direction: rtl` + 형제 선택자 트릭으로 좌→우 채움 구현. 라디오 인풋은 `display:none` — label 클릭으로 선택
- **반응형:** 520px 이하에서 폼 2열 → 1열 전환

## Testing

테스트는 Playwright로 수행한다 (서버 없이 `file://` URL 직접 로드).

```powershell
# 테스트 환경 임시 구성
cd booklog
npm init -y
npm install playwright
node_modules\.bin\playwright install chromium
```

별점 라디오 인풋은 `display:none`이므로 Playwright에서 `.check()` 대신 `label[for="rN"]`을 `.click()` 해야 한다.
