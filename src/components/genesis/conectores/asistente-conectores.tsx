"use client";
/**
 * Asistente «Conectar Genesis» (Ola 1019G · GCA1019M · architecture/genesis-conectores-abiertos.md).
 * Tres pasos por ámbito: 1) lo local del contexto (neuronas, servidores del cerebro, capa de Astraura
 * que cabe) con interruptores; 2) lo gratis sugerido, con «Vincular» al enlace oficial en pestaña
 * nueva y un campo para la clave, que se envía a la API (bóveda) y se borra; 3) resumen por papel
 * con la cadena elegida y su motivo. Nunca valores de claves: solo huellas y NOMBRES de variables.
 */
import { useEffect, useState, type ReactNode } from "react";
import { ExternalLink, KeyRound, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import type { GrupoSugerencias, Sugerencia } from "@/lib/genesis/conectores/sugerir";

export interface OfertaLocal { id: string; nombre: string; origen: "neurona" | "cerebro" | "contenedor"; capa: string; activa: boolean; motivo: string }
export interface ResumenPapel { papel: string; cadena: string; motivo: string }
export interface EstadoConectores { ambito: string; locales: OfertaLocal[]; grupos: GrupoSugerencias[]; resumenPapeles: ResumenPapel[] }
export type ResultadoVinculo = { ok: true; huella: string | null } | { ok: false; error: string };
type CargarEstado = (ambito: string) => Promise<EstadoConectores>; type AlternarLocal = (ambito: string, ofertaId: string, activa: boolean) => Promise<void>;
type VincularClave = (ambito: string, opcionId: string, clave: string) => Promise<ResultadoVinculo>;

export async function cargarEstadoPorDefecto(ambito: string): Promise<EstadoConectores> {
  const r = await fetch(`/api/genesis/conectores/opciones?ambito=${encodeURIComponent(ambito)}`);
  if (!r.ok) throw new Error(`HTTP ${r.status}`); return (await r.json()) as EstadoConectores;
}
export async function vincularClavePorDefecto(ambito: string, opcionId: string, clave: string): Promise<ResultadoVinculo> {
  const r = await fetch("/api/genesis/conectores/vincular", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ambito, opcionId, clave }) });
  const j = (await r.json().catch(() => ({}))) as { ok?: boolean; huella?: string; error?: string };
  return r.ok && j.ok ? { ok: true, huella: j.huella ?? null } : { ok: false, error: j.error ?? `La bóveda respondió HTTP ${r.status}.` };
}
export async function alternarLocalPorDefecto(ambito: string, ofertaId: string, activa: boolean): Promise<void> {
  const r = await fetch("/api/genesis/conectores/local", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ambito, ofertaId, activa }) }); if (!r.ok) throw new Error(`HTTP ${r.status}`);
}

function Pildora({ children }: { children: ReactNode }) {
  return <span className="rounded-full border border-white/15 bg-white/[0.04] px-2 py-0.5 text-[11px] text-white/60">{children}</span>;
}

function TarjetaConector({ s, ambito, vincular }: { s: Sugerencia; ambito: string; vincular: VincularClave }) {
  const [clave, setClave] = useState("");
  const [huella, setHuella] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const guardar = async () => {
    if (!clave || enviando) return; setEnviando(true); setError(null);
    try { const r = await vincular(ambito, s.id, clave);
      if (r.ok) setHuella(r.huella ?? "Vinculada"); else setError(r.error);
    } catch { setError("Sin conexión con el servidor del OS."); } finally { setClave(""); setEnviando(false); }
  };
  return (<li className="space-y-2 rounded-xl border border-white/10 bg-black/25 p-3" data-testid={`conectores-opcion-${s.id}`}>
      <div className="flex flex-wrap items-center gap-1.5"><p className="text-sm font-medium text-white">{s.nombre}</p>{s.papeles.length ? <Pildora>{s.papeles.join(" · ")}</Pildora> : null}<Pildora>{s.limite ? s.limite.nota : "Límite gratis: sin datos"}</Pildora>{s.verificado === null ? <Pildora>Sin verificar</Pildora> : <Pildora>Verificado {s.verificado}</Pildora>}</div>
      <p className="text-xs text-white/50">{s.motivo}</p>
      <div className="flex flex-wrap items-center gap-2">
        {s.enlaceAlta ? <a href={s.enlaceAlta} target="_blank" rel="noopener noreferrer" data-testid={`conectores-vincular-${s.id}`} className="inline-flex cursor-pointer items-center gap-1 rounded-full border border-white/15 px-3 py-1 text-xs text-teal-300 transition-colors duration-150 hover:border-teal-300/60">Vincular<ExternalLink className="h-3.5 w-3.5" aria-hidden /></a> : null}
        {(s.enlaceClave ? <a href={s.enlaceClave} target="_blank" rel="noopener noreferrer" data-testid={`conectores-clave-enlace-${s.id}`} className="inline-flex cursor-pointer items-center gap-1 rounded-full border border-white/15 px-3 py-1 text-xs text-white/70 hover:text-white">Página de la clave<ExternalLink className="h-3.5 w-3.5" aria-hidden /></a> : null)}
        {s.variables.length ? <span className="font-mono text-[10px] text-white/40">{s.variables.join(" ")}</span> : null}
      </div>
      <div className="flex items-center gap-2"><Input type="password" autoComplete="off" value={clave} onChange={(e) => setClave(e.target.value)} placeholder="Pega tu clave aquí" data-testid={`conectores-clave-${s.id}`} className="h-8 max-w-56 border-white/15 bg-black/30 text-sm" />
        <Button size="sm" className="h-8 cursor-pointer gap-1" disabled={!clave || enviando} onClick={() => void guardar()} data-testid={`conectores-guardar-${s.id}`}>{enviando ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <KeyRound className="h-3.5 w-3.5" aria-hidden />} Guardar en la bóveda</Button></div>
      {huella ? <p className="text-xs text-emerald-300" data-testid={`conectores-huella-${s.id}`}>Vinculada · huella {huella}</p> : null}{error ? <p className="text-xs text-red-300" data-testid={`conectores-error-${s.id}`}>{error}</p> : null}
    </li>
  );}

