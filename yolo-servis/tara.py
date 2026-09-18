"""Aynı fotoğrafta farklı ayarları deneyip hangisinin daha çok ürün bulduğunu ölçer.

Kalabalık rafta iki ayar belirleyici: girdi boyutu (küçük ürünler çözünürlük
düşünce kayboluyor) ve güven eşiği (varsayılan eşik dolu rafta çok eliyor).

Kullanım:
    python tara.py fotolar/raf.jpeg
"""

import sys
import time
from pathlib import Path

from huggingface_hub import hf_hub_download
from PIL import Image
from ultralytics import YOLO

BOYUTLAR = [1280, 1600, 1920]
ESIKLER = [0.25, 0.15, 0.10, 0.05]
IOU = 0.5
MAKS_KUTU = 2000


def main(yollar: list[str]) -> int:
    if not yollar:
        print("kullanım: python tara.py <fotograf...>")
        return 1

    model = YOLO(hf_hub_download("foduucom/product-detection-in-shelf-yolov8", "best.pt"))

    for yol in yollar:
        with Image.open(yol) as im:
            olcu = im.size
        print(f"\n=== {Path(yol).name}  ({olcu[0]}x{olcu[1]}) ===")
        print(f"{'imgsz':>6} " + " ".join(f"conf{e:<6}" for e in ESIKLER) + "  süre")

        for boyut in BOYUTLAR:
            satir = f"{boyut:>6} "
            sureler = []
            for esik in ESIKLER:
                bas = time.time()
                sonuc = model.predict(
                    yol,
                    imgsz=boyut,
                    conf=esik,
                    iou=IOU,
                    max_det=MAKS_KUTU,
                    verbose=False,
                )[0]
                sureler.append(time.time() - bas)
                satir += f"{len(sonuc.boxes):<10} "
            print(satir + f" {max(sureler):.1f}sn")

    print("\nSayı artıyor diye sevinme: eşik düştükçe hatalı kutu da artar.")
    print("En umut verici ayarı dene.py ile çizdirip gözle doğrula.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
