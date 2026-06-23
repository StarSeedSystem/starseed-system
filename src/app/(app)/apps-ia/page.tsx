"use client";

import AiAppGenerator from "@/components/appgen/ai-app-generator";

export default function AppsIAPage() {
  return (
    <main className="flex h-[calc(100vh-1rem)] flex-col px-4 py-6 md:px-8">
      <div className="mb-4 shrink-0">
        <h1 className="text-2xl font-bold text-amber-50">Apps con IA · Estudio</h1>
        <p className="mt-1 text-sm text-white/50">
          Genera apps con Astraura: archivos, formatos, carpetas, conexiones y plugins. Un estudio
          en el navegador estilo Cursor / Claude Code — describe tu idea, genera, edita en vivo,
          previsualiza, guarda y exporta.
        </p>
      </div>
      <div className="min-h-0 flex-1">
        <AiAppGenerator />
      </div>
    </main>
  );
}
