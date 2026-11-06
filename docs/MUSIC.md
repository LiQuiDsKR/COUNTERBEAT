# 배경음악 (Suno)

## 목표
- 곡 1개 = 보스 1체 (약 2분)
- 150 BPM, D minor (현재 프로토와 같은 그리드)
- 핵심: **드롭 직전 1박 완전 무음** → 게임의 캐치 포인트(공수 전환)

## Style
```
instrumental aggressive phonk x electronic, 150 BPM, D minor, heavily distorted 808 bass, pitched 808 cowbell lead melody, punchy kick, snappy claps, rolling hi-hats, dark synth arps, risers, hard-cut silence right before every drop, massive drops, arcade boss battle energy, no vocals
```

## Exclude styles
```
vocals, rap, singing, lo-fi, chill, slow tempo, acoustic
```

## Lyrics (구조 태그만)
```
[Instrumental]

[Intro]
[sparse kick and hi-hats, cowbell teaser]

[Build-Up]
[tension, light kick, sparse cowbell hits, rising noise riser]

[Stop]
[one beat of total silence]

[Drop]
[full phonk, distorted 808, cowbell melody, claps, rolling hats]
[ends with a low growl]

[Build-Up]
[tension, faster hi-hats, riser]

[Stop]

[Drop]
[heavier, more cowbell, harder 808]

[Break]
[dark atmospheric pad, heartbeat kick, tension]

[Build-Up]
[maximum tension, snare roll, riser]

[Stop]

[Final Drop]
[biggest drop, everything hits]

[Outro]
[808 fades, cowbell echo]
```

## 선곡 기준
1. 드롭 전 무음이 확실한가
2. BPM이 일정한가 (템포 흔들림 없음)
3. 빌드업과 드롭의 대비가 큰가
4. 카우벨 멜로디가 또렷한가 (레이저/노드 위치로 쓸 것)

## 게임에 붙이는 법 (예정)
Suno는 마디 수를 정확히 지키지 않음 → 곡 선택 후 비트맵 작성:
- BPM, 첫 박 오프셋(ms)
- 구간 목록: `intro / dodge / catch / strike / break` 시작 마디
- 탄막 패턴은 구간 + 마디 번호로 배치
