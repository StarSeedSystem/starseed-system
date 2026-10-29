"use client";
// Tarjeta de una variación pública (Ola 1019V · tarea P · contrato §4): vista previa, «Probar»
// (aplica en vivo y deshace al cerrar o al pulsar de nuevo), «Aplicar» con deshacer visible,
// «Guardar en la Biblioteca» (SaveToLibrary), «Compartir» (ShareToDialog), «Ver origen», valoración
// y licencia. Código: confirmación y apertura aislada. Adaptador inyectado; pruebas sin red.
import { useEffect, useMemo, useRef, useState } from "react";
import { ExternalLink, RotateCcw, Share2, Star, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SaveToLibrary } from "@/components/library/save-to-library";
import { ShareToDialog } from "@/components/sharing/share-to-dialog";
import { adaptadorDe, type AdaptadorFamilia } from "@/lib/variaciones/familias";
import type { Variacion } from "@/lib/variaciones/orden";
import { validarVariacion } from "@/lib/variaciones/validar";
import { recursoDeVariacion } from "@/lib/variaciones/publicar-campos";

/** Una variación publicada con su payload (base = la de `orden.ts`; `tema` llega desde la ventana). */
export type VariacionTarjeta = Partial<Variacion> & {
  id: string; titulo: string; licencia: string; payload: unknown; valoracionMedia: number; valoracionCount: number;
  deVariacion?: string | null; enlaceExterno?: string; tema?: string; codigo?: boolean;
};
export type EstadoPrueba = "reposo" | "probando" | "aplicada";
export interface TarjetaVariacionProps {
  clave: string; variacion: VariacionTarjeta; adaptador?: AdaptadorFamilia<unknown> | null;
  alVerOrigen?: (id: string) => void; alValorar?: (valor: number) => void;
  alUsar?: (id: string) => void; abrirAislado?: (payload: unknown) => void;
}

