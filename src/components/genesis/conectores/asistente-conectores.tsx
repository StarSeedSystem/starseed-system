"use client";

/* Asistente «Conectar Genesis» (Ola 1019G · architecture/genesis-conectores-abiertos.md §3–§4). Tres
 * pasos por ámbito (cuenta, grupo o página): lo local del contexto con interruptores, lo gratis por
 * vincular (enlace oficial del alta en pestaña nueva y clave a la bóveda, borrada del campo) y el
 * resumen por papel; jamás se muestra el valor de una clave, solo la huella que devuelve el servidor. */
import { useCallback, useEffect, useState } from "react";
import { ExternalLink, KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import type { Asignacion } from "@/lib/genesis/conectores/asignaciones";
import type { OpcionCatalogo, Papel } from "@/lib/genesis/conectores/catalogo-opciones";
import type { VistaOpciones } from "@/lib/genesis/conectores/opciones-ambito";
import type { Sugerencia } from "@/lib/genesis/conectores/sugerir";

type Red = (url: string, init?: RequestInit) => Promise<Response>;
export interface Props { ambito: string; red?: Red } /* red inyectable: fetch por defecto, API simulada en pruebas */
export interface ResumenPapel { papel: Papel; elegidos: string[]; motivo: string; puedePago: boolean; privado: boolean }
export function resumenPorPapel(asignaciones: readonly Asignacion<Papel>[], catalogo: readonly OpcionCatalogo[]): ResumenPapel[] {
  const porId = new Map(catalogo.map((o) => [o.id, o] as const));
  return asignaciones.map((a) => {
    const primero = a.cadena.length ? porId.get(a.cadena[0]) : undefined;
    const privado = a.preferencias.privacidad === "local";
    const motivo = !primero ? (privado ? "Lo privado no sale de la cuenta: ninguna neurona ni servidor del cerebro sirve todavía."
      : "Todavía no hay opción asignada para este papel.")
      : primero.privacidad === "local" ? "Primero lo local de la cuenta: no sale de sus neuronas ni de sus servidores."
        : primero.gratis ? "Primero lo gratis: alta en el enlace oficial y clave en la bóveda del ámbito."
          : "De pago, solo con el permiso y el tope del ámbito.";
    return { papel: a.clave, elegidos: a.cadena.map((id) => porId.get(id)?.nombre ?? id), motivo, puedePago: (a.preferencias.presupuesto ?? 0) > 0, privado };
  });
}
export function grupoDe(vista: VistaOpciones | null, clave: "local-por-activar" | "gratis-por-vincular"): Sugerencia[] {
  const g = vista?.sugerencias.find((x) => x.clave === clave);
  return g && "opciones" in g ? g.opciones : [];
}
const PILDA = "rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] text-white/60";
const TARJETA = "rounded-xl border border-white/10 bg-black/25 p-2.5";
const PASOS = [[1, "Local"], [2, "Gratis por vincular"], [3, "Resumen por papel"]] as const;
const CLASE = (a: boolean) => `cursor-pointer rounded-full border px-3 py-1 text-xs transition-colors ${a ? "border-emerald-300/40 bg-emerald-400/15 text-emerald-100" : "border-white/10 text-white/60"}`;
export function AsistenteConectores({ ambito, red = (url, init) => fetch(url, init) }: Props) {
  const [vista, setVista] = useState<VistaOpciones | null>(null);
  const [paso, setPaso] = useState(1);
  const [aviso, setAviso] = useState<string | null>(null);
  const [activados, setActivados] = useState<ReadonlySet<string>>(new Set());
  const [claves, setClaves] = useState<Readonly<Record<string, string>>>({});
  const [guardadas, setGuardadas] = useState<Readonly<Record<string, string>>>({});
  const url = `/api/genesis/conectores?ambito=${encodeURIComponent(ambito)}`;
  const post = (cuerpo: unknown) => red(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(cuerpo) });
  const cargar = useCallback(async () => {
    const res = await red(url);
    if (res.ok) setVista((await res.json()) as VistaOpciones); else setAviso("No se pudo leer el catálogo del ámbito.");
  }, [red, url]);
  useEffect(() => { void cargar().catch(() => setAviso("No se pudo leer el catálogo del ámbito.")); }, [cargar]);
  /** Alta (o baja local) de una opción local en la cadena del primer papel para el que sirve. */
  const cambiarLocal = async (s: Sugerencia, encender: boolean) => {
    if (encender && s.papeles.length) {
      const res = await post({ accion: "asignar", clave: s.papeles[0], cadena: s.id });
      if (!res.ok) { setAviso("No se pudo activar la opción local."); return; }
    }
    setActivados((prev) => { const nx = new Set(prev); if (encender) nx.add(s.id); else nx.delete(s.id); return nx; });
  };
  /** Manda la clave pegada a la bóveda del ámbito y la borra del campo en cuanto el servidor responde. */
  const vincular = async (id: string) => {
    const valor = (claves[id] ?? "").trim();
    if (!valor) return;
    const res = await post({ accion: "vincular", proveedor: id, valor });
    if (!res.ok) { setAviso("No se pudo guardar la clave en la bóveda."); return; }
    const { huella } = (await res.json()) as { huella: string };
    setGuardadas((prev) => ({ ...prev, [id]: huella.slice(0, 8) }));
    setClaves((prev) => ({ ...prev, [id]: "" }));
  };
  const locales = grupoDe(vista, "local-por-activar");
  const gratis = grupoDe(vista, "gratis-por-vincular");
  const resumen = vista ? resumenPorPapel(vista.asignaciones, vista.catalogo) : [];
  const sinOpcion = vista?.sugerencias.find((g) => g.clave === "sin-opcion");
  return (
    <section data-testid="asistente-conectores" className="mx-auto w-full max-w-2xl space-y-3 rounded-2xl border border-white/10 bg-black/25 p-4 backdrop-blur">
      <h2 className="text-sm font-medium text-white">Conectar Genesis</h2>
      <div className="flex flex-wrap gap-2">
        {PASOS.map(([n, e]) => <button key={n} type="button" onClick={() => setPaso(n)} aria-pressed={paso === n} data-testid={`paso-${n}`} className={CLASE(paso === n)}>{n} · {e}</button>)}
      </div>
      {aviso ? <p className="text-xs text-rose-300" data-testid="aviso">{aviso}</p> : !vista ? <p className="text-xs text-white/40" data-testid="cargando">Cargando el catálogo…</p> : null}
      {paso === 1 ? <ul className="space-y-2" data-testid="paso-local">
        <li className="text-xs text-white/50">Neuronas, servidores del cerebro y la capa de Astraura que cabe en tu contexto: enciende lo que quieras en las cadenas.</li>
        {locales.map((s) => (
          <li key={s.id} className={TARJETA} data-testid={`local-${s.id}`}><div className="flex items-center justify-between gap-2"><p className="text-sm text-white">{s.nombre}</p>
            <Switch checked={activados.has(s.id)} onCheckedChange={(v) => void cambiarLocal(s, v)} aria-label={`Activar ${s.nombre}`} /></div>
            <div className="mt-1.5 flex flex-wrap gap-1.5">{s.papeles.map((p) => <span key={p} className={PILDA}>{p}</span>)}<span className={PILDA}>{s.tipo}</span><span className={PILDA}>{s.privacidad}</span></div>
            <p className="mt-1 text-[11px] text-white/50">{s.motivo}</p></li>
        ))}
      </ul> : null}
      {paso === 2 ? <ul className="space-y-2" data-testid="paso-gratis">
        {gratis.map((s) => {
          const e = s.enlaceAlta ?? s.enlaceClave;
          return (
            <li key={s.id} className={TARJETA} data-testid={`gratis-${s.id}`}><div className="flex items-center justify-between gap-2"><p className="text-sm text-white">{s.nombre}</p>
              {e ? <a href={e} target="_blank" rel="noreferrer" className="inline-flex cursor-pointer items-center gap-1 text-xs text-sky-300 hover:text-sky-200" data-testid={`vincular-${s.id}`}><ExternalLink className="h-3.5 w-3.5" aria-hidden /> Vincular</a> : null}</div>
              <p className="mt-1 text-[11px] text-white/50">{s.limite?.nota ?? "Límite gratis sin datos verificados (null)."} {s.motivo}</p>
              <div className="mt-1.5 flex items-center gap-1.5">
                <Input type="password" placeholder="Pega aquí la clave del servicio" value={claves[s.id] ?? ""} onChange={(ev) => setClaves((prev) => ({ ...prev, [s.id]: ev.target.value }))} className="h-7 text-xs" data-testid={`clave-${s.id}`} />
                <Button size="sm" className="h-7 cursor-pointer gap-1 px-2 text-xs" onClick={() => void vincular(s.id)} data-testid={`guardar-${s.id}`}><KeyRound className="h-3 w-3" aria-hidden />Guardar</Button></div>
              {guardadas[s.id] ? <p className="mt-1 text-[11px] text-emerald-200" data-testid={`boveda-${s.id}`}>Clave en la bóveda · huella {guardadas[s.id]}…</p> : null}</li>
          );
        })}
      </ul> : null}
      {paso === 3 ? <ul className="space-y-2" data-testid="paso-resumen">
        {resumen.map((r) => (
          <li key={r.papel} className={TARJETA} data-testid={`resumen-${r.papel}`}><p className="text-sm font-medium text-white">{r.papel}</p>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              {r.elegidos.length ? r.elegidos.map((n) => <span key={n} className={PILDA}>{n}</span>) : <span className="text-[11px] text-amber-200/80">Sin opción todavía</span>}
              {r.privado ? <span className={PILDA}>privado</span> : null}{r.puedePago ? <span className={PILDA}>permite pago</span> : null}</div>
            <p className="mt-1 text-[11px] text-white/50">{r.motivo}</p></li>
        ))}
        {sinOpcion && "papeles" in sinOpcion ? sinOpcion.papeles.map((p) => <li key={p.papel} className="text-[11px] text-amber-200/80">{p.papel}: {p.motivo}</li>) : null}
      </ul> : null}
    </section>
  );
}