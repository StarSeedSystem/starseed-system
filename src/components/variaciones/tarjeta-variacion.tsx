"use client";
// Tarjeta de variación (Ola 1019V · tarea P · contrato: architecture/variaciones-publicas.md §4).
// Vista previa, «Probar» (aplica en vivo y deshace al cerrar o al pulsar de nuevo), «Aplicar» con
// deshacer visible, «Guardar en la Biblioteca», «Compartir», «Ver origen», valoración y licencia.
// Las de código piden confirmación y su vista previa vive aislada (iframe sandbox sin
// allow-same-origin). Todo lo que toca el mundo va INYECTADO: la tarjeta no toca Supabase, red,
// reloj ni DOM ajeno; `ventana-variaciones.tsx` es quien la monta en la pestaña.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Check, ExternalLink, Play, Save, Share2, Star, TriangleAlert, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SANDBOX_CODIGO } from "@/lib/variaciones/validar";

/** Datos que pinta la tarjeta; el payload y su validación ya los resolvió el anfitrión. */
export interface VariacionTarjeta {
  id: string;
  titulo: string;
  descripcion: string;
  licencia: string;
  valoracionMedia: number;
  valoracionCount: number;
  /** Id de la variación de la que deriva (cadena de origen, contrato §4). */
  deVariacion?: string | null;
  /** Enlace https que abre «Ver origen». */
  enlaceOrigen?: string | null;
  version?: string;
  /** La validación (`validarVariacion`) declaró que el payload exige aislamiento. */
  requiereAislamiento?: boolean;
}

/** Acciones inyectadas; `probar` y `aplicar` devuelven la función que deshace el cambio. */
export interface AccionesTarjeta {
  probar?: () => () => void;
  aplicar?: () => () => void;
  guardar?: () => void;
  compartir?: () => void;
}

export interface TarjetaVariacionProps {
  variacion: VariacionTarjeta;
  acciones: AccionesTarjeta;
  /** Vista previa ya resuelta por el adaptador de la familia, si la hay. */
  vistaPrevia?: ReactNode;
  /** Solo para las de código: vista previa aislada en un iframe con `srcDoc`. */
  htmlPrevia?: string | null;
}

