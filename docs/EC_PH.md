# 토양 EC·pH 데이터 연결

SEN0604는 Modbus 레지스터 0~3을 한 번에 읽습니다.
수분은 10으로 나누고, 온도는 부호 있는 정수를 10으로 나눕니다.
EC는 µS/cm 원값, pH는 10으로 나눈 값입니다.
제조사 형식: https://wiki.dfrobot.com/sen0604/docs/20297

`soil_ec`, `soil_ph`는 실제 센서가 응답한 경우만 저장하며,
0과 미수집(null)을 구분합니다. 비정상 EC·pH가 있어도 정상 온도·수분은 남깁니다.
과거 두 항목 센서 자료는 계속 처리할 수 있으며 과거 EC·pH를 채워 넣지 않습니다.

## 연결 경로

센서 → 60초 간격 SQLite 저장 → 기존 6시간 간격 업로드
→ Supabase `ingest_environment_ecph` → `environment_readings`
→ `/api/admin-readings` → 관리자/연결 기업의 센서 카드 및 보고서.

`sql/add_soil_ec_ph.sql`은 기존 수신 함수를 먼저 비공개 스키마에 백업하고,
EC·pH 컬럼 및 전용 수신 함수를 추가합니다. 장치 인증과 기업 접근 검사는 유지됩니다.
새 RPC가 없는 경우 전송은 실패하여 로컬 큐에 남고, 전송 완료로 표시되지 않습니다.
API는 EC·pH 값을 그대로 전달하며, 이전 자료에는 null을 반환합니다.
웹의 기존 센서 카드·기록·보고서·CSV는 이 두 항목을 이미 지원합니다.

## 백업과 복구

장치 백업: `/home/pi/backups/ecph-20260928/`
PC 백업: 프로젝트의 `backups/ecph-20260928/`
웹 변경 전 main 커밋: `01eba4dba2fe822c5471f31527ae4a8111d0ac65`

장치에서 실행:

```bash
/home/pi/carbon_monitor/.venv/bin/python /home/pi/backups/ecph-20260928/restore_program.py
systemctl status carbon-monitor --no-pager
```

이전 센서 소스와 설정으로 복원하고 서비스를 재시작합니다.
새로운 측정 기록은 삭제하지 않습니다. DB 수신 함수 복구는
`sql/rollback_soil_ec_ph.sql`을 SQL Editor에서 실행합니다.
웹 API 복구는 백업한 `website/api/admin-readings.js`를 다시 배포합니다.

백업에는 변경 전 프로그램·환경 설정·서비스·패키지 목록과 SQLite 사본이 있습니다.
백업 DB는 무결성 검사에 통과했습니다. 전체 복구 설명은 백업 폴더의 RESTORE.md를 참고하세요.

## 검증

제조사 4레지스터 예시, 기존 두 항목 읽기, 부분 센서 오류,
SQLite 재개방 시 EC·pH 보존, 전송 재시도 및 웹 API 반환을 검사합니다.
장치 적용 시 실제 토양 센서의 네 값이 수집되지 않으면 프로그램을 자동 복구합니다.
현재 장치 NTP가 미동기화되어 수동 시간 보정 이후에도 `errors.clock`이 남을 수 있습니다.
