"use client";

/**
 * Resumen compacto del gobierno de la Protomolécula (Ola 1026P · P2), para la pestaña «Gobierno» de la ventana de la
 * orbe. Dice, en lenguaje claro, quién ve la Protomolécula del lugar donde estás, cómo se decide cada tipo de cambio
 * y qué puedes hacer TÚ con tu rol. No edita nada: las reglas se cambian en los ajustes de la entidad (enlace al final).
 *
 * Ligero a propósito (la orbe puede colgar del layout raíz): no importa el compositor de propuestas ni el motor de
 * gobernanza; lo pesado se carga a demanda en `entorno.ts`.
 */
import Link from "next/link";
import { ArrowUpRight, Globe, Lock, ShieldCheck, Users } from "lucide-react";
import { permisosDelActor } from "@/lib/protomolecula/gobierno/decision";
import type { ServiciosGobierno } from "@/lib/protomolecula/gobierno/entorno";
import {
  ARTICULO_ENTIDAD, ETIQUETA_NIVEL, ETIQUETA_TIPO, ETIQUETA_VISIBILIDAD, reglasPorDefecto, type VisibilidadProto,
} from "@/lib/protomolecula/gobierno/reglas";
import { TIPOS_CAMBIO_PROTO, type ContextoProto } from "@/lib/protomolecula/peticion/contrato";
import { COLOR_DECISION, ETIQUETA_DECISION, ICONO_DECISION, ICONO_TIPO } from "./etiquetas-gobierno";
import { useGobiernoProto } from "./use-gobierno-proto";

const ICONO_VISIBILIDAD: Record<VisibilidadProto, typeof Lock> = { privada: Lock, miembros: Users, publica: Globe };

export interface PropsGobiernoProtoResumen {
  contexto: ContextoProto;
  servicios?: Partial<ServiciosGobierno>;
  className?: string;
  /** Reloj, para las pruebas. */
  ahora?: number;
}

/** Dónde se cambian las reglas de cada entidad: las rutas que existen (`/grupo/[slug]`, `/pagina/[slug]`). */
function rutaDeAjustes(tipo: "grupo" | "comunidad" | "pagina", id: string): string {
  return `/${tipo === "pagina" ? "pagina" : "grupo"}/${encodeURIComponent(id)}`;
}

