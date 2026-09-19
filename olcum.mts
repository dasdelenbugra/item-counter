// Gecici olcum betigi: dusunme seviyesinin sureye ve tanima kalitesine etkisi.
// Kullanim:
//   node --env-file=.env.local --experimental-strip-types olcum.mts <foto>
// Seviyeyi GEMINI_THINKING ile ver (LOW / MEDIUM / HIGH).

import { readFileSync } from "node:fs";
import { rafiAnalizEt } from "./lib/gemini.ts";

const yol = process.argv[2];
if (!yol) {
  console.error("kullanim: olcum.mts <fotograf>");
  process.exit(1);
}

const b64 = readFileSync(yol).toString("base64");
const basla = Date.now();
const urunler = await rafiAnalizEt(b64, "image/jpeg");
const sure = (Date.now() - basla) / 1000;

console.log(
  JSON.stringify(
    {
      seviye: process.env.GEMINI_THINKING ?? "(varsayilan)",
      sure_sn: Number(sure.toFixed(1)),
      toplam: urunler.reduce((t, u) => t + u.adet, 0),
      satir: urunler.length,
      bilinmeyen: urunler.filter((u) => u.ad.toLowerCase().includes("bilinmeyen")).length,
      ornekler: urunler.slice(0, 6).map((u) => `${u.marka} ${u.ad} x${u.adet}`),
    },
    null,
    1,
  ),
);
