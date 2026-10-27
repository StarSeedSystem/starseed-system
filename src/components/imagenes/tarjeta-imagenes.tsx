"use client";
/**
 * Imágenes de Astraura · TARJETA DE OPCIONES (IMG1011C). Contrato: architecture/astraura-imagenes.md §6.
 *
 * Una rejilla con TODAS las opciones de una generación (máx. 8), sin solaparse en pantallas
 * pequeñas (una columna en móvil), cada una con su modelo, dónde se hizo, licencia y
 * atribución a la vista. Acciones sobre la ELEGIDA: editar en la Protomolécula, ampliar,
 * usar como referencia para 3D, guardar en la Biblioteca y borrador de publicación; y por
 * opción: elegir y variar (otra semilla). Se incrusta en un mensaje de Astraura, en la
 * respuesta de un agente o de un bot: solo necesita la petición. Accesible y sin animación
 * si el sistema pide menos movimiento (prefers-reduced-motion). Nada aquí publica ni sondea:
 * la generación va por `media-gen` (regla de oro intacta).
 */
import { useEffect } from "react";
import { useTarjetaImagenes, type PeticionTarjeta } from "@/lib/imagenes/adaptadores/use-tarjeta-imagenes";
import type { OpcionGaleria } from "@/ai/astraura/media/proveedor-neuronas";

export interface TarjetaImagenesProps {
  /** La petición que trajo las opciones (prompt + permisos). Si cambia, se regeneran. */
  peticion?: PeticionTarjeta;
  className?: string;
}

const DONDE: Record<string, string> = {
  dispositivo: "Tu aparato",
  navegador: "Tu pestaña (WebGPU)",
  neurona: "Tu neurona",
  malla: "La malla",
  espacio: "Un Space de Hugging Face",
  "web-gratis": "La web gratis",
  externo: "Un servicio de pago",
};

function etiquetaDonde(capa: string, neurona?: string): string {
  const base = DONDE[capa] ?? "Otra capa";
  return capa === "neurona" && neurona ? `${base} «${neurona}»` : base;
}

/** Marcado honesto del uso que la licencia permite: en «libre» no aparece nada. */
const USO_VISIBLE: Record<string, string> = {
  atribucion: "requiere atribución",
  condicionado: "con condiciones del titular",
  "restringido-region": "restringida por región",
  "no-comercial": "solo uso no comercial",
};

interface PropsOpcion {
  op: OpcionGaleria;
  elegida: boolean;
  onElegir: () => void;
  onVariar: () => void;
}

