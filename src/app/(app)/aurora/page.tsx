"use client";
import AuroraStudio from "@/components/aurora/aurora-studio";

export default function AuroraPage() {
  return (
    <main className="min-h-screen px-4 py-8 md:px-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-2xl font-bold text-fuchsia-50">Aurora · Voz de Astraura</h1>
        <p className="text-sm text-white/50 mt-1 mb-6">Control por voz en tiempo real de todos tus sistemas StarSeed. Configura proveedor, voz, carácter, personalidad y emociones, y guarda Personalidades en baúles, memorias y archivos.</p>
        <AuroraStudio />
      </div>
    </main>
  );
}
