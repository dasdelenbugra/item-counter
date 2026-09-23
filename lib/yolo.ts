/**
 * Raftaki ürünleri sayan YOLO modeli, ziyaretçinin tarayıcısında çalışır.
 *
 * Gemini ürünü tanır ama kalabalık rafta sayım kaydırır; YOLO tanımaz ama
 * tutarlı sayar ve kutuları verir. İkisini birlikte kullanıyoruz.
 *
 * Önceden bu model ayrı bir Python sunucusunda çalışıyordu (yolo-servis/).
 * Tarayıcıya taşındı çünkü sunucuyu sürekli açık tutmak ya bilgisayarın açık
 * kalmasını ya da ücretli barındırmayı gerektiriyordu. Ayarlar sunucudakiyle
 * aynı, sonuçlar da aynı fotoğrafta aynı çıkmalı.
 *
 * Model ağırlıkları repo'ya konmadı, doğrudan Hugging Face'ten indiriliyor:
 * lisansları SKU-110K veri setinin koşullarına bağlı, yeniden dağıtmıyoruz.
 */

import type { InferenceSession } from "onnxruntime-web";

export type YoloKutu = {
  sinif: string;
  guven: number;
  // 0–1 arası oran; arayüz fotoğrafı hangi boyutta gösterirse göstersin çizebilsin
  x: number;
  y: number;
  en: number;
  boy: number;
};

export type YoloSonuc = {
  toplam: number;
  bos_raf: number;
  kutular: YoloKutu[];
  sure_ms: number;
};

const MODEL_URL =
  "https://huggingface.co/chistopat/sku110k-yolo11-object-detector/resolve/main/weights/sku110k-yolo11-s640.onnx";
// Kütüphanenin .wasm dosyaları paketle aynı sürümden CDN'den geliyor;
// Next.js paketleyicisinin bunları bulmasıyla uğraşmamak için.
const ORT_SURUM = "1.30.0";

// yolo-servis/app.py ile aynı değerler; değiştirirsen ikisini birlikte değiştir.
const IMGSZ = 640; // model 640'ta eğitilmiş, sabit girişli ONNX
const GUVEN = 0.25;
const IOU = 0.5;
const MAKS_KUTU = 1000;

let oturum: Promise<InferenceSession> | null = null;

async function modeliIndir(): Promise<ArrayBuffer> {
  // 38 MB: her ziyarette yeniden inmesin diye tarayıcı önbelleğinde tutuluyor.
  // Önbellek kullanılamıyorsa (gizli sekme vb.) doğrudan indir.
  try {
    const onbellek = await caches.open("raf-sayim-model-v1");
    const kayitli = await onbellek.match(MODEL_URL);
    if (kayitli) return await kayitli.arrayBuffer();
    const res = await fetch(MODEL_URL);
    if (!res.ok) throw new Error(`model indirilemedi (${res.status})`);
    await onbellek.put(MODEL_URL, res.clone());
    return await res.arrayBuffer();
  } catch (e) {
    if (e instanceof Error && e.message.startsWith("model indirilemedi")) throw e;
    const res = await fetch(MODEL_URL);
    if (!res.ok) throw new Error(`model indirilemedi (${res.status})`);
    return await res.arrayBuffer();
  }
}

/**
 * Modeli yükler. Birden çok kez çağrılabilir, tek sefer yükler.
 * Kullanıcı fotoğraf seçerken çağırıyoruz ki "Say"a basana kadar hazır olsun.
 */
export function yoloyuHazirla(): Promise<InferenceSession> {
  oturum ??= (async () => {
    const ort = await import("onnxruntime-web");
    ort.env.wasm.wasmPaths = `https://cdn.jsdelivr.net/npm/onnxruntime-web@${ORT_SURUM}/dist/`;
    return ort.InferenceSession.create(await modeliIndir(), {
      executionProviders: ["wasm"],
    });
  })();
  // Yükleme başarısız olursa sonraki denemede baştan başlasın.
  oturum.catch(() => {
    oturum = null;
  });
  return oturum;
}

/**
 * Ultralytics'in letterbox'ı: oranı koruyarak 640'a sığdır, kalanı gri (114)
 * doldur, ortala. Model bu biçimde eğitildi; düz germek tespiti bozar.
 */
