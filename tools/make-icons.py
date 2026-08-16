"""站点图标：从原画生成 public/ 下那两枚圆角 PNG。

    python tools/make-icons.py          # 需要 Python 3 与 Pillow

不是 npm 脚本，也不进 npm run check —— 原画一年也未必改一次，
为它给整条工具链添一个 Python 依赖不合算。改了 art/lantern-icon.png 就手跑一遍。

两枚的分工：32 给标签页（浏览器要 16 时自己缩），180 给 iOS「加到主屏」。
再大的档次没人要：这一页没有 web app manifest，安卓那边取的也是 apple-touch-icon。

存成调色板 PNG 而不是 RGBA：同一张图 8 位索引比 32 位省四分之三（180 那枚 34 → 15 kB），
圆角的抗锯齿边靠追加的一列「背景色 × 不同透明度」色号保住，肉眼看不出差别。
"""

import sys
from pathlib import Path

from PIL import Image, ImageDraw
import numpy as np

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / 'art' / 'lantern-icon.png'
OUT = ROOT / 'public'

MARGIN = 0.05     # 内容上下各留的空。原画自带 8%，裁到 5% 明显更饱满
RADIUS = 0.225    # 圆角半径占边长，取的是当下移动端图标的通行比例
SS = 8            # 圆角遮罩的超采样倍数：直接画 32 px 的圆角会有锯齿
ALPHA_STEPS = 20  # 边缘透明度档数，20 档已看不出台阶

# (边长, 调色板色数, 文件名)
TARGETS = [
    (32, 96, 'favicon-32.png'),
    (180, 128, 'apple-touch-icon.png'),
]


def content_box(im):
    """内容包围盒 —— 原画四周是一色的背景，与它有差别的就算内容"""
    a = np.asarray(im).astype(int)
    bg = a[0, 0]
    m = np.abs(a - bg).max(axis=2) > 10
    ys = np.where(m.sum(axis=1) > 0)[0]
    xs = np.where(m.sum(axis=0) > 0)[0]
    return xs.min(), xs.max(), ys.min(), ys.max(), tuple(bg)


def make(im, size, colors):
    W, H = im.size
    x0, x1, y0, y1, bg = content_box(im)
    # 按内容高度定正方形：这盏灯高远大于宽，横向裁不动，能收的只有上下
    side = (y1 - y0) / (1 - 2 * MARGIN)
    left = round((x0 + x1) / 2 - side / 2)
    top = round((y0 + y1) / 2 - side / 2)
    right, bottom = round(left + side), round(top + side)
    base = Image.new('RGB', (right - left, bottom - top), bg)
    src = (max(left, 0), max(top, 0), min(right, W), min(bottom, H))
    base.paste(im.crop(src), (src[0] - left, src[1] - top))
    rgb = base.resize((size, size), Image.LANCZOS)

    # 圆角覆盖率：放大 SS 倍画一遍再缩回来，得到 0..255 的抗锯齿边
    n = size * SS
    mask = Image.new('L', (n, n), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, n - 1, n - 1], radius=int(n * RADIUS), fill=255)
    cov = np.asarray(mask.resize((size, size), Image.LANCZOS)).astype(int)

    # 必须是中值切分：八叉树那条路给多少色都只用一小撮（128 与 256 出来的像素一模一样），
    # 灯笼纸那片渐变会糊成一块边界分明的斑。中值切分 96 色就已看不出条带。
    q = rgb.quantize(colors=colors, method=Image.MEDIANCUT)
    pal = q.getpalette()[:colors * 3]
    idx = np.array(q, dtype=np.uint8)

    # 追加「背景色 × 透明度阶梯」，圆角边上的像素改指到最近的一档
    levels = [round(255 * i / (ALPHA_STEPS - 1)) for i in range(ALPHA_STEPS)]
    for _ in levels:
        pal += list(bg)
    edge = cov < 255
    lv = np.array(levels)
    idx[edge] = colors + np.abs(lv[None, :] - cov[edge][:, None]).argmin(axis=1).astype(np.uint8)

    out = Image.fromarray(idx, mode='P')
    out.putpalette(pal)
    return out, bytes([255] * colors + levels)


def main():
    # Windows 的控制台默认不走 UTF-8，不改这一句下面几行中文会印成乱码
    sys.stdout.reconfigure(encoding='utf-8')
    if not SRC.exists():
        sys.exit(f'找不到原画：{SRC}')
    im = Image.open(SRC).convert('RGB')
    for size, colors, name in TARGETS:
        img, trns = make(im, size, colors)
        img.save(OUT / name, optimize=True, transparency=trns)
        print(f'{name}  {size}×{size}  {colors} 色  {(OUT / name).stat().st_size / 1000:.1f} kB')


if __name__ == '__main__':
    main()
