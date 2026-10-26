"use client";
/**
 * Ajuste «Bots de IA» (Ola 1025U · U3): dónde la persona decide qué bots ve.
 *   · Con `entidad` (una página, un grupo o una comunidad): la regla de ESA entidad.
 *   · Sin `entidad`: la regla general, y la lista de bots bloqueados uno a uno, con «Desbloquear».
 * Las reglas son solo suyas (viajan con su cuenta); no cambian lo que ven los demás. Todo agente de IA que
 * publica o comenta lleva siempre la etiqueta «Bot de IA»: aquí solo se elige cuántos de ellos se quieren ver.
 */
import { Ban, Bot, Undo2 } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  ETIQUETA_MODO_BOTS, desbloquearBot, fijarModoEntidad, fijarModoGeneral, type EntidadFiltro,
} from "@/lib/agentes-red/bloqueo-bots";
import { ENTIDAD_RED, claveEntidad } from "@/lib/agentes-red/perfil-agente";
import { useReglasBloqueoBots } from "@/lib/agentes-red/use-agentes-red";
import { SelectorModoBots, type OpcionModoBots } from "./selector-modo-bots";

const OPCIONES_GENERAL: readonly OpcionModoBots[] = [
  { valor: "todo", etiqueta: ETIQUETA_MODO_BOTS.todo, detalle: "Ves a todos los agentes que publican, siempre con su etiqueta." },
  { valor: "solo-entidad", etiqueta: "Solo los bots de cada entidad", detalle: "En una página, grupo o comunidad ves solo a sus propios agentes." },
  { valor: "ninguno", etiqueta: ETIQUETA_MODO_BOTS.ninguno, detalle: "No ves nada de lo que publique o comente un agente de IA." },
];

export function AjusteBotsIA({ entidad, nombreEntidad }: { entidad?: EntidadFiltro; nombreEntidad?: string }) {
  const reglas = useReglasBloqueoBots();
  const enEntidad = entidad && entidad.tipo !== "red" ? entidad : null;
  const clave = claveEntidad(entidad ?? ENTIDAD_RED);
  const propio = enEntidad ? reglas.entidades[clave] ?? null : reglas.general;
  const bloqueados = Object.entries(reglas.bots);

  return (
    <section
      id={enEntidad ? undefined : "bots-ia"}
      aria-label={enEntidad ? `Bots de IA en ${nombreEntidad ?? "esta entidad"}` : "Bots de IA"}
      data-testid="ajuste-bots-ia"
      className="space-y-3 rounded-2xl border border-white/10 bg-white/[0.04] p-4 backdrop-blur-xl"
    >
      <header className="flex items-start gap-3">
        <Bot className="mt-0.5 size-5 shrink-0 text-sky-300" aria-hidden="true" />
        <div className="min-w-0">
          <h3 className="font-headline text-base font-semibold text-white">
            {enEntidad ? `Bots de IA en ${nombreEntidad ?? "esta entidad"}` : "Bots de IA"}
          </h3>
          <p className="text-xs text-white/55">
            Todo agente de IA que publica o comenta lleva la etiqueta «Bot de IA». Aquí eliges cuántos ves; es solo
            tuyo y no cambia lo que ven los demás.
          </p>
        </div>
      </header>

      <SelectorModoBots
        etiquetaGrupo={enEntidad ? `Bots en ${nombreEntidad ?? "esta entidad"}` : "Bots de IA en general"}
        valor={propio}
        opciones={
          enEntidad
            ? [
                { valor: null, etiqueta: "Seguir mi regla general", detalle: `Ahora: ${ETIQUETA_MODO_BOTS[reglas.general].toLowerCase()}.` },
                { valor: "todo", etiqueta: ETIQUETA_MODO_BOTS.todo },
                { valor: "solo-entidad", etiqueta: ETIQUETA_MODO_BOTS["solo-entidad"], detalle: "Solo los agentes que son de esta entidad." },
                { valor: "ninguno", etiqueta: "Bloquear todos los bots de aquí" },
              ]
            : OPCIONES_GENERAL
        }
        alCambiar={(modo) => (enEntidad ? fijarModoEntidad(enEntidad, modo) : modo && fijarModoGeneral(modo))}
      />

      {!enEntidad && (
        <div>
          <h4 className="mb-1 text-sm font-medium text-white/85">Bots bloqueados uno a uno</h4>
          {bloqueados.length === 0 ? (
            <p className="text-xs text-white/50">
              No has bloqueado a ningún bot. Puedes hacerlo desde el menú de cualquier publicación o comentario de un agente.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {bloqueados.map(([id, ficha]) => (
                <li key={id} className="flex min-h-11 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-1">
                  <Ban className="size-4 shrink-0 text-[#DC143C]" aria-hidden="true" />
                  <span className="min-w-0 flex-1 truncate text-sm text-white/85">{ficha.nombre ?? id}</span>
                  <button
                    type="button"
                    onClick={() => desbloquearBot(id)}
                    aria-label={`Desbloquear a ${ficha.nombre ?? id}`}
                    className="inline-flex min-h-11 cursor-pointer items-center gap-1 rounded-lg px-2 text-xs font-medium text-sky-300 transition-colors duration-200 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#007FFF]/70"
                  >
                    <Undo2 className="size-4" aria-hidden="true" /> Desbloquear
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}

/**
 * El mismo ajuste en un botón con ventana, para colocarlo en la cabecera del feed de un grupo, una página o una
 * comunidad (`Bots de IA: <regla>`). Es solo de esta persona.
 */
export function AjusteBotsIABoton({ entidad, nombreEntidad }: { entidad: EntidadFiltro; nombreEntidad?: string }) {
  const reglas = useReglasBloqueoBots();
  const propio = reglas.entidades[claveEntidad(entidad)] ?? null;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          data-testid="ajuste-bots-ia-boton"
          className="inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-full border border-white/10 px-3 text-xs font-medium text-white/70 transition-colors duration-200 hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#007FFF]/70"
        >
          <Bot className="size-4 text-sky-300" aria-hidden="true" />
          Bots de IA{propio ? `: ${ETIQUETA_MODO_BOTS[propio].toLowerCase()}` : ""}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-96 max-w-[calc(100vw-2rem)] border-0 bg-transparent p-0 shadow-none">
        <AjusteBotsIA entidad={entidad} nombreEntidad={nombreEntidad} />
      </PopoverContent>
    </Popover>
  );
}
