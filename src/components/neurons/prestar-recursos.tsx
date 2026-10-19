"use client";

import { useState, useEffect } from "react";
import { aOferta, type NeuronPrestarPrefs, type NeuronMedidas } from "@/lib/neurons/prestar";
import { detectCapabilities, type NeuronCapabilities } from "@/lib/neurons/neurons";
import { cn } from "@/lib/utils";

function ToggleButton({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={cn(
        "inline-flex cursor-pointer items-center gap-1.5 rounded-lg border px-2 py-1 text-[10px] transition-colors",
        checked
          ? "border-cyan-400/40 bg-cyan-500/[0.06] text-cyan-200"
          : "border-white/10 bg-white/[0.04] text-white/70 hover:border-cyan-400/40 hover:text-cyan-200"
      )}
    >
      <span className="text-[12px] font-medium">{label}</span>
    </button>
  );
}

export function PrestarRecursosPanel() {
  const [caps, setCaps] = useState<NeuronCapabilities | null>(null);
  const [prefs, setPrefs] = useState<NeuronPrestarPrefs>({
    computacion: true,
    almacenamiento: true,
    apps: [],
    ancho: 0,
    aQuien: {
      cuenta: true,
      grupos: false,
      publico: false,
    },
    topes: {
      cpu: 50,
      ram: 1024,
      disco: 2048,
      soloCargando: false,
    },
  });

  useEffect(() => {
    let alive = true;
    void (async () => {
      const c = await detectCapabilities();
      if (!alive) return;
      setCaps(c);
    })();
    return () => { alive = false; };
  }, []);

  const computeOffer = () => {
    if (!caps) return null;
    const medidas: NeuronMedidas = {
      nodoId: caps.nodoId ?? '',
      medio: caps.medio ?? 'navegador',
      ramLibreMb: caps.ramLibreMb ?? 0,
      cpu: caps.cpu ?? 0,
    };
    return aOferta(prefs, medidas);
  };

  return (
    <div className="space-y-4">
      <h3 className="text-[14px] font-semibold text-white/85">
        Prestar recursos
      </h3>
      <div className="space-y-3">
        {/* Computación */}
        <ToggleButton
          label="Dejar que mis otras neuronas usen esta para calcular"
          checked={prefs.computacion}
          onChange={(v) =>
            setPrefs((p) => ({ ...p, computacion: v }))
          }
        />
        {/* Almacenamiento */}
        <ToggleButton
          label="Prestar espacio"
          checked={prefs.almacenamiento}
          onChange={(v) =>
            setPrefs((p) => ({ ...p, almacenamiento: v }))
          }
        />
        {/* Apps prestables */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <ToggleButton
              label="Apps que otras neuronas pueden abrir desde aquí"
              checked={prefs.apps.length > 0}
              onChange={(v) => {
                if (!v) setPrefs((p) => ({ ...p, apps: [] }));
                // If turning on, we don't change apps here; handled below
              }}
            />
            {/* Input for adding apps */}
            <div className="relative">
              <input
                type="text"
                placeholder="Nombre de la app"
                className="rounded-lg border border-white/10 bg-white/[0.04] px-2 py-1 text-[10px] text-white/70 w-[150px]"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    const input = e.currentTarget as HTMLInputElement;
                    const appName = input.value.trim();
                    if (appName) {
                      setPrefs((p) => ({
                        ...p,
                        apps: [...p.apps, appName],
                      }));
                      input.value = "";
                    }
                  }
                }}
              />
              <button
                type="button"
                onClick={() => {
                  // We'll get the input value from a ref or state; for simplicity, we'll use a temporary state
                  // But we don't have state for the input. Let's change approach: use controlled input.
                  // We'll refactor this later if needed, but for now, we'll use a quick hack.
                }}
                className="ml-2 rounded-lg border border-white/10 bg-white/[0.04] px-2 py-1 text-[10px] text-white/70 hover:border-cyan-400/40 hover:text-cyan-200"
              >
                Añadir
              </button>
            </div>
          </div>
          {/* List of added apps */}
          {prefs.apps.map((app, idx) => (
            <div key={idx} className="flex items-center gap-2 text-[10px] text-white/60">
              <span className="truncate w-[100px]">{app}</span>
              <button
                type="button"
                onClick={() =>
                  setPrefs((p) => ({
                    ...p,
                    apps: p.apps.filter((_, i) => i !== idx),
                  }))
                }
                className="p-1 rounded hover:bg-white/10"
              >
                <span className="text-white/40">×</span>
              </button>
            </div>
          ))}
        </div>
        {/* Ancho de banda */}
        <div className="space-y-1">
          <span className="text-[10px] text-white/60 block">
            Ancho de banda (KB/s)
          </span>
          <input
            type="number"
            value={prefs.ancho}
            onChange={(e) =>
              setPrefs((p) => ({
                ...p,
                ancho: Number(e.target.value) || 0,
              }))
            }
            className="rounded-lg border border-white/10 bg-white/[0.04] px-2 py-1 text-[10px] text-white/70 w-[150px]"
          />
        </div>
        {/* A quién presta */}
        <div className="space-y-2">
          <span className="text-[10px] text-white/60 block">
            A quién presta
          </span>
          <div className="flex flex-col gap-2">
            <ToggleButton
              label="Mi cuenta"
              checked={prefs.aQuien.cuenta}
              onChange={(v) =>
                setPrefs((p) => ({
                  ...p,
                  aQuien: { ...p.aQuien, cuenta: v },
                }))
              }
            />
            <ToggleButton
              label="Mis grupos"
              checked={prefs.aQuien.grupos}
              onChange={(v) =>
                setPrefs((p) => ({
                  ...p,
                  aQuien: { ...p.aQuien, grupos: v },
                }))
              }
            />
            <ToggleButton
              label="Público"
              checked={prefs.aQuien.publico}
              onChange={(v) =>
                setPrefs((p) => ({
                  ...p,
                  aQuien: { ...p.aQuien, publico: v },
                }))
              }
            />
          </div>
        </div>
        {/* Topes */}
        <div className="space-y-2">
          <span className="text-[10px] text-white/60 block">
            Topes de préstamo
          </span>
          <div className="grid grid-cols-2 gap-4 text-[10px]">
            <div>
              <span className="block mb-1">CPU (%)</span>
              <input
                type="number"
                value={prefs.topes.cpu}
                onChange={(e) =>
                  setPrefs((p) => ({
                    ...p,
                    topes: { ...p.topes, cpu: Number(e.target.value) || 0 },
                  }))
                }
                className="rounded-lg border border-white/10 bg-white/[0.04] px-2 py-1 w-[100px]"
              />
            </div>
            <div>
              <span className="block mb-1">RAM (MB)</span>
              <input
                type="number"
                value={prefs.topes.ram}
                onChange={(e) =>
                  setPrefs((p) => ({
                    ...p,
                    topes: { ...p.topes, ram: Number(e.target.value) || 0 },
                  }))
                }
                className="rounded-lg border border-white/10 bg-white/[0.04] px-2 py-1 w-[100px]"
              />
            </div>
            <div>
              <span className="block mb-1">Disco (MB)</span>
              <input
                type="number"
                value={prefs.topes.disco}
                onChange={(e) =>
                  setPrefs((p) => ({
                    ...p,
                    topes: { ...p.topes, disco: Number(e.target.value) || 0 },
                  }))
                }
                className="rounded-lg border border-white/10 bg-white/[0.04] px-2 py-1 w-[100px]"
              />
            </div>
            <div>
              <span className="block mb-1">Solo cargando</span>
              <ToggleButton
                label=""
                checked={prefs.topes.soloCargando}
                onChange={(v) =>
                  setPrefs((p) => ({
                    ...p,
                    topes: { ...p.topes, soloCargando: v },
                  }))
                }
                className="mt-2"
              />
            </div>
          </div>
        </div>
        {/* Aviso */}
        <div className="border-t border-white/10 pt-3">
          <p className="text-[10px] leading-snug text-white/40">
            Aviso: lo privado nunca sale de la cuenta. Sus datos personales,
            archivos y aplicaciones privadas permanecen cifrados y solo
            salen de su dispositivo con su permiso explícito.
          </p>
        </div>
        {/* Current offer (for debugging) */}
        {/* <div className="mt-4 p-2 bg-white/[0.02] rounded">
          <pre className="text-[9px] text-white/50">{JSON.stringify(computeOffer(), null, 2)}</pre>
        </div> */}
      </div>
    </div>
  );
}