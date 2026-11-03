"use client";

/**
 * AutomejoraCapas (MTN1027K · `architecture/automejora-meta-n.md` §5): por capa,
 * interruptor, acierto activo frente a la anterior, «Volver a la anterior» y la última
 * noche de Meta^n. Ruta solo local: fuera de la Mac el GET responde vacío y no pinta
 * nada. Al cargar guarda en el almacén las directivas que lleguen MÁS NUEVAS.
 */

import { useCallback, useEffect, useState } from "react";
import { BrainCircuit } from "lucide-react";

import { Switch } from "@/components/ui/switch";
import { configCapa, normalizarConfigAutomejora, normalizarNocheAutomejora, textoAcierto, type AccionAutomejora, type ConfigAutomejora, type NocheAutomejora } from "@/lib/astraura/capas/automejora";
import { guardarDirectivas, normalizarRegistroDirectivas, type RegistroDirectivas } from "@/lib/astraura/capas/directivas-almacen";
import { cn } from "@/lib/utils";

const NOMBRE: Record<string, string> = { juicio: "Razón (juicio)", palabra: "Palabra", herramientas: "Herramientas" };

interface Datos {
  config: ConfigAutomejora;
  noche: NocheAutomejora | null;
  directivas: RegistroDirectivas;
}

type Cuerpo = { config?: unknown; noche?: unknown; directivas?: unknown };

function leerCuerpo(cuerpo: Cuerpo, base: Datos | null): Datos {
  const nuevas = normalizarRegistroDirectivas(cuerpo.directivas);
  for (const [capa, archivo] of Object.entries(nuevas)) void guardarDirectivas(capa, archivo);
  const config = normalizarConfigAutomejora(cuerpo.config);
  const noche = normalizarNocheAutomejora(cuerpo.noche) ?? base?.noche ?? null;
  return { config, noche, directivas: { ...base?.directivas, ...nuevas } };
}

export function AutomejoraCapas({ compacto = false }: { compacto?: boolean }) {
  const [datos, setDatos] = useState<Datos | null>(null);
  const enviar = useCallback(async (capa: string, accion: AccionAutomejora, valor?: boolean) => {
    try {
      const r = await fetch("/api/astraura/automejora", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ capa, accion, valor }),
      });
      if (!r.ok) return;
      const cuerpo = (await r.json()) as Cuerpo;
      setDatos((prev) => leerCuerpo(cuerpo, prev));
    } catch {
      /* sin señal local: se queda como estaba */
    }
  }, []);

  useEffect(() => {
    let vivo = true;
    fetch("/api/astraura/automejora")
      .then(async (r) => (r.ok && vivo ? ((await r.json()) as Cuerpo) : null))
      .then((cuerpo) => {
        if (cuerpo && vivo) setDatos(leerCuerpo(cuerpo, null));
      })
      .catch(() => null);
    return () => {
      vivo = false;
    };
  }, []);

  if (!datos) return null;
  const capas = Array.from(new Set([...Object.keys(datos.config), ...Object.keys(datos.directivas)])).sort();
  const noche = datos.noche;
  const propuso = noche && noche.propuso.length > 90 ? `${noche.propuso.slice(0, 90)}…` : noche?.propuso ?? "";

  return (
    <div className={cn("flex flex-col rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2", compacto ? "gap-1.5" : "gap-2")} data-testid="automejora-capas">
      <div className="flex items-center gap-2">
        <BrainCircuit className="h-3.5 w-3.5 shrink-0 text-[#39FF14]" />
        <span className="text-xs font-medium">Automejora de las capas (Meta^n)</span>
      </div>
      <ul className="flex flex-col gap-1.5">
        {capas.map((capa) => {
          const archivo = datos.directivas[capa] ?? null;
          const cfg = configCapa(datos.config, capa);
          const versiones = archivo?.historial.length ?? 0;
          const activa = archivo?.activa ?? null;
          const hayAnterior = activa !== null && (archivo?.historial.some((d) => d.estado === "anterior" && d.version < activa) ?? false);
          return (
            <li key={capa} data-capa={capa} className="flex items-center gap-2">
              <span className="min-w-0 flex-1 truncate text-xs">{NOMBRE[capa] ?? capa}</span>
              <span className="text-[10px] text-white/50">{textoAcierto(archivo)}</span>
              {versiones > 0 && <span className="text-[10px] text-white/40">{versiones} versiones</span>}
              {hayAnterior && (
                <button type="button" onClick={() => void enviar(capa, "volver")} className="cursor-pointer rounded-md border border-white/15 px-2 py-1 text-[10px] text-white/70 transition-colors duration-200 hover:border-[#007FFF]/70 hover:text-white">
                  Volver a la anterior
                </button>
              )}
              <Switch className="scale-[0.7]" aria-label={`Aportar en ${NOMBRE[capa] ?? capa}`} checked={cfg.aportar} onCheckedChange={(on) => void enviar(capa, "aportar", on)} />
              <Switch className="scale-[0.7]" aria-label="Preguntarme antes de activar" checked={cfg.preguntar} onCheckedChange={(on) => void enviar(capa, "preguntar", on)} />
              <Switch className="scale-90" aria-label={`Automejora de ${NOMBRE[capa] ?? capa}`} checked={cfg.encendida} onCheckedChange={(on) => void enviar(capa, on ? "encender" : "apagar")} />
            </li>
          );
        })}
      </ul>
      <div className="rounded-md border border-white/10 px-2 py-1.5 text-[11px] text-white/70">
        {noche ? (
          <div className="flex flex-col">
            <span>
              Última noche · {noche.fecha}{noche.donde ? ` · corrió en ${noche.donde}` : ""} · {noche.llamadas} llamadas
            </span>
            {propuso && <span className="italic text-white/60">Propuso: «{propuso}»</span>}
            <span>
              Juez: aprobó {noche.aprobadas} de {noche.propuestas} pautas{noche.tareas > 0 ? ` · ${noche.tareas} tareas de código al enjambre` : ""}
            </span>
          </div>
        ) : (
          <span>Aún no ha corrido.</span>
        )}
      </div>
    </div>
  );
}
