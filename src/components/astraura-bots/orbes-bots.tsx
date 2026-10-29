"use client";
/**
 * Orbes hermanas de los bots (BOT1011C1/C2 · contrato §3.3).
 * Conecta `orbes.ts` (puro) con la interfaz del OS: cada bot abierto es una
 * orbe hermana, posiciones por bot (`disposicionOrbes`), sin solaparse,
 * máximo 5 visibles (`MAX_ORBES_VISIBLES`), el resto en «más».
 * El predeterminado no se pinta (su cuerpo ES la orbe de `AuroraWidget`); el resto se abre en «Mis bots».
 */
import { Fragment, useEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import { MoreHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import { QuantumOrbAvatar } from "@/components/aurora/quantum-orb-avatar";
import { prefersReducedMotion } from "@/components/aurora/quantum-orb";
import { readOrbPosition } from "@/lib/aurora/aurora-orb-bus";
import { uidActual } from "@/lib/consumo/usuario";
import { leerBots, suscribirBots } from "@/lib/astraura-bots/adaptadores/almacen-bots";
import { EVENTO_BUCLE_UI, type DetalleBucleUI } from "@/lib/astraura-bots/adaptadores/evento-bucle-ui";
import { avanzar, bucleInicial, indicadorVisible, type EstadoBucle, type EventoBucle } from "@/lib/astraura-bots/bucle";
import type { Bot } from "@/lib/astraura-bots/tipos";
import { DIAMETRO_ANILLO, IndicadorSentidos } from "./indicador-sentidos";
import { TarjetaPropuesta } from "./tarjeta-propuesta";
import { RegistroBot } from "./registro-bot";
import {
  MAX_ORBES_VISIBLES,
  disposicionOrbes,
  ordenZ,
  type EntradaOrbe,
  type PosOrbe,
  type VistaOrbes,
  type ResultadoOrbe,
} from "@/lib/astraura-bots/orbes";

export { MAX_ORBES_VISIBLES, disposicionOrbes, ordenZ };

export interface OrbesBotConfig {
  id: string;
  principal?: boolean;
  pos?: PosOrbe;
}

export function layoutOrbesBot(
  abiertos: readonly OrbesBotConfig[],
  vista: VistaOrbes,
): ResultadoOrbe[] {
  return disposicionOrbes(abiertos.map((o) => ({
    id: o.id,
    principal: o.principal,
    pos: o.pos,
  })), vista);
}

/** Posiciones por bot `{ version: 1, posiciones }`; abiertas = mapa y aviso del panel «Mis bots» (`"1"`). */
export const CLAVE_ORBES = "starseed.astraura.bots.orbes.v1", EVENTO_ENFOCADO = "starseed:astraura-bot-enfocado";
const CLAVE_ABIERTOS = "starseed.astraura.orbes-abiertos", EVENTO_ABRIR = "starseed:orbe-bot";
const D = 48, UMBRAL = 6, SIN_EXTRA: readonly Bot[] = [], acotar01 = (n: number) => Math.min(1, Math.max(0, n));
function leerMapa(clave: string): Record<string, unknown> {
  let v: unknown = null;
  try { v = JSON.parse(window.localStorage.getItem(clave) ?? "{}"); } catch { /* ilegible o bloqueado: vacío */ }
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}
/** Posiciones guardadas; lo mal formado (también una lista de otro formato) se descarta. */
export function leerPosiciones(): Record<string, PosOrbe> {
  const crudo = leerMapa(CLAVE_ORBES).posiciones, res: Record<string, PosOrbe> = {};
  for (const [id, p] of Object.entries(crudo && typeof crudo === "object" && !Array.isArray(crudo) ? crudo : {})) {
    const { xRatio: x, yRatio: y } = (p ?? {}) as Partial<PosOrbe>;
    if (Number.isFinite(x) && Number.isFinite(y)) res[id] = { xRatio: acotar01(Number(x)), yRatio: acotar01(Number(y)) };
  }
  return res;
}
export function guardarPosicion(id: string, pos: PosOrbe): void {
  const valor = JSON.stringify({ version: 1, posiciones: { ...leerPosiciones(), [id]: pos } });
  try { window.localStorage.setItem(CLAVE_ORBES, valor); } catch { /* bloqueado: queda donde se soltó, solo esta sesión */ }
}
/** `extra`: bots de entidad ya abiertos (BOT1011Y) · `principal`: posición de la orbe de `AuroraWidget` (sin ella, la guardada). */
export interface OrbesBotsProps { extra?: readonly Bot[]; principal?: PosOrbe; perfilId?: string; cuentaId?: string }
export function OrbesBots({ extra = SIN_EXTRA, principal, perfilId, cuentaId }: OrbesBotsProps) {
  const [ids, setIds] = useState(perfilId ? { perfil: perfilId, cuenta: cuentaId ?? perfilId } : null);
  const [datos, setDatos] = useState<{ bots: Bot[]; abiertos: Record<string, unknown>; pos: Record<string, PosOrbe> }>({ bots: [], abiertos: {}, pos: {} });
  const [vista, setVista] = useState({ ancho: 0, alto: 0 });
  const [enfocado, setEnfocado] = useState(""), [delante, setDelante] = useState<string[]>([]);
  const [moviendo, setMoviendo] = useState<{ id: string; pos: PosOrbe } | null>(null);
  const arrastre = useRef<{ id: string; x0: number; y0: number; movido: boolean } | null>(null);
  const [bucle, setBucle] = useState<Record<string, EstadoBucle>>({});
  const reducido = useMemo(() => prefersReducedMotion(), []);
  // El puente de sentidos (BOT1011F) avisa de cada paso del bucle: el anillo vive en la orbe (BOT1011E2).
  useEffect(() => {
    const alBucle = (e: Event) => {
      const d = (e as CustomEvent<Partial<DetalleBucleUI> | null>).detail;
      if (!d || typeof d.botId !== "string" || !d.evento) return;
      const botId = d.botId, evento = d.evento;
      setBucle((s) => ({ ...s, [botId]: avanzar(s[botId] ?? bucleInicial(botId), evento) }));
    };
    window.addEventListener(EVENTO_BUCLE_UI, alBucle);
    return () => window.removeEventListener(EVENTO_BUCLE_UI, alBucle);
  }, []);
  const moverBucle = (botId: string, evento: EventoBucle) => {
    try { window.dispatchEvent(new CustomEvent(EVENTO_BUCLE_UI, { detail: { botId, evento } })); } catch { /* sin orbes */ }
  };
  useEffect(() => {
    const fijar = (u: string | null) => setIds({ perfil: u ?? "local", cuenta: u ?? "local" }); // sin sesión: esta neurona
    if (!ids) { uidActual().then(fijar, () => fijar(null)); return; }
    const leer = () => setDatos({ bots: leerBots(ids.perfil, ids.cuenta), abiertos: leerMapa(CLAVE_ABIERTOS), pos: leerPosiciones() });
    const medir = () => setVista({ ancho: window.innerWidth, alto: window.innerHeight });
    const alAbrir = (e: Event) => { // el panel avisa antes de guardar su mapa: manda el detalle del evento
      const d = (e as CustomEvent<{ id?: unknown; abierto?: unknown } | null>).detail, id = d?.id;
      if (typeof id === "string") setDatos((s) => ({ ...s, abiertos: { ...s.abiertos, [id]: d?.abierto ? "1" : "" } }));
    };
    leer(); medir();
    const quitar = suscribirBots(leer), oyentes: [string, (e: Event) => void][] = [[EVENTO_ABRIR, alAbrir], ["storage", leer], ["resize", medir]];
    for (const [n, f] of oyentes) window.addEventListener(n, f);
    return () => { quitar(); for (const [n, f] of oyentes) window.removeEventListener(n, f); };
  }, [ids]);
  const idPred = ids ? `astraura:${ids.perfil}` : "";
  const cuenta = ids ? ids.cuenta : "local"; // quien confirma, rechaza o deshace: la de esta neurona

  const { xRatio: bx, yRatio: by } = principal ?? readOrbPosition();
  const otros = useMemo(() => {
    const propios = datos.bots.filter((b) => b.id !== idPred && datos.abiertos[b.id] === "1");
    const rango = (id: string) => (delante.includes(id) ? delante.indexOf(id) : delante.length);
    return [...propios, ...extra.filter((b) => b.id !== idPred && !propios.some((p) => p.id === b.id))]
      .filter((b) => b.activo).sort((a, b) => rango(a.id) - rango(b.id));
  }, [datos, extra, delante, idPred]);
  const disposicion = useMemo(() => {
    if (!ids || !vista.ancho || otros.length === 0) return [];
    const entradas: EntradaOrbe[] = [{ id: idPred, principal: true, pos: { xRatio: bx, yRatio: by } }, ...otros.map((b) => ({ id: b.id, pos: datos.pos[b.id] }))];
    return layoutOrbesBot(entradas, { ...vista, diametro: D }).filter((r) => r.id !== idPred);
  }, [ids, otros, datos.pos, vista, idPred, bx, by]);
  if (disposicion.length === 0) return null;
  const visibles = disposicion.filter((r) => r.visible), ocultas = disposicion.filter((r) => !r.visible);
  const porId = new Map(otros.map((b) => [b.id, b])), capas = ordenZ(visibles.map((r) => r.id), enfocado);
  const aRatio = (e: PointerEvent): PosOrbe => ({ xRatio: acotar01(e.clientX / vista.ancho), yRatio: acotar01(e.clientY / vista.alto) });
  const enfocar = (id: string, desdeMas = false) => {
    setEnfocado(id); // si viene de «más», pasa delante para colarse entre las visibles
    if (desdeMas) setDelante((d) => [id, ...d.filter((x) => x !== id)]);
    try { window.dispatchEvent(new CustomEvent(EVENTO_ENFOCADO, { detail: { id } })); } catch { /* sin observadores */ }
  };
  const alMover = (e: PointerEvent) => {
    const a = arrastre.current;
    if (a && (a.movido || Math.hypot(e.clientX - a.x0, e.clientY - a.y0) >= UMBRAL)) { a.movido = true; setMoviendo({ id: a.id, pos: aRatio(e) }); }
  };
  const alSoltar = (e: PointerEvent) => { // soltar sin arrastre = tocar
    const a = arrastre.current, pos = aRatio(e);
    arrastre.current = null; setMoviendo(null);
    if (a && !a.movido) enfocar(a.id);
    else if (a) { setDatos((s) => ({ ...s, pos: { ...s.pos, [a.id]: pos } })); guardarPosicion(a.id, pos); }
  };
  const lado = (r: number) => (r > 0.5 ? -46 : 46), transicion = reducido ? "none" : "left 200ms ease-out, top 200ms ease-out, transform 200ms ease-out";
  return (
    <>
      {visibles.map(({ id, pos }) => {
        const b = porId.get(id), p = moviendo?.id === id ? moviendo.pos : pos, est = bucle[id];
        return b ? (
          <Fragment key={id}>
            <button type="button" aria-label={`Orbe de ${b.nombre}`} aria-pressed={enfocado === id} data-bot-id={id}
              title={`${b.nombre} · toca para enfocarlo, arrastra para moverlo`}
              onPointerDown={(e) => { arrastre.current = { id, x0: e.clientX, y0: e.clientY, movido: false }; try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* sin captura */ } }}
              onPointerMove={alMover} onPointerUp={alSoltar} onPointerCancel={() => { arrastre.current = null; setMoviendo(null); }}
              onClick={(e) => { if (e.detail === 0) enfocar(id); }}
              className={cn("fixed cursor-pointer touch-none select-none rounded-full", !reducido && "hover:scale-105", enfocado === id && "ring-2 ring-cyan-300/70")}
              style={{ left: p.xRatio * vista.ancho - D / 2, top: p.yRatio * vista.alto - D / 2, zIndex: 41 + capas.indexOf(id), transition: moviendo?.id === id ? "none" : transicion }}>
              <QuantumOrbAvatar personaId={b.id} size={D} />
            </button>
            {est && est.fase === "esperando" && est.pendiente ? (
              <TarjetaPropuesta bot={b} estado={est} quien={cuenta} pos={p}
                onConfirmar={(q) => moverBucle(id, { tipo: "confirmar", quien: q, at: Date.now() })}
                onRechazar={(q) => moverBucle(id, { tipo: "rechazar", quien: q, at: Date.now() })}
                onApagarSentido={(sentido) => moverBucle(id, { tipo: "soltar", sentido, at: Date.now() })}
                onPausarBot={() => moverBucle(id, { tipo: "pausar", quien: "persona", at: Date.now() })} />
            ) : est && indicadorVisible(est) ? (
              <div data-anillo-bot={id} className="pointer-events-none fixed" style={{ left: p.xRatio * vista.ancho - DIAMETRO_ANILLO / 2, top: p.yRatio * vista.alto - DIAMETRO_ANILLO / 2, width: DIAMETRO_ANILLO, height: DIAMETRO_ANILLO, zIndex: 41 + capas.indexOf(id) }}>
                <IndicadorSentidos estado={est} nombreBot={b.nombre}
                  onApagarSentido={(sentido) => moverBucle(id, { tipo: "soltar", sentido, at: Date.now() })}
                  onPausarBot={() => moverBucle(id, { tipo: "pausar", quien: "persona", at: Date.now() })} />
              </div>
            ) : null}
            {enfocado === id && est && est.registro.length > 0 && (
              <div className="fixed bottom-6 right-6 z-50 w-72 max-h-64 overflow-y-auto">
                <RegistroBot estado={est} nombreBot={b.nombre} quien={cuenta}
                  onDeshacer={(q) => moverBucle(id, { tipo: "deshacer", quien: q, at: Date.now() })} />
              </div>
            )}
          </Fragment>
        ) : null;
      })}
      {ocultas.length > 0 && (
        <label title="Más bots" style={{ left: bx * vista.ancho + lado(bx) - 14, top: by * vista.alto + lado(by) - 14 }}
          className="fixed z-[49] grid h-7 w-7 cursor-pointer place-items-center rounded-full border border-white/20 bg-zinc-950/80 text-white/80 transition-colors duration-200 hover:bg-zinc-800">
          <MoreHorizontal className="h-4 w-4" aria-hidden />
          <select aria-label={`Más bots (${ocultas.length} sin mostrar)`} value="" onChange={(e) => enfocar(e.target.value, true)} className="absolute inset-0 cursor-pointer opacity-0">
            <option value="" disabled>Bots ocultos</option>
            {ocultas.map(({ id }) => <option key={id} value={id}>{porId.get(id)?.nombre}</option>)}
          </select>
        </label>
      )}
    </>
  );
}
