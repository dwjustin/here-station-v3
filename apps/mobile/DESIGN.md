# Here Station Design System

## 1. Experience

### Scope

지하철역 실내 길안내 앱. 시작 → 역 선택 → 길 안내(AR) 세 화면.

### Design direction

- 이전 초안(배민 방향·파란색·기본 서체·캐릭터 자리 비움)을 대체한다.
- Duolingo DESIGN.md의 구조만 참고한다: 큰 시각 중심, 밑턱 있는 큰 버튼, 캐릭터·아이콘으로 전하는 정보, 크기 차이로 만드는 리듬. 색·캐릭터·게임 요소는 가져오지 않는다.
- 모바일 웹이 아니라 처음부터 앱으로 만든 화면처럼 보이게 한다.

### Principles

- 화면마다 먼저 볼 것 하나와 행동 하나.
- 주 행동은 엄지가 닿는 하단에 고정한다. 내용이 길어도 버튼이 화면 밖으로 밀리지 않는다.
- 모든 것을 카드에 넣지 않는다. 카드 중첩, 같은 크기 상자 반복, 설명 문구 과다를 피한다.

## 2. Foundations

### Color (마스코트 역두 final SVG에서 추출, `src/theme/token.ts`의 `colors`가 기준)

| Token | Value | Use |
|---|---|---|
| background | `#FFFBF4` | 따뜻한 흰 바탕 |
| surface | `#FBF0D5` | 배 크림. 캐릭터 무대 |
| sunken | `#F3E6CB` | 눌린 면, 비활성 버튼 |
| text | `#3B2A24` | 진한 갈색 잉크, 13.2:1 |
| muted | `#7A625A` | 보조 글자, 5.5:1 |
| border | `#EADBC0` | 구분선 |
| helmet / helmetLip | `#FCBA01` / `#E19301` | 안전모. 주 버튼 면 / 밑턱, AR 화살표 |
| onHelmet | `#5A2D1C` | 노랑 위 글자 6.7:1 (흰 글자는 대비 부족) |
| fur / furDeep | `#8C402B` / `#5A2D1C` | 털. 강조 글자 |
| scarf / scarfLip / scarfInk | `#88B71A` / `#629904` / `#4E7A06` | 목도리. 진행·완료, 연두 글자 4.9:1 |
| danger | `#C9342A` | 오류 글자 5.1:1 |

### Type

Pretendard Regular·Bold (`assets/fonts`, expo-font 설정 플러그인으로 빌드 때 포함). 굵기는 family로만 고른다.

| Role | Size / line | Weight |
|---|---|---|
| display | 32 / 40 | Bold |
| title | 24 / 32 | Bold |
| headline (버튼·입력) | 19 / 26 | Bold |
| body | 16 / 24 | Regular |
| bodyBold | 16 / 24 | Bold |
| label | 14 / 20 | Bold |
| caption | 13 / 18 | Regular |

긴 한글 문구는 `lineBreakStrategyIOS="hangul-word"`로 단어 단위 줄바꿈한다.

### Adaptive size

- `useUi()`가 화면 폭 390dp 기준 배율(0.85~1.25, 폭은 520dp까지만 반영)을 크기·간격·글자에 곱한다. 화면 폭과 안드로이드 '디스플레이 크기' 설정을 따른다.
- 글자는 그 위에 시스템 글자 크기(fontScale)가 자동으로 곱해진다. 노선 번호 배지만 원형이 깨지지 않게 고정한다.
- 터치 영역은 48dp 아래로 줄이지 않는다. 태블릿·가로에서는 내용 폭을 520dp로 막고 가운데 둔다.

## 3. Components

- **Button**: 면 + 단단한 밑턱(주 5dp, 보조 3dp). 누르면 면이 밑턱만큼 내려가고 밑턱이 사라진다. 높이 합이 같아 주변이 흔들리지 않는다. primary(노랑) / secondary(흰 면) / 비활성(sunken).
- **Yeokdu**: `assets/yeokdu` SVG 포즈 5종(basic, hello, map, cheer, confused)을 expo-image로 띄운다. 장식이므로 스크린리더에서 숨긴다.
- **StationField / LineTabs / StationList**: 역은 글자로 찾지 않고 고른다. 출발 고리(연두)·도착 점(노랑)을 세로선으로 이은 두 칸은 누르는 버튼이고, 고르는 중인 칸 아래에 노란 줄이 붙는다. 그 아래 1~9호선 원형 배지 한 줄(고른 노선만 색을 채움, 스크롤해도 위에 고정)과 그 노선의 역 목록. 역 줄은 카드 없이 노선 배지 + 역 이름, 갈아탈 수 있는 노선은 오른쪽에 작은 배지.

## 4. Screens

- **시작**: 크림 원 위의 큰 역두(hello) → "어디로 안내할까요?" → 하단 고정 "길 안내 시작하기".
- **역 선택**: 상단은 뒤로 가기만. 큰 제목, 출발→도착 칸, "○○역을 골라 주세요", 노선 배지 줄, 역 목록. 출발역을 고르면 바로 도착역 차례가 된다. 역 목록은 `GET /stations?q=`(빈 검색어)로 한 번 불러 노선별로 묶는다. 하단 고정 "길 찾기" + 안내·오류(역두 confused).
- **길 안내**: 카메라 전체 화면. 위에 둥근 뒤로 가기 + 3단계 진행 막대(출발역·열차·도착역), 가운데 노란 화살표, 아래쪽에 떠 있는 카드(좌우·아래 16dp 여백, 배경만 `rgba(255,251,244,0.7)`, 글자·버튼은 불투명). 카드는 화살표(화면 높이 약 62%)를 가리지 않게 화면 아래에 둔다. 단계별 역두 표정 + 문구, 열차 단계만 "내렸어요".

## 5. Prototype

`design/prototype.html`은 세 화면을 눌러 보는 HTML 프로토타입이다. 브라우저로 바로 열면 된다(`assets/` 글꼴·역두 SVG를 그대로 쓴다). 역 목록은 노선마다 서울 구간 일부만 넣은 예시이고, 카메라는 가짜 배경, "가상 보행"을 누르면 다음 단계로 넘어간다.

## 6. Governance

1. 사용자의 직접 지시가 이 문서보다 먼저다.
2. 화면·토큰이 바뀌면 이 문서도 같이 고친다.
