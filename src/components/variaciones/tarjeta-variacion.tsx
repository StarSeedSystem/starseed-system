"use client";

// TarjetaVariacion — tarjeta de variación pública (Ola 1019V · tarea P · contrato §4 de
// architecture/variaciones-publicas.md): vista previa, «Probar» (aplica y deshace al cerrar
// o al pulsar de nuevo), «Aplicar» con deshacer visible, guardar en Biblioteca, compartir,
// «Ver origen», valoración y licencia; código pide confirmación y corre aislado. Adaptador
// inyectable (§5); nada se ejecuta sin validar.
import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Check, ExternalLink, Eye, RotateCcw, Share2, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SaveToLibrary } from "@/components/library/save-to-library";
import { ShareToDialog } from "@/components/sharing/share-to-dialog";
import { SANDBOX_CODIGO, validarVariacion } from "@/lib/variaciones/validar";
import { adaptadorDe, type AdaptadorFamilia } from "@/lib/variaciones/familias";
import type { ShareResourceRef } from "@/lib/sharing/share-targets";

/** Datos mínimos que pinta y ejecuta una tarjeta; el payload ya viene publicado. */
export interface VariacionTarjeta {
  id: string; clave: string; titulo: string; descripcion: string; version?: string; licencia: string;
  etiquetas: string[]; valoracionMedia: number; valoracionCount: number; payload: unknown;
  /** código: pide confirmación y corre aislada */ codigo?: boolean; enlaceOrigen?: string;
}
export interface TarjetaVariacionProps {
  variacion: VariacionTarjeta;
  adaptador?: AdaptadorFamilia<unknown> | null; // inyectable para pruebas (contrato §5)
}

// ─────── Helpers puros (probables sin DOM) ───────
export const esVariacionDeCodigo = (v: VariacionTarjeta): boolean => v.codigo === true || validarVariacion(v.payload).requiereAislamiento;
export function htmlDePayload(payload: unknown): string {
  if (typeof payload !== "object" || payload === null) return "";
  const registro = payload as Record<string, unknown>;
  return typeof registro.html === "string" ? registro.html : "";
}
export function textoVistaPrevia(payload: unknown, adaptador?: AdaptadorFamilia<unknown> | null): string {
  const delAdaptador = adaptador?.vistaPrevia?.(payload);
  if (delAdaptador !== undefined && delAdaptador !== null) return String(delAdaptador);
  const texto = JSON.stringify(payload);
  if (texto === undefined) return "";
  return texto.length > 200 ? `${texto.slice(0, 200)}…` : texto;
}
export const TEXTO_CONFIRMACION_CODIGO = "Esta variación lleva código: pide tu confirmación y se ejecuta aislada, en un iframe sin acceso al propio origen (sandbox).";
export function recursoDeTarjeta(v: VariacionTarjeta): ShareResourceRef {
  return { kind: "archivo", id: v.id, name: v.titulo, mime: "application/json", note: v.descripcion || `Variación pública de ${v.clave}` };
}
export function itemDeBiblioteca(v: VariacionTarjeta): { type: "file"; title: string; mime: string; content: string; tags: string[] } {
  const contenido = JSON.stringify({ kind: "starseed-variacion", v: 1, clave: v.clave, id: v.id, licencia: v.licencia, payload: v.payload });
  return { type: "file", title: v.titulo, mime: "application/json", content: contenido, tags: ["starseed-variacion", v.clave.split(":")[0] ?? "", ...v.etiquetas].filter(Boolean) };
}

