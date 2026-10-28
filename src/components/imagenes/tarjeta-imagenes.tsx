"use client";
/**
 * Tarjeta de opciones de imagen de Astraura (IMG1011C). Contrato: architecture/astraura-imagenes.md §4 y §6.
 *
 * Recibe el PLAN (hasta 8 opciones de `planImagen`, el núcleo puro de `src/lib/imagenes`) y lo enseña en
 * rejilla que no se solapa en pantallas pequeñas ni en un mensaje de chat, de agente o de bot. Por opción
 * se ve: modelo, DÓNDE se hizo (tu aparato, tu PC, la pestaña, la malla, la web…), su motor, su semilla,
 * su motivo honesto, y LICENCIA y ATRIBUCIÓN a la vista. Acciones: elegir, variar (más semillas del mismo
 * modelo), editar en la Protomolécula, ampliar, usar como referencia para 3D (diálogo «Crear en 3D desde
 * una imagen», G3D1011E), guardar en la Biblioteca y borrador de publicación. Quien incrusta —el chat de
 * Astraura, un agente, un bot o la futura del hook de la tarjeta— pasa las acciones que pueda; las que
 * faltan se muestran deshabilitadas con su porqué («basta de ilusiones», nunca un botón muerto).
 *
 * Accesible: teclado, aria-label en cada acción, `region` con su título y estados anunciados con aria-live.
 * Respeta `prefers-reduced-motion` (sin giros ni transiciones con `motion-reduce:`).
 */
import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { Info, Loader2, X } from "lucide-react";
import { MOTORES, type ModeloImagen } from "@/lib/imagenes/modelos";
import type { Cuantizacion, OpcionImagen } from "@/lib/imagenes/plan";
import type { MotorImg } from "@/lib/imagenes/modelos";
import type { UsoLicencia } from "@/lib/avatares/adn/adn";

/** Estado de cada opción: plan (todavía sin generar), en curso, hecha o con error. */
export type EstadoOpcion = "plan" | "generando" | "hecha" | "error";
/** Opción del plan con el resultado de su generación: la imagen (`url`) o el porqué del fallo. */
export interface OpcionTarjeta extends OpcionImagen {
  estado?: EstadoOpcion;
  /** URL de la imagen ya generada de esta opción (Biblioteca o el aparato). */
  url?: string;
  /** Qué falló al generarla, para la persona. */
  fallo?: string;
}
/** Acciones que pasa quien incrusta la tarjeta (chat de Astraura, agente, bot, hook). Las ausentes quedan dichas. */
export interface AccionesTarjeta {
  elegir?: (o: OpcionTarjeta) => void;
  /** Más semillas del mismo modelo. */
  variar?: (o: OpcionTarjeta) => void;
  /** Abre la imagen en el lienzo de la Protomolécula. */
  editar?: (o: OpcionTarjeta) => void;
  guardar?: (o: OpcionTarjeta) => void;
  /** Abre el diálogo «Crear en 3D desde una imagen» (G3D1011E, src/components/avatares/generar-3d.tsx). */
  referencia3d?: (o: OpcionTarjeta) => void;
  /** Crea el borrador de publicación. */
  publicar?: (o: OpcionTarjeta) => void;
}

export interface TarjetaImagenesProps {
  /** Las opciones del plan (`planImagen` del núcleo puro, `src/lib/imagenes/plan.ts`). */
  opciones: readonly OpcionTarjeta[];
  /** Motivos honestos de lo que descartó el plan (por qué no hay más opciones). */
  descartes?: readonly string[];
  /** El hook de la tarjeta está planificando o generando: esqueletos, nada inventado. */
  cargando?: boolean;
  /** Error del plan o de la generación, para la persona. */
  error?: string | null;
  acciones?: AccionesTarjeta;
  /** Título si lo que incrusta la tarjeta quiere nombrarla de otro modo. */
  titulo?: string;
}

