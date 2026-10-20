"use client";

import { useState, useEffect, useRef } from "react";
import { aOferta, type NeuronPrestarPrefs, type NeuronMedidas } from "@/lib/neurons/prestar";
import { detectCapabilities, type NeuronCapabilities } from "@/lib/neurons/neurons";
import { cn } from "@/lib/utils";

function ToggleButton({
  label,
  checked,
  onChange,
  explanation,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  explanation?: string;
}) {
  return (
    <div className="space-y-1">
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
      {explanation && (
        <p className="ml-4 text-[10px] leading-snug text-white/50">{explanation}</p>
      )}
    </div>
  );
}

function NumberInput({
  label,
  value,
  onChange,
  unit,
  min = 0,
  step = 1,
  explanation,
  ariaLabel,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  unit?: string;
  min?: number;
  step?: number;
  explanation?: string;
  ariaLabel: string;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-white/60">{label}</span>
        {unit && <span className="text-[10px] text-white/40">{unit}</span>}
      </div>
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(Number(e.target.value) || 0)}
        min={min}
        step={step}
        aria-label={ariaLabel}
        className="rounded-lg border border-white/10 bg-white/[0.04] px-2 py-1 text-[10px] text-white/70 w-[120px]"
      />
      {explanation && <p className="ml-4 text-[10px] leading-snug text-white/50">{explanation}</p>}
    </div>
  );
}

