"use client";

/**
 * Imágenes locales de Astraura · TARJETA DE OPCIONES (IMG1011C-parte 1). Contrato: architecture/astraura-imagenes.md §6.
 *
 * Muestra TODAS las opciones de una generación en una rejilla que no se solapa en pantallas pequeñas
 * (grid responsivo, nunca capas absolutas), y en cada opción deja visibles el modelo, dónde se hará
 * (tu aparato, tu PC, la malla, la web…), su licencia y la atribución de su repositorio. Acciones
 * por opción: elegir, variar (más semillas del mismo modelo), editar en la Protomolécula, ampliar,
 * usar como referencia para 3D (el diálogo real del taller 3D, `Generar3D`), guardar en la
 * Biblioteca y borrador de publicación. Se incrusta igual en el chat de Astraura, en la respuesta
 * de un agente o en la de un bot: si quien la monta ya tiene las opciones (el plan ya salió), las
 * recibe por props con sus callbacks y no toca el hook de planificación; si no, las planifica al
 * montar con `useTarjetaImagenes`. Con `prefers-reduced-motion` no anima (transiciones ausentes).
 */
import { useEffect, useState } from "react";
import { type CapaImg, type OpcionImagen, type PeticionImagen } from "@/lib/imagenes/plan";
import type { UsoLicencia } from "@/lib/avatares/adn/adn";
import { useTarjetaImagenes } from "@/lib/imagenes/adaptadores/use-tarjeta-imagenes";
import { borradorPublicacion } from "@/lib/publicacion/borrador";
import { Generar3D } from "@/components/avatares/generar-3d";

/** Una opción de imagen para la tarjeta: la del plan y, si ya existe, su URL y su prompt. */
export type OpcionTarjeta = OpcionImagen & { prompt?: string; url?: string; elegida?: boolean };

export interface TarjetaImagenesProps {
  peticion?: PeticionImagen;
  opciones?: readonly OpcionTarjeta[];
  onElegir?: (o: OpcionTarjeta) => void;
  onVariar?: (o: OpcionTarjeta) => void;
  onEditar?: (o: OpcionTarjeta) => void;
  onGuardar?: (o: OpcionTarjeta) => void;
}

const ETIQUETA_CAPA: Record<CapaImg, string> = {
  dispositivo: "Tu aparato",
  navegador: "Tu PC (la pestaña)",
  neurona: "Otra neurona tuya",
  malla: "La malla",
  espacio: "La web (Space gratuito de Hugging Face)",
  "web-gratis": "La web (gratis)",
  externo: "La web (servicio de pago)",
};

const ETIQUETA_USO: Record<UsoLicencia, string> = {
  libre: "uso libre",
  atribucion: "con atribución obligatoria",
  condicionado: "condicionado",
  "no-comercial": "no comercial",
  "restringido-region": "restringido en algunas regiones",
};

