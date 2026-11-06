'use strict';
// 곡별 비트맵. sections: [시작 마디, 타입] — 다음 항목 시작 전까지가 그 구간.
// 타입: intro / dodge / strike / end. 세 번째 값은 특별 구간 (아래 sections 주석 참고)
// dodge 구간의 마지막 마디 4박째 = 캐치 포인트 (곡에 필터를 닫아 빨아들였다가 드롭에 확 열기)
const SONGS = {
  cb1: {
    title: 'COUNTERBEAT #1',
    file: 'music/COUNTERBEAT%20%231.mp3',
    bpm: 150,
    offset: 0.022,      // 파일 시작 → 첫 박(초). 브라우저 분석값
    bossHp: 3000,       // 전부 PERFECT 기준: 그레이즈 x1.5면 SPLIT(56)쯤, 그레이즈 없이도 72마디 2배 비트 반격쯤 처치
    // 난이도: 첫 맵이라 낮게. tier = min(maxTier, 마디 / tierBars)
    maxTier: 2,
    tierBars: 36,
    // 분석 메모: 0~23 조용한 빌드업(8, 20마디 임팩트, 23 끝 라이저), 24 첫 드롭.
    // 드롭은 '7마디 + 숨 고르는 1마디'(31, 39, 63, 71, 87, 95) 단위.
    // 48 임팩트 후 49~51 조용, 56~57 조용, 72~79·96~103 브레이크다운(72·76·96·100 임팩트),
    // 104~112 파이널, 113 아웃트로.
    // 원칙: 전부 4마디 단위로 회피 ↔ 반격 교대 (2마디 구간 없음). 회피 끝 박 = 캐치.
    // 곡이 4마디 단위와 어긋나는 곳만 특별 구간 (세 번째 값):
    //   'split'  : WARNING 경고 후 반격 박을 2분 → 4분 → 8분 연타로 쪼갬 (56~59: 조용 2마디 뒤 58에 드롭이 늦게 들어옴)
    //   'warning': 회피 구간 시작에 WARNING 경고만
    //   'final'  : 곡 끝 남는 1마디 (112) 마지막 연타 + FINISH
    //   'x2'     : 2배 비트 반격 (4분 자리를 8분 4연타로). SPLIT을 넘긴 뒤부터 계속
    // 반격 패턴 번호: 1 = 기본(값 없음), 2 = 'p2' 클랩 더블, 3 = 'split', 4 = 'x2'
    // 배치(고정, 외워서 늘게): 1 1 1 1 2 2 → 3 → 4 ×6 → FINAL
    sections: [
      [0, 'intro'],
      [4, 'dodge'],
      [8, 'strike'],    // 임팩트
      [12, 'dodge'],
      [16, 'strike'],
      [20, 'dodge'],    // 23 라이저 → 캐치
      [24, 'strike'],   // 첫 드롭
      [28, 'dodge'],    // 31 숨 고르기 → 캐치
      [32, 'strike'],
      [36, 'dodge'],
      [40, 'strike', 'p2'],   // 패턴2 첫 등장
      [44, 'dodge'],
      [48, 'strike', 'p2'],   // 임팩트
      [52, 'dodge'],
      [56, 'strike', 'split'],
      [60, 'dodge'],    // 63 숨 고르기 → 캐치
      [64, 'strike', 'x2'],
      [68, 'dodge'],
      [72, 'strike', 'x2'],   // 브레이크다운 임팩트
      [76, 'dodge'],
      [80, 'strike', 'x2'],
      [84, 'dodge'],
      [88, 'strike', 'x2'],
      [92, 'dodge'],
      [96, 'strike', 'x2'],   // 브레이크다운 임팩트
      [100, 'dodge'],
      [104, 'strike', 'x2'],  // 파이널 드롭
      [108, 'dodge', 'warning'],
      [112, 'strike', 'final'],
      [113, 'end'],
    ],
  },
};

// 스테이지 목록 (스테이지 선택 화면 카드 순서). song: SONGS 키, locked: 아직 없음
// diff: 난이도 별 (1~5), color: 카드 강조색
const STAGES = [
  { id: 1, song: 'cb1', name: 'COUNTERBEAT', diff: 1, color: '#00e5ff' },
  { id: 2, locked: true, color: '#ff1e56' },
  { id: 3, locked: true, color: '#b06bff' },
  { id: 4, locked: true, color: '#ffd23f' },
];
