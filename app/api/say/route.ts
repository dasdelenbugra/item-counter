import { rafiAnalizEt, type RafUrunu } from "@/lib/gemini";
import { yoloVarMi, yoloylaSay, type YoloSonuc } from "@/lib/yolo";
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

    const base64 = Buffer.from(await dosya.arrayBuffer()).toString("base64");

    const baslangic = Date.now();
    // İkisi paralel: toplam süre yavaş olanın süresi kadar, toplamları kadar değil.
    // allSettled çünkü YOLO düşerse Gemini sonucu yine de dönmeli.
    const [geminiSonuc, yoloSonuc] = await Promise.allSettled([
      rafiAnalizEt(base64, dosya.type),
      yoloVarMi()
        ? yoloylaSay(dosya, dosya.name || "raf.jpg")
        : Promise.reject(new Error("kapalı")),
    ]);
    const sure_ms = Date.now() - baslangic;

    let yolo: YoloSonuc | null = null;
    let yolo_hata: string | null = null;
    if (yoloSonuc.status === "fulfilled") {
      yolo = yoloSonuc.value;
    } else if (yoloVarMi()) {
      // Servis tanımlı ama cevap vermedi: sebebini göster, isteği düşürme.
      yolo_hata =
        yoloSonuc.reason instanceof Error
          ? yoloSonuc.reason.message
          : "YOLO servisine ulaşılamadı";
      console.error("YOLO:", yoloSonuc.reason);
    }

    // Gemini gecikirse ya da düşerse isteği tamamen çöpe atma: YOLO'nun
    // sayımı ve kutuları hazır, kullanıcı onları görsün. Yalnızca ikisi
    // birden başarısızsa hata dönüyoruz.
    let urunler: RafUrunu[] = [];
    let gemini_hata: string | null = null;
    if (geminiSonuc.status === "fulfilled") {
      urunler = geminiSonuc.value;
    } else {
      if (!yolo) throw geminiSonuc.reason;
      gemini_hata =
        geminiSonuc.reason instanceof Error
          ? geminiSonuc.reason.message
          : "ürün adları alınamadı";
      console.error("Gemini:", geminiSonuc.reason);
    }

    const toplam = urunler.reduce((t, u) => t + u.adet, 0);

    return NextResponse.json({
      urunler,
      toplam,
      sure_ms,
      yolo,
      yolo_hata,
      gemini_hata,
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { hata: e instanceof Error ? e.message : "bilinmeyen hata" },
      { status: 500 }
    );
  }
}