// ─────── Componente ───────
export function TarjetaVariacion({ variacion, adaptador }: TarjetaVariacionProps) {
  const resuelto = adaptador !== undefined ? adaptador : adaptadorDe(variacion.clave);
  const esCodigo = esVariacionDeCodigo(variacion);
  const [probando, setProbando] = useState(false);
  const [aplicada, setAplicada] = useState(false);
  const [pendiente, setPendiente] = useState<null | "probar" | "aplicar">(null);
  const [confirmada, setConfirmada] = useState(false);
  const [compartir, setCompartir] = useState(false);
  const [motivos, setMotivos] = useState<string[]>([]);
  const deshacer = useRef<(() => void) | null>(null);
  const previa = useMemo(() => textoVistaPrevia(variacion.payload, resuelto), [variacion.payload, resuelto]);
  const origen = typeof variacion.enlaceOrigen === "string" && /^https:\/\/\S+$/.test(variacion.enlaceOrigen) ? variacion.enlaceOrigen : null;

  const quitar = () => { deshacer.current?.(); deshacer.current = null; setProbando(false); };
  // Contrato §4: nada se ejecuta sin validar; las de código piden confirmación primero.
  function ejecutar(modo: "probar" | "aplicar") {
    if (esCodigo && !confirmada) { setPendiente(modo); return; }
    const resultado = validarVariacion(variacion.payload, { codigo: esCodigo });
    if (!resultado.ok) { setMotivos(resultado.motivos); return; }
    try {
      const r = resuelto?.aplicar(variacion.clave, variacion.payload);
      deshacer.current = r?.deshacer ?? null;
      setMotivos([]);
    } catch (error) {
      setMotivos([`El adaptador no pudo aplicar la variación: ${error instanceof Error ? error.message : String(error)}`]);
      return;
    }
    setProbando(true);
    if (modo === "aplicar") setAplicada(true);
  }
  // «Probar» se deshace solo al cerrar: al desmontar la tarjeta (cerraron la ventana).
  useEffect(() => () => deshacer.current?.(), []);
  return (
    <li data-ss-tarjeta-variacion={variacion.id} className="rounded-2xl border border-border/50 bg-card/60 p-3 backdrop-blur-xl">
      <div className="flex flex-wrap items-baseline gap-2">
        <h4 className="text-sm font-semibold">{variacion.titulo}</h4>
        <span className="rounded-full border border-border/50 px-2 py-0.5 text-[10px] text-muted-foreground">{variacion.licencia}</span>
        {variacion.version && <span className="font-mono text-[10px] text-muted-foreground">v{variacion.version}</span>}
        <span className="ml-auto inline-flex items-center gap-1 text-[11px] text-muted-foreground"><Star className="size-3" aria-hidden /> {variacion.valoracionMedia.toFixed(1)} ({variacion.valoracionCount})</span>
      </div>
      {variacion.descripcion && <p className="mt-1 text-xs text-muted-foreground">{variacion.descripcion}</p>}
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {variacion.etiquetas.map((e) => <span key={e} className="rounded-full bg-muted/60 px-2 py-0.5 text-[10px] text-muted-foreground">{e}</span>)}
        {origen && <a href={origen} target="_blank" rel="noopener noreferrer" className="ml-auto inline-flex cursor-pointer items-center gap-1 text-[11px] text-primary hover:underline">Ver origen <ExternalLink className="size-3" aria-hidden /></a>}
      </div>
      {esCodigo
        ? <iframe title={`Vista previa aislada de ${variacion.titulo}`} sandbox={SANDBOX_CODIGO} srcDoc={htmlDePayload(variacion.payload)} className="mt-2 h-24 w-full rounded-xl border border-border/40 bg-background/40" />
        : <pre className="mt-2 max-h-24 overflow-auto rounded-xl border border-border/40 bg-background/30 p-2 font-mono text-[11px] text-muted-foreground">{previa || "Sin vista previa"}</pre>}
      {pendiente && (
        <div role="alertdialog" aria-label="Confirmar variación de código" className="mt-2 flex flex-wrap gap-2 rounded-xl border border-destructive/50 bg-destructive/10 p-2 text-xs">
          <p className="flex w-full items-center gap-1.5"><AlertTriangle className="size-3.5" aria-hidden /> {TEXTO_CONFIRMACION_CODIGO}</p>
          <button type="button" onClick={() => { setConfirmada(true); const modo = pendiente; setPendiente(null); ejecutar(modo); }} className="cursor-pointer rounded-full border border-destructive/50 bg-destructive/20 px-2.5 py-0.5 text-[11px] font-medium hover:bg-destructive/30">Confirmar y ejecutar</button>
          <button type="button" onClick={() => setPendiente(null)} className="cursor-pointer rounded-full border border-border/50 px-2.5 py-0.5 text-[11px] text-muted-foreground hover:text-foreground">Cancelar</button>
        </div>
      )}
      {motivos.length > 0 && <ul role="alert" className="mt-2 list-inside list-disc text-xs text-destructive">{motivos.slice(0, 4).map((m) => <li key={m}>{m}</li>)}</ul>}
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <Button size="sm" variant="outline" className="cursor-pointer gap-1.5 text-xs" onClick={() => (probando ? quitar() : ejecutar("probar"))}><Eye className="size-3.5" aria-hidden /> {probando ? "Quitar prueba" : "Probar"}</Button>
        <Button size="sm" variant="outline" className="cursor-pointer gap-1.5 text-xs" onClick={() => ejecutar("aplicar")}><Check className="size-3.5" aria-hidden /> Aplicar</Button>
        {aplicada && <Button size="sm" variant="ghost" className="cursor-pointer gap-1.5 text-xs" onClick={() => { quitar(); setAplicada(false); }}><RotateCcw className="size-3.5" aria-hidden /> Deshacer</Button>}
        <SaveToLibrary item={itemDeBiblioteca(variacion)} label="Guardar en la Biblioteca" className="text-xs" />
        <Button size="sm" variant="ghost" className="cursor-pointer gap-1.5 text-xs" onClick={() => setCompartir(true)}><Share2 className="size-3.5" aria-hidden /> Compartir</Button>
      </div>
      <ShareToDialog open={compartir} onOpenChange={setCompartir} resource={recursoDeTarjeta(variacion)} />
    </li>
  );
}

export default TarjetaVariacion;
