/**
 * Imágenes locales de Astraura · MONTURA ÚNICA (IMG1011J). Contrato: architecture/astraura-imagenes.md §6 y §9.
 *
 * Un solo punto de entrada por donde el chat de Astraura, la respuesta de un agente o un bot, la
 * Protomolécula y los ajustes de la generación audiovisual montan la tarjeta y las sugerencias sin
 * conocer los módulos de dentro. Además trae los dos trozos puros que faltaban para el enchufe honesto:
 * la entrada de la herramienta `generar_imagen` se convierte en `PeticionImagen` y la galería del
 * proveedor «neuronas» (media-gen) se convierte en opciones de la tarjeta. Nada aquí consulta la red:
 * son conversiones entrada → salida.
 */
import { CAPACIDADES_IMG, MODELOS_IMAGEN, type ModeloImagen, type MotorImg, type CapacidadImg } from "@/lib/imagenes/modelos";
import { PETICION_DEFECTO } from "@/lib/imagenes/adaptadores/use-tarjeta-imagenes";
import type { CapaImg, PeticionImagen } from "@/lib/imagenes/plan";
import type { GaleriaImagenes, OpcionGaleria } from "@/ai/astraura/media/proveedor-neuronas";
import type { OpcionTarjeta } from "./tarjeta-imagenes";

/** La tarjeta de opciones (con las opciones ya hechas o planificando aquí con `peticion`). */
export { TarjetaImagenes, type TarjetaImagenesProps, type OpcionTarjeta } from "./tarjeta-imagenes";
/** La sugerencia «Astraura te sugiere instalar…» (ajustes de la generación audiovisual). */
export { default as SugerenciasInstalacion } from "./sugerencias-instalacion";

/** Motor de verdad para una galería que no trae el suyo: la capa sí lo sabe. */
export function motorDeGaleria(capa: CapaImg): MotorImg | "espacio-hf" | "pollinations" {
  // Web gratis = Pollinations; Space = su Space de Hugging Face; la capa local (aparato, pestaña,
  // neurona o malla) corre el servicio de la neurona (IMG1011A), cuyo motor es stable-diffusion.cpp (§1).
  return capa === "web-gratis" ? "pollinations" : capa === "espacio" ? "espacio-hf" : "sdcpp";
}

/** El modelo de la galería por su NOMBRE (la galería guarda el nombre, no el id). */
function modeloDeGaleria(nombre: string | null): ModeloImagen | null {
  if (!nombre) return null;
  return MODELOS_IMAGEN.find((m) => m.nombre === nombre) ?? null;
}

/**
 * De la entrada de la herramienta `generar_imagen` ({ prompt, opciones?, necesita?, referencia?,
 * comercial? }) a la petición de la tarjeta. Sin prompt no hay tarjeta (devuelve null); lo que falta
 * lo completa `PETICION_DEFECTO`; las capacidades que no existen en el catálogo se sueltan, no se
 * inventan; las opciones se recortan a la franja honesta 1–8 (§4).
 */
export function peticionDesdeHerramienta(entrada: unknown): PeticionImagen & { prompt: string } | null {
  if (!entrada || typeof entrada !== "object") return null;
  const e = entrada as Record<string, unknown>;
  const prompt = typeof e.prompt === "string" ? e.prompt.trim() : "";
  if (!prompt) return null;
  const pedido = typeof e.opciones === "number" && Number.isFinite(e.opciones) ? Math.floor(e.opciones) : PETICION_DEFECTO.opciones;
  const lasCapas = CAPACIDADES_IMG as readonly string[];
  const necesita = Array.isArray(e.necesita)
    ? e.necesita.filter((s): s is CapacidadImg => typeof s === "string" && lasCapas.includes(s))
    : [...PETICION_DEFECTO.necesita];
  return {
    ...PETICION_DEFECTO,
    opciones: Math.min(8, Math.max(1, pedido)),
    necesita,
    comercial: e.comercial === true,
    conReferencia: typeof e.referencia === "string" && e.referencia.trim().length > 0,
    prompt,
  };
}

/**
 * De la galería del proveedor «neuronas» de media-gen a las opciones de la tarjeta. Cada ficha lleva
 * el modelo y la licencia REALES de la galería (procedencia y atribución nunca se inventan); el prompt
 * se pega para que «elegir» y «variar» sirvan; el motor deduce por la capa cuando la galería no lo
 * trae. Una opción sin URL se muestra para que se pueda generar (elegir la hace); una sin archivo ni
 * modelo conocido no presentaría nada real y se suelta con su porqué.
 */
export function opcionesDesdeGaleria(galeria: GaleriaImagenes, prompt: string): OpcionTarjeta[] {
  if (!galeria.ok || !Array.isArray(galeria.opciones)) return [];
  const salidas: OpcionTarjeta[] = [];
  for (const o of galeria.opciones) {
    const ficha = fichaDesdeGaleria(o, prompt);
    if (ficha) salidas.push(ficha);
  }
  return salidas;
}

/** La ficha de UNA opción de galería, o null si no hay nada real que mostrar (con el porqué en el motivo). */
function fichaDesdeGaleria(o: OpcionGaleria, prompt: string): OpcionTarjeta | null {
  const modelo = modeloDeGaleria(o.modelo ?? "");
  if (!o.url && !modelo) return null;
  return {
    capa: o.capa,
    ...(o.neurona ? { neuronaId: o.neurona } : {}),
    modelo,
    motor: motorDeGaleria(o.capa),
    cuantizacion: "nativa" as const,
    semilla: o.semilla,
    motivo: o.atribucion || `Opción de la capa «${o.capa}» de la malla de neuronas.`,
    prompt: prompt.trim(),
    ...(o.url ? { url: o.url } : {}),
  };
}

