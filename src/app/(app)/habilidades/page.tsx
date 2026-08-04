"use client";
import { useEffect, useState } from "react";
import AbilitiesHub from "@/components/abilities/abilities-hub";
import MediaGenPanel from "@/components/media/media-gen-panel";
import { isCapabilityDisabled, setCapabilityDisabled } from "@/ai/astraura/skills";

// Adenda 138 · La habilidad de GENERACIÓN AUDIOVISUAL está ENCENDIDA por defecto
// para toda cuenta desde la web (sin instalar nada, motor gratis Pollinations).
// Aquí se puede apagar y elegir otro servicio (local u online) por neurona o cuenta.
function AudiovisualAbilitySection() {
  const [enabled, setEnabled] = useState(true);
  useEffect(() => {
    setEnabled(!isCapabilityDisabled("av-gen"));
    const on = () => setEnabled(!isCapabilityDisabled("av-gen"));
    window.addEventListener("starseed:capabilities", on);
    return () => window.removeEventListener("starseed:capabilities", on);
  }, []);

  return (
    <section className="mt-8 rounded-xl border border-fuchsia-500/20 bg-fuchsia-950/10 p-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex flex-col">
          <h2 className="text-lg font-semibold text-fuchsia-50">Generación audiovisual</h2>
          <p className="text-sm text-white/55 mt-0.5">
            Encendida por defecto para tu cuenta: Aurora genera imágenes desde cualquier chat, gratis y sin instalar
            nada (Pollinations). Elige otro servicio —local para más calidad, u online— por neurona o para toda la cuenta.
          </p>
        </div>
        <label className="ml-auto flex cursor-pointer items-center gap-2 text-sm text-white/70">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => {
              setCapabilityDisabled("av-gen", !e.target.checked);
              setEnabled(e.target.checked);
            }}
          />
          {enabled ? "Activada para todas" : "Desactivada"}
        </label>
      </div>
      <div className="mt-4">
        <MediaGenPanel />
      </div>
    </section>
  );
}

export default function HabilidadesPage() {
  return (
    <main className="min-h-screen px-4 py-8 md:px-8">
      <div className="max-w-5xl mx-auto">
        <h1 className="text-2xl font-bold text-violet-50">Habilidades · Skills · Tools · MCP · Conexiones</h1>
        <p className="text-sm text-white/50 mt-1 mb-6">
          Unifica todas las capacidades de StarSeed en un solo hub y átalas a tus cerebros, lienzos, apps o tu cuenta.
        </p>
        <AbilitiesHub />
        <AudiovisualAbilitySection />
      </div>
    </main>
  );
}