/** Ficha de UNA opción dentro de la rejilla: miniatura, procedencia, licencia y atribución visibles. */
function FichaOpcion(props: {
  opciones: readonly OpcionTarjeta[];
  indice: number;
  onElegir?: (o: OpcionTarjeta) => void;
  onVariar?: (o: OpcionTarjeta) => void;
  onEditar?: (o: OpcionTarjeta) => void;
  onGuardar?: (o: OpcionTarjeta) => void;
  onBorrador?: (o: OpcionTarjeta) => void;
  abrirAmplia: (o: OpcionTarjeta) => void;
}) {
  const opciones = props.opciones;
  const i = props.indice;
  const o = opciones[i];
  const titulo = o.modelo?.nombre ?? "Modelo a decidir";
  const iniciales = (o.modelo?.nombre ?? "??").slice(0, 2).toUpperCase();
  return (
    <article aria-label={`Opción ${i + 1} de ${opciones.length}: ${titulo}`} className={`rounded-xl border p-3 ${o.elegida ? "border-primary ring-2 ring-primary/30" : "border-border"}`}>
      <div className="flex items-start gap-3">
        {o.url ? (
          <img src={o.url} alt={`Imagen de propuesta con ${o.modelo?.nombre ?? "candidato desconocido"}`} className="h-16 w-16 flex-none rounded-lg object-cover" />
        ) : (
          <div aria-hidden="true" className="flex h-16 w-16 flex-none items-center justify-center rounded-lg bg-muted font-mono text-sm text-muted-foreground">{iniciales}</div>
        )}
        <div className="min-w-0 flex-1">
          <h4 className="truncate text-sm font-semibold">{titulo}</h4>
          <p className="text-xs text-muted-foreground">{ETIQUETA_CAPA[o.capa]}</p>
          <p className="text-xs text-muted-foreground">
            Licencia: {o.modelo?.licencia ?? "por decidir"} · {o.modelo ? ETIQUETA_USO[o.modelo.uso] : "condiciones por decidir"}
          </p>
          {o.url ? (
            <p className="truncate text-xs text-muted-foreground">
              <a className="cursor-pointer underline underline-offset-2" href={o.url} target="_blank" rel="noreferrer">Ver el archivo · {o.modelo?.hf ?? "sin repositorio"}</a>
            </p>
          ) : (
            <p className="truncate text-xs text-muted-foreground" title={o.motivo}>
              <a className="cursor-pointer underline underline-offset-2" href={`https://huggingface.co/${o.modelo?.hf}`} target="_blank" rel="noreferrer">Repositorio · {o.modelo?.hf}</a>
            </p>
          )}
        </div>
      </div>
      <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{o.motivo}</p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        <button type="button" onClick={() => props.onElegir?.(o)} className="cursor-pointer rounded-md bg-primary px-2 py-1 text-xs text-primary-foreground transition-colors hover:bg-primary/90 motion-reduce:transition-none" aria-label={`Elegir la opción ${i + 1} (${titulo})`}>Elegir</button>
        <button type="button" onClick={() => props.onVariar?.(o)} className="cursor-pointer rounded-md border px-2 py-1 text-xs transition-colors hover:bg-muted motion-reduce:transition-none" aria-label={`Variar la opción ${i + 1}: más semillas con ${titulo}`}>Variar</button>
        <button type="button" onClick={() => props.onEditar?.(o)} className="cursor-pointer rounded-md border px-2 py-1 text-xs transition-colors hover:bg-muted motion-reduce:transition-none" aria-label={`Editar la opción ${i + 1} en la Protomolécula`}>Editar</button>
        <button type="button" onClick={() => props.abrirAmplia(o)} disabled={!o.url} className="cursor-pointer rounded-md border px-2 py-1 text-xs transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transition-none" aria-label={`Ampliar la opción ${i + 1}`}>Ampliar</button>
        <button type="button" onClick={() => props.onGuardar?.(o)} className="cursor-pointer rounded-md border px-2 py-1 text-xs transition-colors hover:bg-muted motion-reduce:transition-none" aria-label={`Guardar la opción ${i + 1} en la Biblioteca`}>Guardar</button>
        <button type="button" onClick={() => props.onBorrador?.(o)} className="cursor-pointer rounded-md border px-2 py-1 text-xs transition-colors hover:bg-muted motion-reduce:transition-none" aria-label={`Pasar la opción ${i + 1} a borrador de publicación`}>Borrador</button>
      </div>
    </article>
  );
}

/** Diálogo de ampliación de una imagen: solo se abre si la opción ya tiene su archivo. */
function Ampliacion(props: { ampliada: OpcionTarjeta | null; cerrar: () => void }) {
  const { ampliada, cerrar } = props;
  if (!ampliada?.url) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm">
      <div role="dialog" aria-modal="true" aria-label={`Imagen ampliada: ${ampliada.modelo?.nombre ?? "sin modelo"}`} className="max-h-[90vh] w-full max-w-3xl overflow-auto rounded-xl border bg-card p-4 shadow-lg">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-semibold">{ampliada.modelo?.nombre ?? "Imagen"} · {ETIQUETA_CAPA[ampliada.capa]}</p>
          <button type="button" autoFocus onClick={cerrar} className="cursor-pointer rounded-md border px-3 py-1 text-sm transition-colors hover:bg-muted motion-reduce:transition-none" aria-label="Cerrar la ampliación">Cerrar</button>
        </div>
        <img src={ampliada.url} alt={`Imagen ampliada generada con ${ampliada.modelo?.nombre ?? "candidato desconocido"}`} className="mt-3 max-h-[70vh] w-full rounded-lg object-contain" />
        <p className="mt-2 text-xs text-muted-foreground">
          Licencia: {ampliada.modelo?.licencia ?? "por decidir"} · {ampliada.modelo ? ETIQUETA_USO[ampliada.modelo.uso] : "condiciones por decidir"} ·{" "}
          <a className="cursor-pointer underline underline-offset-2" href={`https://huggingface.co/${ampliada.modelo?.hf}`} target="_blank" rel="noreferrer">Atribución · {ampliada.modelo?.hf}</a>
        </p>
      </div>
    </div>
  );
}

