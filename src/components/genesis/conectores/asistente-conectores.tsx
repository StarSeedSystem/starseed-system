"use client";
/** GENESIS · ASISTENTE «CONECTAR GENESIS» (Ola 1019G · GCA1019M · architecture/genesis-conectores-abiertos.md §3).
 * Tres pasos: local con interruptores, gratis con enlace oficial y clave que se envía y se borra, resumen por
 * papel con su motivo. Red inyectable: pruebas sin red; ninguna clave se guarda ni se devuelve.
 * Cloudroom (CRM1024F): estado honesto (instalada o no en esta neurona, cupo restante del contexto con
 * cupo-cloudroom.ts) y sugerencia SOLO cuando el sugeridor del ámbito la devuelve. Sin red ni claves. */
import { useEffect, useMemo, useState } from "react";
import { Cloud, ExternalLink } from "lucide-react";
import type { Asignacion } from "@/lib/genesis/conectores/asignaciones";
import type { GrupoSugerencias, Sugerencia } from "@/lib/genesis/conectores/sugerir";
import type { Papel } from "@/lib/genesis/conectores/catalogo-opciones";
import type { VistaOpciones } from "@/lib/genesis/conectores/opciones-ambito";
import { cupoRestante, ritmoDiario, type Consumo, type PlanCloudroom } from "@/lib/genesis/conectores/cupo-cloudroom";
/** Parte de la vista de la API que usa el asistente (mismo tipo, sin duplicarlo). */
export type VistaOpcionesAmbito = Pick<VistaOpciones, "sugerencias" | "asignaciones">;
export type ResultadoVincular = { ok: boolean; error?: string };
export type Cargar = (ambito: string) => Promise<VistaOpcionesAmbito>;
export type VincularClave = (ambito: string, proveedor: string, valor: string) => Promise<ResultadoVincular>;
export type ResumenPapel = { papel: Papel; elegido: string | null; cadena: string[]; motivo: string };
export const GRUPOS = { local: "local-por-activar", gratis: "gratis-por-vincular" } as const;
async function cargarPorApi(ambito: string): Promise<VistaOpcionesAmbito> {
  const r = await fetch(`/api/genesis/conectores?ambito=${encodeURIComponent(ambito)}`, { cache: "no-store" });
  if (!r.ok) throw new Error(`La API respondió con estado ${r.status}.`); return (await r.json()) as VistaOpcionesAmbito;
}
async function vincularPorApi(ambito: string, proveedor: string, valor: string): Promise<ResultadoVincular> {
  const r = await fetch(`/api/genesis/conectores?ambito=${encodeURIComponent(ambito)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ accion: "vincular", proveedor, valor }) });
  return r.ok ? { ok: true } : { ok: false, error: `La API respondió con estado ${r.status}.` };
}
/** Motivo por papel: local primero, gratis vinculada después; de pago solo con permiso del ámbito. */
export function resumenPorPapel(asignaciones: readonly Asignacion<Papel>[], pistas: { locales: ReadonlySet<string>; vinculadas: ReadonlySet<string> }): ResumenPapel[] {
  return asignaciones.map((a) => {
    const elegido = a.cadena[0] ?? a.respaldo[0] ?? null;
    const motivo = !elegido ? "Sin opción elegida todavía en este ámbito."
      : pistas.locales.has(elegido) ? "Local primero: lo más potente que cabe, y lo privado no sale de la cuenta."
      : pistas.vinculadas.has(elegido) ? "Gratis vinculada por una cuenta del ámbito: gratis primero."
      : (a.preferencias.presupuesto ?? 0) > 0 ? "De pago con el permiso y el tope del ámbito."
      : "Decidida por el ámbito, sin pista de elección en este asistente.";
    return { papel: a.clave, elegido, cadena: [...a.cadena, ...a.respaldo], motivo };
  });
}
const PASOS = ["Local del contexto", "Gratis por vincular", "Resumen por papel"] as const,
  PILDORA = "cursor-pointer rounded-full border px-3 py-1.5 text-xs transition-colors duration-200",
  CRISTAL = "rounded-xl border border-white/10 bg-white/5 p-2 backdrop-blur";
/** Opciones del grupo pedido (el grupo «sin-opcion» no lleva opciones: devuelve vacío). */
function opcionesDeGrupo(grupos: readonly GrupoSugerencias[], clave: string): Sugerencia[] {
  for (const g of grupos) if (g.clave === clave && "opciones" in g) return g.opciones;
  return [];
}
export type InstalacionCloudroom = "instalada" | "no-instalada" | "sin-dato";
/** Lo que cada página aporta sobre Cloudroom; sin datos no se inventa nada (arquitectura §5). */
export interface EntradaEstadoCloudroom {
  instalacion?: InstalacionCloudroom;
  plan?: PlanCloudroom;
  consumos?: readonly Consumo[];
  inicioCiclo?: string | number;
  ahora?: string | number;
  diasQueQuedan?: number;
  /** Lo que el sugeridor del ámbito devuelve: se ofrece solo si trae la entrada cloudroom. */
  sugerencias?: readonly GrupoSugerencias[];
}
export interface EstadoCloudroom {
  instalacion: InstalacionCloudroom;
  cupo: number | null;
  ritmo: number;
  sugerencia: Sugerencia | null;
  ofrecible: boolean;
  texto: string;
}
/** Busca la entrada «cloudroom» entre los grupos que devuelve el sugeridor; null si no la devuelve. */
export function sugerenciaCloudroom(grupos: readonly GrupoSugerencias[]): Sugerencia | null {
  for (const g of grupos) if ("opciones" in g) { const o = g.opciones.find((x) => x.id === "cloudroom"); if (o) return o; }
  return null;
}
const INSTALACION_TEXTO: Record<InstalacionCloudroom, string> = {
  instalada: "instalada en esta neurona",
  "no-instalada": "no instalada en esta neurona",
  "sin-dato": "instalación sin comprobar en esta neurona",
};
/** Estado honesto, PURO: instalación en la neurona + cupo restante del contexto. Ofrecida solo si el
 * sugeridor la devuelve y la neurona la tiene; si no, se dice por qué y se queda como opción más. */
export function estadoCloudroom(entrada: EntradaEstadoCloudroom): EstadoCloudroom {
  const instalacion = entrada.instalacion ?? "sin-dato";
  const cupo = entrada.plan !== undefined && entrada.inicioCiclo !== undefined && entrada.ahora !== undefined
    ? cupoRestante(entrada.plan, [...(entrada.consumos ?? [])], entrada.inicioCiclo, entrada.ahora) : null;
  const ritmo = cupo !== null && entrada.diasQueQuedan !== undefined ? ritmoDiario(cupo, entrada.diasQueQuedan) : 0;
  const sugerencia = sugerenciaCloudroom(entrada.sugerencias ?? []);
  const cupoTexto = cupo === null ? "cupo sin lectura"
    : `${cupo} agente(s) en la nube en este ciclo · ritmo ${ritmo}/día`;
  const motivo = sugerencia ? `Sugerida para este ámbito: ${sugerencia.motivo}`
    : "No se ofrece como servidor aquí: el sugeridor del ámbito no la devuelve.";
  return {
    instalacion, cupo, ritmo, sugerencia,
    ofrecible: sugerencia !== null && instalacion !== "no-instalada",
    texto: `Cloudroom ${INSTALACION_TEXTO[instalacion]}; ${cupoTexto}. ${motivo}`,
  };
}
const CARD_CLOUDROOM = "rounded-xl border border-cyan-400/20 bg-cyan-500/[0.04] p-3 backdrop-blur";
/** Tarjeta de Cloudroom: honesta y compacta; se usa en el asistente y en la sección de asignaciones. */
export function TarjetaCloudroom({ estado, className = "" }: { estado: EstadoCloudroom; className?: string }) {
  return (
    <section aria-label="Cloudroom como servidor de agentes" className={`${CARD_CLOUDROOM} ${className}`}>
      <header className="flex flex-wrap items-center gap-2">
        <Cloud className="h-4 w-4 shrink-0 text-cyan-300" aria-hidden={true} />
        <h3 className="text-sm font-semibold text-white/85">Cloudroom</h3>
        <span data-testid="cloudroom-instalacion" className="rounded-full border border-white/15 px-2 py-0.5 text-[10px] text-white/60">
          {INSTALACION_TEXTO[estado.instalacion]}
        </span>
        <span data-testid="cloudroom-cupo" className="text-[10px] text-white/55">
          {estado.cupo === null ? "Cupo sin lectura" : `${estado.cupo} agente(s) en la nube · ritmo ${estado.ritmo}/día`}
        </span>
      </header>
      <p className="mt-1 text-[11px] text-white/55">{estado.texto}</p>
      {estado.ofrecible && estado.sugerencia ? (
        <p role="status" className="mt-2 rounded-lg border border-emerald-400/25 bg-emerald-500/10 p-2 text-[11px] text-emerald-100">
          Sugerida para los agentes de este ámbito (100 agentes en la nube cada 30 días).
          {estado.sugerencia.enlaceAlta ? (
            <a href={estado.sugerencia.enlaceAlta} target="_blank" rel="noreferrer"
              className="ml-1 inline-flex cursor-pointer items-center gap-0.5 underline">
              Abrir Cloudroom <ExternalLink className="h-3 w-3" aria-hidden={true} />
            </a>
          ) : null}
        </p>
      ) : (
        <p role="status" className="mt-2 rounded-lg border border-white/10 bg-black/20 p-2 text-[11px] text-white/50">
          No se sugiere aquí; el catálogo la deja como una opción más, nunca la única.
        </p>
      )}
    </section>
  );
}
/** Estado de Cloudroom para la sección de asignaciones (mi Génesis, PoliGenesis): mismo cálculo. */
export function AsistenteConectores({ entrada, className = "" }: { entrada: EntradaEstadoCloudroom; className?: string }) {
  return <TarjetaCloudroom estado={estadoCloudroom(entrada)} className={className} />;
}
export function AsistenteConectarGenesis({ ambito, opciones = null, cargar, vincular, cloudroom = null }: { ambito: string; opciones?: VistaOpcionesAmbito | null; cargar?: Cargar; vincular?: VincularClave; cloudroom?: EntradaEstadoCloudroom | null }) {
  const [vista, setVista] = useState<VistaOpcionesAmbito | null>(opciones), [errorCarga, setErrorCarga] = useState<string | null>(null),
    [paso, setPaso] = useState(1), [locales, setLocales] = useState<Set<string>>(new Set()), [claves, setClaves] = useState<Record<string, string>>({}),
    [vinculadasOk, setVinculadasOk] = useState<Set<string>>(new Set()), [avisoVincular, setAvisoVincular] = useState<string | null>(null);
  useEffect(() => {
    if (opciones) { setVista(opciones); setErrorCarga(null); return; }
    let vivo = true;
    (cargar ?? cargarPorApi)(ambito).then((v) => { if (vivo) setVista(v); })
      .catch((e: unknown) => { if (vivo) setErrorCarga(e instanceof Error ? e.message : "No se pudo cargar."); });
    return () => { vivo = false; };
  }, [ambito, opciones, cargar]);
  const local = useMemo(() => opcionesDeGrupo(vista?.sugerencias ?? [], GRUPOS.local), [vista]);
  const gratis = useMemo(() => opcionesDeGrupo(vista?.sugerencias ?? [], GRUPOS.gratis), [vista]);
  const resumen = useMemo(() => resumenPorPapel(vista?.asignaciones ?? [], { locales, vinculadas: vinculadasOk }), [vista, locales, vinculadasOk]);
  const alternar = (id: string) => setLocales((p) => { const s = new Set(p); if (s.has(id)) s.delete(id); else s.add(id); return s; });
  const enviarClave = async (id: string) => {
    const valor = (claves[id] ?? "").trim(); if (!valor) return; setAvisoVincular(null);
    const r = await (vincular ?? vincularPorApi)(ambito, id, valor); setClaves((p) => ({ ...p, [id]: "" }));
    if (r.ok) setVinculadasOk((p) => new Set(p).add(id)); else setAvisoVincular(r.error ?? "No se pudo vincular esa clave.");
  };
  /** Cloudroom: se pinta si hay entrada de la página o si el sugeridor la devuelve; nunca se inventa. */
  const estadoCloudroomVista = useMemo(() => {
    const sugerencia = sugerenciaCloudroom(vista?.sugerencias ?? []);
    if (sugerencia === null && cloudroom === null) return null;
    return estadoCloudroom({ ...(cloudroom ?? {}), sugerencias: vista?.sugerencias });
  }, [cloudroom, vista]);
  return (
    <section className="space-y-4">
      <h2 className="text-xl font-semibold">Conectar Genesis</h2>
      <p className="text-sm text-muted-foreground">Local primero, gratis después y de pago con permiso para {ambito}.</p>
      <div role="tablist" aria-label="Pasos del asistente" className="flex flex-wrap gap-2">
        {PASOS.map((nombre, i) => (
          <button key={nombre} type="button" role="tab" aria-selected={paso === i + 1} onClick={() => setPaso(i + 1)}
            className={`${PILDORA} ${paso === i + 1 ? "border-emerald-300/60 bg-emerald-500/15 text-white" : "border-white/15 text-white/70"}`}>{i + 1}. {nombre}</button>
        ))}
      </div>
      {errorCarga ? <p className={`${CRISTAL} border-amber-400/25 bg-amber-500/10 text-xs text-amber-100`}>{errorCarga}</p> : null}
      {paso === 1 ? (
        <div className="space-y-2" data-testid="paso-local">
          <p className="text-xs text-white/60">Neuronas, servidores del cerebro y capa de Astraura que ya corre en tu contexto.</p>
          {local.map((o) => (
            <div key={o.id} className={`flex items-center justify-between gap-3 ${CRISTAL}`}>
              <div><p className="text-sm">{o.nombre}</p><p className="text-xs text-white/50">{o.motivo}</p></div>
              <button type="button" role="switch" aria-checked={locales.has(o.id)} aria-label={`Interruptor de ${o.nombre}`} onClick={() => alternar(o.id)}
                className={`${PILDORA} ${locales.has(o.id) ? "border-emerald-300/70 bg-emerald-500/20 text-white" : "border-white/15 text-white/60"}`}>{locales.has(o.id) ? "Encendido" : "Apagado"}</button>
            </div>
          ))}
        </div>
      ) : null}
      {paso === 2 ? (
        <div className="space-y-2" data-testid="paso-gratis">
          <p className="text-xs text-white/60">Crea tu cuenta en el enlace oficial, pega la clave y se envía a la bóveda del servidor.</p>
          {gratis.filter((o) => o.id !== "cloudroom").map((o) => (
            <div key={o.id} className={CRISTAL}>
              <p className="text-sm">{o.nombre}</p>
              {o.enlaceAlta || o.enlaceClave ? <a href={o.enlaceAlta ?? o.enlaceClave ?? "#"} target="_blank" rel="noreferrer" className={`${PILDORA} inline-block py-1`}>Vincular</a> : null}
              <p className="text-xs text-white/50">{o.limite ? `Gratis: ${o.limite.nota}` : "Límite gratis sin verificar: no se promete."}</p>
              <div className="flex gap-2">
                <input type="password" value={claves[o.id] ?? ""} aria-label={`Clave de ${o.nombre}`} onChange={(e) => setClaves((p) => ({ ...p, [o.id]: e.target.value }))}
                  className="min-w-0 flex-1 rounded-full border border-white/15 bg-black/30 px-3 py-1 text-sm" />
                <button type="button" onClick={() => void enviarClave(o.id)} disabled={!(claves[o.id] ?? "").trim()}
                  className={`${PILDORA} border-emerald-300/50 bg-emerald-500/15 disabled:cursor-not-allowed disabled:opacity-40`}>Enviar clave</button>
              </div>
              {vinculadasOk.has(o.id) ? <p className="text-xs text-emerald-200">Clave enviada a la bóveda del ámbito.</p> : null}
            </div>
          ))}
          {avisoVincular ? <p className={`${CRISTAL} border-amber-400/25 bg-amber-500/10 text-xs text-amber-100`}>{avisoVincular}</p> : null}
          {estadoCloudroomVista ? <TarjetaCloudroom estado={estadoCloudroomVista} className="mt-1" /> : null}
        </div>
      ) : null}
      {paso === 3 ? (
        <div className="space-y-2" data-testid="paso-resumen">
          {resumen.map((r) => (
            <div key={r.papel} className={CRISTAL}>
              <p className="text-sm capitalize">{r.papel}</p>
              {r.elegido ? <p className="text-xs text-white/80">Cadena elegida: {r.elegido}</p> : <p className="text-xs text-white/50">Sin opción para este papel todavía.</p>}
              {r.cadena.length > 1 ? <p className="text-xs text-white/50">Cadena completa: {r.cadena.join(" → ")}</p> : null}
              <p className="text-xs text-white/50">{r.motivo}</p>
            </div>
          ))}
          {resumen.length === 0 ? <p className="text-xs text-white/50">Sin asignaciones declaradas en este ámbito.</p> : null}
        </div>
      ) : null}
    </section>
  );
}
