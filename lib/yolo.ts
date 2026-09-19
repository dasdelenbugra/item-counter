/**
 * YOLO servisine köprü.
 *
 * Gemini ürünü tanır ama kalabalık rafta sayım kaydırır; YOLO tanımaz ama
 * tutarlı sayar ve kutuları verir. İkisini birlikte kullanıyoruz.
 *
 * YOLO_URL tanımlı değilse ya da servis cevap vermezse uygulama Gemini'yle
 * çalışmaya devam eder: YOLO bir eklenti, zorunluluk değil.
 */

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

// trim() şart: ortam değişkenine komut satırından yazarken sonuna satır sonu
// takılabiliyor ve "Invalid URL" hatasına dönüşüyor (üretimde bu yaşandı).
// Sondaki / de temizleniyor, yoksa "//say" gibi bir yol oluşuyor.
const SERVIS = process.env.YOLO_URL?.trim().replace(/\/+$/, "") || undefined;

// Hugging Face Spaces bedava katmanda uyuyor; ilk istek konteyneri uyandırır.
const ZAMAN_ASIMI_MS = 45_000;

export function yoloVarMi(): boolean {
  return Boolean(SERVIS);
}

export async function yoloylaSay(foto: Blob, ad: string): Promise<YoloSonuc> {
  if (!SERVIS) throw new Error("YOLO_URL tanımlı değil");

  // Bozuk adresi genel "Invalid URL" yerine anlaşılır biçimde söyle:
  // tünel adresi elle girildiği için yazım hatası olası bir senaryo.
  let hedef: URL;
  try {
    hedef = new URL("/say", SERVIS);
  } catch {
    throw new Error(`YOLO_URL geçersiz: "${SERVIS}" (https:// ile başlamalı)`);
  }

  const form = new FormData();
  form.append("foto", foto, ad);

  const res = await fetch(hedef, {
    method: "POST",
    body: form,
    signal: AbortSignal.timeout(ZAMAN_ASIMI_MS),
  });

  if (!res.ok) {
    throw new Error(`YOLO servisi ${res.status} döndü`);
  }

  return (await res.json()) as YoloSonuc;
}
