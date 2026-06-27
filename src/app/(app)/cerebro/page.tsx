"use client";

import CerebroHub from "@/components/cerebro/cerebro-hub";

export default function CerebroPage() {
  return (
    <main className="min-h-screen px-4 py-8 md:px-8">
      <div className="max-w-5xl mx-auto">
        <h1 className="text-2xl font-bold text-cyan-50">Cerebro</h1>
        <p className="text-sm text-white/50 mt-1 mb-6">
          El Cerebro como tres pilares interconectados: <span className="text-cyan-300">Memoria</span> (archivos .md y
          sus fuentes/servidores), <span className="text-violet-300">Habilidades</span> (el programa de soul.md: skills,
          plugins, claves, permisos y agentes) y <span className="text-amber-300">Contexto</span> (los sentidos de
          Aurora, configurables por proveedor — incl. Sakana Fugu — y modo emociones).
        </p>
        <CerebroHub />
      </div>
    </main>
  );
}
