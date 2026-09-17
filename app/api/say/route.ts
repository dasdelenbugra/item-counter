import { NextRequest, NextResponse } from "next/server";
import { rafiAnalizEt } from "@/lib/gemini";

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
