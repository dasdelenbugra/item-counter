"use client";

import { useState } from "react";
import type { RafUrunu } from "@/lib/gemini";

type Sonuc = {
  urunler: RafUrunu[];
  toplam: number;
  sure_ms: number;
};

export default function Sayfa() {
  const [dosya, setDosya] = useState<File | null>(null);
  const [onizleme, setOnizleme] = useState<string | null>(null);
  const [yukleniyor, setYukleniyor] = useState(false);
  const [sonuc, setSonuc] = useState<Sonuc | null>(null);
  const [hata, setHata] = useState<string | null>(null);

  function dosyaSecildi(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    setDosya(f);
    setSonuc(null);
    setHata(null);
    setOnizleme(f ? URL.createObjectURL(f) : null);
  }

  async function gonder(e: React.FormEvent) {
    e.preventDefault();
    if (!dosya) return;

    setYukleniyor(true);
    setHata(null);
    setSonuc(null);

    try {
      const form = new FormData();
      form.append("foto", dosya);

      const res = await fetch("/api/say", { method: "POST", body: form });
      const veri = await res.json();

      if (!res.ok) throw new Error(veri.hata ?? "istek başarısız");
      setSonuc(veri as Sonuc);
    } catch (err) {
      setHata(err instanceof Error ? err.message : "bilinmeyen hata");
    } finally {
      setYukleniyor(false);
    }
  }

  return (
    <main>
      <h1>Raf Sayım</h1>
      <p className="alt">Raf fotoğrafı yükle, görünen ürünleri saysın.</p>

      <form className="kart" onSubmit={gonder}>
        <input type="file" accept="image/*" onChange={dosyaSecildi} />
        <button type="submit" disabled={!dosya || yukleniyor}>
          {yukleniyor ? "Sayılıyor…" : "Say"}
        </button>
        {onizleme && (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img className="onizleme" src={onizleme} alt="Seçilen fotoğraf" />
        )}
      </form>

      {hata && <p className="kart hata">Hata: {hata}</p>}

      {sonuc && (
        <div className="kart">
          <p className="alt">
            Toplam <strong>{sonuc.toplam}</strong> adet · {sonuc.urunler.length} çeşit ·{" "}
            {(sonuc.sure_ms / 1000).toFixed(1)} sn
          </p>
          <table>
            <thead>
              <tr>
                <th>Ürün</th>
                <th>Marka</th>
                <th>Adet</th>
                <th>Güven</th>
              </tr>
            </thead>
            <tbody>
              {sonuc.urunler.map((u, i) => (
                <tr key={i} title={u.not}>
                  <td>{u.ad}</td>
                  <td>{u.marka}</td>
                  <td>{u.adet}</td>
                  <td>{u.emin_mi}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