function AppSelector({
  apps,
  onAdd,
  onRemove,
}: {
  apps: string[];
  onAdd: (app: string) => void;
  onRemove: (index: number) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [inputValue, setInputValue] = useState("");

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      const name = inputValue.trim();
      if (name) {
        onAdd(name);
        setInputValue("");
      }
    }
  };

  const handleClickAdd = () => {
    const name = inputValue.trim();
    if (name) {
      onAdd(name);
      setInputValue("");
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <ToggleButton
          label="Apps que otras neuronas pueden abrir desde aquí"
          checked={apps.length > 0}
          onChange={(v) => {
            if (!v) onAdd("__CLEAR__");
          }}
          explanation="Elige qué apps instaladas en esta neurona pueden ser abiertas por otras neuronas de tu red."
        />
      </div>
      {apps.length > 0 && (
        <div className="ml-4 space-y-1.5">
          {apps.map((app, idx) => (
            <div key={idx} className="flex items-center gap-2">
              <span className="truncate w-[140px] text-[10px] text-white/70">{app}</span>
              <button
                type="button"
                onClick={() => onRemove(idx)}
                className="cursor-pointer p-1 rounded hover:bg-white/10 text-white/40 transition-colors"
                aria-label={`Eliminar ${app}`}
              >
                <span>×</span>
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="ml-4 flex items-center gap-2">
        <input
          ref={inputRef}
          type="text"
          placeholder="Nombre de la app"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          className="rounded-lg border border-white/10 bg-white/[0.04] px-2 py-1 text-[10px] text-white/70 w-[140px]"
          aria-label="Nombre de la app a prestar"
        />
        <button
          type="button"
          onClick={handleClickAdd}
          className="cursor-pointer rounded-lg border border-white/10 bg-white/[0.04] px-2 py-1 text-[10px] text-white/70 hover:border-cyan-400/40 hover:text-cyan-200 transition-colors"
        >
          Añadir
        </button>
      </div>
    </div>
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
    return () => {
      alive = false;
    };
  }, []);

  const computeOffer = () => {
    if (!caps) return null;
    const medidas: NeuronMedidas = {
      nodoId: caps.nodoId ?? "",
      medio: caps.medio ?? "navegador",
      ramLibreMb: caps.ramLibreMb ?? 0,
      cpu: caps.cpu ?? 0,
    };
    return aOferta(prefs, medidas);
  };

  const handleAppAdd = (app: string) => {
    if (app === "__CLEAR__") {
      setPrefs((p) => ({ ...p, apps: [] }));
    } else {
      setPrefs((p) => ({ ...p, apps: [...p.apps, app] })));
    }
  };

  const handleAppRemove = (index: number) => {
    setPrefs((p) => ({ ...p, apps: p.apps.filter((_, i) => i !== index) }));
  };

  return (
    <div className="space-y-4">
      <h3 className="text-[14px] font-semibold text-white/85">Prestar recursos</h3>
      <div className="space-y-3">
        <ToggleButton
          label="Dejar que mis otras neuronas usen esta para calcular"
          checked={prefs.computacion}
          onChange={(v) => setPrefs((p) => ({ ...p, computacion: v }))}
          explanation="Permite que tus otras neuronas envíen tareas de cómputo (IA, render, transcodificar) a esta neurona."
        />
        <ToggleButton
          label="Prestar espacio"
          checked={prefs.almacenamiento}
          onChange={(v) => setPrefs((p) => ({ ...p, almacenamiento: v }))}
          explanation="Ofrece parte del almacenamiento libre de esta neurona para guardar volúmenes por bandas de otras neuronas."
        />
        <AppSelector
          apps={prefs.apps}
          onAdd={handleAppAdd}
          onRemove={handleAppRemove}
        />
        <NumberInput
          label="Ancho de banda máximo (KB/s)"
          value={prefs.ancho}
          onChange={(v) => setPrefs((p) => ({ ...p, ancho: v }))}
          unit="KB/s"
          min={0}
          step={100}
          explanation="Límite de subida que esta neurona dedicará a servir recursos a otras. 0 = sin límite."
          ariaLabel="ancho de banda máximo (KB/s)"
        />
        <div className="space-y-2">
          <span className="text-[10px] text-white/60 block">A quién presta</span>
          <div className="flex flex-col gap-2 ml-4">
            <ToggleButton
              label="Mi cuenta (todas mis neuronas)"
              checked={prefs.aQuien.cuenta}
              onChange={(v) =>
                setPrefs((p) => ({ ...p, aQuien: { ...p.aQuien, cuenta: v } }))
              }
              explanation="Tus otras neuronas (mismo cuenta) pueden usar los recursos. Activado por defecto."
            />
            <ToggleButton
              label="Mis grupos"
              checked={prefs.aQuien.grupos}
              onChange={(v) =>
                setPrefs((p) => ({ ...p, aQuien: { ...p.aQuien, grupos: v } }))
              }
              explanation="Las neuronas de los miembros de tus grupos (que prestan al grupo) pueden usar los recursos."
            />
            <ToggleButton
              label="Público (vecinos de la malla)"
              checked={prefs.aQuien.publico}
              onChange={(v) =>
                setPrefs((p) => ({ ...p, aQuien: { ...p.aQuien, publico: v } }))
              }
              explanation="Cualquier neurona de la red mesh con resonancia suficiente puede pedir recursos. Solo para tareas públicas."
            />
          </div>
        </div>
        <div className="space-y-2">
          <span className="text-[10px] text-white/60 block">Topes de préstamo</span>
          <div className="grid grid-cols-2 gap-4 ml-4 text-[10px]">
            <NumberInput
              label="CPU máximo (%)"
              value={prefs.topes.cpu}
              onChange={(v) => setPrefs((p) => ({ ...p, topes: { ...p.topes, cpu: v } }))}
              min={0}
              step={5}
              explanation="Porcentaje máximo de CPU que se prestará. Se respeta aunque la neurona tenga más libre."
              ariaLabel="cpu máximo (%)"
            />
            <NumberInput
              label="RAM máximo (MB)"
              value={prefs.topes.ram}
              onChange={(v) => setPrefs((p) => ({ ...p, topes: { ...p.topes, ram: v } }))}
              min={0}
              step={128}
              explanation="Máximo de RAM que se ofrecerá a otras neuronas. No supera la RAM libre real."
              ariaLabel="ram máximo (MB)"
            />
            <NumberInput
              label="Disco máximo (MB)"
              value={prefs.topes.disco}
              onChange={(v) => setPrefs((p) => ({ ...p, topes: { ...p.topes, disco: v } }))}
              min={0}
              step={256}
              explanation="Espacio máximo en disco para volúmenes de otras neuronas. Gestionado por LRU."
              ariaLabel="disco máximo (MB)"
            />
            <ToggleButton
              label="Solo prestar mientras carga"
              checked={prefs.topes.soloCargando}
              onChange={(v) => setPrefs((p) => ({ ...p, topes: { ...p.topes, soloCargando: v } }))}
              explanation="Solo presta recursos cuando el dispositivo está enchufado y cargando."
            />
          </div>
        </div>
        <div className="border-t border-white/10 pt-3">
          <p className="text-[10px] leading-snug text-white/40">
            Aviso: lo privado nunca sale de la cuenta. Sus datos personales, archivos y aplicaciones
            privadas permanecen cifrados y solo salen de su dispositivo con su permiso explícito.
          </p>
        </div>
      </div>
    </div>
  );
}

export default PrestarRecursosPanel;
