"use client";
/** GENESIS · ASISTENTE «CONECTAR GENESIS» (Ola 1019G · GCA1019M · architecture/genesis-conectores-abiertos.md §3).
 * Tres pasos: local con interruptores, gratis con enlace oficial y clave que se envía y se borra, resumen por
 * papel con su motivo. Red inyectable: pruebas sin red; ninguna clave se guarda ni se devuelve.
 * Cloudroom (CRM1024B): estado honesto y sugerencia condicional según sugerirParaAmbito. */
import { useEffect, useMemo, useState } from "react";
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
/** Datos REALES que puede aportar cada página: instalación de la app y cupo de la cuenta (CRM1024C). */
export interface DatosCloudroomContexto {
  instalacion?: InstalacionCloudroom;
  plan?: PlanCloudroom;
  consumos?: Consumo[];
  inicioCiclo?: string | number;
  ahora?: string | number;
  diasQueQuedan?: number;
}
export interface EstadoCloudroom {
  instalacion: InstalacionCloudroom;
  cupo: number | null;
  ritmo: number;
  texto: string;
  motivo: string;
  enlaceAlta: string | null;
}
/** La entrada cloudroom solo si `sugerirParaAmbito` la devolvió a este ámbito. */
export function sugerenciaCloudroom(grupos: readonly GrupoSugerencias[]): Sugerencia | null {
  for (const g of grupos) {
    if ("opciones" in g) {
      const o = g.opciones.find((x) => x.id === "cloudroom");
      if (o) return o;
    }
  }
  return null;
}
/** Estado honesto de Cloudroom (CRM1024B + CRM1024C): sugerencia del catálogo, instalación declarada
 * y cupo del contexto con `cupo-cloudroom.ts`. Sin datos no se inventa nada; null si no fue sugerida. */
export function estadoCloudroom(grupos: readonly GrupoSugerencias[], datos?: DatosCloudroomContexto): EstadoCloudroom | null {
  const s = sugerenciaCloudroom(grupos);
  if (!s) return null;
  const instalacion = datos?.instalacion ?? "sin-dato";
  const plan = datos?.plan, inicioCiclo = datos?.inicioCiclo, ahora = datos?.ahora;
  const cupo = plan && inicioCiclo !== undefined && ahora !== undefined
    ? cupoRestante(plan, datos?.consumos ?? [], inicioCiclo, ahora) : null;
  const ritmo = cupo !== null ? ritmoDiario(cupo, Math.max(1, datos?.diasQueQuedan ?? 30)) : 0;
  const estado = instalacion === "instalada" ? "Instalada en esta neurona."
    : instalacion === "no-instalada" ? "No está instalada en esta neurona."
    : "Instalación sin comprobar en esta neurona.";
  const cupoTexto = cupo === null ? "Cupo sin declarar por la cuenta; decláralo antes de lanzar agentes."
    : `${cupo} agentes en la nube este ciclo · ritmo ${ritmo} al día.`;
  return { instalacion, cupo, ritmo, texto: `${estado} ${cupoTexto}`, motivo: s.motivo, enlaceAlta: s.enlaceAlta };
}
export function AsistenteConectarGenesis({ ambito, opciones = null, cargar, vincular, cloudroom }: { ambito: string; opciones?: VistaOpcionesAmbito | null; cargar?: Cargar; vincular?: VincularClave; cloudroom?: DatosCloudroomContexto }) {
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
  const estadoCloudroomVista = useMemo(() => estadoCloudroom(vista?.sugerencias ?? [], cloudroom), [vista, cloudroom]);
  const alternar = (id: string) => setLocales((p) => { const s = new Set(p); if (s.has(id)) s.delete(id); else s.add(id); return s; });
  const enviarClave = async (id: string) => {
    const valor = (claves[id] ?? "").trim(); if (!valor) return; setAvisoVincular(null);
    const r = await (vincular ?? vincularPorApi)(ambito, id, valor); setClaves((p) => ({ ...p, [id]: "" }));
    if (r.ok) setVinculadasOk((p) => new Set(p).add(id)); else setAvisoVincular(r.error ?? "No se pudo vincular esa clave.");
  };
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
          {gratis.map((o) => (
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
          {estadoCloudroomVista ? (
            <div data-testid="estado-cloudroom" className={`${CRISTAL} space-y-1`}>
              <p className="text-sm">Cloudroom</p>
              <p className="text-xs text-white/50">{estadoCloudroomVista.texto}</p>
              <p className="text-xs text-white/50">{estadoCloudroomVista.motivo}</p>
              <p role="status" className="rounded-lg border border-emerald-400/25 bg-emerald-500/10 p-2 text-[11px] text-emerald-100">
                Sugerida por el catálogo para los agentes de este ámbito; el estado real es el de arriba.
              </p>
              {estadoCloudroomVista.enlaceAlta ? (
                <a href={estadoCloudroomVista.enlaceAlta} target="_blank" rel="noreferrer"
                  className={`${PILDORA} inline-block py-1`}>Abrir Cloudroom</a>
              ) : null}
            </div>
          ) : null}
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