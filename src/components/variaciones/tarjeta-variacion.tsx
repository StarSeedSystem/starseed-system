"use client";
// Tarjeta de una variación pública (Ola 1019V · tarea P · contrato
// architecture/variaciones-publicas.md §4). Ofrece vista previa del adaptador,
// «Probar» (aplica y deshace al cerrar o al repetir), «Aplicar» con deshacer
// visible, «Guardar en la Biblioteca», «Compartir», «Ver origen», valoración y
// licencia. Las variaciones de código piden confirmación y solo se abren en un
// iframe aislado (sandbox sin allow-same-origin). Nada se ejecuta sin validar.
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Code2, ExternalLink, Eye, Share2, Star, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SaveToLibrary } from "@/components/library/save-to-library";
import { ShareToDialog } from "@/components/sharing/share-to-dialog";
import { recursoDeVariacion } from "@/lib/variaciones/publicar-campos";
import { SANDBOX_CODIGO, validarVariacion } from "@/lib/variaciones/validar";
import { adaptadorDe, type AdaptadorFamilia } from "@/lib/variaciones/familias";

export interface VariacionTarjeta {
  id: string; titulo: string; descripcion?: string | null; version?: string | null;
  familia?: string; licencia: string; etiquetas?: string[]; valoracionMedia?: number;
  valoracionCount?: number; payload?: unknown; deVariacion?: string | null;
  enlaceExterno?: string | null; esCodigo?: boolean;
}
export interface TarjetaVariacionProps {
  clave: string; variacion: VariacionTarjeta;
  adaptador?: AdaptadorFamilia<unknown> | null;
  alVerOrigen?: (id: string) => void;
  guardarSlot?: ReactNode; compartirSlot?: ReactNode;
}

/** Solo enlaces https: una variación nunca abre esquemas peligrosos. */
export function esEnlaceSeguro(url?: string | null): string | null {
  return typeof url === "string" && /^https:\/\/\S+$/.test(url) ? url : null;
}

/** Documento que se pinta en el iframe aislado; `null` si no hay código que abrir. */
export function documentoAislado(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const r = payload as Record<string, unknown>;
  const codigo = ["html", "svg", "codigo", "css"].map((k) => r[k]).find((v): v is string => typeof v === "string" && v.trim().length > 0);
  if (!codigo) return null;
  return /^<svg[\s>]/i.test(codigo.trim()) ? `<!doctype html><html><body>${codigo}</body></html>` : codigo;
}

