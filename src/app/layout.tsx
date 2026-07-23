import type { Metadata, Viewport } from "next";
import RootLayoutClient from "./root-layout-client";

export const metadata: Metadata = {
  title: "StarSeed System",
  description: "Sistema operativo social para la regeneración global",
  applicationName: "StarSeed OS",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "StarSeed",
  },
  icons: {
    icon: [
      { url: "/favicon-48.png", sizes: "48x48", type: "image/png" },
      { url: "/starseed-symbol-square.png", sizes: "512x512", type: "image/png" },
    ],
    shortcut: "/favicon-48.png",
    apple: "/apple-icon.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#0A0712",
  colorScheme: "dark",
  // viewportFit=cover habilita env(safe-area-inset-*) en toda la app —
  // lo usan los escritorios (barra superior/dock) en notch/isla dinámica.
  viewportFit: "cover",
};

// Root layout = Server Component MÍNIMO (solo metadata/viewport). El árbol
// visible completo vive en <RootLayoutClient/> (Client Component), de modo que
// Next NO inyecta react-server-dom-client en el bundle del layout del cliente
// → elimina la colisión de module-id con `react` que causaba #310.
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <RootLayoutClient>{children}</RootLayoutClient>;
}
