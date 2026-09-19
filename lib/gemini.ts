import {
  GoogleGenAI,
  PartMediaResolutionLevel,
  ThinkingLevel,
  Type,
} from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

const VARSAYILAN_MODELLER = "gemini-3.6-flash,gemini-3.5-flash,gemini-3.1-flash-lite";

// Tek model yetmiyor: biri kotayı doldurunca (429) ya da yoğunken (503) diğerine geç.
// GEMINI_MODEL virgülle birden fazla model alır, sırayla denenir.
//
// `??` yerine boşluk kontrolü: Vercel'de değişkeni boş değerle tanımlamak
// mümkün ve `??` boş metinde varsayılana DÜŞMÜYOR. O durumda liste boşalıyor,
// döngü hiç çalışmıyor ve kullanıcıya "undefined" diye bir hata dönüyordu.
const MODELLER = (process.env.GEMINI_MODEL?.trim() || VARSAYILAN_MODELLER)
  .split(",")
  .map((m) => m.trim())
  .filter(Boolean);

// Düşünme seviyesi süreyi doğrudan belirliyor ve Vercel isteği 60 saniyede
// kesiyor. Aynı kahve reyonu fotoğrafında ölçüm:
//   HIGH   : 42-45 sn -> bir kez 61 sn'ye çıktı ve 504 yedik
//   MEDIUM : 11-38 sn  -> en kötü ölçümde bile 22 sn pay kalıyor
//   LOW    : 9-14 sn   -> hızlı ama MARKALARI KARIŞTIRIYOR
//
// LOW denendi ve gerçek telefonla test edilince elendi: Nescafe Gold'a
// "Tchibo Gold", Migros'un kendi filtre kahvesine "Tchibo" dedi. Marka
// karıştırmak, müşteri önünde genel isim yazmaktan çok daha kötü.
// MEDIUM aynı fotoğrafta "Nescafe Gold 100g" diyor ve tanıyamadığına
// uydurmak yerine "bilinmeyen" yazıyor.
// Sayma işi zaten YOLO'da; buradaki seviye yalnızca tanımayı etkiliyor.
const DUSUNME_SEVIYELERI: Record<string, ThinkingLevel> = {
  LOW: ThinkingLevel.LOW,
  MEDIUM: ThinkingLevel.MEDIUM,
  HIGH: ThinkingLevel.HIGH,
};
const DUSUNME =
  DUSUNME_SEVIYELERI[process.env.GEMINI_THINKING?.trim().toUpperCase() ?? ""] ??
  ThinkingLevel.MEDIUM;

export type RafUrunu = {
  raf: number;
  ad: string;
  marka: string;
  adet: number;
  emin_mi: "yuksek" | "orta" | "dusuk";
  not: string;
};

const PROMPT = `Sen bir market rafı sayım asistanısın. Görseldeki ürünleri raf raf sayarsın.

ÖNEMLİ: Önce say, sonra tanı. Bunlar iki ayrı iş ve sırası şu:

1. Adım - SAYMA (yazıları okumaya çalışma):
- Görseldeki raf katlarını bul. En üstteki kat 1'dir, aşağı doğru artar. Kat ayrımı yapamıyorsan hepsine 1 yaz.
- Her katı soldan sağa tara ve o katta duran her cismi tek tek say. Bir katı bitirmeden diğerine geçme.
- Karanlıkta kalan, üzerinde parlama/yansıma olan, gölgedeki, bulanık çıkan ürünler de bu sayıma DAHİL. Ne olduğunu anlayamaman onu saymamak için sebep değil; orada bir şey duruyorsa sayarsın.
- Kenarda yarısı kadraj dışında kalan ürünler de sayılır.
- Bu adımda bulduğun toplam, cevabındaki toplam adede eşit olmalı. Hiçbirini eleme.

2. Adım - TANIMA:
- Ambalajdaki yazıyı okuyabiliyorsan ürün adını ve markayı ambalajdaki gibi yaz (gramaj görünüyorsa ekle).
- MARKA TAHMİN ETME. Ambalajda marka adını gerçekten okuyamıyorsan, ürün tanıdık bir markaya benziyor diye o markayı YAZMA; marka alanına "bilinmeyen" yaz. Yanlış marka yazmak, bilinmeyen yazmaktan çok daha kötü.
- Türkiye'de marketlerin kendi markaları yaygındır (Migros'ta "M" logosu, ayrıca A101, BİM, ŞOK, Carrefour). Bunlar tanınmış markalara benzeyen ambalajlar kullanabilir. Üzerinde sadece "M" logosu ya da market adı görüyorsan markayı market adı olarak yaz, Nescafe/Tchibo/Jacobs gibi bir markaya atfetme.
- Okuyamadığın ürünleri ELEME. Onlara ad olarak "bilinmeyen" yaz, marka olarak "bilinmeyen" yaz, emin_mi alanını "dusuk" yap ve not alanında neden okuyamadığını + görünüşünü yaz ("koyu renkli şişe, üzerinde parlama var, katın sağ ucunda" gibi).
- Aynı katta, aynı görünen ürünleri tek satırda topla. Aynı ürün iki farklı kattaysa iki ayrı satır olur.

Kurallar:
- Adetleri tek tek say, "yaklaşık şu kadar var" diye göz kararı yuvarlama yapma.
- Arkada, önündeki ürünün gerisinde kalıp hiç görünmeyen ürünleri sayma; sadece gördüğün yüzleri say.
- Raf dışındaki nesneleri (fiyat etiketi, insan, sepet, zemin) sayma.`;

