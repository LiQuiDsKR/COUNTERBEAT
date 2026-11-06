"""앱 아이콘 생성: python tools/make_icons.py  →  icons/*.png
게임 타이틀의 보스(육각형 + 회전 사각형 + 시안 눈)를 그대로 아이콘으로.
"""
import math
import os
from PIL import Image, ImageDraw

BG = (7, 7, 12)
FG = (255, 255, 255)
CYAN = (0, 229, 255)
HOT = (255, 30, 86)
OUT = os.path.join(os.path.dirname(__file__), '..', 'icons')


def poly(cx, cy, r, n, rot):
    return [(cx + math.cos(rot + i / n * 2 * math.pi) * r, cy + math.sin(rot + i / n * 2 * math.pi) * r) for i in range(n)]


def draw_icon(size, safe):
    """safe: 내용이 차지할 비율 (maskable은 가장자리가 잘리므로 작게)"""
    ss = 4                                  # 슈퍼샘플링
    S = size * ss
    im = Image.new('RGB', (S, S), BG)
    d = ImageDraw.Draw(im)
    c = S / 2
    R = S * safe / 2                        # 내용 반지름

    def outline(pts, color, w):
        d.line(pts + [pts[0]], fill=color, width=int(w), joint='curve')

    # 크로마 잔상 (빨강/시안 살짝 어긋나게)
    off = R * 0.035
    for dx, col in ((-off, HOT), (off, CYAN)):
        outline(poly(c + dx, c, R * 0.86, 6, 0.35), col, R * 0.07)
    outline(poly(c, c, R * 0.86, 6, 0.35), FG, R * 0.07)       # 바깥 육각형
    outline(poly(c, c, R * 0.98, 6, -0.2), (90, 90, 100), R * 0.025)
    outline(poly(c, c, R * 0.55, 4, 0.5), FG, R * 0.055)       # 안쪽 사각형
    e = R * 0.24
    d.ellipse([c - e, c - e, c + e, c + e], fill=CYAN)          # 눈
    p = R * 0.085
    d.ellipse([c - p, c - p, c + p, c + p], fill=BG)
    return im.resize((size, size), Image.LANCZOS)


if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    for size in (192, 512):
        draw_icon(size, 0.86).save(os.path.join(OUT, f'icon-{size}.png'))
        draw_icon(size, 0.62).save(os.path.join(OUT, f'maskable-{size}.png'))
    draw_icon(180, 0.8).save(os.path.join(OUT, 'apple-touch-icon.png'))
    draw_icon(32, 0.95).save(os.path.join(OUT, 'favicon-32.png'))
    print('ok')
