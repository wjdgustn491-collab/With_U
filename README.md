# 🌿 EcoPulse: 통합 환경 영향 대시보드 (Integrated Environmental Impact Dashboard)

> React, Tailwind CSS, Recharts를 활용하여 설계된 반응형 친환경 글래스모피즘(Glassmorphism) 통합 제어 대시보드입니다.

![Dashboard Preview](https://img.shields.io/badge/Aesthetics-Glassmorphism-emerald?style=for-the-badge)
![React](https://img.shields.io/badge/React-18-blue?style=for-the-badge&logo=react)
![TailwindCSS](https://img.shields.io/badge/TailwindCSS-v3-38bdf8?style=for-the-badge&logo=tailwindcss)
![Recharts](https://img.shields.io/badge/Recharts-2.12-22c55e?style=for-the-badge)

---

## ⚡ 주요 기능 (Key Features)

EcoPulse 대시보드는 벤토 그리드(Bento-Grid) 레이아웃을 기반으로 하며 총 6개의 연동형 환경 모듈을 제공합니다:

1. **실시간 균형 관리 (Real-time Balance)**: 배출량(Emissions)과 자연 상쇄량(Offsets)의 균형을 시각화하는 Recharts AreaChart.
2. **다차원 발자국 지표 (Multi-Footprint Metrics)**: 탄소, 수분, 생태적 공간, 질소 지표의 변동 상태 및 추세를 보여주는 KPI 카드.
3. **한전 KEPCO API 및 계산기**: 전력(kWh) 및 가스($m^3$) 소비량을 탄소량으로 실시간 계산. 스마트 미터 자동 동기화 시뮬레이션 지원.
4. **수종별 탄소 흡수율 분석 (Carbon Sink Analysis)**: 참나무, 편백나무, 단풍나무, 소나무 등 수종별 이산화탄소 연간 흡수량 비교 및 클릭 시 상세 정보 패널 업데이트.
5. **부문별 배출원 비율 (Emission Sources)**: 가스, 전력, 운송, 폐기물 처리 부문별 탄소 비중을 보여주는 Donut Chart.
6. **2030 넷제로 달성 진척도 (Net-Zero Tracker)**: 넷제로 달성도를 실시간 게이지 차트로 매핑하며, 탄소 감축 마일스톤 체크박스 조작에 따라 달성도가 실시간으로 계산되어 반영.

---

## 🛠️ 기술 스택 (Tech Stack)

- **Frontend**: HTML5, React 18 (UMD CDN version)
- **Styling**: Tailwind CSS (Play CDN), CSS3 Custom Variables (Glassmorphism Effect)
- **Charts**: Recharts
- **Icons**: Inline SVG React Components (의존성 없는 최적화 렌더링)
- **Compiler**: Babel Standalone (브라우저 즉시 빌드)

---

## 🚀 실행 및 배포 방법 (How to Run & Deploy)

### 1. 로컬에서 실행하기
1. 이 레포지토리를 클론하거나 `index.html` 파일을 다운로드합니다.
2. `index.html` 파일을 더블클릭하면 즉시 브라우저에서 실행됩니다. (추가 패키지 설치나 로컬 서버 설정이 필요하지 않습니다.)

### 2. GitHub Pages로 라이브 호스팅 배포하기
이 프로젝트는 단일 파일(`index.html`)로 작동하므로, GitHub Pages를 통해 무료로 10초 만에 라이브 배포할 수 있습니다:
1. GitHub 리포지토리에 이 파일들을 업로드합니다. (업로드 시 파일명을 `index.html`로 변경해 주세요.)
2. 리포지토리의 **Settings** (설정) 탭으로 이동합니다.
3. 왼쪽 메뉴에서 **Pages**를 클릭합니다.
4. Build and deployment의 Branch 설정을 `main` (또는 `master`) 브라우저의 `/ (root)` 폴더로 설정한 후 **Save**를 누릅니다.
5. 약 1~2분 후 제공되는 URL(예: `https://<your-username>.github.io/<repo-name>/`)로 접속하면 라이브 대시보드를 인터넷상에서 볼 수 있습니다!

---

## 📄 라이선스 (License)
© 2026 ECOPULSE. All rights reserved.
