"use client";
// Tarjeta de variación pública (Ola 1019V · contrato §4): vista previa, «Probar» (aplica y se
// deshace al cerrar o al volver a pulsar), «Aplicar» con deshacer, guardar, compartir, origen,
// valoración y licencia. El código pide confirmación y se abre aislado: nunca corre en el OS.
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Check, Eye, ExternalLink, Play, ShieldAlert, Star, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SaveToLibrary } from "@/components/library/save-to-library";
import { ShareToDialog } from "@/components/sharing/share-to-dialog";
import { adaptadorDe, type AdaptadorFamilia } from "@/lib/variaciones/familias";
import { SANDBOX_CODIGO, validarVariacion } from "@/lib/variaciones/validar";
import { recursoDeVariacion } from "@/lib/variaciones/publicar-campos";
import type { Variacion } from "@/lib/variaciones/orden";
export interface VariacionTarjeta extends Variacion { payload: unknown; tema?: string; enlaceExterno?: string; deVariacion?: string | null }
export type ModoTarjeta = "inactiva" | "probando" | "aplicada";
export type PasoTarjeta = { tipo: "confirmar" } | { tipo: "aplicar"; modo: "probando" | "aplicada" } | { tipo: "promover" } | { tipo: "deshacer" };
/** Decisión pura: qué hacer al pulsar «Probar» o «Aplicar». El código siempre confirma. */
export function siguientePaso(modo: ModoTarjeta, accion: "probar" | "aplicar", codigo: boolean): PasoTarjeta {
  if (codigo) return { tipo: "confirmar" };
  if (accion === "probar") return modo === "inactiva" ? { tipo: "aplicar", modo: "probando" } : { tipo: "deshacer" };
  if (modo === "inactiva") return { tipo: "aplicar", modo: "aplicada" };
  return modo === "probando" ? { tipo: "promover" } : { tipo: "deshacer" };
}
/** Enlace de origen: solo https y sin espacios (nunca javascript:, data: ni http). */
export const enlaceSeguro = (url?: string | null): string | null => (url && /^https:\/\/\S+$/.test(url) ? url : null);
/** Vista previa legible: la del adaptador si existe; si lanza o falta, el payload tal cual. */
export function vistaPreviaDe(adaptador: AdaptadorFamilia<unknown> | null, payload: unknown): string {
  try { const vista = adaptador?.vistaPrevia ? adaptador.vistaPrevia(payload) : payload; return JSON.stringify(vista ?? payload, null, 2) ?? "—"; }
  catch { return "La vista previa de esta familia no está disponible."; }
}
/** ¿La variación es código? También por familia (átomos y herramientas). */
export const esCodigo = (payload: unknown, familia: string): boolean =>
  validarVariacion(payload, { codigo: familia === "atomo" || familia === "herramienta" }).requiereAislamiento;
const escapar = (texto: string): string => texto.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
function htmlDe(payload: unknown): string {
  if (typeof payload === "string") return payload;
  const registro = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : null;
  for (const clave of ["html", "codigo", "script", "css"]) if (registro && typeof registro[clave] === "string") return registro[clave] as string;
  return `<pre>${escapar(JSON.stringify(payload ?? null, null, 2) ?? "—")}</pre>`;
}
/** Documento sandbox: sin allow-same-origin, sin acceso a la cuenta ni al OS. */
export const documentoAislado = (payload: unknown): string =>
  `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">`
  + `<style>body{margin:0;padding:12px;font:13px system-ui;background:#0b0b10;color:#e8e8ef}</style></head><body>${htmlDe(payload)}</body></html>`;
