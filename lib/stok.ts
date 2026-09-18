/**
 * Fotoğraftan çıkan ürün listesini sistemdeki stokla eşleştirir.
 *
 * İşin zor yanı burası: model ürün adını her seferinde aynı yazmıyor
 * ("Nescafe Classic 100g", "NESCAFE Classic Granül", "Classic kahve"...).
 * Bu yüzden düz metin karşılaştırması işe yaramaz; adları sadeleştirip
 * kelime örtüşmesine bakıyoruz.
 */

import type { RafUrunu } from "@/lib/gemini";
import { STOK, type StokKalemi } from "@/veri/stok";

export type EslesmeDurumu = "eslesti" | "rafta_yok" | "sistemde_yok";

export type KarsilastirmaSatiri = {
  ad: string;
  marka: string;
  sistem: number | null;
  rafta: number | null;
  fark: number | null;
  durum: EslesmeDurumu;
};

const TR_HARF: Record<string, string> = {
  ç: "c",
  ğ: "g",
  ı: "i",
  İ: "i",
  ö: "o",
  ş: "s",
  ü: "u",
  â: "a",
  î: "i",
  û: "u",
};

const BIRIMLER = ["gr", "kg", "gram", "adet", "paket", "ml", "lt"];

/**
 * "NESCAFE Classic Poşet 100g" -> ["nescafe", "classic", "poset", "100"]
 *
 * İki şey kritik, ikisi de ölçerek bulundu:
 *
 * 1. Rakamlar KALIR. Atıldığında "100 g" ile "200 g" ve "2'si 1 Arada" ile
 *    "3'ü 1 Arada" aynı kelimelere düşüyor, ürünler birbirine karışıyordu.
 * 2. Rakam-harf sınırı AYRILIR. Model "2si1 Arada" diye bitişik yazıyor,
 *    stokta ise "2'si 1 Arada" ayrık duruyor; ayırmazsak hiç örtüşmüyorlar.
 */
function kelimeler(metin: string): string[] {
  return metin
    .toLowerCase()
    .replace(/[çğıİöşüâîû]/g, (h) => TR_HARF[h] ?? h)
    .replace(/(\d)([a-z])/g, "$1 $2")
    .replace(/([a-z])(\d)/g, "$1 $2")
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((k) => k.length > 2 || /^\d+$/.test(k))
    .filter((k) => !BIRIMLER.includes(k));
}

// Örtüşen kelime sayısının, küçük listenin uzunluğuna oranı.
// Jaccard yerine bunu seçtim: "Nescafe Classic" ile
// "Nescafe Classic Granül Kahve 100 g" tam eşleşme saysın diye.
function benzerlik(a: string[], b: string[]): number {
  if (!a.length || !b.length) return 0;
  const kume = new Set(b);
  const ortak = a.filter((k) => kume.has(k)).length;
  return ortak / Math.min(a.length, b.length);
}

// Bu eşiğin altındaki eşleşmeler yanlış çıkıyor; üstünde bırakmak,
// yanlış eşleştirmektense eşleştirmemeyi tercih etmek demek.
const ESIK = 0.5;

export function karsilastir(
  urunler: RafUrunu[],
  stok: StokKalemi[] = STOK,
): KarsilastirmaSatiri[] {
  // Aynı ürün farklı raflarda ayrı satır olarak geliyor; önce topla.
  const rafta = new Map<string, { ad: string; marka: string; adet: number }>();
  for (const u of urunler) {
    if (u.ad.toLowerCase() === "bilinmeyen") continue;
    const anahtar = `${u.marka} ${u.ad}`.toLowerCase();
    const mevcut = rafta.get(anahtar);
    if (mevcut) mevcut.adet += u.adet;
    else rafta.set(anahtar, { ad: u.ad, marka: u.marka, adet: u.adet });
  }

  const stokKelime = stok.map((s) => kelimeler(`${s.marka} ${s.ad}`));
  // Bir stok kalemi birden çok raf satırıyla eşleşebilir: aynı ürün hem 3.
  // hem 4. rafta durabiliyor ve model ikisine farklı ad yazabiliyor.
  // Bire bir eşleştirirsek ikincisi haksız yere "sistemde yok" görünüyor.
  const toplananlar = new Map<number, number>();
  const satirlar: KarsilastirmaSatiri[] = [];

  for (const r of rafta.values()) {
    const kendi = kelimeler(`${r.marka} ${r.ad}`);

    let enIyi = -1;
    let enIyiPuan = 0;
    stokKelime.forEach((sk, i) => {
      const puan = benzerlik(kendi, sk);
      if (puan > enIyiPuan) {
        enIyiPuan = puan;
        enIyi = i;
      }
    });

    if (enIyi >= 0 && enIyiPuan >= ESIK) {
      toplananlar.set(enIyi, (toplananlar.get(enIyi) ?? 0) + r.adet);
    } else {
      // Rafta gördük ama sistemde karşılığını bulamadık.
      satirlar.push({
        ad: r.ad,
        marka: r.marka,
        sistem: null,
        rafta: r.adet,
        fark: null,
        durum: "sistemde_yok",
      });
    }
  }

  stok.forEach((s, i) => {
    const bulunan = toplananlar.get(i);
    satirlar.push({
      ad: s.ad,
      marka: s.marka,
      sistem: s.adet,
      rafta: bulunan ?? 0,
      fark: (bulunan ?? 0) - s.adet,
      // Sistemde kayıtlı olup rafta hiç görünmeyenler: asıl aranan bilgi bu.
      durum: bulunan === undefined ? "rafta_yok" : "eslesti",
    });
  });

  // Önce rafta hiç olmayanlar, sonra farkı büyük olanlar.
  const oncelik: Record<EslesmeDurumu, number> = {
    rafta_yok: 0,
    eslesti: 1,
    sistemde_yok: 2,
  };
  return satirlar.sort(
    (a, b) =>
      oncelik[a.durum] - oncelik[b.durum] ||
      Math.abs(b.fark ?? 0) - Math.abs(a.fark ?? 0),
  );
}
