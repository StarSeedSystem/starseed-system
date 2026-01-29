import type { Metadata } from "next";
import { Inter, Space_Grotesk, Source_Code_Pro, Roboto, Outfit } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "sonner";
import { ThemeProvider } from "@/components/theme-provider";
import { AppearanceProvider } from "@/context/appearance-context";
import { cn } from "@/lib/utils";
import { LiquidGlass } from "@/components/ui/liquid-glass";

const fontInter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

const fontRoboto = Roboto({
  weight: ["400", "500", "700"],
  subsets: ["latin"],
  variable: "--font-roboto",
});

const fontOutfit = Outfit({
  subsets: ["latin"],
  variable: "--font-outfit",
});

const fontHeadline = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-headline",
});

const fontCode = Source_Code_Pro({
  subsets: ["latin"],
  variable: "--font-code",
});


export const metadata: Metadata = {
  title: "StarSeed Network",
  description: "The digital embodiment of the StarSeed Society.",
  icons: {
    icon: "/icon.png",
    shortcut: "/icon.png",
    apple: "/icon.png",
  },
  openGraph: {
    title: "StarSeed Network",
    description: "The digital embodiment of the StarSeed Society.",
    siteName: "StarSeed Network",
    images: [
      {
        url: "/logo.png",
        width: 800,
        height: 600,
      },
    ],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
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
          fontCode.variable
        )}
        style={{
          "--font-body": "var(--font-inter)"
        } as React.CSSProperties}
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <AppearanceProvider>
            <LiquidGlass />
            {children}
            <Toaster />
            <Sonner />
          </AppearanceProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
