"use client";
import BrainsPanel from "@/components/brains/brains-panel";

export default function CerebrosPage() {
  return (
    <main className="min-h-screen px-4 py-8 md:px-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-2xl font-bold text-cyan-50">Cerebros</h1>
        <p className="text-sm text-white/50 mt-1 mb-6">
          Empaqueta todo tu contexto — memorias, baúles, conexiones, IA, permisos, APIs — y conéctalo a tus
          servidores. Elige el cerebro para cada contexto.
        </p>
        <BrainsPanel />
      </div>
    </main>
  );
}
