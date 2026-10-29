"use client";

/**
 * Pestaña Medios de los ajustes del cerebro (CB1013S, contrato §8): capacidades
 * (qué servidor o neurona atiende cada una) y almacenamiento (destinos de
 * `getMemoryDestinations(cerebro)`, explicado línea por destino con `destinosDe()`).
 * Controlado por props, igual que AjustesSeguridad: enseña `valor` y avisa con
 * `onCambio({ medios })`; no guarda nada.
 */

import { useMemo } from "react";
import { HardDrive, Server } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Brain } from "@/lib/brains/brains";
import { getMemoryDestinations } from "@/lib/brains/memory-destinations";
import { APLICACION, CAPACIDADES, type AjustesObjetivo, type Capacidad } from "@/lib/cerebros/ajustes";
import { destinosMedios, explicarDestinos } from "@/lib/cerebros/ajustes-almacen";
import { MarcaAplicacion, type NivelAjustes } from "@/components/cerebro/ajustes-seguridad";

/** Clase de los datos de memoria por defecto en este panel: el cerebro de una cuenta es privado. */
const CLASE_DATO = "privado" as const;
const SELECTOR = "h-9 max-w-[16rem] rounded-md border border-white/15 bg-black/40 px-2 text-sm text-white";

export interface AjustesMediosProps {
  valor: Pick<AjustesObjetivo, "medios">;
  onCambio: (parcial: Partial<AjustesObjetivo>) => void;
  cerebro: Brain;
  /** Neuronas de la cuenta (de `listNeurons()`), separadas del diálogo para probar menos. */
  neuronas: { id: string; nombre: string }[];
  nivel: NivelAjustes;
}

export function AjustesMedios({ valor, onCambio, cerebro, neuronas, nivel }: AjustesMediosProps) {
  const medios = valor.medios;
  const destinos = useMemo(() => destinosMedios(getMemoryDestinations(cerebro)), [cerebro]);
  const lineas = useMemo(() => explicarDestinos(destinos, CLASE_DATO, medios.almacenamiento), [destinos, medios.almacenamiento]);
  const opciones = useMemo(
    () => [
      ...cerebro.servers.map((s) => ({ id: `servidor:${s.id}`, texto: `${s.name} · servidor` })),
      ...neuronas.map((n) => ({ id: `neurona:${n.id}`, texto: `${n.nombre} · neurona` })),
    ],
    [cerebro.servers, neuronas],
  );
  const cambiar = (medios2: AjustesObjetivo["medios"]) => onCambio({ medios: medios2 });
  const marcaAlmacen: "se-aplica" | "solo-se-guarda" =
    nivel === "cerebro" ? APLICACION["medios.almacenamiento"] : "solo-se-guarda";

  return (
    <section className="space-y-5 text-white" aria-label="Medios">
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2"><Server className="h-4 w-4 text-white/60" /><h3 className="text-sm font-semibold">Capacidades</h3><MarcaAplicacion estado={APLICACION["medios.capacidades"]} /></div>
        <p className="text-xs leading-relaxed text-white/60">Qué servidor o neurona atiende cada capacidad. «Automático» lo deja en manos del encaminamiento de Astraura.</p>
        <div className="flex flex-col gap-2">
          {(Object.keys(CAPACIDADES) as Capacidad[]).map((cap) => (
            <label key={cap} className="flex flex-wrap items-center gap-2 text-sm">
              <span className="min-w-[7rem] font-medium">{CAPACIDADES[cap]}</span>
              <select
                aria-label={`Servidor de ${CAPACIDADES[cap]}`}
                className={SELECTOR}
                value={medios.capacidades[cap] ?? "auto"}
                onChange={(e) => cambiar({ ...medios, capacidades: { ...medios.capacidades, [cap]: e.target.value } })}
              >
                <option value="auto">Automático</option>
                {opciones.map((o) => (<option key={o.id} value={o.id}>{o.texto}</option>))}
              </select>
            </label>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2"><HardDrive className="h-4 w-4 text-white/60" /><h3 className="text-sm font-semibold">Almacenamiento</h3><MarcaAplicacion estado={marcaAlmacen} /></div>
        <p className="text-xs leading-relaxed text-white/60">
          {nivel === "cerebro"
            ? "Dónde guarda el cerebro. «Automático» respeta los destinos de memoria de este cerebro; una elección específica se aplica de verdad al guardar (enciende o apaga StarSeed y Syncthing)."
            : "En una memoria o carpeta se guarda por ahora: el destino de memoria real se configura en el nivel del cerebro entero."}
        </p>
        <div className="flex flex-wrap gap-2">
          <ButtonAlmacen etiqueta="Automático" activo={albergaAuto(medios.almacenamiento)} onToggle={() => alternar(medios, cambiar, "auto")} />
          {destinos.map((d) => (
            <ButtonAlmacen key={d.id} etiqueta={d.etiqueta} apagado={!d.activo} activo={medios.almacenamiento.includes(d.id)} onToggle={() => alternar(medios, cambiar, d.id)} />
          ))}
        </div>
        <ul className="space-y-1 text-xs text-white/70">
          {lineas.map((l) => (
            <li key={l.id}>
              <span className="font-medium text-white/85">{l.etiqueta}</span>
              <span className="text-white/60"> · {l.va ? "va" : "no va"}: {l.texto}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/** «auto» está ya en la elección. */
function albergaAuto(elegidos: string[]): boolean {
  return elegidos.includes("auto");
}

/** Alterna una selección; «auto» es exclusivo y una elección concreta quita «auto». */
function alternar(
  medios: AjustesObjetivo["medios"],
  cambiar: (m: AjustesObjetivo["medios"]) => void,
  id: string,
): void {
  const quitar = medios.almacenamiento.filter((x) => x !== id);
  const siguiente = medios.almacenamiento.includes(id)
    ? quitar
    : id === "auto"
      ? ["auto"]
      : [...quitar.filter((x) => x !== "auto"), id];
  cambiar({ ...medios, almacenamiento: siguiente });
}

function ButtonAlmacen({
  etiqueta,
  activo,
  apagado = false,
  onToggle,
}: {
  etiqueta: string;
  activo: boolean;
  apagado?: boolean;
  onToggle: () => void;
}) {
  const estado = activo ? "default" : "outline";
  return (
    <Button
      type="button"
      size="sm"
      variant={estado}
      className="h-auto cursor-pointer whitespace-normal py-1.5"
      aria-pressed={activo}
      title={apagado ? `${etiqueta}: apagado en los destinos del cerebro` : etiqueta}
      onClick={onToggle}
    >
      {etiqueta}{apagado ? " · apagado" : ""}
    </Button>
  );
}