export interface TarjetaVariacionProps {
  clave: string; variacion: VariacionTarjeta; adaptador?: AdaptadorFamilia<unknown> | null;
  alValorar?: (id: string, valor: number) => void | Promise<void>; miValoracion?: number | null; alVerOrigen?: (id: string) => void;
}
export function TarjetaVariacion({ clave, variacion, adaptador, alValorar, miValoracion = null, alVerOrigen }: TarjetaVariacionProps) {
  const adapt = useMemo(() => adaptador ?? adaptadorDe(clave), [adaptador, clave]);
  const codigo = useMemo(() => esCodigo(variacion.payload, variacion.familia), [variacion.payload, variacion.familia]);
  const [modo, setModo] = useState<ModoTarjeta>("inactiva");
  const [confirmar, setConfirmar] = useState(false);
  const [aislada, setAislada] = useState(false);
  const [compartir, setCompartir] = useState(false);
  const deshacerRef = useRef<(() => void) | null>(null);
  const vivo = useRef<{ modo: ModoTarjeta; deshacer: (() => void) | null }>({ modo: "inactiva", deshacer: null });
  useEffect(() => { vivo.current = { modo, deshacer: deshacerRef.current }; }, [modo]);
  useEffect(() => () => { if (vivo.current.modo === "probando") vivo.current.deshacer?.(); }, []);
  function ejecutar(accion: "probar" | "aplicar") {
    const paso = siguientePaso(modo, accion, codigo);
    if (paso.tipo === "confirmar") { setConfirmar(true); return; }
    if (paso.tipo === "deshacer") { deshacerRef.current?.(); deshacerRef.current = null; setModo("inactiva"); return; }
    if (paso.tipo === "promover") { setModo("aplicada"); return; }
    if (!adapt) { toast.error("Esta familia no declara cómo aplicarse."); return; }
    const validado = adapt.validar(variacion.payload);
    if (!validado.ok) { toast.error(validado.motivos[0] ?? "No se pudo validar la variación."); return; }
    try { deshacerRef.current = adapt.aplicar(clave, validado.payload).deshacer; setModo(paso.modo); }
    catch { toast.error("No se pudo aplicar la variación."); }
  }
  const item = useMemo(() => ({ type: "file" as const, title: variacion.titulo, mime: "application/json", content: JSON.stringify({ kind: "starseed-variacion", v: 1, clave, payload: variacion.payload, licencia: variacion.licencia }), tags: ["starseed-variacion", variacion.familia] }), [clave, variacion]);
  const recurso = useMemo(() => recursoDeVariacion({ clave, titulo: variacion.titulo, descripcion: variacion.descripcion, id: variacion.id }), [clave, variacion]);
  const origen = enlaceSeguro(variacion.enlaceExterno), origenInterno = variacion.deVariacion ?? null, activa = modo !== "inactiva";
  return (
    <article data-ss-tarjeta-variacion={variacion.id} className="rounded-2xl border border-border/50 bg-card/60 p-3 backdrop-blur-xl">
      <div className="flex flex-wrap items-baseline gap-2"><h4 className="text-sm font-semibold">{variacion.titulo}</h4>
        <span className="rounded-full border border-border/50 px-2 py-0.5 text-[10px] text-muted-foreground">{variacion.licencia}</span>
        {variacion.version && <span className="font-mono text-[10px] text-muted-foreground">v{variacion.version}</span>}
        <span className="ml-auto inline-flex items-center gap-1 text-[11px] text-muted-foreground"><Star className="size-3" aria-hidden /> {variacion.valoracionMedia.toFixed(1)} ({variacion.valoracionCount})</span></div>
      {variacion.descripcion && <p className="mt-1 text-xs text-muted-foreground">{variacion.descripcion}</p>}
      <details className="mt-2 rounded-xl border border-border/40 bg-background/30 px-2 py-1">
        <summary className="cursor-pointer text-[11px] text-muted-foreground"><Eye className="mr-1 inline size-3" aria-hidden />Vista previa</summary>
        <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap break-words text-[10px] text-muted-foreground">{vistaPreviaDe(adapt, variacion.payload)}</pre>
      </details>
      {confirmar && (
        <div role="alertdialog" aria-label="Confirmar variación de código" className="mt-2 rounded-xl border border-amber-400/40 bg-amber-400/10 p-2 text-[11px] text-amber-200">
          <p><ShieldAlert className="mr-1 inline size-3" aria-hidden />Es código: se abre aislada, sin acceso a tu cuenta ni al OS.</p>
          <div className="mt-1 flex gap-1.5">
            <Button size="sm" className="h-7 cursor-pointer text-[11px]" onClick={() => { setConfirmar(false); setAislada(true); }}>Abrir aislada</Button>
            <Button size="sm" variant="ghost" className="h-7 cursor-pointer text-[11px]" onClick={() => setConfirmar(false)}>Cancelar</Button>
          </div>
        </div>
      )}
      {aislada && <iframe sandbox={SANDBOX_CODIGO} srcDoc={documentoAislado(variacion.payload)} title={`Variación aislada de ${variacion.titulo}`} className="mt-2 h-48 w-full rounded-xl border border-border/50 bg-background/40" />}
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <Button size="sm" variant="outline" className="h-7 cursor-pointer gap-1 text-[11px]" onClick={() => ejecutar("probar")} aria-pressed={modo === "probando"}>
          <Play className="size-3" aria-hidden />{modo === "probando" ? "Dejar de probar" : "Probar"}
        </Button>
        <Button size="sm" className="h-7 cursor-pointer gap-1 text-[11px]" onClick={() => ejecutar("aplicar")} aria-pressed={modo === "aplicada"}>
          <Check className="size-3" aria-hidden />{modo === "aplicada" ? "Aplicada" : "Aplicar"}
        </Button>
        {activa && <Button size="sm" variant="ghost" className="h-7 cursor-pointer gap-1 text-[11px]" onClick={() => { deshacerRef.current?.(); deshacerRef.current = null; setModo("inactiva"); }}><Undo2 className="size-3" aria-hidden />Deshacer</Button>}
        <SaveToLibrary item={item} variant="icon" className="h-7 w-7" />
        <Button size="icon" variant="ghost" className="h-7 w-7 cursor-pointer text-muted-foreground hover:text-foreground" aria-label="Compartir variación" onClick={() => setCompartir(true)}><ExternalLink className="size-3.5" aria-hidden /></Button>
        {origenInterno && alVerOrigen && <Button size="sm" variant="ghost" className="h-7 cursor-pointer text-[11px]" onClick={() => alVerOrigen(origenInterno)}>Ver origen</Button>}
        {origen && <a href={origen} target="_blank" rel="noopener noreferrer" className="ml-auto inline-flex cursor-pointer items-center gap-1 text-[11px] text-primary hover:underline">Ver origen <ExternalLink className="size-3" aria-hidden /></a>}
      </div>
      <div className="mt-2 flex items-center gap-0.5" role="radiogroup" aria-label="Valoración de la variación">
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} type="button" role="radio" aria-checked={(miValoracion ?? 0) >= n} aria-label={`Valorar con ${n} estrella${n === 1 ? "" : "s"}`} disabled={!alValorar}
            onClick={() => void alValorar?.(variacion.id, n)} className="cursor-pointer p-0.5 text-muted-foreground transition-colors hover:text-amber-400 disabled:cursor-default">
            <Star className={`size-3.5 ${(miValoracion ?? 0) >= n ? "fill-amber-400 text-amber-400" : ""}`} aria-hidden />
          </button>
        ))}
      </div>
      <ShareToDialog open={compartir} onOpenChange={setCompartir} resource={recurso} />
    </article>
  );
}
