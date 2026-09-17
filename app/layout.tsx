import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Raf Sayım",
  description: "Raf fotoğrafından ürün sayımı",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="tr">
      <body>{children}</body>
    </html>
  );
}
