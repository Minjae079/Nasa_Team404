# Storage 4파일 연결

## 결과 파일 규약

분석마다 고유한 영문/숫자/하이픈/밑줄 ID를 사용합니다.
로컬 출력 폴더에는 정확히 다음 이름의 파일이 필요합니다.

- before.png
- after.png
- change_overlay.png
- metadata.json

`data/scene-metadata.example.json`을 metadata.json으로 복사하고 실제 값으로 교체합니다.
예제 날짜/좌표/제품 ID는 실제 자료가 아닙니다. 모델 출력으로 게시하면 안 됩니다.
현재 규약은 version, id, title, crs, bounds, before/after의 observed_at 및 source_scene_id,
model_version을 요구합니다. UTC 시각은 Z로 끝납니다. 원본 관측 ID는 ASF 제품 ID를 사용합니다.

좌표계는 EPSG:4326이며 bounds 순서는 [서쪽 경도, 남쪽 위도, 동쪽 경도, 북쪽 위도]입니다.
날짜 변경선을 넘으면 서쪽 경도가 동쪽 경도보다 클 수 있습니다.
이 bounds는 검색 대상으로 삼을 분석 범위입니다. 실제 유효 영역이 사각형이 아니면 범위 안에도
NoData가 있을 수 있습니다. 현재는 사각형 검색이며 픽셀 유효성/폴리곤 검색은 추가 작업입니다.

세 PNG는 각각 독립 이미지로 표시합니다. change_overlay는 오른쪽 패널의 Change image로
전환하며, 좌표 정렬이 확인되지 않은 상태에서 지도나 after 위에 임의로 합성하지 않습니다.
추가 AI 설명/위험도 필드는 아직 처리하지 않습니다. 게시된 metadata는 위 규약으로 정규화합니다.

## 서버 설정

프로젝트 루트의 .env.local에 아래 이름으로 설정합니다. 파일은 Git에서 제외됩니다.

```dotenv
SUPABASE_URL=https://jywbvxyyumznolgultci.supabase.co
SUPABASE_SECRET_KEY=실제_서버용_sb_secret_키
SARSCOPE_PUBLIC_ANALYSES=true
```

Vercel에서는 같은 값을 서버 환경변수로 설정합니다. 비밀 키에 VITE_ 접두어를 붙이지 않습니다.
키는 채팅/커밋/브라우저 코드에 넣지 않습니다. 현재 서버는 sb_secret_ 형식 키를 요구합니다.

## 검증과 게시

D:\nasa_team404에서 실행합니다.

```cmd
npm ci
node tools/publish-scene-bundle.mjs --dir "D:\실제_모델_출력_폴더"
node tools/publish-scene-bundle.mjs --dir "D:\실제_모델_출력_폴더" --publish
npm run dev
```

첫 명령은 메타데이터와 PNG 헤더/구조를 확인하는 dry run입니다. 완전한 PNG 디코딩이나
과학적 정확성을 검증하지는 않습니다. --publish가 있어야 실제 업로드됩니다.

기존 private sarscope-data 버킷에 results/분석ID/ 아래 네 파일을 업로드한 뒤,
results/scenes.json 검색 목록을 마지막에 갱신합니다. 별도의 DB 테이블은 만들지 않습니다.
폴더에 파일만 수동으로 올리면 목록에 등록되지 않으므로 게시 도구를 사용합니다.
기존 단일 prediction.png용 results/manifest.json은 유지합니다.

게시자는 한 번에 한 명만 사용합니다. 동일 ID/파일을 덮어쓰지 않습니다.
실패한 업로드는 일부 파일을 남길 수 있지만 목록에 공개하지 않습니다.
실패 시 남은 파일을 확인한 뒤 metadata.json에 새 ID를 주어 다시 게시합니다.
자동 삭제/자동 복구는 하지 않습니다. 목록 크기는 8MB/5000건으로 제한하며 대규모 검색은 DB로 이전합니다.

## 사이트 동작

지도 클릭 → GET /api/scene-results?lat=위도&lng=경도 → 해당 bounds의 공개 결과 검색.
이후 관측 시각이 가장 최신인 결과가 기본 선택됩니다. 드롭다운으로 다른 분석을 선택합니다.
서버는 실제 metadata.json과 검색 목록의 일치를 확인하고 세 이미지에 10분 유효 URL을 발급합니다.
API는 원본 이미지 전체를 프록시하지 않고 브라우저가 Storage에서 직접 다운로드하게 합니다.

빠른 위치 변경/홈 복귀 시 요청을 취소합니다. URL은 만료 전에 갱신하며 이미지 오류 시 자동
갱신은 한 번만 시도하고 이후에는 사용자가 Refresh를 누릅니다.
설정 누락/공개 비활성/결과 없음/API 실패/이미지 실패를 구분합니다.
기존 Model results 메뉴는 이전 단일 PNG 뷰어로 남아 있으며 이번 4파일 결과는 지도 클릭 화면에 표시합니다.

## 검증 범위

단위/통합 테스트는 가상 Storage로 네 파일 게시, 부분 업로드 실패, 기존 목록 보존,
좌표 검색, 날짜 선택, 잘못된 메타데이터 차단을 검증합니다.
실제 모델 파일과 서버 키 없이는 실제 Supabase 업로드와 PNG 표시 완료를 확인할 수 없습니다.
