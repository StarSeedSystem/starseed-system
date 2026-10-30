"use client";
// Tarjeta pública (contrato §4): probar/aplicar con deshacer, guardar, compartir, origen, valoración y licencia; se valida.
import { useEffect, useMemo, useRef, useState } from "react";
import { BookMarked, Code2, ExternalLink, Play, Share2, Star, Undo2 } from "lucide-react";
import { adaptadorDe } from "@/lib/variaciones/familias";
import { validarVariacion } from "@/lib/variaciones/validar";
import { recursoDeVariacion } from "@/lib/variaciones/publicar-campos";
import { SaveToLibrary } from "@/components/library/save-to-library";
import { ShareToDialog } from "@/components/sharing/share-to-dialog";
export interface DatosTarjetaVariacion {
  id: string; titulo: string; descripcion?: string; version?: string; familia?: string;
  licencia: string; etiquetas?: string[]; valoracionMedia?: number; valoracionCount?: number;
  deVariacion?: string; enlaceExterno?: string; payload?: unknown;
}
export interface AccionesTarjetaVariacion {
  vistaPrevia?: (clave: string, v: DatosTarjetaVariacion) => (() => void) | void;
  aplicar?: (clave: string, v: DatosTarjetaVariacion) => (() => void) | void;
  abrirAislada?: (clave: string, v: DatosTarjetaVariacion) => void;
  abrirOrigen?: (v: DatosTarjetaVariacion) => void;
  valorar?: (estrellas: number, v: DatosTarjetaVariacion) => void;
  confirmar?: (mensaje: string) => boolean;
  avisar?: (mensaje: string) => void;
}
export interface TarjetaVariacionProps { clave: string; variacion: DatosTarjetaVariacion; acciones?: AccionesTarjetaVariacion }
export type FaseTarjeta = "reposo" | "probando" | "aplicada";
export type BotonTarjeta = "probar" | "aplicar";
export type AccionTarjeta = "previsualizar" | "aplicar-tras-previa" | "aplicar" | "deshacer" | "abrir-aislada";
export interface PasoTarjeta { fase: FaseTarjeta; accion: AccionTarjeta }
export function siguientePaso(fase: FaseTarjeta, boton: BotonTarjeta, codigo = false): PasoTarjeta {
  if (codigo) return { fase: "reposo", accion: "abrir-aislada" };
  if (fase === "aplicada") return { fase: "reposo", accion: "deshacer" };
  if (boton === "probar") return fase === "probando"
    ? { fase: "reposo", accion: "deshacer" }
    : { fase: "probando", accion: "previsualizar" };
  return { fase: "aplicada", accion: fase === "probando" ? "aplicar-tras-previa" : "aplicar" };
}
export function deshacerAlCerrar(fase: FaseTarjeta): boolean { return fase === "probando"; }
export function enlaceOrigenSeguro(url?: string): string | null {
  return url && /^https:\/\/\S+$/.test(url) ? url : null;
}
export function textoValoracion(media = 0, count = 0): string {
  const n = Number.isFinite(media) ? Math.min(5, Math.max(0, media)) : 0;
  return `${n.toFixed(1)} (${Math.max(0, Math.trunc(count))})`;
}
export function esVariacionDeCodigo(v: Pick<DatosTarjetaVariacion, "familia">): boolean {
  return v.familia === "atomo" || v.familia === "herramienta";
}
export function motivoNoValida(v: DatosTarjetaVariacion, codigo: boolean): string | null {
  if (v.payload === undefined) return null;
  const r = validarVariacion(v.payload, { codigo });
  return r.ok ? null : r.motivos.join(" · ");
}
export function vistaPreviaTexto(payload: unknown, max = 600): string {
  if (payload === undefined) return "";
  try {
    const t = JSON.stringify(payload, null, 2) ?? "";
    return t.length > max ? `${t.slice(0, max)}…` : t;
  } catch {
    return "Vista previa no disponible: el payload no se puede serializar.";
  }
}
export function TarjetaVariacion({ clave, variacion: v, acciones = {} }: TarjetaVariacionProps) {
  const codigo = esVariacionDeCodigo(v);
  const [fase, setFase] = useState<FaseTarjeta>("reposo");
  const [guardar, setGuardar] = useState(false), [compartir, setCompartir] = useState(false);
  const previa = useRef<(() => void) | null>(null), aplicada = useRef<(() => void) | null>(null);
  const faseRef = useRef(fase); faseRef.current = fase;
  const adaptador = useMemo(() => adaptadorDe(clave), [clave]);
  const url = enlaceOrigenSeguro(v.enlaceExterno), motivo = motivoNoValida(v, codigo);
  const recurso = recursoDeVariacion({ clave, titulo: v.titulo, descripcion: v.descripcion, id: v.id });
  const avisar = acciones.avisar ?? (() => {}), confirmar = acciones.confirmar ?? ((m: string) => typeof window !== "undefined" && window.confirm(m));
  const aplicar = acciones.aplicar ?? ((c: string, vv: DatosTarjetaVariacion) => { try { return adaptador?.aplicar(c, vv.payload).deshacer; } catch { return undefined; } });
  useEffect(() => () => { if (deshacerAlCerrar(faseRef.current) && previa.current) { previa.current(); previa.current = null; } }, []);
  const ejecutar = (accion: AccionTarjeta) => {
    if (motivo) return avisar(motivo);
    if (accion === "abrir-aislada") {
      if (!confirmar("Esta variación contiene código. Se abrirá aislada, sin acceso a tu cuenta ni a tus datos. ¿Continuar?")) return;
      return acciones.abrirAislada ? acciones.abrirAislada(clave, v) : avisar("No hay un visor aislado disponible.");
    }
    if (accion === "deshacer") { (previa.current ?? aplicada.current)?.(); previa.current = null; aplicada.current = null; return; }
    if (accion === "previsualizar") { const d = acciones.vistaPrevia?.(clave, v) ?? aplicar(clave, v); previa.current = typeof d === "function" ? d : null; return; }
    if (accion === "aplicar-tras-previa") { previa.current?.(); previa.current = null; }
    const d = aplicar(clave, v); aplicada.current = typeof d === "function" ? d : null;
  };
  const pulsar = (b: BotonTarjeta) => {
    const paso = siguientePaso(fase, b, codigo);
    if (paso.accion === "previsualizar" && !acciones.vistaPrevia && !acciones.aplicar && !adaptador) return avisar("Esta variación no tiene adaptador para probarla.");
    if (paso.accion === "aplicar" && !acciones.aplicar && !adaptador) return avisar("Esta variación no tiene adaptador para aplicarla.");
    setFase(paso.fase); ejecutar(paso.accion);
  };
  const boton = "cursor-pointer rounded-full border border-border/50 bg-background/40 px-3 py-1 text-xs text-muted-foreground hover:text-foreground";
  return (
    <article className="rounded-2xl border border-border/50 bg-card/60 p-3 backdrop-blur-xl">
      <div className="flex flex-wrap items-baseline gap-2">
        <h4 className="text-sm font-semibold">{v.titulo}</h4>
        {v.version && <span className="font-mono text-[10px] text-muted-foreground">v{v.version}</span>}
        <span className="rounded-full border border-border/50 px-2 py-0.5 text-[10px] text-muted-foreground">{v.licencia || "Sin licencia"}</span>
        {codigo && <span className="inline-flex items-center gap-1 rounded-full bg-muted/60 px-2 py-0.5 text-[10px] text-muted-foreground"><Code2 className="size-3" aria-hidden /> código aislado</span>}
      </div>
      {v.descripcion && <p className="mt-1 text-xs text-muted-foreground">{v.descripcion}</p>}
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground"><Star className="size-3" aria-hidden /> {textoValoracion(v.valoracionMedia, v.valoracionCount)}</span>
        {[1, 2, 3, 4, 5].map((n) => <button key={n} type="button" aria-label={`Valorar con ${n} estrellas`} onClick={() => acciones.valorar?.(n, v)} className="cursor-pointer text-muted-foreground hover:text-primary"><Star className="size-3" aria-hidden /></button>)}
        {(v.etiquetas ?? []).map((e) => <span key={e} className="rounded-full bg-muted/60 px-2 py-0.5 text-[10px] text-muted-foreground">{e}</span>)}
      </div>
      {v.payload !== undefined && <pre className="mt-2 max-h-24 overflow-auto rounded-xl border border-border/40 bg-background/40 p-2 text-[10px] text-muted-foreground">{vistaPreviaTexto(v.payload)}</pre>}
      {fase !== "reposo" && <p role="status" className="mt-2 text-[11px] text-primary">{fase === "probando" ? "Vista previa en vivo: se deshace al cerrar o al pulsar «Probar» otra vez." : "Aplicada. Puedes deshacerla cuando quieras."}</p>}
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <button type="button" onClick={() => pulsar("probar")} className={boton}><Play className="mr-1 inline size-3" aria-hidden />{fase === "probando" ? "Cerrar prueba" : codigo ? "Probar aislada" : "Probar"}</button>
        <button type="button" onClick={() => pulsar("aplicar")} className={`${boton} border-primary/50 bg-primary/15 text-foreground`}><Undo2 className="mr-1 inline size-3" aria-hidden />{fase === "aplicada" ? "Deshacer" : codigo ? "Abrir aislada" : "Aplicar"}</button>
        {guardar ? <SaveToLibrary variant="button" label="Guardar en la Biblioteca" item={{ type: "file", refId: v.id, title: v.titulo, description: v.descripcion, tags: v.etiquetas, url: url ?? undefined, content: JSON.stringify({ clave, variacion: v.id }) }} />
          : <button type="button" onClick={() => setGuardar(true)} className={boton}><BookMarked className="mr-1 inline size-3" aria-hidden />Guardar en la Biblioteca</button>}
        <button type="button" onClick={() => setCompartir(true)} className={boton}><Share2 className="mr-1 inline size-3" aria-hidden />Compartir</button>
        {compartir && <ShareToDialog open onOpenChange={setCompartir} resource={recurso} />}
        <button type="button" onClick={() => acciones.abrirOrigen ? acciones.abrirOrigen(v) : avisar(v.deVariacion ? `Deriva de ${v.deVariacion}.` : "Esta variación no declara un origen.")} className={boton}>Ver origen <ExternalLink className="ml-1 inline size-3" aria-hidden /></button>
      </div>
    </article>
  );
}
export default TarjetaVariacion;
