"""Generate a visibly synthetic four-file bundle for Storage connection tests."""
import argparse
import json
import math
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

parser = argparse.ArgumentParser()
parser.add_argument('--dir', required=True)
parser.add_argument('--id', required=True)
args = parser.parse_args()
if not args.id.startswith('mock-'):
    parser.error('Use a mock- result ID')
folder = Path(args.dir)
folder.mkdir(parents=True, exist_ok=True)

def font(size):
    for name in ['C:/Windows/Fonts/arialbd.ttf', 'DejaVuSans.ttf']:
        try:
            return ImageFont.truetype(name, size)
        except OSError:
            pass
    return ImageFont.load_default()

for kind in ['before', 'after', 'change_overlay']:
    image = Image.new('RGB', (960, 640), '#071721')
    draw = ImageDraw.Draw(image)
    draw.rectangle((20, 108, 940, 560), fill='#263c3c')
    for row in range(7):
        for col in range(13):
            x, y = 32 + col * 69, 118 + row * 62
            color = ['#49605b', '#586a60', '#65756a'][(row + col) % 3]
            draw.rounded_rectangle((x, y, x+53, y+44), radius=3, fill=color)
    for width, color in [(88, '#efab50'), (43, '#4da8dc')]:
        if kind == 'before' and width == 88:
            continue
        if kind == 'after' and width == 88:
            color = '#4da8dc'
        if kind == 'change_overlay' and width == 43:
            color = '#17475f'
        points = [(int(470+66*math.sin(y/95)), y) for y in range(109,561,3)]
        draw.line(points, fill=color, width=width, joint='curve')
    draw.text((28, 18), 'MOCK DATA - NOT SATELLITE IMAGERY', font=font(30), fill='#ffd28a')
    draw.text((28, 63), kind.upper() + ' / STORAGE CONNECTION TEST', font=font(22), fill='#f0f6f3')
    draw.rectangle((0, 574, 960, 640), fill='#071721')
    draw.text((28, 582), 'Synthetic shapes only. No real flood, water-area or model measurements.', font=font(18), fill='#ffd28a')
    draw.text((28, 611), args.id, font=font(15), fill='#bdcbd1')
    image.save(folder / (kind + '.png'))
metadata = {
    'version': 1, 'id': args.id,
    'title': '[MOCK] Illinois Tech - Storage connection test',
    'synthetic': True, 'crs': 'EPSG:4326',
    'bounds': [-87.65, 41.82, -87.61, 41.85],
    'before': {'observed_at': '2026-10-01T00:00:00Z', 'source_scene_id': 'MOCK_BEFORE_NOT_AN_ASF_PRODUCT'},
    'after': {'observed_at': '2026-10-13T00:00:00Z', 'source_scene_id': 'MOCK_AFTER_NOT_AN_ASF_PRODUCT'},
    'model_version': 'mock-storage-test-v1',
}
(folder / 'metadata.json').write_text(json.dumps(metadata, indent=2)+'\n', encoding='utf-8')
print('Created clearly labelled mock bundle:', folder)
