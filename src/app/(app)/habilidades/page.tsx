"use client";
import AbilitiesHub from "@/components/abilities/abilities-hub";

export default function HabilidadesPage() {
  return (
    <main className="min-h-screen px-4 py-8 md:px-8">
      <div className="max-w-5xl mx-auto">
        <h1 className="text-2xl font-bold text-violet-50">Habilidades · Skills · Tools · MCP · Conexiones</h1>
        <p className="text-sm text-white/50 mt-1 mb-6">
          Unifica todas las capacidades de StarSeed en un solo hub y átalas a tus cerebros, lienzos, apps o tu cuenta.
        </p>
        <AbilitiesHub />
      </div>
    </main>
  );
}
