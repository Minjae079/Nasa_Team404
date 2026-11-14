# Nasa_Team404 · SARSCOPE

React + Vite 기반 NASA NISAR 관측 비교 프론트엔드입니다.
기존 SARSCOPE React 소스를 기반으로 별자리 배경, 3D 지구본, 관측 비교 화면과 모바일 UI를 다듬었습니다.

## 실행

Node.js 22.16 이상이 필요합니다.

```bash
git clone https://github.com/Minjae079/Nasa_Team404.git
cd Nasa_Team404
npm ci
npm run dev
```

http://127.0.0.1:3000 에서 확인합니다.

## 화면

- 별자리 배경과 단일 MapLibre 지구본/상세 지도
- NASA/ASF 관측 검색과 Before/After 사진 비교
- 사진 로딩·오류 안내와 확대 뷰어
- 모델 결과 목록, 결과 없음 안내
- 데스크톱 및 모바일 레이아웃

## 검증

```bash
npm test
npm run build
```

Vercel 설정: Framework Vite, Build `npm run build`, Output `dist`.
`api/`는 Node.js 서버 함수이며 정적 파일 호스팅만으로는 관측 API가 실행되지 않습니다.

## 모델 연결

현재 프론트 작업 단계입니다. 실제 추론 가중치 및 입력 파일, 관측 ID별 결과 연결은 별도 작업입니다.
NASA browse 이미지는 미리보기이며 검증된 변화 탐지 또는 미래 홍수 예측 결과가 아닙니다.

기존 모델 결과 조회를 연결할 때만 `.env.example`을 참고해 서버 환경변수를 설정합니다.
`SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `SARSCOPE_PUBLIC_ANALYSES`는 서버 전용이며 비밀 키에 `VITE_` 접두어를 붙이지 않습니다.
새 저장소를 만들었다고 기존 서비스 데이터가 이전되는 것은 아닙니다.

- [프론트 변경 및 검증 내역](FRONTEND_KO.md)
- [Python 모델 연결](ml/README_KO.md)
- [별자리 에셋 출처와 라이선스](assets/sky/README.md)

기존 REACT_BRANCH.md와 HACKATHON_HANDOFF_KO.md는 원본 저장소의 과거 인수인계 기록입니다.
이 저장소의 실행과 빌드는 본 README를 우선합니다.

## 4파일 Storage 연결 (현재 지도 클릭 화면)

`before.png`, `after.png`, `change_overlay.png`, `metadata.json` 묶음을 게시하고 좌표로 조회합니다.
지도 클릭 시 사전 처리된 결과를 표시하며, 즉석 모델 실행이나 NASA 미리보기 대체 표시는 하지 않습니다.
설정·메타데이터 예제·게시 명령은 [STORAGE_BUNDLES_KO.md](STORAGE_BUNDLES_KO.md)를 참고하세요.
