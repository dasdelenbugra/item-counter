"use client";

import { useRef, useState } from "react";
import type { RafUrunu } from "@/lib/gemini";
import { yoloyuHazirla, yoloylaSay, type YoloSonuc } from "@/lib/yolo";

type GeminiSonuc = {
  urunler: RafUrunu[];
  toplam: number;
  sure_ms: number;
};

// Telefon fotoğrafı 8 MB ve HEIC gelebiliyor. Göndermeden önce JPEG'e çevirip
// küçültüyoruz: sunucuya hep aynı tip gelir, mobil veriyle yükleme hızlanır.
// 2560'ın altına inme: marka adının ambalajdan okunabilmesi buna bağlı.
// Sayımı YOLO yapıyor, ama yanlış marka göstermek sunumda göze batıyor.
const UZUN_KENAR = 2560;
const KALITE = 0.85;

type Kaynak = {
  cizilecek: CanvasImageSource;
  en: number;
  boy: number;
  birak: () => void;
};

/**
 * Fotoğrafı tuvale çizilebilir hale getirir.
 *
 * img.decode() KULLANMA: sekme gizliyken hiç sonuçlanmıyor (ölçtük). Kullanıcı
 * fotoğrafı seçip telefonu kilitlerse ya da başka uygulamaya geçerse ekran
 * "hazırlanıyor"da sonsuza kadar takılıyordu. createImageBitmap gizliyken de
 * çalışıyor ve EXIF yön bilgisini uyguluyor.
 */
async function kaynagiHazirla(dosya: File): Promise<Kaynak> {
  try {
    const bitmap = await createImageBitmap(dosya, {
      imageOrientation: "from-image",
    });
    return {
      cizilecek: bitmap,
      en: bitmap.width,
      boy: bitmap.height,
      birak: () => bitmap.close(),
    };
  } catch {
    // Eski Safari imageOrientation seçeneğini bilmiyor: <img> yoluna düş.
    // Burada da decode() yerine load olayını bekliyoruz, aynı sebeple.
    const url = URL.createObjectURL(dosya);
    const img = new Image();
    try {
      await new Promise<void>((tamam, hata) => {
        img.onload = () => tamam();
        img.onerror = () => hata(new Error("görsel yüklenemedi"));
        img.src = url;
      });
    } catch (e) {
      URL.revokeObjectURL(url);
      throw e;
    }
    return {
      cizilecek: img,
      en: img.naturalWidth,
      boy: img.naturalHeight,
      birak: () => URL.revokeObjectURL(url),
    };
  }
}

async function jpegeCevir(dosya: File): Promise<File> {
  const kaynak = await kaynagiHazirla(dosya);
  try {
    const olcek = Math.min(1, UZUN_KENAR / Math.max(kaynak.en, kaynak.boy));

    const tuval = document.createElement("canvas");
    tuval.width = Math.round(kaynak.en * olcek);
    tuval.height = Math.round(kaynak.boy * olcek);
    tuval
      .getContext("2d")!
      .drawImage(kaynak.cizilecek, 0, 0, tuval.width, tuval.height);

    const blob = await new Promise<Blob | null>((c) =>
      tuval.toBlob(c, "image/jpeg", KALITE),
    );
    if (!blob) throw new Error("fotoğraf dönüştürülemedi");

    return new File([blob], "raf.jpg", { type: "image/jpeg" });
  } finally {
    kaynak.birak();
  }
}

