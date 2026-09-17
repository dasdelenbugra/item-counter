import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
const MODEL = process.env.GEMINI_MODEL ?? "gemini-2.5-flash";

export type RafUrunu = {
  ad: string;
  marka: string;
  adet: number;
  emin_mi: "yuksek" | "orta" | "dusuk";
  not: string;
};

const PROMPT = `Sen bir market rafı sayım asistanısın. Görseldeki raf ürünlerini listele.

Kurallar:
- Sadece fotoğrafta GÖRÜNEN ürünleri say. Arkada olabilecek ürünleri tahmin etme.
- Aynı ürünün tüm görünen adetlerini tek satırda topla.
- Ambalajdaki yazıyı okuyabiliyorsan ürün adını ve markayı ambalajdaki gibi yaz (gramaj görünüyorsa ekle).
- Okuyamadığın ürünler için ad alanına "bilinmeyen" yaz, not alanında görünüşünü kısaca tarif et.
- Adetten emin değilsen emin_mi alanını "dusuk" yap. Asla sayı uydurma.
- Raf dışındaki nesneleri (fiyat etiketi, insan, sepet) sayma.`;

const SCHEMA = {
  type: Type.OBJECT,
  properties: {
    urunler: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          ad: { type: Type.STRING },
          marka: { type: Type.STRING },
          adet: { type: Type.INTEGER },
          emin_mi: { type: Type.STRING, enum: ["yuksek", "orta", "dusuk"] },
          not: { type: Type.STRING },
        },
        required: ["ad", "marka", "adet", "emin_mi", "not"],
      },
    },
  },
  required: ["urunler"],
};

export async function rafiAnalizEt(
  base64: string,
  mimeType: string
): Promise<RafUrunu[]> {
  const res = await ai.models.generateContent({
    model: MODEL,
    contents: [
      {
        role: "user",
        parts: [{ inlineData: { mimeType, data: base64 } }, { text: PROMPT }],
      },
    ],
    config: {
      responseMimeType: "application/json",
      responseSchema: SCHEMA,
      temperature: 0, // aynı fotoğrafa tutarlı cevap için
    },
  });

  const json = JSON.parse(res.text ?? "{}");
  return json.urunler ?? [];
}
