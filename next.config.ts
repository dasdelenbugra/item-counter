import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Ev dizininde bir package-lock.json olduğu için Turbopack proje kökünü
  // yanlış tahmin ediyordu; kökü açıkça bu klasör olarak sabitliyoruz.
  turbopack: {
    root: path.resolve(__dirname),
  },
};

export default nextConfig;
