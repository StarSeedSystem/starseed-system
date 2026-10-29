"use client";

/** GENESIS · Asistente «Conectar Genesis» (Ola 1019G · GCA1019M · architecture/genesis-conectores-abiertos.md §3).
 * Tres pasos: 1) lo local del contexto con interruptores; 2) lo gratis por vincular — enlace oficial y clave a la API, borrada del campo —
 * y 3) resumen por papel con la cadena elegida y su motivo. La red está inyectable para probarlo sin red; jamás se guarda un valor de clave. */

import { useEffect, useState } from "react";
import { ExternalLink, KeyRound, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import type { Papel } from "@/lib/genesis/conectores/catalogo-opciones";
import type { VistaOpciones } from "@/lib/genesis/conectores/opciones-ambito";
import type { Sugerencia } from "@/lib/genesis/conectores/sugerir";

export interface ResultadoVinculo { ok: boolean; huella: string | null } // huella SHA-256 abreviada; nunca el valor de la clave
export type CargarVista = (ambito: string) => Promise<VistaOpciones | null>;
export type VolverVinculo = (proveedor: string, valor: string) => Promise<ResultadoVinculo>;
export interface PropsAsistente { ambito: string; cargar?: CargarVista; vincular?: VolverVinculo }
export interface RolResumido { papel: Papel; cadena: string[]; elegido: string | null; motivo: string }
/** Resumen por papel: cadena del ámbito, nombre del elegido y el motivo de la sugerencia que lo cubre, o el porqué de «Sin opción». */
export function resumenPorPapel(vista: VistaOpciones): RolResumido[] {
  const sinOpcion = vista.sugerencias.find((g) => g.clave === "sin-opcion");
  const opciones = vista.sugerencias.flatMap((g) => ("opciones" in g ? g.opciones : []));
  return vista.asignaciones.map((a) => {
    const elegido = a.cadena[0] ?? null;
    const sinEse = sinOpcion && sinOpcion.clave === "sin-opcion" ? sinOpcion.papeles.find((p) => p.papel === a.clave)?.motivo : undefined;
    const cubre = opciones.find((s) => s.id === elegido && s.papeles.includes(a.clave));
    return {
      papel: a.clave, cadena: a.cadena,
      elegido: elegido ? vista.catalogo.find((o) => o.id === elegido)?.nombre ?? elegido : null,
      motivo: cubre?.motivo ?? sinEse ?? "Sin motivo registrado.",
    };
  });
}
const cargarPorDefecto: CargarVista = (ambito) =>
  fetch(`/api/genesis/conectores?ambito=${encodeURIComponent(ambito)}`)
    .then((res) => (res.ok ? (res.json() as Promise<VistaOpciones>) : null)).catch(() => null);

/** Envía la clave a la API del ámbito y devuelve SOLO la huella abreviada (nunca el valor). */
const vincularPorDefecto = async (ambito: string, proveedor: string, valor: string): Promise<ResultadoVinculo> => {
  const res = await fetch(`/api/genesis/conectores?ambito=${encodeURIComponent(ambito)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ accion: "vincular", proveedor, valor }) }).catch(() => null);
  if (!res || !res.ok) return { ok: false, huella: null };
  return { ok: true, huella: ((await res.json()) as { huella?: string }).huella?.slice(0, 12) ?? "registrada" };
};

export function AsistenteConectores({ ambito, cargar = cargarPorDefecto, vincular }: PropsAsistente) {
  const [vista, setVista] = useState<VistaOpciones | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [paso, setPaso] = useState<1 | 2 | 3>(1);
  const [activados, setActivados] = useState<ReadonlySet<string>>(new Set());
  const [vinculadas, setVinculadas] = useState<ReadonlySet<string>>(new Set());
  const [claves, setClaves] = useState<Record<string, string>>({});
  const [enviando, setEnviando] = useState(false);
  useEffect(() => {
    let vivo = true;
    const fallo = () => { if (vivo) setAviso("No se pudo cargar el catálogo del ámbito."); };
    cargar(ambito).then((v) => { if (vivo) { setVista(v); if (!v) fallo(); } }, fallo);
    return () => { vivo = false; };
  }, [ambito, cargar]);
  const enviarClave = async (s: Sugerencia) => {
    const valor = (claves[s.id] ?? "").trim();
    if (enviando || !valor) return;
    setEnviando(true);
    const res = vincular ? await vincular(s.id, valor) : await vincularPorDefecto(ambito, s.id, valor);
    setEnviando(false);
    setClaves((prev) => ({ ...prev, [s.id]: "" })); // la clave se borra del campo al instante
    if (res.ok) setVinculadas((prev) => new Set(prev).add(s.id));
    setAviso(res.ok ? `Clave guardada en la bóveda del ámbito. Huella: ${res.huella ?? "registrada"}.` : "No se pudo guardar la clave en la bóveda.");
  };
  if (aviso && !vista) return <p className="rounded-xl border border-amber-300/30 bg-amber-300/10 p-3 text-sm text-amber-200" data-testid="asistente-conectores">{aviso}</p>;
  if (!vista) return <p className="p-3 text-sm text-white/50">Cargando opciones de conexión…</p>;
  const opcionesDe = (clave: string) => { const g = vista.sugerencias.find((x) => x.clave === clave); return g && "opciones" in g ? g.opciones : []; };
  const local = opcionesDe("local-por-activar");
  const gratis = opcionesDe("gratis-por-vincular");
  return (
    <section className="space-y-3 rounded-xl border border-white/10 bg-white/5 p-3" data-testid="asistente-conectores">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-medium text-white">Conectar Genesis</h2>
        {[1, 2, 3].map((n) => <span key={n} className={`text-[10px] ${n === paso ? "text-emerald-300" : "text-white/40"}`}>{n}</span>)}
      </div>
      {aviso ? <p className="text-[11px] text-amber-200/90">{aviso}</p> : null}
      {paso === 1 ? (
        <div className="space-y-2">
          <p className="text-[11px] text-white/45">Lo local del contexto: neuronas, servidores del cerebro y la capa de Astraura que cabe. Lo privado no sale de aquí.</p>
          {local.map((s) => (
            <div key={s.id} className="flex items-center justify-between gap-2 rounded-xl border border-white/10 bg-black/25 p-3">
              <div className="min-w-0"><p className="truncate text-sm text-white">{s.nombre}</p><p className="truncate text-[11px] text-white/50">{s.motivo}</p></div>
              <Switch checked={activados.has(s.id)} onCheckedChange={(on) => setActivados((p) => { const n = new Set(p); if (on) n.add(s.id); else n.delete(s.id); return n; })} aria-label={`Activar ${s.nombre}`} />
            </div>
          ))}
        </div>
      ) : paso === 2 ? (
        <div className="space-y-2">
          {gratis.map((s) => (
            <div key={s.id} className="space-y-1 rounded-xl border border-white/10 bg-black/25 p-3">
              <p className="truncate text-sm text-white">{s.nombre}{vinculadas.has(s.id) ? " · vinculada" : ""}</p>
              <p className="text-[11px] text-white/50">{s.motivo}{s.limite ? ` Gratis: ${s.limite.nota}` : ""}</p>
              <div className="flex flex-wrap items-center gap-2">
                <a href={s.enlaceAlta ?? s.enlaceClave ?? "#"} target="_blank" rel="noreferrer noopener" data-testid={`enlace-${s.id}`} className="inline-flex h-8 cursor-pointer items-center gap-1 rounded-md border border-white/15 px-3 text-xs text-white/80"><ExternalLink className="h-3.5 w-3.5" aria-hidden /> Vincular</a>
                <Input type="password" autoComplete="off" placeholder="Pega la clave…" aria-label={`Clave de ${s.nombre}`} value={claves[s.id] ?? ""} onChange={(e) => setClaves((p) => ({ ...p, [s.id]: e.target.value }))} className="h-8 w-48 bg-black/30" />
                <Button size="sm" className="h-8 cursor-pointer gap-1" disabled={enviando || !claves[s.id]} onClick={() => void enviarClave(s)}>{enviando ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <KeyRound className="h-3.5 w-3.5" aria-hidden />} Enviar clave</Button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {resumenPorPapel(vista).map((r) => (
            <div key={r.papel} className="rounded-xl border border-white/10 bg-black/25 p-3">
              <p className="text-sm text-white">{r.papel}</p><p className="text-[11px] text-white/60">{r.elegido ? `Cadena elegida: ${r.cadena.join(" → ")}` : "Sin cadena elegida todavía."}</p><p className="text-[11px] text-white/45">{r.motivo}</p>
            </div>
          ))}
        </div>
      )}
      {paso > 1 ? <Button variant="ghost" size="sm" className="h-8 cursor-pointer text-white/70" onClick={() => setPaso((p) => (p - 1) as 1 | 2 | 3)}>Atrás</Button> : null}
      {paso < 3 ? <Button size="sm" className="h-8 cursor-pointer" onClick={() => setPaso((p) => (p + 1) as 1 | 2 | 3)}>Continuar</Button> : null}
    </section>
  );
}
