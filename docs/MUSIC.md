# 배경음악 (Suno)

> Suno에는 Exclude 칸이 없음 → 빼고 싶은 요소는 Style 칸에 `no ~` / `not ~`로 같이 적음.

## 목표
- 곡 1개 = 보스 1체 (약 2분)
- 150 BPM, D minor (현재 프로토와 같은 그리드)
- 핵심: **드롭 직전 1박 완전 무음** → 게임의 캐치 포인트(공수 전환)

## Style
```
instrumental aggressive phonk x electronic, 150 BPM, D minor, heavily distorted 808 bass, pitched 808 cowbell lead melody, punchy kick, snappy claps, rolling hi-hats, dark synth arps, risers, hard-cut silence right before every drop, massive drops, arcade boss battle energy, no vocals, no rap, no singing, not lo-fi, not chill, no slow tempo, no acoustic
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

---

# 로비 / 메뉴 BGM (Suno)

## 목표
- 로비·설정·스테이지 선택에서 **무한 반복** (게임 시작 시 페이드아웃 → 스테이지 곡)
- 어둡고 긴장감 있는 네온 톤, 단 **고조·클라이막스·감정 서사 없음** → 같은 패턴이 계속 도는 미니멀 루프
- D minor, 75 BPM 하프타임 (게임 150 BPM과 맞물림)
- Suno가 인트로/아웃트로를 붙여도 OK: BPM 분석 후 중간 8~16마디를 마디 단위로 잘라 끊김 없이 루프

시행착오: ①시네마틱·미스터리 → 장엄하고 시작/끝이 있음 ②밝은 신스팝 → 너무 신남 → ③이 버전

## Style
```
instrumental dark minimal synthwave loop, 75 BPM half-time feel, D minor, hypnotic repeating bass ostinato, steady dark arpeggio pattern, muted kick, filtered hi-hats, subtle distant cowbell, low steady synth pad, neon night tension, constant intensity, repetitive groove, seamless loop, no vocals, no build-up, no climax, no crescendo, no risers, no swells, no breakdown, no drop, not epic, not cinematic, not orchestral, not bright, not happy, no fade in, no fade out
```

## Lyrics (구조 태그만)
```
[Instrumental]

[Loop A]
[hypnotic bass ostinato, dark arpeggio, muted kick, filtered hats, constant intensity]

[Loop A]
[unchanged groove, same intensity]

[Loop B]
[same groove, arpeggio slightly varied, same intensity, no build]

[Loop A]
[unchanged groove, same intensity]

[Loop B]
[same groove, subtle cowbell echo, same intensity]

[Loop A]
[unchanged groove, ends on the last beat of the bar]
```

## 선곡 기준
1. 가운데 구간이 일정하고 단조로운가 (고조 없음)
2. 박자가 일정한가 (루프 이음새 깔끔)
3. 어둡고 긴장되지만 오래 틀어놔도 안 피곤한가