export function TarjetaVariacion({ clave, variacion, adaptador, alVerOrigen, guardarSlot, compartirSlot }: TarjetaVariacionProps) {
  const adapt = useMemo(() => (adaptador !== undefined ? adaptador : adaptadorDe(clave)), [adaptador, clave]);
  const revision = useMemo(() => validarVariacion(variacion.payload, { codigo: variacion.esCodigo === true }), [variacion.payload, variacion.esCodigo]);
  const esCodigo = revision.requiereAislamiento;
  const [estado, setEstado] = useState<"inactiva" | "probando" | "aplicada">("inactiva");
  const [confirmando, setConfirmando] = useState(false);
  const [aislada, setAislada] = useState(false);
  const [verPrevia, setVerPrevia] = useState(false);
  const [verOrigen, setVerOrigen] = useState(false);
  const [compartir, setCompartir] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const deshacerRef = useRef<(() => void) | null>(null);
  const estadoRef = useRef(estado);
  estadoRef.current = estado;

  // «Probar» se deshace solo al cerrar la tarjeta; «Aplicar» permanece.
  useEffect(() => () => {
    if (estadoRef.current === "probando") {
      deshacerRef.current?.();
      deshacerRef.current = null;
    }
  }, []);

  const deshacer = () => {
    deshacerRef.current?.();
    deshacerRef.current = null;
    setEstado("inactiva");
    setAviso(null);
  };

  const aplicarVariacion = (destino: "probando" | "aplicada") => {
    if (estado === "aplicada") return;
    if (estado === "probando" && destino === "probando") return deshacer();
    if (estado === "probando" && destino === "aplicada") return setEstado("aplicada");
    if (esCodigo) return setConfirmando(true);
    if (!revision.ok) return setAviso(revision.motivos[0] ?? "La variación no pasó la validación.");
    if (!adapt) return setAviso("Este elemento no tiene adaptador; no se puede aplicar aquí.");
    const validado = adapt.validar(variacion.payload);
    if (!validado.ok) return setAviso(validado.motivos[0] ?? "La variación no pasó la validación.");
    try {
      deshacerRef.current = adapt.aplicar(clave, validado.payload).deshacer;
      setEstado(destino);
      setAviso(null);
    } catch (e) {
      setAviso(e instanceof Error ? e.message : "No se pudo aplicar la variación.");
    }
  };

  const abrirAislada = () => {
    if (!revision.ok) return setAviso(revision.motivos[0] ?? "La variación no pasó la validación.");
    if (!documentoAislado(variacion.payload)) return setAviso("Esta variación de código no trae un documento que abrir.");
    setConfirmando(false);
    setAislada(true);
  };

  const previa = useMemo(() => {
    if (!adapt?.vistaPrevia || !revision.ok || esCodigo) return null;
    try {
      return adapt.vistaPrevia(variacion.payload);
    } catch {
      return null;
    }
  }, [adapt, revision.ok, esCodigo, variacion.payload]);

  const enlace = esEnlaceSeguro(variacion.enlaceExterno);
  const origen = variacion.deVariacion ?? null;
  const recurso = recursoDeVariacion({ clave, titulo: variacion.titulo, descripcion: variacion.descripcion ?? undefined, id: variacion.id });

  return (
    <article data-ss-variacion={variacion.id} className="rounded-2xl border border-border/50 bg-card/60 p-3 backdrop-blur-xl">
      <div className="flex flex-wrap items-baseline gap-2">
        <h4 className="text-sm font-semibold">{variacion.titulo}</h4>
        <span className="rounded-full border border-border/50 px-2 py-0.5 text-[10px] text-muted-foreground">{variacion.licencia || "Sin licencia"}</span>
        {variacion.version && <span className="font-mono text-[10px] text-muted-foreground">v{variacion.version}</span>}
        <span aria-label={`Valoración ${(variacion.valoracionMedia ?? 0).toFixed(1)} de 5`} className="ml-auto inline-flex items-center gap-1 text-[11px] text-muted-foreground">
          <Star className="size-3" aria-hidden /> {(variacion.valoracionMedia ?? 0).toFixed(1)} ({variacion.valoracionCount ?? 0})
        </span>
      </div>
      {variacion.descripcion && <p className="mt-1 text-xs text-muted-foreground">{variacion.descripcion}</p>}
      {variacion.etiquetas && variacion.etiquetas.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {variacion.etiquetas.map((e) => <span key={e} className="rounded-full bg-muted/60 px-2 py-0.5 text-[10px] text-muted-foreground">{e}</span>)}
        </div>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <Button size="sm" variant="ghost" className="cursor-pointer gap-1 text-xs" aria-pressed={verPrevia} onClick={() => setVerPrevia((v) => !v)}>
          <Eye className="size-3.5" aria-hidden /> Vista previa
        </Button>
        <Button size="sm" variant="outline" className="cursor-pointer gap-1 text-xs" aria-pressed={estado === "probando"} onClick={() => aplicarVariacion("probando")}>
          {estado === "probando" ? <><Undo2 className="size-3.5" aria-hidden /> Deshacer prueba</> : "Probar"}
        </Button>
        <Button size="sm" className="cursor-pointer gap-1 text-xs" disabled={estado === "aplicada"} onClick={() => aplicarVariacion("aplicada")}>
          {estado === "aplicada" ? "Aplicada" : "Aplicar"}
        </Button>
        {estado === "aplicada" && <Button size="sm" variant="ghost" className="cursor-pointer gap-1 text-xs" onClick={deshacer}><Undo2 className="size-3.5" aria-hidden /> Deshacer</Button>}
        {guardarSlot !== undefined ? guardarSlot : (
          <SaveToLibrary
            item={{ type: "file", title: variacion.titulo, note: `Variación de «${clave}»`, tags: ["starseed-variacion", clave.split(":")[0]], mime: "application/json", content: JSON.stringify({ kind: "starseed-variacion", v: 1, clave, payload: variacion.payload, licencia: variacion.licencia }) }}
            label="Guardar en la Biblioteca"
          />
        )}
        {compartirSlot !== undefined ? compartirSlot : (
          <Button size="sm" variant="ghost" className="cursor-pointer gap-1 text-xs" onClick={() => setCompartir(true)}><Share2 className="size-3.5" aria-hidden /> Compartir</Button>
        )}
        {origen ? (
          <Button size="sm" variant="ghost" className="cursor-pointer gap-1 text-xs" onClick={() => { setVerOrigen((v) => !v); alVerOrigen?.(origen); }}>Ver origen</Button>
        ) : enlace ? (
          <a href={enlace} target="_blank" rel="noopener noreferrer" className="inline-flex cursor-pointer items-center gap-1 text-xs text-primary hover:underline">Ver origen <ExternalLink className="size-3" aria-hidden /></a>
        ) : (
          <Button size="sm" variant="ghost" className="text-xs" disabled title="Esta variación no declara un origen">Ver origen</Button>
        )}
      </div>
      {verOrigen && origen && <p className="mt-2 font-mono text-[10px] text-muted-foreground">Deriva de la variación {origen}</p>}
      {verPrevia && (
        <div className="mt-2 rounded-xl border border-border/50 bg-background/40 p-2">
          {esCodigo ? <p className="text-xs text-muted-foreground">El código solo se abre aislado, nunca en la interfaz.</p>
            : previa === null ? <p className="text-xs text-muted-foreground">Este adaptador no ofrece vista previa.</p>
            : <pre className="max-h-40 overflow-auto text-[10px] text-muted-foreground">{JSON.stringify(previa, null, 2)}</pre>}
        </div>
      )}
      {aviso && <p role="alert" className="mt-2 rounded-xl border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">{aviso}</p>}
      {confirmando && (
        <div role="alertdialog" aria-label="Confirmar variación de código" className="mt-2 rounded-xl border border-amber-500/40 bg-amber-500/10 p-2 text-xs">
          <p className="flex items-center gap-1 font-medium"><Code2 className="size-3.5" aria-hidden /> Esta variación lleva código.</p>
          <p className="mt-1 text-muted-foreground">Solo puede abrirse aislada; no se aplica a tu interfaz. ¿Abrirla en un marco aislado?</p>
          <div className="mt-2 flex gap-1.5">
            <Button size="sm" className="cursor-pointer text-xs" onClick={abrirAislada}>Abrir aislada</Button>
            <Button size="sm" variant="ghost" className="cursor-pointer text-xs" onClick={() => setConfirmando(false)}>Cancelar</Button>
          </div>
        </div>
      )}
      {aislada && revision.ok && (
        <iframe title={`Variación aislada de ${variacion.titulo}`} sandbox={SANDBOX_CODIGO} srcDoc={documentoAislado(variacion.payload) ?? ""} className="mt-2 h-64 w-full rounded-xl border border-border/50 bg-background" />
      )}
      {compartir && <ShareToDialog open={compartir} onOpenChange={setCompartir} resource={recurso} />}
    </article>
  );
}
export default TarjetaVariacion;
