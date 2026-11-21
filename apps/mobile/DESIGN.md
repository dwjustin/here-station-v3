# Here Station Design System

<!-- design-md:section experience -->
## 1. Experience

<!-- design-md:claim scope kind=product-surface lang=en -->
### Scope

지하철역 실내 길안내 앱
<!-- design-md:claim-end -->

<!-- design-md:claim primary-tasks kind=user-outcomes count=1 lang=en -->
### Primary tasks

- 홈의 시작 버튼으로 출발역과 도착역 선택 화면 열기
<!-- design-md:claim-end -->

### Design direction

- 사용자가 고른 배민의 친근하고 경쾌한 방향을 참고한다. 로고·민트색·캐릭터·글꼴은 복제하지 않는다.

- 상단 Here Station 눈썹 문구를 없애고 가운데 캐릭터 자리를 비워 둔다.

### Principles

- 짧고 친근한 문구와 시작 버튼 하나에 집중한다.

### Avoid

- 임의 캐릭터·이모지·준비 중 문구 삽입

- 배민의 관찰 값을 프로젝트 브랜드 사실로 복사

<!-- design-md:section foundations -->
## 2. Foundations

<!-- design-md:claim foundations kind=rules-or-constraints lang=en -->
### Semantic tokens

- **color.background**: `#FFFFFF` — src/theme/token.ts의 색상
- **color.border**: `#D7DEE7` — src/theme/token.ts의 색상
- **color.muted**: `#526174` — src/theme/token.ts의 색상
- **color.primary**: `#2459D3` — src/theme/token.ts의 색상
- **color.surface**: `#F4F6F8` — src/theme/token.ts의 색상
- **color.text**: `#182230` — src/theme/token.ts의 색상
- **radius.control**: `12` — 앱 토큰 또는 공통 Button의 dp 값
- **size.control-min**: `48` — 앱 토큰 또는 공통 Button의 dp 값
- **space.lg**: `24` — 앱 토큰 또는 공통 Button의 dp 값
- **space.md**: `16` — 앱 토큰 또는 공통 Button의 dp 값
- **space.sm**: `8` — 앱 토큰 또는 공통 Button의 dp 값
- **space.xl**: `40` — 앱 토큰 또는 공통 Button의 dp 값

### Contrast pairs

- color.text on color.background: minimum 4.5:1
- color.muted on color.background: minimum 4.5:1
- color.background on color.primary: minimum 4.5:1

### Reduced motion

Required.

### Foundation rules

- 파란색과 흰 배경을 쓰고 src/theme/token.ts를 재사용한다.
<!-- design-md:claim-end -->

<!-- design-md:section typography-assets -->
## 3. Typography & Assets

### Type roles

| Role | Usage | Family | Size | Weight |
|---|---|---|---|---|
| hero | 상단 두 줄 제목 | 플랫폼 기본 서체 | 40dp | 700 |
| body | 하단 보조 문구 | 플랫폼 기본 서체 | 16dp | 400 |
| action | 공통 시작 버튼 | 플랫폼 기본 서체 | 16dp | 700 |

### Rules

- 기본 서체를 쓰고 새 글꼴을 설치하지 않는다.

- 문자 확대를 허용하고 짧은 화면은 세로 스크롤로 대응한다.

- 캐릭터 이미지는 이번 범위에서 제작하지 않는다.

<!-- design-md:section components-states -->
## 4. Components & States

### Component: start-guidance

**Semantics:** 버튼 하나로 /stations에 이동. 전체 화면 터치를 명시적인 버튼으로 대체한다.

- Anatomy: 공통 Button, 길 안내 시작하기 라벨
- States: default, focus-visible
- Token references: color.primary, color.background, radius.control, size.control-min

- Interaction kind: interactive

#### State applicability

| State | Applicability | Reason |
|---|---|---|
| default | applicable |  |
| hover | not-applicable | 홈은 터치 기반의 즉시 화면 이동이며 비동기·입력·완료 상태를 갖지 않는다. |
| focus-visible | applicable |  |
| disabled | not-applicable | 홈은 터치 기반의 즉시 화면 이동이며 비동기·입력·완료 상태를 갖지 않는다. |
| loading | not-applicable | 홈은 터치 기반의 즉시 화면 이동이며 비동기·입력·완료 상태를 갖지 않는다. |
| error | not-applicable | 홈은 터치 기반의 즉시 화면 이동이며 비동기·입력·완료 상태를 갖지 않는다. |
| success | not-applicable | 홈은 터치 기반의 즉시 화면 이동이며 비동기·입력·완료 상태를 갖지 않는다. |

### Rules

- src/components/ui/Button.tsx를 그대로 사용한다.

- 빈 캐릭터 배경은 접근성·터치 대상이 아닌 장식이다.

<!-- design-md:section layout-platforms -->
## 5. Layout & Platforms

### Responsive constraints

- Minimum supported width: 320px
- Reflow target: 200% zoom

### Layout rules

- SafeAreaView 안에 좌우 24dp 여백.

- 상단 두 줄 제목, 중앙 빈 캐릭터 공간, 하단 보조 문구와 시작 버튼.

- 중앙 공간은 남는 높이를 받고 짧은 화면에서는 콘텐츠 전체를 세로 스크롤.

### Platform: ios

- 안전 영역과 공통 컴포넌트를 사용한다.

### Platform: android

- 안전 영역과 공통 컴포넌트를 사용한다.

<!-- design-md:section content-locales -->
## 6. Content & Locales

### Voice

- 친근하고 짧게 말하되 길안내 행동은 명확히 쓴다.

### Terminology

| Term | Preferred form |
|---|---|
| home.action | 길 안내 시작하기 |
| home.description | 출발역부터 도착역까지 함께해요. |
| home.heading | 어디로<br>가볼까요? |

### Locale: ko-KR (supported)

- 한국어 UI를 쓴다.

<!-- design-md:section governance -->
## 7. Governance

<!-- design-md:claim authority kind=project-system lang=en -->
### Authority

This document is the project design contract for the declared scope.
<!-- design-md:claim-end -->

<!-- design-md:claim application-priority order=prompt-fact,repository-fact,system-contract,reference-inspiration lang=en -->
### Application priority

1. Direct user instructions for the requested scope.
2. Repository facts.
3. This system contract.
4. Reference inspiration.
<!-- design-md:claim-end -->

<!-- design-md:claim unknowns policy=absent-at-smallest-unresolved-boundary lang=en -->
### Unknowns

Omit only the smallest unresolved value or group. Do not replace it with a plausible default.
<!-- design-md:claim-end -->

<!-- design-md:claim changes policy=review-record-validate-before-adoption lang=en -->
### Changes

Record, review, and validate changes before adoption.
<!-- design-md:claim-end -->

### Project priority details

1. 현재 사용자의 명시적 지시

2. 승인 후 채택되는 프로젝트 시스템

3. 배민 레퍼런스는 영감으로만 사용

### Additional change rules

- 현재 초안은 검토용이며 아직 채택하지 않았다.

- 캐릭터 완성 후 중앙 공간에 연결한다.

- 다른 화면과 공통 컴포넌트는 수정하지 않는다.

### Decision provenance

- typography_assets.character — unresolved; evidence: 사용자는 디자인 시스템에 맞춰 캐릭터를 나중에 만들기 위해 비워 두었다고 설명함.