const SCHEMA = {
  type: Type.OBJECT,
  properties: {
    urunler: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          raf: { type: Type.INTEGER },
          ad: { type: Type.STRING },
          marka: { type: Type.STRING },
          adet: { type: Type.INTEGER },
          emin_mi: { type: Type.STRING, enum: ["yuksek", "orta", "dusuk"] },
          not: { type: Type.STRING },
        },
        required: ["raf", "ad", "marka", "adet", "emin_mi", "not"],
      },
    },
  },
  required: ["urunler"],
};

// Gemini'nin hata gövdesindeki JSON'u çıkar (SDK mesajın önüne metin ekleyebiliyor)
function hataGovdesi(e: unknown): { code?: number; message?: string } | null {
  const ham = e instanceof Error ? e.message : String(e);
  const bas = ham.indexOf("{");
  if (bas === -1) return null;
  try {
    return JSON.parse(ham.slice(bas)).error ?? null;
  } catch {
    return null;
  }
}

// Kullanıcıya ham JSON yerine tek cümlelik hata dön
function anlasilirHata(e: unknown): Error {
  const govde = hataGovdesi(e);
  if (govde?.code === 429) {
    const saniye = /retry in ([\d.]+)s/i.exec(govde.message ?? "")?.[1];
    return new Error(
      `Gemini kotası doldu (ücretsiz katmanda model başına günde 20 istek).` +
        (saniye ? ` ${Math.ceil(Number(saniye))} sn sonra tekrar dene.` : "") +
        ` Başka bir model denemek için .env.local içindeki GEMINI_MODEL'i değiştirebilirsin.`,
    );
  }
  if (govde?.code === 503)
    return new Error("Gemini şu an yoğun, birazdan tekrar dene.");
  if (govde?.message) return new Error(govde.message);
  return e instanceof Error ? e : new Error(String(e));
}

// 503 geçici yoğunluk, tekrar denemeye değer.
// 429 kota hatası: tekrar denemek kotayı boşa harcar, hemen bırak.
async function tekrarDene<T>(is_: () => Promise<T>, deneme = 2): Promise<T> {
  for (let i = 1; ; i++) {
    try {
      return await is_();
    } catch (e) {
      const gecici = hataGovdesi(e)?.code === 503;
      if (!gecici || i >= deneme) throw e;
      await new Promise((r) => setTimeout(r, i * 2000));
    }
  }
}

function istek(base64: string, mimeType: string, model: string) {
  return ai.models.generateContent({
    model,
    contents: [
      {
        role: "user",
        parts: [
          {
            inlineData: { mimeType, data: base64 },
            // küçük ürünlerin okunabilmesi için en yüksek çözünürlükte işle
            mediaResolution: {
              level: PartMediaResolutionLevel.MEDIA_RESOLUTION_ULTRA_HIGH,
            },
          },
          { text: PROMPT },
        ],
      },
    ],
    config: {
      responseMimeType: "application/json",
      responseSchema: SCHEMA,
      temperature: 0, // aynı fotoğrafa tutarlı cevap için
      thinkingConfig: { thinkingLevel: DUSUNME },
    },
  });
}

export async function rafiAnalizEt(
  base64: string,
  mimeType: string,
): Promise<RafUrunu[]> {
  // Yapılandırma hataları sunucuda sessizce garip hatalara dönüşüyor;
  // burada erkenden ne eksik olduğunu söyle.
  if (!process.env.GEMINI_API_KEY?.trim()) {
    throw new Error(
      "GEMINI_API_KEY tanımlı değil. Vercel'de Settings > Environment Variables " +
        "altına ekleyip yeniden yayınla (Redeploy).",
    );
  }
  if (MODELLER.length === 0) {
    throw new Error(`Model listesi boş. GEMINI_MODEL'i sil ya da şöyle doldur: ${VARSAYILAN_MODELLER}`);
  }

  let sonHata: unknown;

  for (const model of MODELLER) {
    try {
      const res = await tekrarDene(() => istek(base64, mimeType, model));
      const json = JSON.parse(res.text ?? "{}");
      return json.urunler ?? [];
    } catch (e) {
      const kod = hataGovdesi(e)?.code;
      // kota dolu ya da model yogun: sıradaki modeli dene.
      // diğer hatalar (geçersiz anahtar, bozuk istek) model değiştirmekle geçmez
      if (kod !== 429 && kod !== 503) throw anlasilirHata(e);
      sonHata = e;
    }
  }

  throw anlasilirHata(sonHata);
}
