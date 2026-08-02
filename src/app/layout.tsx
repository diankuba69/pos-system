import type { Metadata } from "next";
import { Manrope, IBM_Plex_Sans, JetBrains_Mono } from "next/font/google";
import { Toaster } from "sonner";
import { AuthProvider } from "@/components/AuthProvider";
import { ConfirmProvider } from "@/components/ui/confirm";
import "./globals.css";

const manrope = Manrope({ variable: "--font-manrope", subsets: ["latin"], weight: ["500", "700", "800"] });
const plex = IBM_Plex_Sans({ variable: "--font-plex", subsets: ["latin"], weight: ["400", "500", "600", "700"] });
const jet = JetBrains_Mono({ variable: "--font-jet", subsets: ["latin"], weight: ["400", "500", "700"] });

export const metadata: Metadata = {
  title: "KasirPro — Aplikasi Kasir & Manajemen Toko",
  description: "Point of sale, stok, supplier, dan laporan penjualan dalam satu aplikasi.",
};

const themeInit = `try{var t=localStorage.getItem('kasirpro-theme');if(t==='dark'||(!t&&window.matchMedia('(prefers-color-scheme: dark)').matches)){document.documentElement.classList.add('dark')}}catch(e){}`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="id" className={`${manrope.variable} ${plex.variable} ${jet.variable} h-full`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInit }} />
      </head>
      <body className="min-h-full">
        <AuthProvider>
          <ConfirmProvider>{children}</ConfirmProvider>
        </AuthProvider>
        <Toaster
          position="top-right"
          richColors
          offset={{ top: "70px", right: "16px", left: "16px" }}
          mobileOffset={{ top: "70px", right: "16px", left: "16px" }}
          toastOptions={{ className: "font-sans", style: { borderRadius: "12px" } }}
        />
      </body>
    </html>
  );
}
