import {
  GoogleGenAI,
  PartMediaResolutionLevel,
  ThinkingLevel,
  Type,
} from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

// Sira KOTAYA gore: ucretsiz katmanda model basina gunde 20 istek var ve
// dolan modelde istek 429 ile dusuyor, sadece zaman kaybettiriyor.
// 2026-09-19'da 3.6 (31/20) ve 3.5 (30/20) dolmustu; her istek once o ikisinde
// bosa gidip en zayif modele (flash-lite) dusuyordu. Yavaslik ve bozuk urun
// adlarinin sebebi ayarlar degil buydu.
// flash-lite en sona: kotasi genis (gunde 500) ama tanima kalitesi dusuk.
// Kimlikler API'den dogrulandi (ListModels): panelde "Gemini 3 Flash" yazan
// modelin kimligi gemini-3-flash-preview; "gemini-3-flash" diye bir model yok
// ve o isimle istek 404 dondurup tum zinciri dusuruyordu.
const VARSAYILAN_MODELLER =
  "gemini-3.7-flash,gemini-3.8-flash,gemini-3-flash-preview,gemini-3.6-flash,gemini-3.5-flash,gemini-3.1-flash-lite";

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
// Kullanıcı hızdansa doğruluğu seçti. Aynı fotoğrafta raf 1 ölçümü:
//   MEDIUM : 12.8 sn, "Nescafe Gold x3" (yandaki Tchibo'ları da Nescafe sayıyor)
//   HIGH   : 34.9 sn, "Nescafe Gold x2" (Nescafe adedi doğru)
// HIGH yavaş ama sayıyı doğru veriyor; zaman aşımı da artık çökmeye değil
// "isimler eksik" durumuna düşürüyor, yani yavaşlığın bedeli sınırlı.
const DUSUNME =
  DUSUNME_SEVIYELERI[process.env.GEMINI_THINKING?.trim().toUpperCase() ?? ""] ??
  ThinkingLevel.HIGH;

// Görsel çözünürlüğü süreyi düşünme seviyesi kadar etkiliyor: fotoğraf
// 1500x2000 ve ULTRA_HIGH'da her karesi ayrıntılı işleniyor.
const COZUNURLUKLER: Record<string, PartMediaResolutionLevel> = {
  MEDIUM: PartMediaResolutionLevel.MEDIA_RESOLUTION_MEDIUM,
  HIGH: PartMediaResolutionLevel.MEDIA_RESOLUTION_HIGH,
  ULTRA_HIGH: PartMediaResolutionLevel.MEDIA_RESOLUTION_ULTRA_HIGH,
};
// Üretimde ölçüldü (aynı kahve reyonu, 3'er deneme):
//   ULTRA_HIGH : 12-59 sn, oynaklık çok yüksek, bir kez 59.7 sn
//   MEDIUM     : 14-16 sn, tutarlı ama cam kavanozdaki küçük yazıyı okuyamıyor
//   HIGH       : 11.6-14.2 sn, tutarlı ve üç denemede de AYNI isimleri verdi
// Detay kaybı sayımı etkilemiyor, çünkü sayan model YOLO.
// Kullanıcı ilk ayara dönmeyi seçti: yavaş ama isimleri doğru veren hali.
// HIGH/MEDIUM hız kazandırıyor ama cam kavanozlardaki markaları karıştırıyor.
const COZUNURLUK =
  COZUNURLUKLER[process.env.GEMINI_COZUNURLUK?.trim().toUpperCase() ?? ""] ??
  PartMediaResolutionLevel.MEDIA_RESOLUTION_ULTRA_HIGH;

// Gemini'nin süresi çok oynak: aynı fotoğrafta 12 sn de sürüyor 58 sn de.
// Vercel 60 sn'de kesiyor, yani beklemeye devam etmek tüm isteği çöpe atıyor.
// Bu süreyi aşarsa vazgeçiyoruz; YOLO'nun kutuları zaten hazır olduğu için
// kullanıcı sayımı ve kutuları yine görüyor, sadece ürün adları eksik kalıyor.
// HIGH düşünmede süre 34-51 sn arasında gidip geliyor. 50 sn sınır, 51 sn
// süren isteği kıl payı kesiyordu; 54'e çekildi. Geri kalan işler (YOLO
// paralel, dosya okuma, JSON) 2-3 sn, yani Vercel'in 60 sn'sine hâlâ pay var.
// Sınır aşılırsa kullanıcı hata değil, "kutular var isimler yok" ekranı görüyor.
const ZAMAN_ASIMI_MS = Number(process.env.GEMINI_ZAMAN_ASIMI_MS ?? 54_000);

export class GeminiZamanAsimi extends Error {
  constructor() {
    super("Gemini zamanında cevap vermedi, ürün adları alınamadı");
    this.name = "GeminiZamanAsimi";
  }
}

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
- BENZER GÖRÜNEN ÜRÜNLERİ AYNI VARSAYMA. Yan yana duran, aynı renk ve şekildeki ürünler farklı markalar olabilir; özellikle altın/kahverengi kavanozlar ve benzer ambalajlar birbirine çok benzer. Her ürünün etiketini TEK TEK oku, komşusuna bakarak karar verme. İki ürünü ancak ikisinin de etiketini okuyup aynı olduğunu gördüysen tek satırda topla.
- Aynı katta, etiketini okuyup aynı olduğunu doğruladığın ürünleri tek satırda topla. Aynı ürün iki farklı kattaysa iki ayrı satır olur.

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
            mediaResolution: { level: COZUNURLUK },
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

  // Sınır tüm deneme zincirine konuyor, tek isteğe değil: iki model sırayla
  // denenirken toplam süre yine 60 sn'yi aşabilirdi.
  const bitis = Date.now() + ZAMAN_ASIMI_MS;
  const kalanSureyleYaris = <T,>(is_: Promise<T>): Promise<T> =>
    Promise.race([
      is_,
      new Promise<never>((_, hata) =>
        setTimeout(() => hata(new GeminiZamanAsimi()), Math.max(0, bitis - Date.now())),
      ),
    ]);

  let sonHata: unknown;

  for (const model of MODELLER) {
    try {
      const res = await kalanSureyleYaris(
        tekrarDene(() => istek(base64, mimeType, model)),
      );
      const json = JSON.parse(res.text ?? "{}");
      return json.urunler ?? [];
    } catch (e) {
      // Süre doldu: sıradaki modeli denemenin anlamı yok, zaten geç kaldık.
      if (e instanceof GeminiZamanAsimi) throw e;
      const kod = hataGovdesi(e)?.code;
      // kota dolu ya da model yogun: sıradaki modeli dene.
      // diğer hatalar (geçersiz anahtar, bozuk istek) model değiştirmekle geçmez
      if (kod !== 429 && kod !== 503) throw anlasilirHata(e);
      sonHata = e;
    }
  }

  throw anlasilirHata(sonHata);
}
