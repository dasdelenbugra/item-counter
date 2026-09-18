"""Raf fotoğrafındaki ürünleri sayan YOLO servisi.

Gemini'den farkı: bu model ürünün NE olduğunu bilmez, sadece "burada bir cisim
var" der ve kutusunu verir. Karşılığında iki şey kazanırız: kalabalık rafta
sayım tutarlılığı (aynı fotoğrafa hep aynı cevap) ve kutuları fotoğrafın
üstüne çizip "işte saydıklarım" diyebilme imkanı.
"""

import io
import os
import time

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from huggingface_hub import hf_hub_download
from PIL import Image
from ultralytics import YOLO

# SKU-110K ile eğitilmiş YOLO11. Tek sınıfı var: ürün.
#
# Önce foduucom/product-detection-in-shelf-yolov8 kullanıyorduk; o model
# "Retail Coolers" (soğutucu reyonu) verisiyle eğitilmiş ve kuru gıda rafında
# ürünlerin çoğunu atlıyordu. Aynı kahve reyonu fotoğrafında ölçüm:
#   coolers modeli : 76 kutu (en agresif ayarla 114), 2.7 sn
#   bu model       : 129 kutu varsayılan ayarla,     0.3 sn
# Ayar değiştirerek değil, doğru modeli seçerek çözüldü.
DEPO = os.getenv("YOLO_DEPO", "chistopat/sku110k-yolo11-object-detector")
AGIRLIK = os.getenv("YOLO_AGIRLIK", "weights/sku110k-yolo11-s640.pt")

# Model 640'ta eğitilmiş; büyütmek tespiti düşürüyor (ölçüldü).
IMGSZ = int(os.getenv("YOLO_IMGSZ", "640"))
# Bu model yoğun raf için eğitildiğinden varsayılan eşik iyi çalışıyor;
# kutuların güveni 0.70-0.87 bandında, sınırda değil.
GUVEN = float(os.getenv("YOLO_GUVEN", "0.25"))
IOU = float(os.getenv("YOLO_IOU", "0.50"))
# Varsayılan 300'lük kutu sınırı dolu bir rafta yetmiyor.
MAKS_KUTU = int(os.getenv("YOLO_MAKS_KUTU", "1000"))

model = YOLO(hf_hub_download(DEPO, AGIRLIK))

app = FastAPI(title="Raf Sayım YOLO")
# Next.js sunucu tarafından çağırıyor, CORS aslında gerekmiyor;
# tarayıcıdan elle test edebilmek için açık.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
def saglik():
    """Servis ayakta mı, hangi ayarlarla çalışıyor."""
    return {"durum": "ayakta", "model": DEPO, "imgsz": IMGSZ, "guven": GUVEN}


@app.post("/say")
async def say(foto: UploadFile = File(...)):
    ham = await foto.read()
    try:
        gorsel = Image.open(io.BytesIO(ham)).convert("RGB")
    except Exception:
        raise HTTPException(status_code=400, detail="görsel okunamadı")

    baslangic = time.time()
    sonuc = model.predict(
        gorsel,
        imgsz=IMGSZ,
        conf=GUVEN,
        iou=IOU,
        max_det=MAKS_KUTU,
        verbose=False,
    )[0]
    sure_ms = int((time.time() - baslangic) * 1000)

    isimler = sonuc.names
    kutular = []
    for kutu in sonuc.boxes:
        x1, y1, x2, y2 = (float(v) for v in kutu.xyxy[0])
        kutular.append(
            {
                "sinif": isimler[int(kutu.cls[0])],
                "guven": round(float(kutu.conf[0]), 3),
                # Piksel değil oran döndürüyoruz: arayüz fotoğrafı hangi boyutta
                # gösterirse göstersin kutuyu yeniden hesaplamadan çizebilsin.
                "x": round(x1 / gorsel.width, 5),
                "y": round(y1 / gorsel.height, 5),
                "en": round((x2 - x1) / gorsel.width, 5),
                "boy": round((y2 - y1) / gorsel.height, 5),
            }
        )

    bos_raflar = [k for k in kutular if "empty" in k["sinif"].lower()]
    urunler = [k for k in kutular if k not in bos_raflar]

    return {
        "toplam": len(urunler),
        "bos_raf": len(bos_raflar),
        "kutular": kutular,
        "sure_ms": sure_ms,
        "olcu": {"en": gorsel.width, "boy": gorsel.height},
    }
