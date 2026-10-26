"use client";

/**
 * Selector y gestor de escenarios del mundo (Ola 1025U · U1). Escenarios sin tope: crear, renombrar,
 * duplicar, borrar (con confirmación), visibilidad (privado, de un grupo o público) y zonas.
 *
 * Honestidad: hoy el escenario vive en ESTE aparato y nadie más lo ve. La interfaz lo dice, y enseña por
 * dónde viajaría al compartirse según `elegirTransporte` (el contrato único de las salas del OS).
 * Sin radix: lista y confirmación propias, con teclado (Escape cierra) y objetivos de 44 px.
 */
import { useEffect, useId, useMemo, useRef, useState, type FormEvent } from "react";
import { Check, ChevronDown, Copy, Globe2, Lock, Pencil, Plus, Trash2, Users, X, type LucideIcon } from "lucide-react";
import {
  ETIQUETA_AFINIDAD,
  ETIQUETA_VISIBILIDAD,
  MAX_ZONAS,
  VISIBILIDADES_ESCENARIO,
  transporteDeEscenario,
  type Escenario,
  type VisibilidadEscenario,
} from "@/lib/avatares/mundo/escenarios";
import { OCUPACIONES_MUNDO, type OcupacionMundo } from "@/lib/avatares/mundo/simulacion";
import type { EntidadMundo } from "@/lib/avatares/mundo/habitantes-cuenta";
import type { Alcanzabilidad, TransporteSala } from "@/lib/salas/sala";
import type { UsoEscenarios } from "./use-escenarios";

const ICONO_VISIBILIDAD: Record<VisibilidadEscenario, LucideIcon> = { privada: Lock, grupo: Users, publica: Globe2 };

const NOMBRE_TRANSPORTE: Record<TransporteSala, string> = {
  "servidor-publico": "un servidor público",
  "servidor-privado": "tu servidor privado",
  "malla-p2p": "la malla P2P",
  local: "solo este aparato",
};

const CLASE_BOTON =
  "inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center gap-2 rounded-full border border-white/15 bg-white/8 px-3 " +
  "text-xs font-bold text-white/85 transition duration-150 hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 " +
  "focus-visible:ring-[#007FFF] disabled:cursor-not-allowed disabled:opacity-45";
const CLASE_CAMPO =
  "min-h-11 w-full rounded-xl border border-white/15 bg-[#0b1020] px-3 text-sm text-white placeholder:text-white/40 " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#007FFF]";

export interface SelectorEscenarioProps {
  uso: UsoEscenarios;
  /** Grupos y páginas que gestiona la persona (para compartir un escenario con uno). */
  entidades: readonly EntidadMundo[];
  alcance: Alcanzabilidad;
}

function Seccion({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2 border-t border-white/10 pt-3 first:border-t-0 first:pt-0">
      <h3 className="font-headline text-[11px] font-bold uppercase tracking-[0.16em] text-white/55">{titulo}</h3>
      {children}
    </section>
  );
}

