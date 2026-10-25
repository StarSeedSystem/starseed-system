"use client";

/**
 * Medios de un cerebro, una memoria o una carpeta (CB1013S, contrato §8):
 * qué servidor sirve cada capacidad y en qué destinos se guarda cada dato.
 * Controlado por props: enseña `valor` y avisa con `onCambio` / `onElegidos`; no guarda nada.
 * Cada sección lleva su marca de APLICACION; las purezas están en medios-puras.ts.
 */

import { APLICACION, CAPACIDADES, type AjustesObjetivo, type Capacidad } from "@/lib/cerebros/ajustes";
import { type DestinoMedios, type OpcionMedio } from "@/lib/cerebros/medios-puras";
import { Button } from "@/components/ui/button";
import { MarcaAplicacion } from "@/components/cerebro/ajustes-seguridad";

export type { DestinoMedios, OpcionMedio };

export interface AjustesMediosProps {
  valor: Pick<AjustesObjetivo, "medios">;
  onCambio: (parcial: Partial<AjustesObjetivo>) => void;
  nivel: "cerebro" | "memoria" | "carpeta";
  opciones: OpcionMedio[];
  destinos: DestinoMedios[];
  onElegidos: (ids: string[]) => void;
}

const SELECTOR = "h-9 rounded-md border border-white/15 bg-black/40 px-2 text-sm text-white cursor-pointer";

export function AjustesMedios({ valor, onCambio, nivel, opciones, destinos, onElegidos }: AjustesMediosProps) {
  const capacidades = Object.entries(CAPACIDADES) as [Capacidad, string][];
  const servidores = opciones.filter((o) => o.grupo === "servidor");
  const neuronas = opciones.filter((o) => o.grupo === "neurona");
  const elegidos = nivel === "cerebro" ? destinos.filter((d) => d.activo).map((d) => d.id) : valor.medios.almacenamiento;
  const alternarDestino = (id: string) => {
    const ids = elegidos.includes(id) ? elegidos.filter((x) => x !== id) : [...elegidos, id];
    if (nivel === "cerebro") onElegidos(ids);
    else onCambio({ medios: { ...valor.medios, almacenamiento: ids } });
  };
  const asignarServidor = (cap: Capacidad, siguiente: string) => {
    const capacidadesNuevas = { ...valor.medios.capacidades };
    if (siguiente === "auto") delete capacidadesNuevas[cap];
    else capacidadesNuevas[cap] = siguiente;
    onCambio({ medios: { ...valor.medios, capacidades: capacidadesNuevas } });
  };
  return (
    <section className="space-y-5 text-white" aria-label="Medios">
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-semibold">Servidor por capacidad</h3>
          <MarcaAplicacion estado={APLICACION["medios.capacidades"]} />
        </div>
        <p className="text-xs text-white/60">Qué atiende cada medio. «Automático» deja que el sistema elija por ti.</p>
        <div className="grid gap-2">
          {capacidades.map(([id, etiqueta]) => (
            <label key={id} className="flex flex-wrap items-center gap-2 text-sm">
              {etiqueta}
              <select aria-label={`Servidor de ${etiqueta.toLowerCase()}`} className={SELECTOR} value={valor.medios.capacidades[id] ?? "auto"} onChange={(e) => asignarServidor(id, e.target.value)}>
                <option value="auto">Automático</option>
                {servidores.length > 0 && (
                  <optgroup label="Servidores del cerebro">
                    {servidores.map((o) => <option key={o.id} value={o.id}>{o.texto}</option>)}
                  </optgroup>
                )}
                {neuronas.length > 0 && (
                  <optgroup label="Neuronas">
                    {neuronas.map((o) => <option key={o.id} value={o.id}>{o.texto}</option>)}
                  </optgroup>
                )}
              </select>
            </label>
          ))}
        </div>
      </div>
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-semibold">Dónde se guarda</h3>
          <MarcaAplicacion estado={nivel === "cerebro" ? APLICACION["medios.almacenamiento"] : "solo-se-guarda"} />
        </div>
        <p className="text-xs text-white/60">Los destinos de memoria de este cerebro. En el nivel cerebro se aplican al momento; en una memoria o carpeta se guarda por ahora.</p>
        <div className="flex flex-wrap gap-2">
          {destinos.map((d) => (
            <DestinoButton key={d.id} destino={d} seleccionado={elegidos.includes(d.id)} bloqueado={nivel === "cerebro" && d.fijo} onClick={() => alternarDestino(d.id)} />
          ))}
        </div>
        <ul className="space-y-1">
          {destinos.map((d) => <li key={d.id} className="text-xs leading-relaxed text-white/70">{d.explicacion}</li>)}
        </ul>
      </div>
    </section>
  );
}

function DestinoButton({ destino, seleccionado, bloqueado, onClick }: { destino: DestinoMedios; seleccionado: boolean; bloqueado: boolean; onClick: () => void }) {
  const titulo = bloqueado
    ? destino.id === "local" ? "El espejo local siempre está activo." : "Se quita en Destinos del cerebro."
    : destino.texto;
  return (
    <Button type="button" size="sm" variant={seleccionado ? "default" : "outline"} className="h-auto whitespace-normal py-1.5 cursor-pointer" aria-pressed={seleccionado} disabled={bloqueado} title={titulo} onClick={onClick}>
      {destino.texto}{destino.id === "local" ? (bloqueado ? " · siempre" : "") : destino.activo ? "" : " · apagado"}
    </Button>
  );
}
