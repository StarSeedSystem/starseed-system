"use client";
/**
 * Tarjeta de variación (Ola 1019V · tarea P · contrato architecture/variaciones-publicas.md §4).
 * Vista previa, «Probar» (se aplica en vivo y deshace al pulsar de nuevo o al desmontar),
 * «Aplicar» con deshacer visible, «Guardar en la Biblioteca», «Compartir», «Ver origen»,
 * valoración y licencia. Las de código piden confirmación y se abren aisladas.
 * El adaptador y la confirmación se INYECTAN: sin red, sin Supabase, sin disco.
 */
import { useEffect, useRef, useState } from "react";
import { Bookmark, Eye, EyeOff, FlaskConical, PlayCircle, Share2, Star, Undo2 } from "lucide-react";
import type { AdaptadorFamilia } from "@/lib/variaciones/familias";
import type { VariacionVentana } from "./ventana-variaciones";

export interface VariacionTarjeta extends VariacionVentana {
  /** Payload público de la variación; nunca datos privados ni secretos (lo valida el adaptador). */
  payload?: unknown;
}
export type EstadoProceso = "reposo" | "prueba" | "aplicada";
export type AccionProceso = "probar" | "aplicar" | "deshacer";

/** Máquina de estados PURA del proceso de una variación, para probarla sin DOM. */
export function siguienteProceso(estado: EstadoProceso, accion: AccionProceso): EstadoProceso {
  if (accion === "deshacer") return "reposo";
  if (accion === "aplicar") return "aplicada";
  if (accion === "probar") return estado === "reposo" ? "prueba" : estado;
  return estado;
}

/** ¿Es una variación de código? Se detecta por su etiqueta pública, nunca por el payload a ciegas. */
export function esVariacionCodigo(v: { etiquetas: readonly string[] }): boolean {
  return v.etiquetas.some((e) => e.toLowerCase() === "código" || e.toLowerCase() === "codigo");
}

const enlaceSeguro = (url?: string): string | null => (url && /^https:\/\/\S+$/.test(url) ? url : null);

export interface PropsTarjetaVariacion {
  variacion: VariacionTarjeta;
  clave: string;
  adaptador?: AdaptadorFamilia<unknown> | null;
  confirmar?: (mensaje: string) => boolean;
  alGuardarBiblioteca?: (v: VariacionTarjeta) => void;
  alCompartir?: (v: VariacionTarjeta) => void;
  alCerrar?: () => void;
}

const ETIQUETAS_PROCESO: Record<EstadoProceso, string> = { reposo: "", prueba: "Prueba en vivo · se deshace al cerrar", aplicada: "Aplicada" };

const MAPA_PROCESO: Record<Exclude<AccionProceso, "deshacer">, EstadoProceso> = { probar: "prueba", aplicar: "aplicada" };