export function TarjetaVariacion({ variacion, acciones, vistaPrevia, htmlPrevia }: TarjetaVariacionProps) {
  const codigo = variacion.requiereAislamiento === true;
  const [probando, setProbando] = useState(false);
  const [aplicado, setAplicado] = useState(false);
  /** Confirmación en curso de una variación de código: la acción que espera el «Confirmar». */
  const [pendiente, setPendiente] = useState<null | "probar" | "aplicar">(null);
  const deshacerProbar = useRef<(() => void) | null>(null);
  const deshacerAplicar = useRef<(() => void) | null>(null);
  useEffect(() => () => deshacerProbar.current?.(), []); // «Probar» se deshace SOLO al cerrar (contrato §4)
  const ejecutar = (accion: "probar" | "aplicar") => {
    const deshacer = accion === "probar" ? acciones.probar?.() : acciones.aplicar?.();
    if (!deshacer) return;
    (accion === "probar" ? deshacerProbar : deshacerAplicar).current = deshacer;
    if (accion === "probar") setProbando(true); else setAplicado(true);
  };
  const alternar = (accion: "probar" | "aplicar") => {
    const guardado = accion === "probar" ? deshacerProbar : deshacerAplicar;
    if (accion === "probar" ? probando : aplicado) {
      guardado.current?.(); guardado.current = null;
      if (accion === "probar") setProbando(false); else setAplicado(false);
      return;
    }
    if (codigo && pendiente !== accion) { setPendiente(accion); return; } // las de código piden confirmación
    setPendiente(null);
    ejecutar(accion);
  };
  const media = variacion.valoracionMedia.toFixed(1);
  const origen = variacion.enlaceOrigen && /^https:\/\/\S+$/.test(variacion.enlaceOrigen) ? variacion.enlaceOrigen : null;
  return (
    <article data-ss-variacion={variacion.id} className="rounded-2xl border border-border/50 bg-card/60 p-3 backdrop-blur-xl">
      <div className="flex flex-wrap items-baseline gap-2">
        <h4 className="text-sm font-semibold">{variacion.titulo}</h4>
        <span className="rounded-full border border-border/50 px-2 py-0.5 text-[10px] text-muted-foreground">{variacion.licencia}</span>
        {variacion.version && <span className="font-mono text-[10px] text-muted-foreground">v{variacion.version}</span>}
        {codigo && <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[10px] text-amber-600">Código · aislado</span>}
        <span className="ml-auto inline-flex items-center gap-1 text-[11px] text-muted-foreground"><Star className="size-3" aria-hidden /> {media} ({variacion.valoracionCount})</span>
      </div>
      {variacion.descripcion && <p className="mt-1 text-xs text-muted-foreground">{variacion.descripcion}</p>}
      {variacion.deVariacion && <p className="mt-1 font-mono text-[10px] text-muted-foreground">Deriva de {variacion.deVariacion}</p>}
      <div className="mt-2 rounded-xl border border-border/40 bg-background/40 p-2 text-xs">
        {codigo && htmlPrevia ? (
          <iframe title={`Vista previa aislada: ${variacion.titulo}`} sandbox={SANDBOX_CODIGO} srcDoc={htmlPrevia} className="h-28 w-full rounded-lg" />
        ) : (vistaPrevia ?? <p className="p-2 text-muted-foreground">Sin vista previa: «Probar» la aplica en vivo.</p>)}
      </div>
      {pendiente && (
        <div role="alertdialog" aria-label="Confirmar código aislado" className="mt-2 rounded-xl border border-amber-500/40 bg-amber-500/10 p-2 text-xs">
          <p className="flex items-center gap-1 font-medium"><TriangleAlert className="size-3.5" aria-hidden /> El payload lleva código: se abre aislado y sin acceso a tu cuenta.</p>
          <div className="mt-1.5 flex gap-1.5">
            <Button size="sm" className="cursor-pointer gap-1 text-xs" onClick={() => { const a = pendiente; setPendiente(null); if (a) ejecutar(a); }}>Confirmar y abrir aislado</Button>
            <Button size="sm" variant="outline" className="cursor-pointer text-xs" onClick={() => setPendiente(null)}>Cancelar</Button>
          </div>
        </div>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <Button size="sm" variant="outline" className="cursor-pointer gap-1 text-xs" disabled={!acciones.probar} onClick={() => alternar("probar")}>
          {probando ? <Undo2 className="size-3.5" aria-hidden /> : <Play className="size-3.5" aria-hidden />} {probando ? "Deshacer probar" : "Probar"}
        </Button>
        <Button size="sm" variant="outline" className="cursor-pointer gap-1 text-xs" disabled={!acciones.aplicar} onClick={() => alternar("aplicar")}>
          {aplicado ? <Undo2 className="size-3.5" aria-hidden /> : <Check className="size-3.5" aria-hidden />} {aplicado ? "Deshacer" : "Aplicar"}
        </Button>
        {acciones.guardar && <Button size="sm" variant="ghost" className="cursor-pointer gap-1 text-xs" onClick={acciones.guardar}><Save className="size-3.5" aria-hidden /> Guardar en la Biblioteca</Button>}
        {acciones.compartir && <Button size="sm" variant="ghost" className="cursor-pointer gap-1 text-xs" onClick={acciones.compartir}><Share2 className="size-3.5" aria-hidden /> Compartir</Button>}
        {origen && <a href={origen} target="_blank" rel="noopener noreferrer" className="ml-auto inline-flex cursor-pointer items-center gap-1 text-[11px] text-primary hover:underline">Ver origen <ExternalLink className="size-3" aria-hidden /></a>}
      </div>
    </article>
  );
}

export default TarjetaVariacion;
