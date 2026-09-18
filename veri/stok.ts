/**
 * Sahte stok verisi — sunum içindir.
 *
 * Gerçek projede bu liste mağazanın stok sistemindeki API'den gelecek.
 * Demoda "sistemde şu kadar yazıyor" tarafını temsil etmesi için elle yazıldı;
 * fotoğrafındaki reyona göre düzenleyebilirsin.
 */

export type StokKalemi = {
  ad: string;
  marka: string;
  adet: number;
};

export const STOK: StokKalemi[] = [
  { ad: "Classic Granül Kahve 100 g", marka: "Nescafe", adet: 24 },
  { ad: "Classic Granül Kahve 200 g", marka: "Nescafe", adet: 12 },
  { ad: "Gold Granül Kahve 100 g", marka: "Nescafe", adet: 20 },
  { ad: "3'ü 1 Arada", marka: "Nescafe", adet: 60 },
  { ad: "2'si 1 Arada", marka: "Nescafe", adet: 40 },
  { ad: "Monarch Filtre Kahve 200 g", marka: "Jacobs", adet: 14 },
  { ad: "Selection Filtre Kahve 250 g", marka: "Jacobs", adet: 16 },
  { ad: "Gold Selection 250 g", marka: "Tchibo", adet: 18 },
  { ad: "Cafissimo Espresso", marka: "Tchibo", adet: 6 },
  { ad: "Coffee Mate Kahve Kreması", marka: "Nestle", adet: 22 },
  { ad: "Türk Kahvesi 100 g", marka: "Kurukahveci Mehmet Efendi", adet: 30 },
  { ad: "Café Crown Latte", marka: "Ülker", adet: 25 },
  { ad: "Caffe Mocha", marka: "Starbucks", adet: 8 },
  { ad: "Caramel Latte", marka: "Starbucks", adet: 8 },
  { ad: "Vanilla Latte", marka: "Starbucks", adet: 8 },
  // Ambalajdaki yazı Almanca; stok adını da öyle yazdık, yoksa eşleşmiyor.
  // Sunumda söylenecek şey: stok adı ambalajdaki adla uyumlu olmalı.
  { ad: "Kaffee Filterpapier", marka: "Melitta", adet: 15 },
  // Sistemde var ama rafta göremeyeceğimiz kalemler: karşılaştırmanın
  // "rafta hiç yok" durumunu sunumda gösterebilmek için bilerek duruyorlar.
  { ad: "Türk Kahvesi 100 g", marka: "Doğuş", adet: 12 },
  { ad: "Espresso Çekirdek Kahve 1 kg", marka: "Lavazza", adet: 5 },
];
