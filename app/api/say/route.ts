import { rafiAnalizEt } from "@/lib/gemini";
import { denemeHakkiVarMi, GUNLUK_SINIR, kisiAnahtari } from "@/lib/sinir";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60; // Vercel'de uzun süren çağrılar için

const MAX_BOYUT = 10 * 1024 * 1024; // 10 MB

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const dosya = form.get("foto");

    if (!(dosya instanceof File)) {
      return NextResponse.json({ hata: "foto alanında dosya yok" }, { status: 400 });
    }
    if (!dosya.type.startsWith("image/")) {
      return NextResponse.json({ hata: "sadece görsel dosyası" }, { status: 400 });
    }
    if (dosya.size > MAX_BOYUT) {
      return NextResponse.json({ hata: "dosya 10 MB'tan büyük" }, { status: 400 });
    }

    // Hakkı dosya kontrollerinden sonra düş: bozuk dosya gönderen deneme kaybetmesin.
    if (!denemeHakkiVarMi(kisiAnahtari(req.headers))) {
      return NextResponse.json(
        {
          hata: `Günlük deneme sınırına ulaştın (günde ${GUNLUK_SINIR} deneme). Yarın tekrar deneyebilirsin.`,
        },
        { status: 429 },
      );
    }

    const base64 = Buffer.from(await dosya.arrayBuffer()).toString("base64");

    // Sayım ve kutular tarayıcıda (lib/yolo.ts) yapılıyor; sunucunun tek işi
    // ürünleri tanımak. Gemini düşerse tarayıcı kutuları yine gösteriyor.
    const baslangic = Date.now();
    const urunler = await rafiAnalizEt(base64, dosya.type);
    const sure_ms = Date.now() - baslangic;
    const toplam = urunler.reduce((t, u) => t + u.adet, 0);

    return NextResponse.json({ urunler, toplam, sure_ms });
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { hata: e instanceof Error ? e.message : "bilinmeyen hata" },
      { status: 500 }
    );
  }
}