/** EL mostrador: la rejilla de fichas con sus acciones. Pura presentación, sin planificación. */
function Mostrador(props: {
  opciones: readonly OpcionTarjeta[];
  onElegir?: (o: OpcionTarjeta) => void;
  onVariar?: (o: OpcionTarjeta) => void;
  onEditar?: (o: OpcionTarjeta) => void;
  onGuardar?: (o: OpcionTarjeta) => void;
  onBorrador?: (o: OpcionTarjeta) => void;
}) {
  const [ampliada, setAmpliada] = useState<OpcionTarjeta | null>(null);
  const fichas = { onElegir: props.onElegir, onVariar: props.onVariar, onEditar: props.onEditar, onGuardar: props.onGuardar, onBorrador: props.onBorrador };
  return (
    <section aria-label="Opciones de imagen" className="w-full space-y-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {props.opciones.map((_, i) => (
          <FichaOpcion
            key={`${i}-${props.opciones[i]?.modelo?.id ?? "sin-modelo"}`}
            indice={i}
            opciones={props.opciones}
            abrirAmplia={() => setAmpliada(props.opciones[i] ?? null)}
            {...fichas}
          />
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2 border-t pt-2">
        <Generar3D destino="avatar" etiqueta="Usar como referencia para 3D" />
        <p className="text-xs text-muted-foreground">Guarda antes la imagen que quieras en la Biblioteca: el taller la toma de ahí.</p>
      </div>
      <Ampliacion ampliada={ampliada} cerrar={() => setAmpliada(null)} />
    </section>
  );
}

/** Variante sin opciones por props: planifica con el hook y enlaza sus acciones reales. */
function TarjetaGenerada(props: { peticion?: PeticionImagen; onElegir?: (o: OpcionTarjeta) => void }) {
  const { opciones, cargando, error, generarOpciones, elegirOpcion, variarOpcion, abrirEnProtomolecula, guardarEnBiblioteca } = useTarjetaImagenes();
  const clave = props.peticion ? JSON.stringify(props.peticion) : "";
  useEffect(() => {
    if (!clave) return;
    const p = JSON.parse(clave) as PeticionImagen & { prompt?: string };
    void generarOpciones(p);
  }, [clave, generarOpciones]);
  if (cargando) return <p role="status" className="p-3 text-sm text-muted-foreground">Calculando las opciones de imagen…</p>;
  if (error) return <p role="alert" className="p-3 text-sm text-destructive">{error}</p>;
  if (opciones.length === 0) {
    return <p className="p-3 text-sm text-muted-foreground">Aún no hay opciones: danos la petición de imagen y Astraura reparte por capas.</p>;
  }
  return (
    <Mostrador
      opciones={opciones}
      onElegir={(o) => { if (props.onElegir) props.onElegir(o); else void elegirOpcion(o); }}
      onVariar={(o) => void variarOpcion(o)}
      onEditar={(o) => void abrirEnProtomolecula.abrirProtomoleculaEditor(o.url ?? "")}
      onGuardar={(o) => void guardarEnBiblioteca(o)}
      onBorrador={() => void borradorPublicacion()}
    />
  );
}

/** La tarjeta incrustable: con `opciones` (chat, agente o bot ya planificó) o con `peticion` (planifica aquí). */
export function TarjetaImagenes(props: TarjetaImagenesProps) {
  if (props.opciones && props.opciones.length > 0) {
    return (
      <Mostrador
        opciones={props.opciones}
        onElegir={(o) => props.onElegir?.(o)}
        onVariar={(o) => props.onVariar?.(o)}
        onEditar={(o) => props.onEditar?.(o)}
        onGuardar={(o) => props.onGuardar?.(o)}
        onBorrador={() => void borradorPublicacion()}
      />
    );
  }
  return <TarjetaGenerada peticion={props.peticion} onElegir={props.onElegir} />;
}

/** Formas de uso: chat de Astraura, respuesta de agente y respuesta de bot montan la misma tarjeta. */
export default TarjetaImagenes;
