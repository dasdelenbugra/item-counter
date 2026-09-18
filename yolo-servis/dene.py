"""Fotoğrafları modelden geçirip sonucu gözle kontrol etmeyi sağlar.

Kullanım:
    python dene.py raf1.jpg raf2.jpg raf3.jpg

Her fotoğraf için bulunan ürün sayısını yazar ve kutuları çizilmiş halini
`cikti/` klasörüne kaydeder. Asıl karar buradan çıkar: kutular gerçekten
ürünlerin üstünde mi, yoksa model saçmalıyor mu?
"""

import sys
from pathlib import Path

from huggingface_hub import hf_hub_download
from ultralytics import YOLO

IMGSZ = 640   # modelin egitim boyutu; buyutmek tespiti dusuruyor
GUVEN = 0.25
IOU = 0.50
MAKS_KUTU = 1000

CIKTI = Path("cikti")


def main(yollar: list[str]) -> int:
    if not yollar:
        print("kullanım: python dene.py <fotograf...>")
        return 1

    print("model indiriliyor / yükleniyor…")
    model = YOLO(hf_hub_download("chistopat/sku110k-yolo11-object-detector", "weights/sku110k-yolo11-s640.pt"))
    CIKTI.mkdir(exist_ok=True)

    for yol in yollar:
        sonuc = model.predict(
            yol, imgsz=IMGSZ, conf=GUVEN, iou=IOU, max_det=MAKS_KUTU, verbose=False
        )[0]

        sayim: dict[str, int] = {}
        for kutu in sonuc.boxes:
            ad = sonuc.names[int(kutu.cls[0])]
            sayim[ad] = sayim.get(ad, 0) + 1

        hedef = CIKTI / f"{Path(yol).stem}_kutulu.jpg"
        sonuc.save(filename=str(hedef))

        detay = ", ".join(f"{ad}: {adet}" for ad, adet in sorted(sayim.items())) or "hiç kutu yok"
        print(f"{Path(yol).name}: {len(sonuc.boxes)} kutu ({detay}) -> {hedef}")

    print(f"\nKutulu görselleri {CIKTI.resolve()} içinde aç ve gözle kontrol et.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
