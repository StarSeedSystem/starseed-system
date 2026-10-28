"use client";
/**
 * Tarjeta de opciones de imagen (IMG1011C · parte 1 de 3). Contrato: architecture/astraura-imagenes.md §6.
 *
 * Muestra TODAS las opciones de una generación en rejilla (1 columna en pantallas pequeñas), y por
 * opción: el modelo, dónde se hizo en la cadena de capas, la licencia y la atribución. Acciones:
 * elegir, variar (otra semilla), editar en la Protomolécula, ampliar, usar como referencia 3D,
 * guardar en la Biblioteca y borrador de publicación. El ESTADO y las acciones reales los da un
 * adaptador (parte 2 de la cadena); la tarjeta solo muestra y delega, así se incrusta igual en un
 * mensaje de chat de Astraura, en la respuesta de un agente o en la de un bot. Honesta: nada inventa.
 */
import type { OpcionImagen, CapaImg } from "@/lib/imagenes/plan";
import { PROTO_ORB_ABRIR_EVENT } from "@/lib/protomolecula/orbe-bus";

/** Una opción del plan con su desenlace (lo rellena quien generó la imagen). */
export interface OpcionResultado extends OpcionImagen {
  /** URL de la imagen generada, cuando ya salió. */
  url?: string;
  estado: "pendiente" | "lista" | "error";
  /** Atribución visible opcional (autor, Space, servicio). */
  atribucion?: string;
}

/** Acciones de la tarjeta: quien incrusta decide qué ofrece; lo sin manejo ni aparece. */
export interface AccionesTarjeta {
  elegir?: (o: OpcionResultado) => void;
  variar?: (o: OpcionResultado) => void;
  editarEnProtomolecula?: (o: OpcionResultado) => void;
  ampliar?: (o: OpcionResultado) => void;
  usarComoReferencia3D?: (o: OpcionResultado) => void;
  guardarEnBiblioteca?: (o: OpcionResultado) => void;
  borradorPublicacion?: (o: OpcionResultado) => void;
}

/** Dónde se hizo cada opción, en palabras de la persona (contrato §3). */
export const DONDE_SE_HIZO: Record<CapaImg, string> = {
  dispositivo: "En tu aparato",
  navegador: "En tu PC (pestaña con WebGPU)",
  neurona: "En otra neurona tuya",
  malla: "En la malla de tu comunidad",
  espacio: "En un Space público de Hugging Face",
  "web-gratis": "En la web (gratis)",
  externo: "En un servicio de pago",
};

const USO_LEGIBLE: Record<string, string> = {
  libre: "uso libre", atribucion: "pide atribución", condicionado: "uso con condiciones",
  "restringido-region": "restringido en algunas regiones", "no-comercial": "no comercial",
};

/** Licencia y nota de uso, legibles sin saber de IA. */
export function licenciaDe(o: OpcionResultado): string {
  const m = o.modelo;
  if (m) return `${m.licencia} (${USO_LEGIBLE[m.uso] ?? "revisa su licencia"})`;
  if (o.motor === "pollinations") return "Web gratis: sin licencia declarada, no la uses como tuya comercial";
  if (o.motor === "espacio-hf") return "Hecho en su Space público: manda la licencia del modelo (Apache-2.0)";
  if (o.motor === "externo") return "Servicio de pago: manda la ficha del servicio";
  return "Licencia a revisar en su fuente";
}

/** Sin manejo propio, abre AL MENOS el panel de la Protomolécula con su bus de orbe (si no está
 * activa, no pasa nada y la delegación queda para el adaptador). Puura de interacción: el estado
 * y la molécula real la crea el editor (parte 2 de la cadena). */
export function abrirProtomolecula(): void {
  try {
    if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(PROTO_ORB_ABRIR_EVENT, { cancelable: true }));
  } catch { /* sin orbe activa: no pasa nada */ }
}

const CLASE_BTON = "cursor-pointer rounded border border-border/40 bg-muted/50 px-2 py-1 text-xs transition-colors duration-150 motion-reduce:transition-none hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring";

