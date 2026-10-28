"use client";

// TarjetaVariacion (Ola 1019V · tarea P; contrato architecture/variaciones-publicas.md §4):
// vista previa del payload, «Probar» (aplica en vivo y deshace al pulsar de nuevo o al cerrar),
// «Aplicar» con deshacer visible, «Guardar en la Biblioteca» (SaveToLibrary), «Compartir»
// (ShareToDialog), «Ver origen», valoración y licencia. Las de código piden confirmación y se
// ven solo aisladas (iframe con sandbox). Nada se ejecuta sin validar con el adaptador (§5).

import { useEffect, useRef, useState } from "react";
import { ExternalLink, RotateCcw, Star, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SaveToLibrary } from "@/components/library/save-to-library";
import { ShareToDialog } from "@/components/sharing/share-to-dialog";
import { adaptadorDe } from "@/lib/variaciones/familias";
import { recursoDeVariacion } from "@/lib/variaciones/publicar-campos";
import type { VariacionVentana } from "./ventana-variaciones";
const FAMILIAS_CODIGO = new Set(["herramienta", "atomo"]);

/** Una variación es «de código» por su familia o por su etiqueta de código: pide confirmación y marco aislado. */
export function esDeCodigo(v: { familia: string; etiquetas: readonly string[] }): boolean {
  return FAMILIAS_CODIGO.has(v.familia) || v.etiquetas.some((e) => e.includes("codigo"));
}
/** Resumen en texto del payload para la vista previa; puro, sin ejecutar nada. */
export function textoVistaPrevia(payload: unknown): string {
  const texto = payload == null ? "" : typeof payload === "string" ? payload : typeof payload === "number" ? String(payload) : JSON.stringify(payload, null, 2);
  if (!texto) return "Sin estado capturado; probar la variación enseña el efecto en el elemento.";
  return texto.length > 320 ? `${texto.slice(0, 320)}…` : texto;
}
const escaparHtml = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] ?? c));

export interface TarjetaVariacionProps {
  /** Clave canónica del elemento (`widget:clima`): nombra el TIPO del elemento, nunca la instancia. */
  clave: string;
  variacion: VariacionVentana;
  /** Payload de la fila de datos; lo inyecta quien conoce la capa de datos, la tarjeta no consulta nada. */
  payload?: unknown;
}

type Modo = "nada" | "probando" | "aplicada";
const ESTADOS: Record<Modo, string | null> = { nada: null, probando: "Probando en el elemento — se deshace al pulsar de nuevo o al cerrar", aplicada: "Aplicada al elemento" };