export function SelectorEscenario({ uso, entidades, alcance }: SelectorEscenarioProps) {
  const { almacen, activo } = uso;
  const [abierto, setAbierto] = useState(false);
  const raiz = useRef<HTMLDivElement>(null);
  const idPanel = useId();

  // Cierra con Escape o al pulsar fuera.
  useEffect(() => {
    if (!abierto) return;
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key === "Escape") setAbierto(false);
    };
    const alPulsar = (e: MouseEvent) => {
      if (raiz.current && !raiz.current.contains(e.target as Node)) setAbierto(false);
    };
    document.addEventListener("keydown", alTeclear);
    document.addEventListener("mousedown", alPulsar);
    return () => {
      document.removeEventListener("keydown", alTeclear);
      document.removeEventListener("mousedown", alPulsar);
    };
  }, [abierto]);

  const Icono = ICONO_VISIBILIDAD[activo.visibilidad];
  return (
    <div ref={raiz} className="relative w-full min-w-0 sm:w-auto">
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={abierto}
        aria-controls={idPanel}
        onClick={() => setAbierto((v) => !v)}
        data-testid="selector-escenario"
        className={CLASE_BOTON + " w-full justify-between sm:w-auto sm:min-w-[12rem]"}
      >
        <span className="inline-flex min-w-0 items-center gap-2">
          <Icono className="size-4 shrink-0 text-cyan-300" aria-hidden="true" />
          <span className="sr-only">Escenario: </span>
          <span className="truncate" data-testid="nombre-escenario-activo">{activo.nombre}</span>
        </span>
        <ChevronDown className={"size-4 shrink-0 transition-transform duration-200 " + (abierto ? "rotate-180" : "")} aria-hidden="true" />
      </button>

      {abierto && (
        <div
          id={idPanel}
          role="dialog"
          aria-label="Escenarios del mundo"
          data-testid="panel-escenarios"
          className="absolute left-0 top-full z-40 mt-2 flex max-h-[70vh] w-[min(24rem,calc(100vw-1rem))] flex-col gap-3 overflow-y-auto overscroll-contain rounded-2xl border border-white/15 bg-[rgba(8,12,24,0.88)] p-3 shadow-[0_18px_60px_rgba(0,0,0,0.55)] backdrop-blur-2xl"
        >
          <Seccion titulo={`Tus escenarios · ${almacen.escenarios.length}`}>
            <ul className="flex flex-col gap-1" role="list">
              {almacen.escenarios.map((e) => {
                const EIcono = ICONO_VISIBILIDAD[e.visibilidad];
                const esActivo = e.id === activo.id;
                return (
                  <li key={e.id}>
                    <button
                      type="button"
                      aria-current={esActivo ? "true" : undefined}
                      onClick={() => uso.elegir(e.id)}
                      data-testid="opcion-escenario"
                      className={
                        "flex min-h-11 w-full cursor-pointer items-center gap-2 rounded-xl px-3 text-left text-sm transition duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#007FFF] " +
                        (esActivo ? "bg-violet-500/25 text-white" : "text-white/80 hover:bg-white/10")
                      }
                    >
                      <EIcono className="size-4 shrink-0 text-cyan-300" aria-hidden="true" />
                      <span className="min-w-0 flex-1 truncate font-semibold">{e.nombre}</span>
                      <span className="shrink-0 text-[10px] uppercase tracking-wider text-white/50">{ETIQUETA_VISIBILIDAD[e.visibilidad]}</span>
                      {esActivo && <Check className="size-4 shrink-0 text-[#39FF14]" aria-hidden="true" />}
                    </button>
                  </li>
                );
              })}
            </ul>
          </Seccion>

          <GestionActivo key={activo.id} uso={uso} activo={activo} entidades={entidades} alcance={alcance} />
          <NuevoEscenario uso={uso} entidades={entidades} />

          {uso.aviso && (
            <p role="alert" data-testid="aviso-escenarios" className="rounded-xl border border-[#DC143C]/40 bg-[#DC143C]/15 px-3 py-2 text-xs text-[#ffd0d9]">
              {uso.aviso}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/* ───────────────────────────── El escenario activo ───────────────────────────── */

function GestionActivo({ uso, activo, entidades, alcance }: { uso: UsoEscenarios; activo: Escenario; entidades: readonly EntidadMundo[]; alcance: Alcanzabilidad }) {
  const [renombrando, setRenombrando] = useState(false);
  const [nombre, setNombre] = useState(activo.nombre);
  const [confirmando, setConfirmando] = useState(false);
  const unico = uso.almacen.escenarios.length <= 1;
  const camino = useMemo(() => transporteDeEscenario(activo, alcance), [activo, alcance]);

  const guardarNombre = (e: FormEvent) => {
    e.preventDefault();
    if (uso.renombrar(activo.id, nombre).ok) setRenombrando(false);
  };

  const pedirVisibilidad = (v: VisibilidadEscenario) => {
    if (v === "grupo") {
      const grupo = activo.grupoId ?? entidades[0]?.id;
      if (!grupo) return; // sin grupos que elegir, el aviso de abajo lo explica
      uso.cambiarVisibilidad(activo.id, "grupo", grupo);
      return;
    }
    uso.cambiarVisibilidad(activo.id, v);
  };

  return (
    <>
      <Seccion titulo="Este escenario">
        {renombrando ? (
          <form onSubmit={guardarNombre} className="flex gap-2">
            <label className="sr-only" htmlFor="nombre-escenario">Nombre del escenario</label>
            <input id="nombre-escenario" value={nombre} onChange={(e) => setNombre(e.target.value)} maxLength={60} className={CLASE_CAMPO} autoFocus />
            <button type="submit" className={CLASE_BOTON} aria-label="Guardar el nombre"><Check className="size-4" aria-hidden="true" /></button>
            <button type="button" className={CLASE_BOTON} aria-label="Cancelar" onClick={() => { setRenombrando(false); setNombre(activo.nombre); }}><X className="size-4" aria-hidden="true" /></button>
          </form>
        ) : (
          <div className="flex flex-wrap gap-2">
            <button type="button" className={CLASE_BOTON} onClick={() => { setNombre(activo.nombre); setRenombrando(true); }}>
              <Pencil className="size-4" aria-hidden="true" /> Renombrar
            </button>
            <button type="button" className={CLASE_BOTON} onClick={() => uso.duplicar(activo.id)}>
              <Copy className="size-4" aria-hidden="true" /> Duplicar
            </button>
            <button type="button" className={CLASE_BOTON + " text-[#ffb3c1]"} disabled={unico} title={unico ? "Debe quedar al menos un escenario" : undefined} onClick={() => setConfirmando(true)}>
              <Trash2 className="size-4" aria-hidden="true" /> Borrar
            </button>
          </div>
        )}
        {confirmando && (
          <div role="alertdialog" aria-label="Confirmar el borrado" data-testid="confirmar-borrado" className="flex flex-col gap-2 rounded-xl border border-[#DC143C]/40 bg-[#DC143C]/12 p-3">
            <p className="text-xs text-white/85">¿Borrar «{activo.nombre}»? También se olvida su mundo guardado en este aparato. No se puede deshacer.</p>
            <div className="flex gap-2">
              <button type="button" className={CLASE_BOTON} onClick={() => setConfirmando(false)}>Cancelar</button>
              <button type="button" className={CLASE_BOTON + " border-[#DC143C]/60 bg-[#DC143C]/30 text-white"} onClick={() => { uso.borrar(activo.id, true); setConfirmando(false); }}>
                Sí, borrar
              </button>
            </div>
          </div>
        )}
      </Seccion>

      <Seccion titulo="Quién lo ve">
        <div role="radiogroup" aria-label="Visibilidad del escenario" className="grid grid-cols-3 gap-1">
          {VISIBILIDADES_ESCENARIO.map((v) => {
            const VIcono = ICONO_VISIBILIDAD[v];
            const marcado = activo.visibilidad === v;
            return (
              <button
                key={v}
                type="button"
                role="radio"
                aria-checked={marcado}
                onClick={() => pedirVisibilidad(v)}
                className={
                  "flex min-h-11 cursor-pointer flex-col items-center justify-center gap-0.5 rounded-xl border px-1 py-1 text-[11px] font-bold transition duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#007FFF] " +
                  (marcado ? "border-cyan-300/60 bg-cyan-400/20 text-cyan-50" : "border-white/10 text-white/70 hover:bg-white/10")
                }
              >
                <VIcono className="size-4" aria-hidden="true" />
                {ETIQUETA_VISIBILIDAD[v]}
              </button>
            );
          })}
        </div>
        {activo.visibilidad === "grupo" && (
          <div className="flex flex-col gap-1">
            <label className="text-xs text-white/65" htmlFor="grupo-escenario">Se comparte con</label>
            <select
              id="grupo-escenario"
              className={CLASE_CAMPO}
              value={activo.grupoId ?? ""}
              onChange={(e) => uso.cambiarVisibilidad(activo.id, "grupo", e.target.value)}
            >
              {entidades.map((en) => (
                <option key={en.id} value={en.id}>{en.tipo === "pagina" ? "Página" : "Grupo"} · {en.nombre}</option>
              ))}
            </select>
          </div>
        )}
        {entidades.length === 0 && (
          <p className="text-xs text-white/60" data-testid="sin-grupos">
            «De un grupo» se activa cuando gestionas un grupo o una página. Hoy no hay ninguno que leer en esta cuenta.
          </p>
        )}
        {activo.visibilidad === "publica" && (
          <p className="text-xs text-white/70">En un escenario público solo viven agentes de grupos y páginas. Tus personalidades personales nunca salen de tu cuenta.</p>
        )}
        <p className="text-xs text-white/65" data-testid="camino-escenario">
          Ahora mismo no se comparte con nadie: este escenario vive en este aparato. Al compartirlo viajaría por {NOMBRE_TRANSPORTE[camino.transporte]}. {camino.motivo}
        </p>
      </Seccion>

      <ZonasEscenario uso={uso} activo={activo} />
    </>
  );
}

/* ───────────────────────────── Zonas ───────────────────────────── */

function ZonasEscenario({ uso, activo }: { uso: UsoEscenarios; activo: Escenario }) {
  const [nombre, setNombre] = useState("");
  const [afinidad, setAfinidad] = useState<OcupacionMundo | "">("");
  const lleno = activo.zonas.length >= MAX_ZONAS;

  const agregar = (e: FormEvent) => {
    e.preventDefault();
    if (uso.agregarZona(activo.id, nombre, afinidad || null).ok) {
      setNombre("");
      setAfinidad("");
    }
  };

  return (
    <Seccion titulo={`Zonas · ${activo.zonas.length}`}>
      <ul className="flex flex-wrap gap-1.5" role="list">
        {activo.zonas.map((z) => (
          <li key={z.id} className="inline-flex min-h-11 items-center gap-1 rounded-full border border-white/12 bg-white/6 pl-3 pr-1 text-xs text-white/85" data-testid="zona-escenario">
            <span className="truncate">{z.nombre}</span>
            {z.afinidad && <span className="text-[10px] uppercase tracking-wider text-white/45">{ETIQUETA_AFINIDAD[z.afinidad]}</span>}
            <button
              type="button"
              aria-label={`Quitar la zona ${z.nombre}`}
              disabled={activo.zonas.length <= 1}
              onClick={() => uso.quitarZona(activo.id, z.id)}
              className="inline-flex size-9 cursor-pointer items-center justify-center rounded-full text-white/60 transition duration-150 hover:bg-white/12 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#007FFF] disabled:cursor-not-allowed disabled:opacity-40"
            >
              <X className="size-3.5" aria-hidden="true" />
            </button>
          </li>
        ))}
      </ul>
      <form onSubmit={agregar} className="flex flex-col gap-2">
        <label className="sr-only" htmlFor="zona-nombre">Nombre de la zona nueva</label>
        <input id="zona-nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Zona nueva" maxLength={60} className={CLASE_CAMPO} disabled={lleno} />
        <div className="flex gap-2">
          <label className="sr-only" htmlFor="zona-afinidad">Qué atrae a la zona</label>
          <select id="zona-afinidad" value={afinidad} onChange={(e) => setAfinidad(e.target.value as OcupacionMundo | "")} className={CLASE_CAMPO} disabled={lleno}>
            <option value="">Sin afinidad</option>
            {OCUPACIONES_MUNDO.map((o) => (
              <option key={o} value={o}>Atrae a quien va a {ETIQUETA_AFINIDAD[o].toLowerCase()}</option>
            ))}
          </select>
          <button type="submit" className={CLASE_BOTON} disabled={lleno || !nombre.trim()} aria-label="Añadir la zona">
            <Plus className="size-4" aria-hidden="true" />
          </button>
        </div>
        {lleno && <p className="text-xs text-white/60">Un escenario admite hasta {MAX_ZONAS} zonas.</p>}
      </form>
    </Seccion>
  );
}

/* ───────────────────────────── Escenario nuevo ───────────────────────────── */

function NuevoEscenario({ uso, entidades }: { uso: UsoEscenarios; entidades: readonly EntidadMundo[] }) {
  const [nombre, setNombre] = useState("");
  const [visibilidad, setVisibilidad] = useState<VisibilidadEscenario>("privada");
  const [grupoId, setGrupoId] = useState("");
  const grupo = grupoId || entidades[0]?.id || "";

  const crear = (e: FormEvent) => {
    e.preventDefault();
    const r = uso.crear({ nombre, visibilidad, ...(visibilidad === "grupo" ? { grupoId: grupo } : {}) });
    if (r.ok) {
      setNombre("");
      setVisibilidad("privada");
    }
  };

  return (
    <Seccion titulo="Escenario nuevo">
      <form onSubmit={crear} className="flex flex-col gap-2">
        <label className="sr-only" htmlFor="escenario-nuevo">Nombre del escenario nuevo</label>
        <input id="escenario-nuevo" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Nombre del escenario" maxLength={60} className={CLASE_CAMPO} />
        <div className="flex gap-2">
          <label className="sr-only" htmlFor="escenario-nuevo-vis">Visibilidad del escenario nuevo</label>
          <select id="escenario-nuevo-vis" value={visibilidad} onChange={(e) => setVisibilidad(e.target.value as VisibilidadEscenario)} className={CLASE_CAMPO}>
            {VISIBILIDADES_ESCENARIO.map((v) => (
              <option key={v} value={v} disabled={v === "grupo" && entidades.length === 0}>{ETIQUETA_VISIBILIDAD[v]}</option>
            ))}
          </select>
          <button type="submit" className={CLASE_BOTON + " shrink-0"} disabled={!nombre.trim()}>
            <Plus className="size-4" aria-hidden="true" /> Crear
          </button>
        </div>
        {visibilidad === "grupo" && entidades.length > 0 && (
          <>
            <label className="sr-only" htmlFor="escenario-nuevo-grupo">Grupo del escenario nuevo</label>
            <select id="escenario-nuevo-grupo" value={grupo} onChange={(e) => setGrupoId(e.target.value)} className={CLASE_CAMPO}>
              {entidades.map((en) => (
                <option key={en.id} value={en.id}>{en.tipo === "pagina" ? "Página" : "Grupo"} · {en.nombre}</option>
              ))}
            </select>
          </>
        )}
      </form>
    </Seccion>
  );
}
