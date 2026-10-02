import type { Metadata } from "next";
import { Playfair_Display, Quicksand } from "next/font/google";
import { Toaster } from "sonner";
import "./globals.css";

const playfair = Playfair_Display({
  subsets: ["latin"],
  variable: "--font-display",
  weight: ["400", "500", "600", "700"],
});

const quicksand = Quicksand({
  subsets: ["latin"],
  variable: "--font-body",
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Sheepie | Inventory & Order Management",
  description: "Internal inventory and order management system for Sheepie",
  robots: {
    index: false,
    follow: false,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${playfair.variable} ${quicksand.variable} antialiased font-body`}
      >
        {children}
        <Toaster
          position="bottom-center"
          offset={96}
          toastOptions={{ className: "!rounded-2xl !border !border-white/80 !bg-white/90 !backdrop-blur-xl !text-[#213368] !font-body" }}
        />
      </body>
    </html>
  );
}