const ETIQUETAS_CAPA: Record<OpcionImagen["capa"], string> = {
  dispositivo: "tu aparato",
  navegador: "tu PC (pestaña)",
  neurona: "otra neurona tuya",
  malla: "la malla",
  espacio: "Space de Hugging Face",
  "web-gratis": "la web (gratis)",
  externo: "servicio de pago",
};
const ETIQUETAS_USO: Record<UsoLicencia, string> = {
  libre: "uso libre",
  atribucion: "con atribución",
  condicionado: "uso condicionado",
  "no-comercial": "no comercial",
  "restringido-region": "restringido por región",
};
const ETIQUETAS_CUANT: Record<Cuantizacion, string | null> = { nativa: null, q8: "8 bits", q4: "4 bits" };
const NOMBRE_MOTOR: Record<MotorImg, string> = {
  sdcpp: MOTORES.sdcpp.nombre, comfyui: MOTORES.comfyui.nombre, diffusers: MOTORES.diffusers.nombre,
  "onnx-web": MOTORES["onnx-web"].nombre, "a1111-forge": MOTORES["a1111-forge"].nombre,
};

/**
 * Dónde se hizo lo que pide la opción, en palabras para la persona (§4: «cada opción lleva su
 * procedencia»). Las de malla y neurona nombre cuál prestó; la tuya propia no hace falta nombrarla.
 */
export function etiquetaCapa(o: OpcionTarjeta): string {
  const capa = ETIQUETAS_CAPA[o.capa];
  return o.neuronaId && (o.capa === "neurona" || o.capa === "malla") ? `${capa} · ${o.neuronaId}` : capa;
}
/** Nombre del motor o del servicio de esta opción (Pollinations, Space de HF, servicio de pago, motor local). */
export function etiquetaMotor(o: OpcionTarjeta): string {
  if (o.motor === "espacio-hf") return "Space de Hugging Face";
  if (o.motor === "pollinations") return "Pollinations (la web gratis)";
  if (o.motor === "externo") return "Servicio de pago (tu clave)";
  return NOMBRE_MOTOR[o.motor as MotorImg];
}
/** La imagen con la que se hizo, citando su fuente: licencia y origen, visibles y dichos en la leyenda. */
export function atribucionDe(o: OpcionTarjeta): string {
  if (o.modelo?.hf) return o.modelo.hf;
  if (o.motor === "pollinations") return "https://pollinations.ai";
  if (o.motor === "espacio-hf") return "huggingface.co (Space de Hugging Face)";
  return "Servicio externo · se anota al generar";
}
/** La cuenta cuantización, en palabras; `nativa` no enseña nada. */
export function etiquetaCuantizacion(c: Cuantizacion): string | null {
  return ETIQUETAS_CUANT[c];
}

/** Lo de la licencia que obliga, en palabras para la persona. */
export function etiquetaUso(u: UsoLicencia): string {
  return ETIQUETAS_USO[u];
}

