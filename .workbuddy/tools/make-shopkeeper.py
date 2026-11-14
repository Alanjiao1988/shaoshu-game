"""Build the approved shopkeeper as a local, transparent decoration, without AI calls."""
from pathlib import Path
import hashlib
import json
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "outputs/少年掌柜_柜台效果预览_v1.png"
BACKGROUND = ROOT / "outputs/少年掌柜_原店铺参考_20261113.png"
REF = ROOT / ".workbuddy/ref"
assert REF.is_dir() and (ROOT / "outputs").is_dir()
image = Image.open(SOURCE).convert("RGBA")
background = Image.open(BACKGROUND).convert("RGBA")
assert image.size == background.size == (1536, 1024)
# Coordinates trace the visible figure in the 2x inspection crop (430,300)-(780,710).
# The counter, coins, shelving, curtain and street are deliberately NOT in this layer.
body = [
 (182,88),(177,73),(184,51),(201,39),(220,31),(239,26),(255,28),(266,39),(270,58),(265,72),
 (299,75),(334,82),(357,95),(378,114),(385,130),(399,143),(411,157),(416,179),(399,162),
 (397,188),(405,206),(390,194),(387,221),(380,232),(381,265),(370,287),(346,310),(339,319),
 (380,329),(402,343),(421,371),(434,402),(445,432),(460,462),(479,480),(498,489),(500,515),
 (515,531),(531,552),(535,575),(558,597),(579,614),(610,626),(627,640),(640,646),(654,663),
 (660,681),(650,688),(639,677),(628,662),(644,681),(637,686),(623,669),(610,658),(600,654),
 (586,655),(576,651),(565,655),(578,669),(588,677),(586,685),(573,684),(555,672),(542,662),
 (537,647),(521,637),(499,626),(481,614),(469,603),(454,619),(440,625),(428,619),(418,602),
 (406,576),(400,549),(392,534),(389,557),(388,583),(385,607),(378,634),(381,657),
 (80,758),(94,708),(98,695),(74,693),(55,683),(46,664),(46,648),(52,631),
 (40,610),(36,591),(45,568),(56,546),(66,521),(71,492),(79,461),(86,429),(100,397),
 (115,375),(133,365),(160,351),(183,336),(197,326),(204,307),(214,292),(229,283),
 (209,284),(195,287),(182,299),(167,304),(167,286),(178,257),(172,235),(176,207),
 (159,219),(148,221),(153,206),(162,183),(166,160),(177,137),(181,116),(166,127),
 (151,129),(145,124),(155,111),(174,102),(185,99)
]
left_hand = [
 (102,655),(125,638),(159,637),(182,664),(201,682),(218,701),(230,707),(251,702),
 (267,707),(286,711),(298,718),(307,730),(312,747),(309,758),(299,750),(299,763),
 (290,766),(277,758),(273,770),(261,768),(254,758),(251,770),(238,773),(221,761),
 (201,752),(190,738),(162,723),(134,701),(111,674)
]
scale = 4
mask = Image.new("L", (image.width * scale, image.height * scale))
draw = ImageDraw.Draw(mask)
for contour in (body, left_hand):
    points = [((430 + x / 2) * scale, (300 + y / 2) * scale) for x, y in contour]
    draw.polygon(points, fill=255)
mask = mask.resize(image.size, Image.Resampling.LANCZOS).filter(ImageFilter.GaussianBlur(.25))
image.putalpha(mask)
source_box = mask.getbbox()
figure = image.crop(source_box)
figure = figure.resize((round(figure.width * .88), round(figure.height * .88)), Image.Resampling.LANCZOS)
asset = REF / "jiaye-shopkeeper.png"
figure.save(asset, optimize=True)
# Original image is mapped to a 1100x844 scene by the game's existing background CSS.
# The sprite starts just right of the live stock controls (their right edge is x=551.1).
left, top = 553, 350
metadata = {
    "source": SOURCE.name,
    "sourceSha256": hashlib.sha256(SOURCE.read_bytes()).hexdigest(),
    "backgroundSha256": hashlib.sha256(BACKGROUND.read_bytes()).hexdigest(),
    "assetSha256": hashlib.sha256(asset.read_bytes()).hexdigest(),
    "sourceSize": list(image.size), "sourceBox": list(source_box),
    "sceneSize": [1100, 844], "left": left, "top": top,
    "width": figure.width, "height": figure.height,
    "layer": 1, "pointerEvents": "none", "storageChanges": False,
}
(REF / "jiaye-shopkeeper.json").write_text(json.dumps(metadata, ensure_ascii=False, indent=2) + "\n", encoding="utf8")
composite = background.copy()
composite.alpha_composite(figure, (left, top))
preview = ROOT / "outputs/少年掌柜_本地图层效果_v2.png"
composite.convert("RGB").save(preview, optimize=True)
print(json.dumps({"asset": str(asset), "preview": str(preview), "geometry": metadata}, ensure_ascii=False))
