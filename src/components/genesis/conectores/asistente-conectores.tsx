"use client";
/** GENESIS · Asistente «Conectar Genesis» (Ola 1019G · GCA1019M · architecture/genesis-conectores-abiertos.md §3).
 * Tres pasos: lo local del contexto con interruptores (se añade a la cadena del papel); lo gratis con «Vincular»
 * que abre el enlace oficial en pestaña nueva y un campo de clave que se envía a la API y se BORRA del campo
 * (jamás se muestra); y resumen por papel con la cadena y su motivo. API inyectable: pruebas sin red. */
import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import type { Papel } from "@/lib/genesis/conectores/catalogo-opciones";
import type { Sugerencia } from "@/lib/genesis/conectores/sugerir";
import type { VistaOpciones } from "@/lib/genesis/conectores/opciones-ambito";
export interface ApiConectores {
  cargar: (ambito: string) => Promise<VistaOpciones>;
  vincular: (proveedor: string, valor: string) => Promise<{ ok: boolean; huella: string | null }>;
  asignar: (papel: Papel, cadena: string) => Promise<boolean>;
}
export interface ResumenPapel { papel: Papel; cadena: string[]; motivo: string }
const RUTA = "/api/genesis/conectores";
const post = (cuerpo: Record<string, unknown>) => fetch(RUTA, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(cuerpo) });
export const API_NUBE: ApiConectores = {
  cargar: async (ambito) => {
    const res = await fetch(`${RUTA}?ambito=${encodeURIComponent(ambito)}`, { cache: "no-store" });
    if (!res.ok) throw new Error("No se pudo leer el catálogo del ámbito.");
    return (await res.json()) as VistaOpciones;
  },
  vincular: async (proveedor, valor) => {
    const res = await post({ accion: "vincular", proveedor, valor });
    const datos = res.ok ? ((await res.json().catch(() => ({}))) as { huella?: unknown }) : {};
    return { ok: res.ok, huella: typeof datos.huella === "string" ? datos.huella : null };
  },
  asignar: async (clave, cadena) => (await post({ accion: "asignar", clave, cadena })).ok,
};
const ETIQUETA_PAPEL: Record<Papel, string> = { escritor: "Escritor", revisor: "Revisor", chat: "Chat", "visión": "Visión", voz: "Voz", imagen: "Imagen", "código": "Código" };
const PASO_NOMBRE = { 1: "1 · Local del contexto", 2: "2 · Gratis por vincular", 3: "3 · Resumen por papel" } as const;
const TARJETA = "rounded-2xl border border-white/10 bg-white/5 p-3";
const PILDORA = (a: boolean) => `cursor-pointer rounded-full border px-3 py-1 text-xs transition ${a ? "border-white/40 bg-white/15 text-white" : "border-white/10 text-white/60"}`;
function grupoConOpciones(vista: VistaOpciones, clave: "local-por-activar" | "gratis-por-vincular"): Sugerencia[] {
  const grupo = vista.sugerencias.find((g) => g.clave === clave);
  return grupo && "opciones" in grupo ? grupo.opciones : [];
}
export function resumenPapeles(vista: VistaOpciones): ResumenPapel[] {
  const motivoDe = new Map<Papel, string>();
  for (const grupo of vista.sugerencias) if ("opciones" in grupo) for (const o of grupo.opciones) for (const p of o.papeles) if (!motivoDe.has(p)) motivoDe.set(p, o.motivo);
  return vista.asignaciones.map((a) => ({ papel: a.clave, cadena: a.cadena, motivo: motivoDe.get(a.clave) ?? (a.preferencias.localPrimero ? "Local primero: la neurona o el servidor del cerebro va antes que la nube." : "Elegida según las preferencias del ámbito.") }));
}
/** Asistente «Conectar Genesis»: contexto local → gratis por vincular → resumen por papel. */
export function AsistenteConectores({ ambito, api = API_NUBE }: { ambito: string; api?: ApiConectores }) {
  const [vista, setVista] = useState<VistaOpciones | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [paso, setPaso] = useState<1 | 2 | 3>(1);
  const [activadas, setActivadas] = useState<Record<string, boolean>>({});
  const [claves, setClaves] = useState<Record<string, string>>({});
  const [huellas, setHuellas] = useState<Record<string, string>>({});
  useEffect(() => {
    let vivo = true; setError(null);
    api.cargar(ambito).then((v) => { if (vivo) setVista(v); }, (e: unknown) => { if (vivo) setError(e instanceof Error ? e.message : "Fallo del asistente."); });
    return () => { vivo = false; };
  }, [api, ambito]);
  async function activar(o: Sugerencia) {
    setActivadas((m) => ({ ...m, [o.id]: true }));
    await Promise.all(o.papeles.map((p) => api.asignar(p, o.id))).catch(() => { setActivadas((m) => ({ ...m, [o.id]: false })); setError("No se pudo añadir a la cadena del papel."); });
  }
  async function enviarClave(o: Sugerencia) {
    const valor = (claves[o.id] ?? "").trim();
    if (!valor) return;
    setClaves((m) => ({ ...m, [o.id]: "" }));
    const { ok, huella } = await api.vincular(o.id, valor);
    if (ok && huella) setHuellas((m) => ({ ...m, [o.id]: huella.slice(0, 8) })); else if (!ok) setError("No se pudo guardar la clave en la bóveda del ámbito.");
  }
  if (!vista) return <p className="text-sm text-white/60">{error ?? "Abriendo el contexto del ámbito…"}</p>;
  const locales = grupoConOpciones(vista, "local-por-activar");
  const gratis = grupoConOpciones(vista, "gratis-por-vincular");
  const resumen = resumenPapeles(vista);
  return (
    <div className={TARJETA}>
      <p className="text-xs uppercase tracking-wide text-white/50">Conectar Genesis · {ambito}</p>
      {error && <p role="alert" className="mt-2 text-xs text-red-300">{error}</p>}
      <nav aria-label="Pasos del asistente" className="mt-2 flex flex-wrap gap-2">
        {([1, 2, 3] as const).map((n) => (<button key={n} type="button" aria-current={paso === n ? "step" : undefined} className={PILDORA(paso === n)} onClick={() => setPaso(n)}>{PASO_NOMBRE[n]}</button>))}
      </nav>
      {paso === 1 && (
        <div aria-label="Local del contexto" className="mt-3 space-y-2">
          {locales.length === 0 && <p className="text-xs text-white/50">Nada local pendiente: el contexto ya está en uso.</p>}
          {locales.map((o) => (
            <div key={o.id} className={`${TARJETA} flex items-center justify-between gap-3`}>
              <p className="text-sm">{o.nombre} <span className="text-xs text-white/50">· {o.papeles.map((p) => ETIQUETA_PAPEL[p]).join(", ")} · {o.motivo}</span></p>
              <Switch aria-label={`Activa ${o.nombre}`} checked={Boolean(activadas[o.id])} onCheckedChange={() => void activar(o)} />
            </div>
          ))}
        </div>
      )}
      {paso === 2 && (
        <div aria-label="Gratis por vincular" className="mt-3 space-y-2">
          {gratis.length === 0 && <p className="text-xs text-white/50">Nada gratis por vincular para este ámbito.</p>}
          {gratis.map((o) => (
            <div key={o.id} className={TARJETA}>
              <p className="text-sm">{o.nombre}{o.limite ? ` · ${o.limite.nota}` : ""}{o.verificado ? " · verificado" : " · sin verificar"}</p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {(o.enlaceAlta ?? o.enlaceClave) ? <a href={o.enlaceAlta ?? o.enlaceClave ?? "#"} target="_blank" rel="noopener noreferrer" className="cursor-pointer rounded-full border border-white/20 px-3 py-1 text-xs transition hover:bg-white/10">Vincular</a>
                  : <span className="text-xs text-white/50">Sin enlace oficial marcado.</span>}
                <Input type="password" autoComplete="off" className="max-w-56" placeholder="Pega aquí tu clave…" aria-label={`Clave de ${o.nombre}`} value={claves[o.id] ?? ""} onChange={(e) => setClaves((m) => ({ ...m, [o.id]: e.target.value }))} />
                <button type="button" onClick={() => void enviarClave(o)} className="cursor-pointer rounded-full bg-white/15 px-3 py-1 text-xs transition hover:bg-white/25">Enviar clave</button>
                {huellas[o.id] && <span className="text-[10px] text-white/50">Guardada · huella {huellas[o.id]}…</span>}
              </div>
            </div>
          ))}
        </div>
      )}
      {paso === 3 && (
        <div aria-label="Resumen por papel" className="mt-3 space-y-2">
          {resumen.length === 0 && <p className="text-xs text-white/50">Sin asignaciones todavía.</p>}
          {resumen.map((r) => (
            <div key={r.papel} className={TARJETA}>
              <p className="text-sm">{ETIQUETA_PAPEL[r.papel]} · {r.cadena.length > 0 ? r.cadena.join(" → ") : "cadena vacía"} <span className="text-xs text-white/50">{r.motivo}</span></p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