export function TarjetaImagenes({ opciones, descartes, cargando = false, error = null, acciones, titulo = "Opciones de imagen" }: TarjetaImagenesProps) {
  const [ampliada, setAmpliada] = useState<OpcionTarjeta | null>(null);
  // Escape cierra la imagen ampliada; así el teclado también sale del despiece (una sola tecla, siempre).
  useEffect(() => {
    if (!ampliada) return;
    const cerrar = (e: KeyboardEvent) => { if (e.key === "Escape") setAmpliada(null); };
    window.addEventListener("keydown", cerrar);
    return () => window.removeEventListener("keydown", cerrar);
  }, [ampliada]);
  // Guardar en la Biblioteca por DEFECTO cuando no llega cableado: `saveResource` de la propia Biblioteca
  // del OS (la misma que usa el diálogo «Crear en 3D desde una imagen»). Sin duplicar lo que ya hay en main.
  const guardarPorDefecto = useMemo(
    () => (o: OpcionTarjeta) => {
      if (!o.url) return;
      void import("@/lib/library-store").then(({ saveResource }) => {
        saveResource({
          kind: "image",
          title: o.modelo?.nombre ? `Imagen: ${o.modelo.nombre}` : "Imagen de Astraura",
          url: o.url,
          origin: `${etiquetaMotor(o)} · ${atribucionDe(o)} · semilla ${o.semilla}`,
        });
      });
    },
    [],
  );
  const accionesCompletas: AccionesTarjeta = { guardar: guardarPorDefecto, ...acciones };
  const hayOpciones = opciones.length > 0;
  return (
    <section aria-label={titulo} className="w-full space-y-3 overflow-hidden">
      <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold md:text-base">{titulo}</h3>
        <span className="text-xs text-muted-foreground">{hayOpciones ? `${opciones.length} opciones` : "sin opciones"}</span>
      </div>
      {error && (
        <p role="alert" className="rounded-lg border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}
      {cargando ? (
        <p aria-live="polite" aria-busy="true" className="flex items-center gap-2 rounded-lg border px-3 py-3 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden />
          Preparando opciones…
        </p>
      ) : !hayOpciones ? (
        <p aria-live="polite" className="flex items-start gap-2 rounded-lg border px-3 py-3 text-sm text-muted-foreground">
          <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span>
            Nada que mostrar todavía: pide a Astraura generar una imagen, o instala un modelo (el panel de
            sugerencias de imágenes de la Biblioteca te propone un paquete base según tu aparato).
          </span>
        </p>
      ) : (
        <ul className="grid w-full grid-cols-1 gap-3 overflow-hidden sm:grid-cols-2 xl:grid-cols-3">
          {opciones.map((o) => (
            <OpcionItem
              key={`${o.capa}·${o.motor}·${o.modelo?.id ?? "web"}·${o.semilla}`}
              o={o}
              acciones={accionesCompletas}
              onAmpliar={setAmpliada}
            />
          ))}
        </ul>
      )}
      {descartes && descartes.length > 0 && (
        <details className="rounded-lg border px-3 py-2 text-xs text-muted-foreground">
          <summary className="cursor-pointer select-none">Por qué no hay más opciones ({descartes.length})</summary>
          <ul className="mt-2 list-disc space-y-1 pl-4">
            {descartes.map((d) => <li key={d}>{d}</li>)}
          </ul>
        </details>
      )}
      {ampliada && <OverlayAmpliada o={ampliada} onCerrar={() => setAmpliada(null)} />}
    </section>
  );
}

const ETIQUETAS_ESTADO: Record<EstadoOpcion, string> = {
  plan: "por generar",
  generando: "generando…",
  hecha: "generada",
  error: "con error",
};
/** Si el modelo es «gated» (pide aceptar términos de Hugging Face para poder bajarlo). */
export function modeloGated(m: ModeloImagen | null | undefined): boolean {
  return !!m?.gated;
}
/** El uso que obliga la licencia del modelo de la opción; sin modelo (web, pago) no se inventa una licencia. */
export function usoDe(o: OpcionTarjeta): UsoLicencia | null {
  return o.modelo?.uso ?? null;
}

function OpcionItem({ o, acciones, onAmpliar }: { o: OpcionTarjeta; acciones: AccionesTarjeta; onAmpliar: (o: OpcionTarjeta) => void }) {
  const tieneUrl = !!o.url;
  const cuant = o.cuantizacion !== "nativa" ? ETIQUETAS_CUANT[o.cuantizacion] : null;
  const estado = o.estado ?? "plan";
  const uso = usoDe(o);
  return (
    <li className="flex min-w-0 flex-col gap-2 overflow-hidden rounded-xl border p-3 transition-shadow duration-200 hover:shadow-md motion-reduce:transition-none">
      <div className="relative flex h-28 items-center justify-center overflow-hidden rounded-lg border bg-muted">
        {tieneUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- la imagen viene de la Biblioteca o del aparato: src directa, sin dominio propio.
          <img src={o.url} alt={`Imagen generada con ${o.modelo?.nombre ?? atribucionDe(o)}`} className="h-full w-full cursor-pointer object-cover" onClick={() => onAmpliar(o)} />
        ) : (
          <span className="text-xs text-muted-foreground">Aún sin imagen</span>
        )}
        <span className="absolute left-1.5 top-1.5 rounded bg-background/80 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">#{o.semilla}</span>
      </div>
      <div className="flex min-w-0 flex-wrap items-center gap-1.5">
        <span className="min-w-0 truncate font-medium text-sm" title={o.modelo?.nombre ?? etiquetaMotor(o)}>
          {o.modelo?.nombre ?? etiquetaMotor(o)}
        </span>
        {estado !== "plan" && <BadgeEstado estado={estado} />}
        {modeloGated(o.modelo) && (
          <span className="cursor-help rounded-full border px-1.5 text-[10px] lowercase text-muted-foreground" title="Gated: se baja solo tras aceptar sus términos en Hugging Face con tu cuenta; si te lo pide, un token de lectura tuyo va en el entorno, nunca en el código. Se consigue en huggingface.co/settings/tokens.">
            gated
          </span>
        )}
      </div>
      <dl aria-label={`Procedencia de ${o.modelo?.nombre ?? etiquetaMotor(o)}`} className="min-w-0 space-y-0.5 text-xs text-muted-foreground">
        <div className="flex min-w-0 gap-1">
          <dt className="shrink-0">Dónde:</dt><dd className="min-w-0 truncate">{etiquetaCapa(o)}</dd>
        </div>
        <div className="flex min-w-0 gap-1">
          <dt className="shrink-0">Con qué:</dt><dd className="min-w-0 truncate" title={etiquetaMotor(o)}>{etiquetaMotor(o)}{cuant ? ` · ${cuant}` : ""}</dd>
        </div>
        <div className="flex min-w-0 gap-1">
          <dt className="shrink-0">Licencia:</dt>
          <dd className="min-w-0 truncate" title={o.modelo?.licencia}>{o.modelo?.licencia ?? "—"}</dd>
        </div>
        <div className="flex min-w-0 gap-1">
          <dt className="shrink-0">Atribución:</dt><dd className="min-w-0 truncate" title={atribucionDe(o)}>{atribucionDe(o)}</dd>
        </div>
        <div className="flex min-w-0 items-start gap-1">
          <dt className="shrink-0">Uso:</dt>
          <dd className="min-w-0 truncate" title={uso ? etiquetaUso(uso) : "Según los términos del servicio"}>
            {uso ? etiquetaUso(uso) : "según el servicio"}
          </dd>
        </div>
      </dl>
      {o.motivo && <p className="text-xs text-muted-foreground/90">{o.motivo}</p>}
      {estado === "generando" && (
        <p aria-live="polite" className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" aria-hidden /> Generando esta opción…
        </p>
      )}
      {estado === "error" && (
        <p role="alert" aria-live="polite" className="rounded border border-destructive/40 bg-destructive/10 px-2 py-1 text-xs text-destructive">{o.fallo ?? "No se pudo generar."}</p>
      )}
      <div className="mt-auto flex flex-wrap gap-1.5">
        <MenuAcciones o={o} acciones={acciones} onAmpliar={onAmpliar} />
      </div>
    </li>
  );
}

/** Rótulo del estado de la opción: por generar, en curso, hecha o con error. */
function BadgeEstado({ estado }: { estado: EstadoOpcion }) {
  const tinta = estado === "hecha" ? "border-emerald-500/60 text-emerald-600 dark:text-emerald-400"
    : estado === "error" ? "border-destructive/60 text-destructive"
    : "border-amber-500/60 text-amber-600 dark:text-amber-400";
  return <span className={cn("shrink-0 rounded-full border px-1.5 py-0.5 text-[10px]", tinta)}>{ETIQUETAS_ESTADO[estado]}</span>;
}

interface AccionBoton { texto: string; aria: string; title: string; dale: boolean; razon: string; ir: () => void }

const FALTA_CABLEADO = "Todavía no disponible aquí: falta el cableado de este sitio.";
const FALTA_IMAGEN = "Primero se genera esta imagen (elige la opción y espera su resultado).";

/** Las acciones del contrato §6, por opción. Lo que no está cableado o aún no tiene imagen, queda dicho. */
function MenuAcciones({ o, acciones, onAmpliar }: { o: OpcionTarjeta; acciones: AccionesTarjeta; onAmpliar: (o: OpcionTarjeta) => void }) {
  const tieneUrl = !!o.url;
  const lista: AccionBoton[] = [
    { texto: "Elegir", aria: "Elegir esta opción", title: "Producir la imagen final con esta opción", dale: !!acciones.elegir, razon: FALTA_CABLEADO, ir: () => acciones.elegir?.(o) },
    { texto: "Variar", aria: "Variar esta opción", title: "Más semillas del mismo modelo", dale: !!acciones.variar, razon: FALTA_CABLEADO, ir: () => acciones.variar?.(o) },
    { texto: "Editar", aria: "Editar en la Protomolécula", title: "Abrir la imagen en el lienzo de la Protomolécula", dale: !!acciones.editar && tieneUrl, razon: tieneUrl ? FALTA_CABLEADO : FALTA_IMAGEN, ir: () => acciones.editar?.(o) },
    { texto: "Ampliar", aria: "Ampliar la imagen", title: "Verla grande", dale: tieneUrl, razon: FALTA_IMAGEN, ir: () => (acciones.ampliar ? acciones.ampliar(o) : onAmpliar(o)) },
    { texto: "3D", aria: "Usar como referencia para 3D", title: "Abrir «Crear en 3D desde una imagen»", dale: !!acciones.referencia3d && tieneUrl, razon: tieneUrl ? FALTA_CABLEADO : FALTA_IMAGEN, ir: () => acciones.referencia3d?.(o) },
    { texto: "Biblioteca", aria: "Guardar en la Biblioteca", title: "Guardarla en tu Biblioteca", dale: !!acciones.guardar && tieneUrl, razon: tieneUrl ? FALTA_CABLEADO : FALTA_IMAGEN, ir: () => acciones.guardar?.(o) },
    { texto: "Publicar", aria: "Crear borrador de publicación", title: "Pasarla al borrador de publicación", dale: !!acciones.publicar && tieneUrl, razon: tieneUrl ? FALTA_CABLEADO : FALTA_IMAGEN, ir: () => acciones.publicar?.(o) },
  ];
  return (
    <div className="flex flex-wrap gap-1.5">
      {lista.map((a) => (
        <button
          key={a.texto}
          type="button"
          disabled={!a.dale}
          title={a.dale ? a.title : a.razon}
          aria-label={`${a.aria}${a.dale ? "" : ` (no disponible: ${a.razon})`}`}
          className={cn(
            "inline-flex h-8 cursor-pointer items-center gap-1 rounded-lg border px-2 text-xs font-medium",
            "transition-colors duration-200 motion-reduce:transition-none hover:bg-accent hover:text-accent-foreground",
            "disabled:cursor-not-allowed disabled:opacity-50",
          )}
          onClick={a.ir}
        >
          {a.dale ? null : <Info className="h-3 w-3 shrink-0" aria-hidden />}
          {a.texto}
        </button>
      ))}
    </div>
  );
}

/** Despiece de la imagen sobre la tarjeta: se cierra con Escape, con el botón o tocando el fondo. */
function OverlayAmpliada({ o, onCerrar }: { o: OpcionTarjeta; onCerrar: () => void }) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Imagen ampliada: ${o.modelo?.nombre ?? atribucionDe(o)}`}
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onCerrar(); }}
    >
      <div className="max-h-full w-full max-w-3xl space-y-2 overflow-auto rounded-xl border bg-card p-4">
        <div className="flex items-center justify-between gap-2">
          <h4 className="min-w-0 truncate text-sm font-semibold">
            {o.modelo?.nombre ?? etiquetaMotor(o)} <span className="font-mono text-xs text-muted-foreground">#{o.semilla}</span>
          </h4>
          <button
            type="button"
            autoFocus
            className="cursor-pointer rounded-lg border px-2 py-1 text-xs transition-colors duration-200 motion-reduce:transition-none hover:bg-accent"
            onClick={onCerrar}
          >
            <X className="h-4 w-4" aria-hidden />
            <span className="sr-only">Cerrar la imagen ampliada</span>
          </button>
        </div>
        {o.url &&
          // eslint-disable-next-line @next/next/no-img-element -- la misma imagen ya cargada en la opción, natural y a escala real.
          <img src={o.url} alt={`Imagen ampliada generada con ${o.modelo?.nombre ?? atribucionDe(o)}`} className="max-h-[70vh] w-full rounded-lg object-contain" />}
        <dl aria-label="Licencia y atribución" className="min-w-0 space-y-0.5 text-xs text-muted-foreground">
          <div className="flex min-w-0 gap-1">
            <dt className="shrink-0">Licencia:</dt><dd className="min-w-0 truncate" title={o.modelo?.licencia}>{o.modelo?.licencia ?? "—"}</dd>
          </div>
          <div className="flex min-w-0 gap-1">
            <dt className="shrink-0">Atribución:</dt><dd className="min-w-0 truncate" title={atribucionDe(o)}>{atribucionDe(o)}</dd>
          </div>
          <div className="flex min-w-0 gap-1">
            <dt className="shrink-0">Dónde:</dt><dd className="min-w-0 truncate">{etiquetaCapa(o)}</dd>
          </div>
        </dl>
      </div>
    </div>
  );
}

export default TarjetaImagenes;

