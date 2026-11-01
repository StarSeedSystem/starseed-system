"use client";
import { useEffect, useState } from "react";
import AbilitiesHub from "@/components/abilities/abilities-hub";
import MediaGenPanel from "@/components/media/media-gen-panel";
import { SugerenciasInstalacion, TarjetaImagenes } from "@/components/imagenes";
import type { PeticionImagen } from "@/lib/imagenes/plan";
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
      <div className="mt-4 space-y-4">
        <MediaGenPanel />
        <SugerenciasInstalacion />
        <PruebaPorCapas />
      </div>
    </section>
  );
}

/** Prueba aquí las opciones por capas (IMG1011J): escribes una idea y Astraura reparte modelos y motores. */
function PruebaPorCapas() {
  const [prompt, setPrompt] = useState("");
  const [peticion, setPeticion] = useState<(PeticionImagen & { prompt?: string }) | undefined>();
  const repartir = () => {
    const texto = prompt.trim();
    if (!texto) return;
    setPeticion({ opciones: 4, prioridad: "rapidez", comercial: false, necesita: ["texto-a-imagen"], conReferencia: false, permisoRemoto: false, permitirDePago: false, prompt: texto });
  };
  return (
    <div className="rounded-xl border border-white/10 bg-black/20 p-4">
      <h3 className="text-sm font-semibold text-white">Opciones por capas</h3>
      <p className="mt-1 text-xs text-white/55">
        Describe una imagen y Astraura reparte VARIAS opciones: la pestaña, tu neurona, la malla y la web gratis,
        con el modelo, la procedencia y la licencia de cada una.
      </p>
      <div className="mt-2 flex gap-2">
        <input
          type="text"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") repartir(); }}
          placeholder="Ej.: un bosque de cristal al amanecer"
          aria-label="Petición de imagen"
          className="min-w-0 flex-1 rounded-lg border border-white/15 bg-transparent px-3 py-1.5 text-xs text-white placeholder:text-white/30"
        />
        <button type="button" onClick={repartir} className="cursor-pointer rounded-lg border border-white/15 px-3 py-1.5 text-xs text-white transition-colors duration-200 hover:bg-white/10">
          Repartir opciones
        </button>
      </div>
      <div className="mt-3 text-white/80"><TarjetaImagenes peticion={peticion} /></div>
    </div>
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
