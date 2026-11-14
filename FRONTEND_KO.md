# SARSCOPE 프론트 디자인 작업

기존 feature/react-vite-migration 소스를 사용한 로컬 작업입니다.
대상 저장소: https://github.com/Minjae079/Nasa_Team404
초기 프론트 코드: main

## 실행

이 폴더에서 다음 명령을 실행합니다. Node.js 22.16 이상이 필요합니다.

```cmd
npm.cmd ci
npm.cmd run dev
```

http://127.0.0.1:3000 에서 확인합니다. 홈과 지도는 비밀 키 없이 확인할 수 있습니다.

## 변경

- 기존 별자리, 지구본, 청록/라임 색상과 좌우 비교 패널 보존
- 홈 버튼 우선순위 및 헤더 간격 정리
- 관측 사진 로딩/실패 표시, 로딩 완료 후 활성화되는 확대 버튼
- React 상태 기반 이미지 확대 대화상자와 닫기/Escape
- 결과가 없는 경우 안내와 네 가지 분류 설명
- 모바일 비교 패널, 닫기 버튼, 선택 메뉴, 상세 지도 패널 간격 조정
- reduced-motion 및 키보드 포커스 스타일
- 기존 테스트가 발견한 Vite 환경파일 경로 응답 오류 수정

주요 파일: src/react.css, src/components/GlobeScene.jsx,
src/components/ComparisonScene.jsx, src/components/ModelResults.jsx,
src/components/AboutDialog.jsx, app.js, vite.config.js.

## 검증과 범위

npm.cmd test: 18/18 통과. npm.cmd run build: 성공.
브라우저에서 홈, 결과 없음, 실제 NASA 관측 목록 및 사진, 확대 뷰어 확인.
1440×900 및 390×844 화면을 점검했습니다.

모델 추론, 관측 ID별 모델 결과 연결, 업로드, 원격 푸시, 배포는 이번 작업에 포함하지 않았습니다.
원격 브랜치에 문서의 src/lib/globeMotion.js가 없어 초기 자동 자전은 구현하지 않았습니다.
기존 단일 지도 컨트롤러를 유지했습니다.
