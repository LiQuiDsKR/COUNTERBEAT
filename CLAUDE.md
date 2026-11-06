# CLAUDE.md

## 커밋 규칙
- 커밋은 사용자 단독 커밋. **`Co-Authored-By` 트레일러 넣지 않음.**
- PR 본문에도 생성 도구 표기 넣지 않음.

## 프로젝트
- 게임 설명/조작/디버그 키는 README.md에 기록 (게임 화면에는 설명 텍스트 넣지 않음).
- 음악 관련은 docs/MUSIC.md.
- 빌드 도구 없음. `python -m http.server 5173`으로 실행 (`.claude/launch.json`).
- 모든 타이밍은 오디오 시계 기준 (`songTime()`), 프레임 시간으로 판정하지 말 것.
