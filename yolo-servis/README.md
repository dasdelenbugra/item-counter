---
title: Raf Sayim YOLO
emoji: "\U0001F4E6"
colorFrom: green
colorTo: gray
sdk: docker
app_port: 7860
pinned: false
---

# Raf Sayım — YOLO servisi

Raf fotoğrafındaki ürünleri tespit edip sayar. Ürünün ne olduğunu **bilmez**,
sadece kutu verir; tanıma işini Next.js tarafındaki Gemini yapar.

Model: [chistopat/sku110k-yolo11-object-detector](https://huggingface.co/chistopat/sku110k-yolo11-object-detector)
(YOLO11s, SKU-110K veri setiyle 640 piksel girdiyle eğitilmiş, tek sınıf)

## Model seçimi neden önemliydi

Önce `foduucom/product-detection-in-shelf-yolov8` kullanıldı. O model
"Retail Coolers" (soğutucu reyonu) verisiyle eğitilmiş ve kuru gıda rafında
ürünlerin çoğunu atlıyordu. Aynı kahve reyonu fotoğrafında ölçüm:

| Model | Kutu (varsayılan) | Süre |
|---|---|---|
| foduucom (coolers) | 76 | 2.7 sn |
| **chistopat (SKU-110K)** | **129** | **0.3 sn** |

Önce ayar değiştirerek çözmeye çalıştık: girdi boyutunu büyütmek ve fotoğrafı
parçalara bölmek **kötüleştirdi**, sadece eşikleri gevşetmek 114'e çıkardı.
Asıl sorun ayar değil model seçimiydi.

**Not:** Bu model tek sınıflı, yani boş raf tespiti yok (eski modelde vardı).

## Uç noktalar

- `GET /` — servis ayakta mı, hangi ayarlarla çalışıyor
- `POST /say` — `foto` alanında görsel; ürün sayısı, boş raf sayısı ve kutuları döner

Kutu koordinatları 0–1 arası **oran** olarak döner, piksel değil.

## Ayarlar (ortam değişkeni)

| Değişken | Varsayılan | Ne işe yarar |
|---|---|---|
| `YOLO_IMGSZ` | 640 | Modelin eğitim boyutu. **Büyütmek tespiti düşürüyor**, ölçüldü |
| `YOLO_GUVEN` | 0.10 | Eşik. Düşürmek sayıyı artırır, hatalı kutuyu da artırır |
| `YOLO_IOU` | 0.5 | Yan yana aynı ürünler birbirini bastırmasın diye |
| `YOLO_MAKS_KUTU` | 1000 | Kalabalık rafta 300'lük varsayılan yetmiyor |

## Yerelde çalıştırma

```bash
pip install -r requirements.txt
uvicorn app:app --reload --port 7860
```