export function TarjetaVariacion(
  { variacion, clave, adaptador, confirmar, alGuardarBiblioteca, alCompartir }: Omit<PropsTarjetaVariacion, "alCerrar">,
) {
  const [proceso, setProceso] = useState<EstadoProceso>("reposo");
  const [pideConfirmacion, setPideConfirmacion] = useState(false);
  const deshacerActual = useRef<(() => void) | null>(null);
  const accionPendiente = useRef<Exclude<AccionProceso, "deshacer">>("probar");
  const validacion = adaptador && variacion.payload !== undefined
    ? adaptador.validar(variacion.payload)
    : { ok: false as const, motivos: ["Sin adaptador para esta familia"] };
  const puedeAplicar = validacion.ok;
  const codigo = esVariacionCodigo(variacion);

  const revertir = () => {
    deshacerActual.current?.();
    deshacerActual.current = null;
    setPideConfirmacion(false);
    setProceso("reposo");
  };
  const aplicar = (accion: Exclude<AccionProceso, "deshacer">) => {
    if (!puedeAplicar || !adaptador) return;
    deshacerActual.current?.();
    // Contrato §5: nada se ejecuta sin validar. validar es puro y su resultado llega aquí ya revisado.
    const resultado = adaptador.aplicar(clave, validacion.ok ? validacion.payload : undefined);
    deshacerActual.current = resultado.deshacer;
    setPideConfirmacion(false);
    setProceso(MAPA_PROCESO[accion]);
  };
  const intentar = (accion: AccionProceso) => {
    if (accion === "deshacer") {
      revertir();
      return;
    }
    accionPendiente.current = accion;
    if (codigo) {
      // Código: pide confirmación y se abre aislado; nunca directo.
      const mensaje = "Esta variación contiene código: se abrirá aislada. ¿Continuar?";
      if (confirmar) {
        if (confirmar(mensaje)) aplicar(accionPendiente.current);
        return;
      }
      setPideConfirmacion(true);
      return;
    }
    aplicar(accion);
  };
  // Contrato: la prueba se deshace sola al cerrar (desmontaje del anfitrión). cleanup puro.
  useEffect(() => () => { deshacerActual.current?.(); deshacerActual.current = null; }, []);
  const urlOrigen = enlaceSeguro(variacion.enlaceExterno);
  const vista = puedeAplicar && adaptador?.vistaPrevia ? adaptador.vistaPrevia(validacion.ok ? validacion.payload : undefined) : undefined;

  return (
    <li className="rounded-2xl border border-border/50 bg-card/60 p-3 backdrop-blur-xl" data-ss-tarjeta-variacion={variacion.id}>
      <div className="flex flex-wrap items-baseline gap-2">
        <h4 className="text-sm font-semibold">{variacion.titulo}</h4>
        <span className="rounded-full border border-border/50 px-2 py-0.5 text-[10px] text-muted-foreground">{variacion.licencia}</span>
        {variacion.version && <span className="font-mono text-[10px] text-muted-foreground">v{variacion.version}</span>}
        <span className="ml-auto inline-flex items-center gap-1 text-[11px] text-muted-foreground">
          <Star className="size-3" aria-hidden /> {variacion.valoracionMedia.toFixed(1)} ({variacion.valoracionCount})
        </span>
      </div>
      {variacion.descripcion && <p className="mt-1 text-xs text-muted-foreground">{variacion.descripcion}</p>}
      {proceso !== "reposo" && (
        <p className="mt-1 text-[11px] text-primary" role="status" aria-label="Proceso">{ETIQUETAS_PROCESO[proceso]}</p>
      )}
      {codigo && <p className="mt-1 text-[11px] text-amber-600">Variación de código: se abre solo aislada y pide confirmación.</p>}
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {variacion.etiquetas.map((e) => <span key={e} className="rounded-full bg-muted/60 px-2 py-0.5 text-[10px] text-muted-foreground">{e}</span>)}
        {urlOrigen && (
          <a href={urlOrigen} target="_blank" rel="noopener noreferrer" className="inline-flex cursor-pointer items-center gap-1 text-[11px] text-primary hover:underline">
            Ver origen <Eye className="size-3" aria-hidden />
          </a>
        )}
      </div>
      {puedeAplicar && (
        <p data-ss-vista-previa data-testid="vista-previa" className="mt-2 rounded-xl border border-dashed border-border/50 bg-background/30 p-2 text-[11px] text-muted-foreground">
          {typeof vista === "string" && vista ? `Vista previa: ${vista}` : "Vista previa no disponible para este payload"}
        </p>
      )}
      {pideConfirmacion && (
        <div role="alertdialog" aria-label="Confirmar variación de código" className="mt-2 rounded-xl border border-border/60 bg-background/40 p-2">
          <p className="text-[11px] text-muted-foreground">El código se aísla y no se abre sin tu confirmación.</p>
          <div className="mt-1 flex gap-1.5">
            <button type="button" className="cursor-pointer rounded-full border border-primary/50 bg-primary/15 px-2.5 py-1 text-[11px]"
              onClick={() => aplicar(accionPendiente.current)}>
              Confirmar
            </button>
            <button type="button" className="cursor-pointer rounded-full border border-border/60 bg-background/40 px-2.5 py-1 text-[11px]"
              onClick={() => setPideConfirmacion(false)}>
              Cancelar
            </button>
          </div>
        </div>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <button type="button" aria-pressed={proceso === "prueba"} disabled={!puedeAplicar}
          className={claseBotonProceso(puedeAplicar, proceso === "prueba")}
          onClick={() => intentar(proceso === "prueba" ? "deshacer" : "probar")}>
          {proceso === "prueba" ? <EyeOff className="size-3" aria-hidden /> : <FlaskConical className="size-3" aria-hidden />}
          {proceso === "prueba" ? "Cerrar prueba" : "Probar"}
        </button>
        {puedeAplicar ? (
          <button type="button" aria-pressed={proceso === "aplicada"} className={claseBotonProceso(true, proceso === "aplicada")}
            onClick={() => intentar(proceso === "aplicada" ? "deshacer" : "aplicar")}>
            {proceso === "aplicada" ? <Undo2 className="size-3" aria-hidden /> : <PlayCircle className="size-3" aria-hidden />}
            {proceso === "aplicada" ? "Deshacer" : "Aplicar"}
          </button>
        ) : null}
        {alGuardarBiblioteca && (
          <button type="button" className={claseBotonProceso(true, false)} onClick={() => alGuardarBiblioteca(variacion)}>
            <Bookmark className="size-3" aria-hidden /> Guardar en la Biblioteca
          </button>
        )}
        {alCompartir && (
          <button type="button" className={claseBotonProceso(true, false)} onClick={() => alCompartir(variacion)}>
            <Share2 className="size-3" aria-hidden /> Compartir
          </button>
        )}
      </div>
    </li>
  );
}

/** Clase común de las píldoras del OS: cristal, curseur pointer y estado activo con el acento. */
function claseBotonProceso(activo: boolean, encendido: boolean): string {
  if (!activo) {
    return "inline-flex cursor-not-allowed items-center gap-1 rounded-full border border-border/30 bg-background/20 px-2.5 py-1 text-[11px] font-medium text-muted-foreground";
  }
  return `inline-flex cursor-pointer items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors ${encendido ? "border-primary/50 bg-primary/15 text-foreground" : "border-border/60 bg-background/40 hover:bg-primary/10"}`;
}

export default TarjetaVariacion;