function letterbox(kaynak: CanvasImageSource, en: number, boy: number) {
  const r = Math.min(IMGSZ / en, IMGSZ / boy);
  const yeniEn = Math.round(en * r);
  const yeniBoy = Math.round(boy * r);
  const sol = Math.round((IMGSZ - yeniEn) / 2 - 0.1);
  const ust = Math.round((IMGSZ - yeniBoy) / 2 - 0.1);

  const tuval = document.createElement("canvas");
  tuval.width = IMGSZ;
  tuval.height = IMGSZ;
  const ctx = tuval.getContext("2d", { willReadFrequently: true })!;
  ctx.fillStyle = "rgb(114,114,114)";
  ctx.fillRect(0, 0, IMGSZ, IMGSZ);
  ctx.drawImage(kaynak, sol, ust, yeniEn, yeniBoy);

  // RGBA piksel -> modelin beklediği 3x640x640, 0-1 arası
  const { data } = ctx.getImageData(0, 0, IMGSZ, IMGSZ);
  const alan = IMGSZ * IMGSZ;
  const girdi = new Float32Array(3 * alan);
  for (let i = 0; i < alan; i++) {
    girdi[i] = data[i * 4] / 255;
    girdi[alan + i] = data[i * 4 + 1] / 255;
    girdi[2 * alan + i] = data[i * 4 + 2] / 255;
  }
  return { girdi, r, sol, ust };
}

type HamKutu = { x1: number; y1: number; x2: number; y2: number; guven: number };

function kesisimOrani(a: HamKutu, b: HamKutu): number {
  const en = Math.max(0, Math.min(a.x2, b.x2) - Math.max(a.x1, b.x1));
  const boy = Math.max(0, Math.min(a.y2, b.y2) - Math.max(a.y1, b.y1));
  const kesisim = en * boy;
  const birlesim =
    (a.x2 - a.x1) * (a.y2 - a.y1) + (b.x2 - b.x1) * (b.y2 - b.y1) - kesisim;
  return birlesim > 0 ? kesisim / birlesim : 0;
}

/**
 * Aynı ürüne düşen üst üste kutulardan en güvenlisini bırakır.
 * Eşik 0.5: yan yana duran aynı ürünler birbirini bastırmasın.
 */
function cakisanlariEle(kutular: HamKutu[]): HamKutu[] {
  kutular.sort((a, b) => b.guven - a.guven);
  const kalan: HamKutu[] = [];
  for (const k of kutular) {
    if (kalan.every((s) => kesisimOrani(k, s) <= IOU)) {
      kalan.push(k);
      if (kalan.length >= MAKS_KUTU) break;
    }
  }
  return kalan;
}

export async function yoloylaSay(
  kaynak: CanvasImageSource,
  en: number,
  boy: number,
): Promise<YoloSonuc> {
  const ort = await import("onnxruntime-web");
  const model = await yoloyuHazirla();

  const baslangic = performance.now();
  const { girdi, r, sol, ust } = letterbox(kaynak, en, boy);
  const cikti = await model.run({
    [model.inputNames[0]]: new ort.Tensor("float32", girdi, [1, 3, IMGSZ, IMGSZ]),
  });

  // Çıktı [1, 4 + sınıf sayısı, N]: her aday için merkez x, merkez y, en, boy
  // ve sınıf puanları. Bu modelde tek sınıf var ("object").
  const tensor = cikti[model.outputNames[0]];
  const [, satir, n] = tensor.dims;
  const v = tensor.data as Float32Array;

  const adaylar: HamKutu[] = [];
  for (let i = 0; i < n; i++) {
    let guven = 0;
    for (let s = 4; s < satir; s++) guven = Math.max(guven, v[s * n + i]);
    if (guven < GUVEN) continue;
    const cx = v[i];
    const cy = v[n + i];
    const w = v[2 * n + i];
    const h = v[3 * n + i];
    adaylar.push({
      x1: cx - w / 2,
      y1: cy - h / 2,
      x2: cx + w / 2,
      y2: cy + h / 2,
      guven,
    });
  }

  // Letterbox koordinatlarından fotoğrafın kendisine, oradan 0-1 oranına
  const kutular: YoloKutu[] = cakisanlariEle(adaylar).map((k) => {
    const x1 = Math.min(en, Math.max(0, (k.x1 - sol) / r));
    const y1 = Math.min(boy, Math.max(0, (k.y1 - ust) / r));
    const x2 = Math.min(en, Math.max(0, (k.x2 - sol) / r));
    const y2 = Math.min(boy, Math.max(0, (k.y2 - ust) / r));
    return {
      sinif: "object",
      guven: Math.round(k.guven * 1000) / 1000,
      x: x1 / en,
      y: y1 / boy,
      en: (x2 - x1) / en,
      boy: (y2 - y1) / boy,
    };
  });

  return {
    toplam: kutular.length,
    bos_raf: 0, // bu model tek sınıflı, boş raf tespit etmiyor
    kutular,
    sure_ms: Math.round(performance.now() - baslangic),
  };
}
