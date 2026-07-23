import { Inter, Space_Grotesk, Source_Code_Pro, Roboto, Outfit } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/utils";
import { RegisterSW } from "@/components/pwa/register-sw";
import ProvidersTree from "@/components/providers-tree";

const fontInter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const fontRoboto = Roboto({ weight: ["400", "500", "700"], subsets: ["latin"], variable: "--font-roboto" });
const fontOutfit = Outfit({ subsets: ["latin"], variable: "--font-outfit" });
const fontHeadline = Space_Grotesk({ subsets: ["latin"], variable: "--font-headline" });
const fontCode = Source_Code_Pro({ subsets: ["latin"], variable: "--font-code" });

// Server Component (sin "use client"): NO usa hooks de React directamente,
// así se elimina el "Invalid hook call" (#310) de raíz. Todos los providers
// que usan hooks viven en <ProvidersTree /> (Client Component), que hidrata
// con la instancia única de React del navegador — sin necesidad de alias de
// next/dist/compiled/react (que rompía la hidratación del subtree en Vercel).
export default function RootLayoutClient({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body
        suppressHydrationWarning
        className={cn(
          "min-h-screen bg-background font-body antialiased",
          fontInter.variable,
          fontRoboto.variable,
          fontOutfit.variable,
          fontHeadline.variable,
          fontCode.variable,
        )}
      >
        {/* Registro del Service Worker (PWA): instalable + shell offline.
            Defensivo y sin UI; se omite en dev salvo NEXT_PUBLIC_ENABLE_SW=1. */}
        <RegisterSW />
        <ProvidersTree>{children}</ProvidersTree>
      </body>
    </html>
  );
}