export function AsistenteConectoresGenesis({ ambito, cargarEstado = cargarEstadoPorDefecto, vincularClave = vincularClavePorDefecto, alternarLocal = alternarLocalPorDefecto }: { ambito: string; cargarEstado?: CargarEstado; vincularClave?: VincularClave; alternarLocal?: AlternarLocal; }) {
  const [estado, setEstado] = useState<EstadoConectores | null>(null); const [fallo, setFallo] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false); const [cambiando, setCambiando] = useState<string | null>(null);
  useEffect(() => {
    let vivo = true; setCargando(true); setFallo(null);
    cargarEstado(ambito).then((e) => { if (vivo) { setEstado(e); setCargando(false); } }).catch(() => { if (vivo) { setFallo("No se pudo cargar el estado de los conectores del ámbito."); setCargando(false); } });
    return () => { vivo = false; };
  }, [ambito, cargarEstado]);
  const alternar = async (o: OfertaLocal) => {
    if (cambiando) return; setCambiando(o.id); setFallo(null);
    try { await alternarLocal(ambito, o.id, !o.activa);
      setEstado((e) => e && { ...e, locales: e.locales.map((x) => (x.id === o.id ? { ...x, activa: !x.activa } : x)) });
    } catch { setFallo("No se pudo cambiar esa oferta local."); } finally { setCambiando(null); }
  };
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2"><h2 className="text-base font-semibold text-white">Conectar Genesis</h2><Pildora>{estado?.ambito ?? ambito}</Pildora><span className="text-xs text-white/45">Local primero, gratis después y de pago solo con tu permiso.</span></div>
      {cargando || !estado ? (
        <p className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/20 p-3 text-sm text-white/60" data-testid="conectores-cargando">{cargando ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}{fallo ?? "Mirando qué tiene ya este ámbito…"}</p>
      ) : (
        <>
          <section className="space-y-2" aria-label="Lo local del contexto" data-testid="conectores-locales">
            <h3 className="text-sm font-semibold text-white/85">Lo local de este ámbito</h3>
            {estado.locales.length === 0 ? <p className="rounded-xl border border-white/10 p-3 text-xs text-white/50">Sin neuronas ni servidores del cerebro ahora mismo.</p> : (
              <ul className="space-y-2">{estado.locales.map((o) => (
                  <li key={o.id} className="flex items-center gap-3 rounded-xl border border-white/10 bg-black/25 p-3">
                    <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-1.5"><p className="text-sm font-medium text-white">{o.nombre}</p><Pildora>{o.origen}</Pildora><Pildora>{o.capa}</Pildora></div><p className="mt-0.5 text-xs text-white/50">{o.motivo}</p></div>
                    <Switch checked={o.activa} onCheckedChange={() => void alternar(o)} disabled={cambiando !== null} aria-label={`Usar ${o.nombre}`} data-testid={`conectores-interruptor-${o.id}`} />
                  </li>
                ))}</ul>
            )}
          </section>
          <section className="space-y-2" aria-label="Sugerencias" data-testid="conectores-sugerencias">
            <h3 className="text-sm font-semibold text-white/85">Lo que te falta</h3>
            {estado.grupos.map((g) =>
              g.clave === "sin-opcion" ? (
                <ul key="sin-opcion" className="space-y-2">{g.papeles.map((p) => (
                  <li key={p.papel} className="rounded-xl border border-amber-400/20 bg-amber-500/10 p-3 text-xs text-amber-100" data-testid={`conectores-sin-opcion-${p.papel}`}><span className="font-medium">{p.papel}</span>: {p.motivo}</li>
                ))}</ul>
              ) : g.clave !== "local-por-activar" && g.opciones.length > 0 ? (
                <div key={g.clave} className="space-y-2">
                  <p className="text-xs uppercase tracking-wide text-white/40">{g.titulo}</p>
                  <ul className="space-y-2">{g.opciones.map((s) => <TarjetaConector key={s.id} s={s} ambito={estado.ambito} vincular={vincularClave} />)}</ul>
                </div>
              ) : null,
            )}
          </section>
          <section className="space-y-2" aria-label="Resumen por papel" data-testid="conectores-resumen">
            <h3 className="text-sm font-semibold text-white/85">Cadena por papel</h3>
            <ul className="space-y-2">{estado.resumenPapeles.map((r) => (<li key={r.papel} className="rounded-xl border border-white/10 bg-black/25 p-3"><div className="flex flex-wrap items-center gap-1.5"><Pildora>{r.papel}</Pildora><span className="text-sm text-white/85">{r.cadena}</span></div><p className="mt-0.5 text-xs text-white/50">{r.motivo}</p></li>))}</ul>
          </section>
        </>
      )}
    </div>
  );
}