export default function Sayfa() {
  const [dosya, setDosya] = useState<File | null>(null);
  const [onizleme, setOnizleme] = useState<string | null>(null);
  const [hazirlaniyor, setHazirlaniyor] = useState(false);
  const [yukleniyor, setYukleniyor] = useState(false);
  // Sayım (tarayıcıda YOLO) ve tanıma (sunucuda Gemini) ayrı ayrı gelir:
  // YOLO birkaç saniyede biter, Gemini 30-50 sn sürer.
  const [yolo, setYolo] = useState<YoloSonuc | null>(null);
  const [yoloHata, setYoloHata] = useState<string | null>(null);
  const [gemini, setGemini] = useState<GeminiSonuc | null>(null);
  const [geminiHata, setGeminiHata] = useState<string | null>(null);
  const [hata, setHata] = useState<string | null>(null);
  const [kutulariGoster, setKutulariGoster] = useState(true);

  const galeriRef = useRef<HTMLInputElement>(null);
  const kameraRef = useRef<HTMLInputElement>(null);
  const onizlemeUrl = useRef<string | null>(null);

  async function dosyaSecildi(e: React.ChangeEvent<HTMLInputElement>) {
    const ham = e.target.files?.[0];
    // aynı fotoğrafı arka arkaya seçebilmek için alanı boşalt
    e.target.value = "";
    if (!ham) return;

    sonuclariTemizle();
    setHazirlaniyor(true);
    // Model 38 MB; "Say"a basılana kadar arka planda insin. Hata olursa
    // gönderirken tekrar denenecek, burada yutmak yeterli.
    yoloyuHazirla().catch(() => {});

    try {
      const jpeg = await jpegeCevir(ham);
      setDosya(jpeg);

      if (onizlemeUrl.current) URL.revokeObjectURL(onizlemeUrl.current);
      onizlemeUrl.current = URL.createObjectURL(jpeg);
      // önizleme gönderilen dosyanın kendisi: ekranda ne görüyorsan o gidiyor
      setOnizleme(onizlemeUrl.current);
    } catch {
      setDosya(null);
      setHata("Fotoğraf okunamadı. Başka bir dosya dene.");
    } finally {
      setHazirlaniyor(false);
    }
  }

  function sonuclariTemizle() {
    setYolo(null);
    setYoloHata(null);
    setGemini(null);
    setGeminiHata(null);
    setHata(null);
  }

  async function yoloCalistir(foto: File) {
    const kaynak = await createImageBitmap(foto);
    try {
      setYolo(await yoloylaSay(kaynak, kaynak.width, kaynak.height));
    } finally {
      kaynak.close();
    }
  }

  async function geminiCalistir(foto: File) {
    const form = new FormData();
    form.append("foto", foto);
    const res = await fetch("/api/say", { method: "POST", body: form });
    const veri = await res.json();
    if (!res.ok) throw new Error(veri.hata ?? "istek başarısız");
    setGemini(veri as GeminiSonuc);
  }

  async function gonder(e: React.FormEvent) {
    e.preventDefault();
    if (!dosya) return;

    setYukleniyor(true);
    sonuclariTemizle();

    // İkisi paralel ve birbirinden bağımsız: biri düşerse diğerinin sonucu
    // yine gösterilir. Yalnızca ikisi birden düşerse hata ekranı çıkar.
    const [y, g] = await Promise.allSettled([
      yoloCalistir(dosya),
      geminiCalistir(dosya),
    ]);
    const mesaj = (r: PromiseRejectedResult) =>
      r.reason instanceof Error ? r.reason.message : "bilinmeyen hata";

    if (y.status === "rejected") {
      console.error("YOLO:", y.reason);
      setYoloHata(mesaj(y));
    }
    if (g.status === "rejected") setGeminiHata(mesaj(g));
    if (y.status === "rejected" && g.status === "rejected") setHata(mesaj(g));
    setYukleniyor(false);
  }

  const sonucVar = Boolean(yolo || gemini);
  const urunler = gemini?.urunler ?? [];
  const cesit = new Set(urunler.map((u) => u.marka + " " + u.ad)).size;

  return (
    <main>
      <h1>Raf Sayım</h1>
      <p className="alt">Raf fotoğrafı yükle, görünen ürünleri saysın.</p>

      <form className="kart" onSubmit={gonder}>
        {/* iki ayrı alan: capture tek başına konsaydı galeri seçeneği kapanırdı */}
        <input
          ref={galeriRef}
          className="gizli"
          type="file"
          accept="image/*"
          onChange={dosyaSecildi}
        />
        <input
          ref={kameraRef}
          className="gizli"
          type="file"
          accept="image/*"
          capture="environment"
          onChange={dosyaSecildi}
        />

        <div className="dugmeler">
          <button
            type="button"
            className="ikincil"
            disabled={hazirlaniyor || yukleniyor}
            onClick={() => galeriRef.current?.click()}
          >
            Galeriden seç
          </button>
          <button
            type="button"
            className="ikincil"
            disabled={hazirlaniyor || yukleniyor}
            onClick={() => kameraRef.current?.click()}
          >
            Kamerayla çek
          </button>
          <button type="submit" disabled={!dosya || hazirlaniyor || yukleniyor}>
            {yukleniyor ? "Sayılıyor…" : "Say"}
          </button>
        </div>

        {hazirlaniyor && <p className="alt bilgi">Fotoğraf hazırlanıyor…</p>}

        {onizleme && dosya && (
          <>
            <div className="sarmal">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className="onizleme" src={onizleme} alt="Seçilen fotoğraf" />
              {kutulariGoster &&
                yolo?.kutular.map((k, i) => (
                  <span
                    key={i}
                    className={
                      k.sinif.toLowerCase().includes("empty")
                        ? "kutu bos"
                        : "kutu"
                    }
                    // oran olarak geldi: yüzdeye çevirince görselin ekrandaki
                    // boyutundan bağımsız doğru yere oturuyor
                    style={{
                      left: (k.x * 100).toFixed(3) + "%",
                      top: (k.y * 100).toFixed(3) + "%",
                      width: (k.en * 100).toFixed(3) + "%",
                      height: (k.boy * 100).toFixed(3) + "%",
                    }}
                  />
                ))}
            </div>
            <p className="alt bilgi">
              Gönderilecek dosya: {(dosya.size / 1024).toFixed(0)} KB · JPEG
            </p>
          </>
        )}
      </form>

      {hata && <p className="kart hata">Hata: {hata}</p>}

      {sonucVar && !hata && (
        <div className="kart">
          {yolo ? (
            <>
              {/* Sayim ve tanima iki ayri modelin isi; ikisinin toplamini
                  esit agirlikta yan yana koymak "hangisi dogru" sorusunu
                  doguruyordu. Sayiyi tespit modeli veriyor, dil modeli
                  yalnizca neyin ne oldugunu soyluyor. */}
              <div className="sayilar">
                <div>
                  <span className="rakam">{yolo.toplam}</span>
                  <span className="etiket">rafta görünen ürün</span>
                </div>
                <div>
                  <span className="rakam">{cesit}</span>
                  <span className="etiket">tanınan çeşit</span>
                </div>
                {yolo.bos_raf > 0 && (
                  <div>
                    <span className="rakam">{yolo.bos_raf}</span>
                    <span className="etiket">boş raf</span>
                  </div>
                )}
              </div>
              <p className="alt bilgi">
                Adedi, fotoğraftaki her ürünü tek tek kutulayan tespit modeli
                sayıyor — kutular görselin üstünde işaretli. Ürün ve marka
                adlarını ayrı bir görsel dil modeli okuyor.
              </p>
              <button
                type="button"
                className="ikincil"
                onClick={() => setKutulariGoster((v) => !v)}
              >
                {kutulariGoster ? "Kutuları gizle" : "Kutuları göster"}
              </button>
            </>
          ) : (
            <p className="alt">
              Toplam <strong>{gemini?.toplam ?? 0}</strong> adet · {cesit} çeşit ·{" "}
              {((gemini?.sure_ms ?? 0) / 1000).toFixed(1)} sn
            </p>
          )}

          {!gemini && !geminiHata && (
            <p className="alt bilgi">Ürün adları okunuyor, bu 30-50 sn sürebilir…</p>
          )}

          {geminiHata && (
            <p className="alt bilgi hata">
              Ürün adları alınamadı ({geminiHata}). Sayım ve kutular geçerli.
            </p>
          )}

          {yoloHata && (
            <p className="alt bilgi hata">
              Sayım modeli çalışmadı ({yoloHata}). Adetler Gemini&apos;den.
            </p>
          )}

          {gemini && (
            <p className="alt bilgi">
              Sadece fotoğrafta görünen ön yüzler sayılır, arka sıralar sayıma
              dahil değildir. · {cesit} çeşit · {(gemini.sure_ms / 1000).toFixed(1)} sn
            </p>
          )}

          {urunler.length > 0 && (
          <table>
            <thead>
              <tr>
                <th>Raf</th>
                <th>Ürün</th>
                <th>Marka</th>
                <th>Adet</th>
                <th>Güven</th>
              </tr>
            </thead>
            <tbody>
              {urunler.map((u, i) => (
                <tr key={i} title={u.not}>
                  <td>{u.raf}</td>
                  <td>{u.ad}</td>
                  <td>{u.marka}</td>
                  <td>{u.adet}</td>
                  <td>{u.emin_mi}</td>
                </tr>
              ))}
            </tbody>
          </table>
          )}
        </div>
      )}
    </main>
  );
}