export default function TarjetaImagenes({ opciones, cargando, error, acciones, prompt, elegida }: {
  opciones: readonly OpcionResultado[];
  cargando: boolean;
  error: string | null;
  acciones: AccionesTarjeta;
  /** La frase con la que se pidió la imagen: alimenta el texto alternativo. */
  prompt?: string;
  /** Índice de la opción elegida, para marcarla. */
  elegida?: number;
}) {
  if (cargando) return (
    <section aria-busy="true" className="rounded-lg border bg-muted/20 p-4 text-sm text-muted-foreground">
      Preparando opciones de imagen…
    </section>
  );
  if (error) return (
    <section role="alert" className="rounded-lg border border-destructive/40 p-4 text-sm text-destructive">
      {error}
    </section>
  );
  if (!opciones.length) return (
    <section className="rounded-lg border p-4 text-sm text-muted-foreground">
      No hay opciones ni todavía una generación: pide una imagen a Astraura.
    </section>
  );

  return (
    <section
      role="group"
      aria-label="Opciones de imagen de Astraura"
      data-testid="tarjeta-imagenes"
      className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3"
    >
      {opciones.map((o, i) => (
        <article
          key={`${o.semilla}-${i}`}
          className={`flex min-w-0 flex-col gap-2 rounded-lg border bg-background/80 p-3 transition-all duration-200 motion-reduce:transition-none hover:shadow-md ${elegida === i ? "ring-2 ring-ring" : ""}`}
          aria-current={elegida === i ? "true" : undefined}
        >
          <div className="flex h-28 items-center justify-center overflow-hidden rounded bg-muted/30 text-xs text-muted-foreground">
            {o.url ? (
              <img
                src={o.url}
                alt={`${o.modelo?.nombre ?? "Imagen"} ${prompt ? `generada: ${prompt}` : "generada"}`}
                loading="lazy"
                className={`h-full w-full object-cover ${acciones.ampliar ? "cursor-pointer" : ""}`}
                onClick={acciones.ampliar ? () => acciones.ampliar?.(o) : undefined}
              />
            ) : o.estado === "error" ? (
              <span role="status">No salió esta opción: prueba con otra.</span>
            ) : (
              <span aria-hidden="true">Generando…</span>
            )}
          </div>
          <header className="min-w-0">
            <h4 className="truncate text-sm font-medium">
              Opción {i + 1} · {o.modelo?.nombre ?? "Web gratis (Pollinations)"}
            </h4>
            <p className="mt-0.5 truncate text-xs text-muted-foreground">{DONDE_SE_HIZO[o.capa]}</p>
            <p className="mt-0.5 text-xs">{licenciaDe(o)}</p>
            {o.atribucion && <p className="mt-0.5 truncate text-xs text-muted-foreground">{o.atribucion}</p>}
          </header>
          <div aria-label="Acciones de esta opción" className="mt-auto flex flex-wrap gap-1.5">
            {acciones.elegir && <button type="button" className={CLASE_BTON} onClick={() => acciones.elegir?.(o)} aria-label={`Elegir la opción ${i + 1}`}>Elegir</button>}
            {acciones.variar && <button type="button" className={CLASE_BTON} onClick={() => acciones.variar?.(o)} aria-label={`Variar la opción ${i + 1}`}>Variar</button>}
            <button type="button" className={CLASE_BTON}
              onClick={() => (acciones.editarEnProtomolecula ? acciones.editarEnProtomolecula(o) : abrirProtomolecula())}
              aria-label={`Editar la opción ${i + 1} en la Protomolécula`}
            >
              Editar
            </button>
            {acciones.ampliar && <button type="button" className={CLASE_BTON} onClick={() => acciones.ampliar?.(o)} aria-label={`Ampliar la opción ${i + 1}`}>Ampliar</button>}
            {acciones.usarComoReferencia3D && <button type="button" className={CLASE_BTON} onClick={() => acciones.usarComoReferencia3D?.(o)} aria-label={`Usar la opción ${i + 1} como referencia 3D`}>A 3D</button>}
            {acciones.guardarEnBiblioteca && <button type="button" className={CLASE_BTON} onClick={() => acciones.guardarEnBiblioteca?.(o)} aria-label={`Guardar la opción ${i + 1} en la Biblioteca`}>Guardar</button>}
            {acciones.borradorPublicacion && <button type="button" className={CLASE_BTON} onClick={() => acciones.borradorPublicacion?.(o)} aria-label={`Crear borrador de publicación de la opción ${i + 1}`}>Publicar</button>}
          </div>
        </article>
      ))}
    </section>
  );
}
