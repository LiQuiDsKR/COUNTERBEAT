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

# 2스테이지 곡 (Suno)

## 목표
- 1번(어둡고 거친 phonk, 카우벨, D minor)과 다른 분위기 → **하드스타일 × 사이버펑크**: 무대 위의 웅장하고 뜨거운 에너지
- 150 BPM (게임 그리드 고정, 하드스타일 표준 템포), E minor
- 드롭 직전 정적 = 캐치 포인트 (하드스타일 장르 공식과 일치)
- 4마디 단위 프레이즈, 드롭은 마디 첫 박에

## Style
```
instrumental hardstyle x cyberpunk electronic, 150 BPM, E minor, distorted hardstyle kick, reverse bass, soaring supersaw lead melody, gated synth stabs, euphoric yet intense boss battle energy, dramatic breakdowns, hard-cut silence right before every drop, 4-bar phrases, drops land on the downbeat, steady tempo, no vocals, no rap, no singing, no cowbell, not phonk, not lo-fi, not chill, no tempo changes
```

## Lyrics (구조 태그만)
```
[Instrumental]

[Intro]
[pulsing synth arpeggio, filtered kick, tension]

[Build-Up]
[rising supersaw, snare roll, riser]

[Stop]
[one beat of total silence]

[Drop]
[hard distorted kick, reverse bass, soaring lead melody]

[Breakdown]
[atmospheric pads, lead melody alone, emotional but tense]

[Build-Up]
[faster snare roll, pitch riser]

[Stop]

[Drop]
[heavier kick, gated synth stabs, lead melody returns]

[Build-Up]
[maximum tension, riser]

[Stop]

[Final Drop]
[biggest drop, everything hits]

[Outro]
[kick fades, synth echo]
```

## 선곡 기준
1. 드롭 전 정적이 확실한가
2. 템포 일정 (하드스타일 '안티 클라이맥스'의 템포 다운 구간 X → 게임 박자 어긋남)
3. 리드 멜로디가 또렷한가 (레이저/노드 배치 힌트)

다른 BPM 장르(DnB 174 등)를 쓰려면 게임의 곡별 BPM 지원이 먼저 필요.

## 결과: `music/2. UNREACHABLE.mp3`
- 4분 7초, 0마디 픽업 → 1마디부터 곡. 드롭 33·53·93·125마디, 각 드롭 직전 베이스 끊김/라이저
- 템포가 150 → 중반 151~152.5 → 끝 150 근처로 흔들림 (Suno 드리프트). 고정 150이면 후반에 1박 넘게 밀림
  → `songs.js`의 `tempo` 템포맵(4마디마다 킥 위치 기준점)으로 맞춤. 기준점 사이 오차 대부분 ±4ms
- 드롭1 뒤 14+6마디라 45~52마디만 8마디 회피, 나머지는 4마디 교대
- 반격 박자는 구간마다 새 리듬 `chart` (패턴 1·2 재탕 안 함). [editor.html](../editor.html)에서 곡과 같이 들어보며 수정

---

# 3스테이지 곡 (Suno)

## 목표
- 1번(phonk, D minor)·2번(하드스타일, E minor)과 다른 분위기 → **하이브리드 트랩 × 시네마틱**: 어둡고 신비로운 보라색 의식(儀式) 같은 보스전
- 오케스트라 브라스·합창·종소리 + 808 슬라이드. 드롭은 하프타임(묵직하게 쿵… 쾅)이라 1·2번의 달리는 느낌과 대비
- 150 BPM (하프타임 = 체감 75), F# minor
- 드롭 직전 정적 = 캐치 포인트, 4마디 프레이즈, 드롭은 마디 첫 박에
- 템포 흔들림은 템포맵으로 맞출 수 있지만 적을수록 좋음

## Style
```
instrumental hybrid trap x dark cinematic orchestral, 150 BPM half-time, F# minor, massive 808 slides, epic brass stabs, dark choir chants, church bells, pizzicato strings ostinato, mystical ritual boss battle, heavy half-time drops, hard-cut silence right before every drop, 4-bar phrases, drops land on the downbeat, steady tempo, no vocals, no lyrics, no rap, no cowbell, not phonk, not hardstyle, not lo-fi, no tempo changes
```

## Lyrics (구조 태그만)
```
[Instrumental]

[Intro]
[church bell, low choir hum, pizzicato strings ostinato]

[Build-Up]
[timpani roll, rising choir, snare build]

[Stop]
[one beat of total silence]

[Drop]
[half-time trap beat, massive 808 slide, epic brass stabs]

[Breakdown]
[dark choir and bells alone, mysterious]

[Build-Up]
[faster timpani roll, string riser]

[Stop]

[Drop]
[heavier 808, brass and choir together, hi-hat rolls]

[Build-Up]
[maximum tension, full orchestra riser]

[Stop]

[Final Drop]
[biggest drop, everything hits]

[Outro]
[bell rings out, choir fades]
```

## 선곡 기준
1. 드롭 전 정적이 확실한가
2. 하프타임이어도 킥/스네어가 또렷한가 (박 분석·반격 리듬 기준)
3. 템포 일정 (중간에 템포 바뀌는 구간 X)
4. 브라스·종 같은 또렷한 악센트가 있는가 (반격 리듬 힌트)

## 결과: `music/3. STALEMATE.mp3`
- 3분 43초, 템포 150 고정(흔들림 없음) → 템포맵 없이 `offset` 0.430초만. 파일 첫 0.4초는 픽업
- 큰 임팩트·드롭이 전부 4마디 첫 박: 드롭 40·56·92·128, 임팩트 8·16·24·32·72·76·80·84·88·132·136
- 드롭 사이가 36마디(4마디 9개)라 76~83, 120~127 두 곳만 8마디 회피
- 셋잇단 하이햇 → 반격 리듬에 셋잇단 처음 사용 (chart 값 x.33 / x.67)

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
