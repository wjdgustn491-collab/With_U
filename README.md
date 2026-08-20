# WITH_U 통합 탄소 플랫폼

세 개의 화면과, 모든 화면에 공통으로 붙는 사이드바로 구성됩니다.
웹에 처음 들어오면 `index.html`(진입 화면)이 열리고, 왼쪽 사이드바에서
세 서비스를 자유롭게 이동합니다.

| 파일 | 역할 |
|---|---|
| `index.html` | **진입 화면.** 왼쪽 사이드바(화면의 1/5) + 오른쪽 4/5 정중앙의 작업 타이틀. |
| `carbon-dashboard.html` | 통합 탄소 대시보드 — 배출(Input) 대 상쇄(Output) 대조. |
| `impact-dashboard.html` | ESG 공공 성과 지표 — 감축량을 일상 속 체감 지표로 환산. |
| `certificate-verify.html` | 공식 인증서 검증 (KEITI / KCCI). |
| `assets/sidebar.css`<br>`assets/sidebar.js` | 공용 사이드바. 각 페이지는 이 두 파일만 링크하면 동일한 내비게이션을 갖습니다. |
| `api/verify.js` | Vercel 서버리스 프록시 (인증서 검증용). |

## 사이드바 붙이는 방법

페이지에 다음 세 줄만 추가하면 됩니다. 마크업은 `sidebar.js` 가 주입합니다.

```html
<link rel="stylesheet" href="assets/sidebar.css">   <!-- head -->
<body class="wu-has-sidebar">                        <!-- body 에 클래스 -->
<script src="assets/sidebar.js" defer></script>      <!-- </body> 직전 -->
```

메뉴 항목을 늘리거나 문구를 바꾸려면 `assets/sidebar.js` 상단의 `ITEMS`
배열 한 곳만 고칩니다. 폭은 `assets/sidebar.css` 의 `--wu-sb-w`
(기본 `max(248px, 20vw)`)로 조절하고, 화면 폭 900px 이하에서는 자동으로
햄버거 버튼 방식으로 접힙니다.

---

## 공식 인증서 검증 모듈 (KEITI 연동)

한국환경산업기술원(KEITI)의 **환경표지인증 해지·취소 제품 조회** 공식 오픈API를
경유해 인증 유효성을 확인하는 화면입니다.

### 구성

| 파일 | 역할 |
|---|---|
| `certificate-verify.html` | 검증 UI. `/api/verify` 만 호출하고 인증키는 모릅니다. |
| `api/verify.js` | Vercel 서버리스 프록시. CORS·인증키 은닉·XML→JSON 변환 담당. |

### 왜 프록시가 필요한가

정적 HTML만으로는 동작하지 않습니다. 세 가지 이유가 전부 프록시 하나로 해결됩니다.

1. **CORS** — `data.go.kr` 은 CORS 헤더를 주지 않아 브라우저에서 직접 호출하면 차단됩니다.
2. **인증키 노출** — `serviceKey` 를 HTML에 넣으면 소스보기로 그대로 유출됩니다.
3. **응답 포맷** — 이 API는 XML만 반환합니다. 프록시에서 JSON으로 정규화합니다.

### 설치

#### 1. 공공데이터포털 인증키 발급

[환경표지인증 해지취소 제품 조회 GW](https://www.data.go.kr/data/15158373/openapi.do)
페이지에서 **활용신청**을 누릅니다.

- 비용: 무료
- 심의: 개발단계·운영단계 모두 **자동승인** (신청 즉시 사용 가능)
- 트래픽: 개발계정 **일 100건**, 운영계정은 활용사례 등록 시 증액 신청 가능

발급된 키 중 **일반 인증키 (Decoding)** 를 사용합니다.

#### 2. 환경변수 등록

Vercel 프로젝트 → Settings → Environment Variables:

```
DATA_GO_KR_KEY = <발급받은 Decoding 키>
```

#### 3. 배포

```bash
vercel deploy
```

로컬에서 테스트하려면:

```bash
DATA_GO_KR_KEY=<키> vercel dev
```

`vercel dev` 없이 HTML 파일만 열면 프록시가 없으므로 상태 표시등이
`프록시 없음 / OFFLINE` 로 표시됩니다. 이는 정상 동작입니다.

### 상태 표시등

장식이 아니라 실제 헬스체크 결과입니다. 로드 시 `/api/verify` 를 호출해
인증키 설정 여부를 확인하고 세 가지 중 하나를 표시합니다.

| 표시 | 의미 |
|---|---|
| `연결됨 (Live)` / LIVE | 프록시 정상, 인증키 설정됨 |
| `인증키 미설정` / SETUP | 프록시는 살아있으나 `DATA_GO_KR_KEY` 없음 |
| `프록시 없음` / OFFLINE | 서버리스 함수에 도달 못함 (정적 파일로 열었을 때) |

### 검증 의미의 한계 — 중요

이 API가 담고 있는 것은 **해지·취소된 인증 목록**입니다. 따라서:

- 조회 결과 있음 → 해지·취소 이력 있음 → **무효**
- 조회 결과 없음 → 해지·취소 이력 **없음**

두 번째를 "인증이 유효하다"로 읽으면 안 됩니다. 애초에 존재하지 않는 번호도
해지 목록에는 없기 때문입니다. 그래서 UI 문구도 "유효함"이 아니라
"해지·취소 이력 없음"으로 표기합니다.

완전한 유효성 확인에는 유효 인증 목록이 추가로 필요합니다:
[환경표지 인증내역](https://www.data.go.kr/data/15043631/openapi.do) (파일데이터, JSON/XML 자동변환 제공).

### 탄소 배출량(tCO2eq) 수치가 필요한 경우

환경표지인증 API에는 탄소 수치가 없습니다. 제품별 **탄소발자국** 실측값은
[환경성적표지 유효 인증현황](https://www.data.go.kr/data/15089157/fileData.do)
에 있습니다 — 다만 이쪽은 **오픈API가 없고 CSV 파일데이터만** 제공되므로,
주기적으로 내려받아 함께 서빙하는 방식으로 붙여야 합니다.

### 필드 매핑 주의

포털 명세가 축약 필드명(`prodRsid`, `prodPrnm` 등)만 제공하고 한글 대응표가
없습니다. `api/verify.js` 의 `normalizeItem()` 매핑은 명세 설명문을 근거로 한
추정이며, **실제 키로 1회 호출한 응답을 보고 확정해야 합니다.**

### 데이터 출처

- [한국환경산업기술원_환경표지인증 해지취소 제품 조회 GW](https://www.data.go.kr/data/15158373/openapi.do)
- 제공기관 문의: 한국환경산업기술원 디지털전략실 02-2284-1167