function OpcionCard({ op, elegida, onElegir, onVariar }: PropsOpcion) {
  return (
    <div
      role="listitem"
      className={`rounded-lg border p-3 transition-colors duration-150 motion-reduce:transition-none ${elegida ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"}`}
    >
      <div className="flex gap-3">
        {op.url ? (
          <img src={op.url} alt={`Opción ${op.modelo ?? "sin modelo"}·semilla ${op.semilla}`} loading="lazy" className="h-16 w-16 flex-shrink-0 rounded-md object-cover" />
        ) : (
          <div className="flex h-16 w-16 flex-shrink-0 items-center justify-center rounded-md bg-muted text-center text-[10px] leading-tight text-muted-foreground" aria-hidden="true">
            Sin imagen aún
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{op.modelo ?? "Web gratis (Pollinations)"}</p>
          <p className="truncate text-xs text-muted-foreground">{etiquetaDonde(op.capa, op.neurona)} · {op.licencia}</p>
          <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{op.atribucion}</p>
          {USO_VISIBLE[op.uso] ? (
            <p className="mt-1 inline-block rounded bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-400">{USO_VISIBLE[op.uso]}</p>
          ) : null}
        </div>
      </div>
      <div className="mt-2 flex gap-2">
        <button
          type="button"
          onClick={onElegir}
          aria-pressed={elegida}
          className={`inline-flex h-11 cursor-pointer items-center rounded-md px-3 text-xs font-medium transition-colors duration-150 motion-reduce:transition-none ${elegida ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground hover:bg-secondary/80"}`}
        >
          {elegida ? "Elegida" : "Elegir"}
        </button>
        <button
          type="button"
          onClick={onVariar}
          className="inline-flex h-11 cursor-pointer items-center rounded-md bg-muted px-3 text-xs font-medium text-foreground transition-colors duration-150 motion-reduce:transition-none hover:bg-accent"
        >
          Variar
        </button>
      </div>
    </div>
  );
}

export function TarjetaImagenes({ peticion, className }: TarjetaImagenesProps) {
  const t = useTarjetaImagenes();

  useEffect(() => {
    if (peticion?.prompt) void generarOpciones(peticion);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [peticion]);

  const { generarOpciones } = t;
  return (
    <section aria-label="Opciones de imagen" className={`space-y-3 ${className ?? ""}`} aria-busy={t.cargando}>
      {t.cargando ? <p className="text-sm text-muted-foreground">Preparando opciones de imagen…</p> : null}
      {t.error ? <p role="alert" className="text-sm text-destructive">{t.error}</p> : null}
      {t.aviso ? <p role="status" className="text-sm text-emerald-600 dark:text-emerald-400">{t.aviso}</p> : null}
      {!t.cargando && !t.opciones.length && !t.error ? (
        <p className="text-sm text-muted-foreground">Todavía no hay opciones: pide una imagen y el plan por capas traerá varias.</p>
      ) : null}
      {t.opciones.length ? (
        <div role="list" className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {t.opciones.map((op) => (
            <OpcionCard
              key={`${op.capa}/${op.modelo ?? "web"}/${op.semilla}`}
              op={op}
              elegida={t.elegida === op}
              onElegir={() => t.elegirOpcion(op)}
              onVariar={() => void t.variarOpcion(op)}
            />
          ))}
        </div>
      ) : null}
      {t.descartes.length && t.opciones.length ? (
        <details className="text-xs text-muted-foreground">
          <summary className="cursor-pointer">Otras opciones descartadas ({t.descartes.length}) y por qué</summary>
          <ul className="mt-1 space-y-0.5">
            {t.descartes.slice(0, 12).map((d, i) => (
              <li key={i}>· {d}</li>
            ))}
          </ul>
        </details>
      ) : null}
      {t.elegida ? (
        <div className="rounded-lg border border-primary/30 bg-background p-3">
          <p className="text-xs font-medium text-foreground">Imagen elegida · {t.elegida.modelo ?? "web gratis"} · semilla {t.elegida.semilla}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button type="button" onClick={() => t.editarEnProtomolecula(t.elegida!)} className="inline-flex h-11 cursor-pointer items-center rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground transition-colors duration-150 motion-reduce:transition-none hover:bg-primary/90">Editar en la Protomolécula</button>
            <button type="button" onClick={() => t.ampliar(t.elegida!)} className="inline-flex h-11 cursor-pointer items-center rounded-md bg-secondary px-3 text-xs font-medium text-secondary-foreground transition-colors duration-150 motion-reduce:transition-none hover:bg-secondary/80">Ampliar</button>
            <button type="button" onClick={() => t.usarComoReferencia3D(t.elegida!)} className="inline-flex h-11 cursor-pointer items-center rounded-md bg-secondary px-3 text-xs font-medium text-secondary-foreground transition-colors duration-150 motion-reduce:transition-none hover:bg-secondary/80">Usar como referencia para 3D</button>
            <button type="button" onClick={() => t.guardarEnBiblioteca(t.elegida!)} className="inline-flex h-11 cursor-pointer items-center rounded-md bg-secondary px-3 text-xs font-medium text-secondary-foreground transition-colors duration-150 motion-reduce:transition-none hover:bg-secondary/80">Guardar en la Biblioteca</button>
            <button type="button" onClick={() => t.crearBorradorPublicacion(t.elegida!)} className="inline-flex h-11 cursor-pointer items-center rounded-md bg-secondary px-3 text-xs font-medium text-secondary-foreground transition-colors duration-150 motion-reduce:transition-none hover:bg-secondary/80">Borrador de publicación</button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