export function TarjetaVariacion({ clave, variacion, payload }: TarjetaVariacionProps) {
  const adaptador = adaptadorDe(clave);
  const codigo = esDeCodigo(variacion);
  const [modo, setModo] = useState<Modo>("nada");
  const [motivos, setMotivos] = useState<string[]>([]);
  const [confirmar, setConfirmar] = useState(false);
  const [compartir, setCompartir] = useState(false);
  const deshacerRef = useRef<(() => void) | null>(null);

  useEffect(() => () => { deshacerRef.current?.(); deshacerRef.current = null; }, []); // deshace al cerrar (§4)
  function deshacer() { deshacerRef.current?.(); deshacerRef.current = null; setModo("nada"); }
  const validarYAplicar = (): boolean => {
    const valido = adaptador?.validar(payload);
    if (!valido || !valido.ok) { if (valido && !valido.ok) setMotivos(valido.motivos); return false; }
    deshacerRef.current?.();
    deshacerRef.current = adaptador.aplicar(clave, valido.payload).deshacer;
    setMotivos([]);
    return true;
  };

  function alProbar() {
    if (modo === "probando") { deshacer(); return; }
    if (validarYAplicar()) setModo("probando");
  }
  const alAplicar = () => { if (codigo) setConfirmar(true); else if (validarYAplicar()) setModo("aplicada"); };
  const alConfirmar = () => { setConfirmar(false); if (validarYAplicar()) setModo("aplicada"); };

  const guardarEnBiblioteca = {
    type: "file" as const, title: variacion.titulo, mime: "application/json",
    content: JSON.stringify({ kind: "starseed-variacion", v: 1, clave, id: variacion.id, licencia: variacion.licencia }),
    tags: [...new Set(["starseed-variacion", variacion.familia, ...variacion.etiquetas])].slice(0, 8),
  };
  const enlaceOrigen = variacion.enlaceExterno && /^https:\/\/\S+$/.test(variacion.enlaceExterno) ? variacion.enlaceExterno : null;
  return (
    <div data-tarjeta-variacion={variacion.id} className="rounded-2xl border border-border/50 bg-card/60 p-3 backdrop-blur-xl">
      <div className="flex flex-wrap items-baseline gap-2">
        <h4 className="text-sm font-semibold">{variacion.titulo}</h4>
        <span className="rounded-full border border-border/50 px-2 py-0.5 text-[10px] text-muted-foreground">{variacion.licencia}</span>
        {codigo && <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[10px] text-muted-foreground">Código</span>}
        <span className="ml-auto inline-flex items-center gap-1 text-[11px] text-muted-foreground"><Star className="size-3" aria-hidden /> {variacion.valoracionMedia.toFixed(1)} ({variacion.valoracionCount})</span>
      </div>
      {variacion.descripcion && <p className="mt-1 text-xs text-muted-foreground">{variacion.descripcion}</p>}
      <p className="mt-0.5 font-mono text-[10px] text-muted-foreground">{clave}</p>
      <div className="mt-2 rounded-xl border border-border/40 bg-background/40 p-2">
        {codigo ? (
          <iframe title={`Vista aislada de ${variacion.titulo}`} sandbox="" srcDoc={`<pre style="margin:0;white-space:pre-wrap;font:11px ui-monospace">${escaparHtml(textoVistaPrevia(payload))}</pre>`} className="aspect-[4/1] w-full rounded-lg bg-transparent" />
        ) : (
          <pre className="m-0 whitespace-pre-wrap font-mono text-[11px] text-muted-foreground">{textoVistaPrevia(payload)}</pre>
        )}
      </div>
      {motivos.length > 0 && <ul className="mt-1 list-inside list-disc text-[11px] text-destructive">{motivos.slice(0, 3).map((m) => <li key={m}>{m}</li>)}</ul>}
      {ESTADOS[modo] && <p role="status" className="mt-1 text-[11px] text-muted-foreground">{ESTADOS[modo]}</p>}
      {confirmar && (
        <div role="alertdialog" aria-label="Confirmar variación de código" className="mt-2 rounded-xl border border-border/50 bg-card/80 p-2">
          <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground"><TriangleAlert className="size-3.5 text-destructive" aria-hidden /> Esta variación lleva código: se abre solo dentro de su marco aislado. ¿Proseguir?</p>
          <div className="mt-1.5 flex gap-2">
            <Button size="sm" variant="outline" className="cursor-pointer h-6 px-2 text-[11px]" onClick={() => setConfirmar(false)}>Cancelar</Button>
            <Button size="sm" className="cursor-pointer h-6 px-2 text-[11px]" onClick={alConfirmar}>Abrir aislada</Button>
          </div>
        </div>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <Button size="sm" variant="outline" disabled={!adaptador} className="cursor-pointer h-7 px-2.5 text-[11px]" onClick={alProbar}>Probar</Button>
        <Button size="sm" disabled={!adaptador} className="cursor-pointer h-7 px-2.5 text-[11px]" onClick={alAplicar}>Aplicar</Button>
        {modo === "aplicada" && <Button size="sm" variant="ghost" className="cursor-pointer h-7 px-2 text-[11px]" onClick={deshacer}><RotateCcw className="size-3" aria-hidden /> Deshacer</Button>}
        {enlaceOrigen && <a href={enlaceOrigen} target="_blank" rel="noopener noreferrer" className="inline-flex cursor-pointer items-center gap-1 text-[11px] text-primary hover:underline"><ExternalLink className="size-3" aria-hidden /> Ver origen</a>}
        <span className="ml-auto inline-flex items-center gap-1.5">
          <Button size="sm" variant="ghost" className="cursor-pointer h-7 px-2 text-[11px]" onClick={() => setCompartir(true)}>Compartir</Button>
          <SaveToLibrary item={guardarEnBiblioteca} variant="icon" label="Guardar en la Biblioteca" className="size-7" />
        </span>
      </div>
      <ShareToDialog open={compartir} onOpenChange={setCompartir} resource={recursoDeVariacion({ clave, titulo: variacion.titulo, descripcion: variacion.descripcion, id: variacion.id })} />
    </div>
  );
}

export default TarjetaVariacion;