export function GobiernoProtoResumen({ contexto, servicios, className, ahora }: PropsGobiernoProtoResumen) {
  const g = useGobiernoProto(contexto, servicios);
  const reloj = ahora ?? Date.now();

  if (!g.entidad) {
    return (
      <section aria-label="Gobierno de la Protomolécula" className={`space-y-2 rounded-xl border border-white/10 bg-black/20 p-3 ${className ?? ""}`} data-testid="gobierno-resumen-personal">
        <h4 className="flex items-center gap-2 text-sm font-semibold text-white/90">
          <ShieldCheck className="h-4 w-4 text-cyan-300" aria-hidden /> Gobierno de la Protomolécula
        </h4>
        <p className="text-xs text-white/70">
          Aquí no hay un grupo, una comunidad ni una página que decida: lo que cambias es tuyo y lo aplicas tú. Las reglas compartidas viven en los ajustes de cada grupo, comunidad o página.
        </p>
        <p className="text-[11px] text-white/50">Lo personal es siempre de su dueña o dueño. Ninguna IA aprueba sola un cambio: siempre te pide confirmación.</p>
      </section>
    );
  }

  const reglas = g.reglasGuardadas ?? reglasPorDefecto(g.entidad.tipo, g.modoGobierno);
  const yo = g.actor("humano");
  const IconoVisibilidad = ICONO_VISIBILIDAD[reglas.visibilidad];
  const misPermisos = permisosDelActor(reglas, yo, reloj);
  const nombre = g.entidad.nombre ?? "esta entidad";

  return (
    <section aria-label="Gobierno de la Protomolécula" className={`space-y-3 rounded-xl border border-white/10 bg-black/20 p-3 ${className ?? ""}`} data-testid="gobierno-resumen">
      <header className="space-y-1">
        <h4 className="flex items-center gap-2 text-sm font-semibold text-white/90">
          <ShieldCheck className="h-4 w-4 text-cyan-300" aria-hidden /> Protomolécula {ARTICULO_ENTIDAD[g.entidad.tipo]}
        </h4>
        <p className="truncate text-xs text-white/60">{nombre}</p>
      </header>

      {g.cargando ? (
        <p className="text-xs text-white/55" role="status">Leyendo las reglas…</p>
      ) : (
        <>
          <ul className="flex flex-wrap gap-1.5 text-[11px]" aria-label="Resumen de reglas">
            <li className="inline-flex min-h-8 items-center gap-1 rounded-full border border-white/15 bg-white/5 px-2.5 text-white/85" data-testid="chip-visibilidad">
              <IconoVisibilidad className="h-3.5 w-3.5" aria-hidden /> {ETIQUETA_VISIBILIDAD[reglas.visibilidad]}
            </li>
            <li className="inline-flex min-h-8 items-center rounded-full border border-white/15 bg-white/5 px-2.5 text-white/85">
              Gobierno {g.modoGobierno === "hierarchical" ? "jerárquico" : "democrático"}
            </li>
            <li className="inline-flex min-h-8 items-center rounded-full border border-white/15 bg-white/5 px-2.5 text-white/85" data-testid="chip-origen">
              {g.origen === "cuenta" ? "Reglas propias" : g.origen === "aparato" ? "Reglas solo en este aparato" : "Reglas del OS"}
            </li>
          </ul>

          <p className="text-[11px] text-white/60" data-testid="resumen-acceso">
            Abrirla: {ETIQUETA_NIVEL[reglas.acceso.abrir].toLowerCase()} · Usarla: {ETIQUETA_NIVEL[reglas.acceso.usar].toLowerCase()}.
          </p>

          <ul className="space-y-1.5" aria-label="Qué puedes hacer tú con cada tipo de cambio">
            {TIPOS_CAMBIO_PROTO.map((t) => {
              const v = g.decidir(t, "humano");
              const Icono = ICONO_TIPO[t];
              const IconoDecision = ICONO_DECISION[v.decision];
              return (
                <li key={t} className="flex items-center justify-between gap-2 text-xs" data-testid={`resumen-${t}`}>
                  <span className="flex min-w-0 items-center gap-1.5 text-white/80">
                    <Icono className="h-3.5 w-3.5 shrink-0 text-white/60" aria-hidden />
                    <span className="truncate">{ETIQUETA_TIPO[t]}</span>
                  </span>
                  <span className={`inline-flex min-h-8 shrink-0 items-center gap-1 rounded-full border px-2.5 text-[11px] ${COLOR_DECISION[v.decision]}`} title={v.motivo}>
                    <IconoDecision className="h-3.5 w-3.5" aria-hidden /> {ETIQUETA_DECISION[v.decision]}
                  </span>
                </li>
              );
            })}
          </ul>

          <p className="text-[11px] text-white/55" data-testid="resumen-yo">
            {g.persona?.sesion
              ? g.persona.esDueno
                ? "Tu papel: dueña o dueño."
                : g.persona.rol
                  ? `Tu papel: ${g.persona.rol}.`
                  : "No formas parte de esta entidad."
              : "Sin sesión: inicia sesión para proponer o votar."}
            {misPermisos.length > 0 ? ` Tienes ${misPermisos.length === 1 ? "un permiso directo" : `${misPermisos.length} permisos directos`}; cada uso queda anotado.` : ""}
          </p>

          <Link
            href={rutaDeAjustes(g.entidad.tipo, g.entidad.id)}
            className="inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-lg border border-white/15 px-3 text-sm text-cyan-200 transition-colors duration-200 hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300 motion-reduce:transition-none"
          >
            Ver y cambiar las reglas <ArrowUpRight className="h-4 w-4" aria-hidden />
          </Link>
        </>
      )}
    </section>
  );
}

export default GobiernoProtoResumen;
