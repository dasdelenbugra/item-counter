/**
 * Kişi başına günlük deneme sınırı.
 *
 * Siteyi deneyen herkes aynı Gemini anahtarını kullanıyor ve ücretsiz katmanda
 * model başına günde ~20 istek var. Birkaç kişi art arda denerse kota dolar ve
 * o gün gelen herkes ürün adlarını göremez. Sınır bunu önlemek için.
 *
 * Sayaç sunucunun belleğinde tutuluyor. Vercel yeni bir sunucu örneği
 * başlatınca sıfırlanır, yani kesin değil, yaklaşık bir sınır. Kesin sınır
 * için sayacın Redis gibi kalıcı bir yerde tutulması gerekir.
 *
 * Sadece Vercel'deki canlı sitede çalışır; yerelde ve önizlemede kapalı.
 */

// `??` değil `||`: boş tanımlanmış değişken 0 sayılıp sınırı kapatmasın.
const SINIR = Number(process.env.GUNLUK_DENEME_SINIRI?.trim() || 3);
const AKTIF = process.env.VERCEL_ENV === "production" && SINIR > 0;

const sayac = new Map<string, number>();
let gun = "";

function bugun(): string {
  return new Date().toISOString().slice(0, 10);
}

export function kisiAnahtari(headers: Headers): string {
  // Vercel gerçek istemci adresini x-forwarded-for'un başına yazıyor.
  return (
    headers.get("x-forwarded-for")?.split(",")[0].trim() ||
    headers.get("x-real-ip") ||
    "bilinmeyen"
  );
}

/** Deneme hakkı varsa sayar ve true döner; yoksa false. */
export function denemeHakkiVarMi(kisi: string): boolean {
  if (!AKTIF) return true;

  // Gün değişince tüm sayaçları sıfırla; eski günlerin kayıtları birikmesin.
  if (gun !== bugun()) {
    sayac.clear();
    gun = bugun();
  }

  const kullanilan = sayac.get(kisi) ?? 0;
  if (kullanilan >= SINIR) return false;
  sayac.set(kisi, kullanilan + 1);
  return true;
}

export const GUNLUK_SINIR = SINIR;