/** Entrada de «Guardar en la Biblioteca»: referencia JSON de la variación, con clave y licencia. */
export function itemDeGuardado(clave: string, v: VariacionTarjeta) {
  const content = JSON.stringify({ kind: "starseed-variacion", version: 1, clave, payload: v.payload, licencia: v.licencia });
  const tags = ["starseed-variacion", clave.split(":")[0]].concat(v.tema ? [`tema:${v.tema}`] : []);
  return { type: "file", title: v.titulo, mime: "application/json", content, tags };
}
export function TarjetaVariacion({ clave, variacion: v, adaptador, alVerOrigen, alValorar, alUsar, abrirAislado }: TarjetaVariacionProps) {
  const a = adaptador === undefined ? adaptadorDe(clave) : adaptador;
  const [estado, setEstado] = useState<EstadoPrueba>("reposo");
  const [aviso, setAviso] = useState<string | null>(null);
  const [confirmar, setConfirmar] = useState(false);
  const [compartir, setCompartir] = useState(false);
  const deshacerRef = useRef<(() => void) | null>(null);
  const regla = useMemo(() => validarVariacion(v.payload, { codigo: v.codigo === true }), [v.payload, v.codigo]);
  // Vista previa: la calcula el adaptador de la familia; si falla, la tarjeta no se rompe.
  const textoVista = useMemo(() => {
    try { const cruda = a?.vistaPrevia?.(v.payload); return cruda == null ? null : typeof cruda === "string" ? cruda : JSON.stringify(cruda); }
    catch { return null; }
  }, [a, v.payload]);
  useEffect(() => () => { try { deshacerRef.current?.(); } catch { /* el cierre deshace en silencio */ } }, []);
  // Otra variación (o otra clave) repone la tarjeta: lo que quedó de prueba se deshace.
  useEffect(() => {
    try { deshacerRef.current?.(); } catch { /* sin reventar */ } deshacerRef.current = null;
    setEstado("reposo"); setConfirmar(false); setAviso(null); setCompartir(false);
  }, [clave, v.id]);
  function aplicar(modo: "probando" | "aplicada") {
    if (!a) { setAviso("Este elemento no tiene adaptador para aplicar variaciones."); return; }
    if (!regla.ok) { setAviso(regla.motivos[0]); return; }
    try { deshacerRef.current = a.aplicar(clave, v.payload).deshacer; }
    catch { setAviso("El adaptador no pudo aplicar la variación."); return; }
    setEstado(modo); setAviso(null);
    if (modo === "aplicada") alUsar?.(v.id);
  }
  function deshacer() {
    try { deshacerRef.current?.(); } catch { /* deshacer nunca rompe la tarjeta */ }
    deshacerRef.current = null;
    setEstado("reposo");
  }
  const pildora = "cursor-pointer gap-1 h-7 px-2 text-[11px] text-muted-foreground hover:text-foreground";
  return (
    <li className="rounded-2xl border border-border/50 bg-card/60 p-3 backdrop-blur-xl" data-ss-tarjeta-variacion={v.id}>
      <div className="flex flex-wrap items-baseline gap-2">
        <h4 className="text-sm font-semibold">{v.titulo}</h4>
        {v.version && <span className="font-mono text-[10px] text-muted-foreground">v{v.version}</span>}
        <span className="rounded-full border border-border/50 px-2 py-0.5 text-[10px] text-muted-foreground">{v.licencia}</span>
        {regla.requiereAislamiento && <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[10px] text-amber-600"><TriangleAlert className="size-3" aria-hidden /> Código</span>}
        <span className="ml-auto inline-flex items-center gap-1 text-[11px] text-muted-foreground"><Star className="size-3" aria-hidden /> {v.valoracionMedia.toFixed(1)} ({v.valoracionCount})</span>
      </div>
      {v.descripcion && <p className="mt-1 text-xs text-muted-foreground">{v.descripcion}</p>}
      {textoVista && <p aria-label="Vista previa" className="mt-1 rounded-xl bg-muted/40 px-2 py-1 font-mono text-[10px] text-muted-foreground">{textoVista}</p>}
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {v.deVariacion && (
          <Button size="sm" variant="ghost" className={pildora} onClick={() => alVerOrigen?.(v.deVariacion ?? "")}><ExternalLink className="size-3" aria-hidden /> Ver origen</Button>
        )}
        <SaveToLibrary item={itemDeGuardado(clave, v)} label="Guardar en la Biblioteca" className="h-7 gap-1 rounded-full px-2 text-[11px]" />
        <Button size="sm" variant="ghost" className={pildora} onClick={() => setCompartir(true)}><Share2 className="size-3" aria-hidden /> Compartir</Button>
        {v.etiquetas?.map((e) => <span key={e} className="rounded-full bg-muted/60 px-2 py-0.5 text-[10px] text-muted-foreground">{e}</span>)}
        <div role="group" aria-label="Valorar la variación" className="flex items-center gap-0.5">
          {[1, 2, 3, 4, 5].map((n) => (
            <button key={n} type="button" aria-label={`Valorar ${n} de 5`} disabled={!alValorar} className="cursor-pointer" onClick={() => alValorar?.(n)}>
              <Star className={`size-3 ${n <= Math.round(v.valoracionMedia) ? "fill-amber-400 text-amber-500" : "text-muted-foreground"}`} aria-hidden />
            </button>
          ))}
        </div>
        {regla.requiereAislamiento ? (
          !confirmar ? (
            <Button size="sm" variant="outline" className="cursor-pointer gap-1.5 text-xs" onClick={() => setConfirmar(true)}><TriangleAlert className="size-3.5" aria-hidden /> Abrir aislado</Button>
          ) : (
            <>
              <p className="text-xs text-muted-foreground">Se abre aislado: sin acceso a tu sesión ni a tus datos.</p>
              <Button size="sm" variant="outline" className="cursor-pointer gap-1.5 text-xs" disabled={!abrirAislado} onClick={() => { setConfirmar(false); abrirAislado?.(v.payload); }}>Confirmar aislado</Button>
              <Button size="sm" variant="ghost" className="cursor-pointer text-xs" onClick={() => setConfirmar(false)}>Cancelar</Button>
            </>
          )
        ) : (
          <>
            <Button size="sm" variant={estado === "probando" ? "outline" : "secondary"} className="cursor-pointer gap-1.5 text-xs" disabled={!a} onClick={() => (estado === "probando" ? deshacer() : aplicar("probando"))}>
              {estado === "probando" ? "Deshacer prueba" : "Probar"}
            </Button>
            <Button size="sm" className="cursor-pointer gap-1.5 text-xs" disabled={!a || estado !== "reposo"} onClick={() => aplicar("aplicada")}>Aplicar</Button>
          </>
        )}
        {estado === "aplicada" && (
          <Button size="sm" variant="outline" className="cursor-pointer gap-1.5 text-xs" onClick={deshacer}><RotateCcw className="size-3.5" aria-hidden /> Deshacer</Button>
        )}
        {estado === "probando" && <p className="text-[11px] text-muted-foreground">Prueba activa: se deshace al cerrar la ventana.</p>}
      </div>
      {aviso && <p role="alert" className="mt-2 text-xs text-destructive">{aviso}</p>}
      <ShareToDialog open={compartir} onOpenChange={setCompartir} resource={recursoDeVariacion({ clave, titulo: v.titulo, descripcion: v.descripcion, id: v.id })} />
    </li>
  );
}
export default TarjetaVariacion;
