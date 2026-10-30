"use client";
// Tarjeta de variación (Ola 1019V · contrato §4): vista previa del adaptador, «Probar»
// (aplica y se deshace al cerrar o al pulsar de nuevo), «Aplicar» con deshacer visible,
// guardar/compartir, origen, valoración y licencia. El código pide confirmación y solo se
// abre aislado (sandbox sin same-origin). La lógica pura se exporta para probarla aparte.
import { useEffect, useRef, useState } from "react";
import { Check, Code2, Eye, Play, Share2, ShieldAlert, Star, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SaveToLibrary } from "@/components/library/save-to-library";
import { ShareToDialog } from "@/components/sharing/share-to-dialog";
import { adaptadorDe } from "@/lib/variaciones/familias";
import { SANDBOX_CODIGO, validarVariacion } from "@/lib/variaciones/validar";
import type { SaveItemInput } from "@/lib/library/entity-library";
import type { ShareResourceRef } from "@/lib/sharing/share-targets";
export interface VariacionTarjeta {
  id: string; titulo: string; descripcion: string; version: string; familia: string; licencia: string; etiquetas: string[]; valoracionMedia: number; valoracionCount: number; payload?: unknown; codigo?: boolean; deVariacion?: string | null; enlaceExterno?: string | null; autor?: string;
}
export interface TarjetaVariacionProps {
  variacion: VariacionTarjeta; clave: string; onValorar?: (id: string, valor: number) => void; onVerOrigen?: (id: string) => void; biblioteca?: Omit<SaveItemInput, "folderId"> | null;
}
type Modo = "inactivo" | "probando" | "aplicado";
export const enlaceSeguro = (url?: string | null): string | null => (url && /^https:\/\/\S+$/.test(url) ? url : null);
/** Código si la familia lo declara o el payload lleva claves de código (html, js, css…). */
export function requiereAislamiento(v: VariacionTarjeta): boolean {
  return v.codigo === true || validarVariacion(v.payload, { codigo: v.codigo }).requiereAislamiento;
}
/** Vista previa textual y acotada del payload (o de lo que devuelva `vistaPrevia`). */
export function textoPrevio(payload: unknown, maximo = 400): string {
  if (payload === undefined || payload === null) return "";
  const valor = typeof payload === "string" ? payload : (() => { try { return JSON.stringify(payload, null, 2); } catch { return ""; } })();
  return valor.length > maximo ? `${valor.slice(0, maximo)}…` : valor;
}
/** Documento aislado para una variación de código: sin acceso al origen del OS. */
export function htmlAislado(payload: unknown): string {
  const r = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
  const css = r.css ? `<style>${String(r.css)}</style>` : "", js = r.js ?? r.javascript ?? r.script;
  const cuerpo = typeof payload === "string" ? payload : [r.html, css, js ? `<script>${String(js)}</script>` : ""].filter(Boolean).join("\n");
  return `<!doctype html><html lang="es"><meta charset="utf-8"><body>${cuerpo}</body></html>`;
}
/** Referencia compartible: solo la ficha pública de la variación, nunca datos privados. */
export function recursoDeVariacion(clave: string, v: VariacionTarjeta): ShareResourceRef {
  return { kind: "archivo", id: v.id, name: v.titulo, route: `/variaciones?clave=${encodeURIComponent(clave)}`, note: v.descripcion };
}
/** Ítem de Biblioteca: una referencia con su payload, sin duplicar contenido ajeno. */
export function itemBibliotecaDeVariacion(clave: string, v: VariacionTarjeta): Omit<SaveItemInput, "folderId"> {
  const content = JSON.stringify({ kind: "starseed-variacion", v: 1, clave, payload: v.payload, licencia: v.licencia });
  return { type: "file", title: v.titulo, mime: "application/json", content, tags: ["starseed-variacion", ...v.etiquetas] };
}
export function TarjetaVariacion({ variacion, clave, onValorar, onVerOrigen, biblioteca }: TarjetaVariacionProps) {
  const [modo, setModo] = useState<Modo>("inactivo");
  const [aviso, setAviso] = useState<string | null>(null);
  const [confirmando, setConfirmando] = useState<"probar" | "aplicar" | null>(null);
  const [aislado, setAislado] = useState(false), [compartir, setCompartir] = useState(false);
  const deshacer = useRef<(() => void) | null>(null), modoRef = useRef<Modo>(modo);
  modoRef.current = modo;
  const esCodigo = requiereAislamiento(variacion), adaptador = adaptadorDe(clave), origen = enlaceSeguro(variacion.enlaceExterno);
  useEffect(() => () => { if (modoRef.current === "probando") deshacer.current?.(); }, []);
  const deshacerAhora = () => { deshacer.current?.(); deshacer.current = null; setModo("inactivo"); };
  const ejecutar = (accion: "probar" | "aplicar") => {
    if (esCodigo) { setConfirmando(accion); return; }
    if (!adaptador) { setAviso("Este elemento todavía no tiene adaptador para aplicar variaciones."); return; }
    const revision = adaptador.validar(variacion.payload);
    if (!revision.ok) { setAviso(revision.motivos[0] ?? "La variación no pasa la validación."); return; }
    deshacer.current?.();
    try {
      deshacer.current = adaptador.aplicar(clave, revision.payload).deshacer;
      setModo(accion === "probar" ? "probando" : "aplicado"); setAviso(null);
    } catch { setAviso("No se pudo aplicar la variación en este elemento."); }
  };
  const vista = textoPrevio(adaptador?.vistaPrevia?.(variacion.payload) ?? variacion.payload);
  return (
    <div className="rounded-2xl border border-border/50 bg-card/60 p-4 backdrop-blur-xl" data-ss-variacion={variacion.id}>
      <div className="flex flex-wrap items-baseline gap-2">
        <h3 className="text-base font-semibold">{variacion.titulo}</h3>
        <span className="rounded-full border border-border/50 px-2 py-0.5 text-[10px] text-muted-foreground">{variacion.licencia}</span>
        {variacion.version && <span className="font-mono text-[10px] text-muted-foreground">v{variacion.version}</span>}
        {esCodigo && <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] text-amber-200"><Code2 className="size-3" aria-hidden /> Código aislado</span>}
        <span className="ml-auto inline-flex items-center gap-1 text-xs text-muted-foreground"><Star className="size-3.5" aria-hidden /> {variacion.valoracionMedia.toFixed(1)} ({variacion.valoracionCount})</span>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">{variacion.descripcion}</p>
      {vista && <pre className="mt-2 max-h-28 overflow-auto rounded-xl border border-border/40 bg-background/40 p-2 text-[10px] text-muted-foreground" aria-label="Vista previa de la variación">{vista}</pre>}
      {aislado && <iframe title={`Vista aislada de ${variacion.titulo}`} sandbox={SANDBOX_CODIGO} srcDoc={htmlAislado(variacion.payload)} className="mt-2 h-48 w-full rounded-xl border border-border/40 bg-background/40" />}
      <div className="mt-2 flex items-center gap-0.5" aria-label="Valoración">
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} type="button" disabled={!onValorar} onClick={() => onValorar?.(variacion.id, n)} aria-label={`Valorar con ${n} ${n === 1 ? "estrella" : "estrellas"}`}
            className="cursor-pointer rounded-full p-0.5 text-muted-foreground transition-colors hover:text-amber-300 disabled:cursor-default disabled:opacity-50">
            <Star className="size-3.5" aria-hidden fill={n <= Math.round(variacion.valoracionMedia) ? "currentColor" : "none"} />
          </button>
        ))}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <Button size="sm" variant="outline" className="cursor-pointer gap-1 text-xs" onClick={() => (modo === "probando" ? deshacerAhora() : ejecutar("probar"))}>
          {modo === "probando" ? <Undo2 className="size-3.5" aria-hidden /> : <Play className="size-3.5" aria-hidden />}{modo === "probando" ? "Deshacer prueba" : "Probar"}
        </Button>
        <Button size="sm" className="cursor-pointer gap-1 text-xs" onClick={() => ejecutar("aplicar")}><Check className="size-3.5" aria-hidden /> {modo === "aplicado" ? "Aplicado" : "Aplicar"}</Button>
        {modo === "aplicado" && <Button size="sm" variant="ghost" className="cursor-pointer gap-1 text-xs" onClick={deshacerAhora}><Undo2 className="size-3.5" aria-hidden /> Deshacer</Button>}
        <Button size="sm" variant="ghost" className="cursor-pointer gap-1 text-xs" disabled={!onVerOrigen && !origen && !variacion.deVariacion}
          onClick={() => { if (onVerOrigen) onVerOrigen(variacion.id); else if (origen) window.open(origen, "_blank", "noopener,noreferrer"); }}>
          <Eye className="size-3.5" aria-hidden /> Ver origen
        </Button>
        {biblioteca && <SaveToLibrary item={biblioteca} variant="button" label="Guardar en la Biblioteca" />}
        <Button size="sm" variant="ghost" className="cursor-pointer gap-1 text-xs" onClick={() => setCompartir(true)}><Share2 className="size-3.5" aria-hidden /> Compartir</Button>
      </div>
      {confirmando && (
        <div role="alertdialog" aria-label="Confirmar variación de código" className="mt-2 rounded-xl border border-amber-400/40 bg-amber-500/10 p-3 text-xs text-amber-100">
          <p className="flex items-center gap-1"><ShieldAlert className="size-3.5" aria-hidden /> Esta variación lleva código. No se aplica al OS: se abre aislada, sin acceso a tus datos.</p>
          <div className="mt-2 flex gap-2">
            <Button size="sm" className="cursor-pointer text-xs" onClick={() => { setAislado(true); setConfirmando(null); }}>Abrir aislada</Button>
            <Button size="sm" variant="ghost" className="cursor-pointer text-xs" onClick={() => setConfirmando(null)}>Cancelar</Button>
          </div>
        </div>
      )}
      {aviso && <p role="status" className="mt-2 text-xs text-muted-foreground">{aviso}</p>}
      {variacion.etiquetas.length > 0 && <div className="mt-2 flex flex-wrap gap-1">{variacion.etiquetas.map((e) => <span key={e} className="rounded-full bg-muted/60 px-2 py-0.5 text-[10px] text-muted-foreground">{e}</span>)}</div>}
      {variacion.autor && <p className="mt-1 text-[10px] text-muted-foreground">Por {variacion.autor}</p>}
      <ShareToDialog open={compartir} onOpenChange={setCompartir} resource={recursoDeVariacion(clave, variacion)} />
    </div>
  );
}
export default TarjetaVariacion;
