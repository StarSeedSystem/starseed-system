// Adaptador de publicaciones y mensajes (contrato §5 de architecture/variaciones-publicas.md).
// Familias «post» y «mensaje» con partes #estilo, #plantilla y #decoracion: captura y aplica
// SOLO formato del borrador, nunca el texto ni los destinatarios. Módulo PURO: el borrador entra
// por un puerto inyectado; nada se ejecuta sin validar y el payload jamás lleva secretos.
import { validarEstilo } from "@/lib/mensajeria/formato";
import type { EstiloMensaje } from "@/lib/mensajeria/formato-tipos";
import { leerClave } from "../clave-elemento";
import { registrarFamilia, type AdaptadorFamilia } from "../familias";
import { validarVariacion } from "../validar";
export type FamiliaPublicacion = "post" | "mensaje";
export type PartePublicacion = "estilo" | "plantilla" | "decoracion";
export const PARTES_PUBLICACION: readonly PartePublicacion[] = ["estilo", "plantilla", "decoracion"];
const TIPOS_BLOQUE = ["titulo", "parrafo", "cita", "codigo", "lista", "tareas"] as const;
const CLAVES_ESTILO = ["fuente", "tamano", "color", "negrita", "cursiva", "animacionTexto", "alineacion"] as const;
const CLAVES_DECORACION = ["fondo", "animacionFondo", "colorMarco", "grosorMarco"] as const;
/** Plantilla de formato por tipo de bloque: estilos, nunca texto. */
export type PlantillaPublicacion = Partial<Record<(typeof TIPOS_BLOQUE)[number], EstiloMensaje>>;
/** Decoración del mensaje o la publicación: fondo, marco y animación de fondo. */
export type DecoracionPublicacion = Pick<EstiloMensaje, "fondo" | "animacionFondo" | "colorMarco" | "grosorMarco">;
export type PayloadPublicacion = EstiloMensaje | PlantillaPublicacion | DecoracionPublicacion;
/** Vista de variación del borrador; el texto y los destinatarios se quedan en el anfitrión. */
export interface BorradorPublicacion {
  estilo?: EstiloMensaje;
  plantilla?: PlantillaPublicacion;
  decoracion?: DecoracionPublicacion;
}
/** Puerto del borrador actual del editor rico o del compositor de publicaciones. */
export interface PuertoBorrador {
  leer(familia: FamiliaPublicacion): BorradorPublicacion | null;
  /** Cambia solo esa parte y conserva texto, destinatarios y demás estado del borrador. */
  escribirParte(familia: FamiliaPublicacion, parte: PartePublicacion, valor: PayloadPublicacion | undefined): void;
}
function soloClaves(estilo: EstiloMensaje | undefined, claves: readonly (keyof EstiloMensaje)[]): EstiloMensaje | undefined {
  if (!estilo) return undefined;
  const salida: EstiloMensaje = {};
  for (const clave of claves) {
    const valor = estilo[clave];
    if (valor !== undefined) (salida as Record<string, unknown>)[clave] = valor;
  }
  return Object.keys(salida).length ? salida : undefined;
}
function baseValida(payload: unknown): boolean {
  const revision = validarVariacion(payload);
  return revision.ok && !revision.requiereAislamiento;
}
export function validarEstiloPublicacion(payload: unknown): EstiloMensaje | null {
  if (!baseValida(payload)) return null;
  return soloClaves(validarEstilo(payload), CLAVES_ESTILO) ?? null;
}
export function validarDecoracionPublicacion(payload: unknown): DecoracionPublicacion | null {
  if (!baseValida(payload)) return null;
  return (soloClaves(validarEstilo(payload), CLAVES_DECORACION) as DecoracionPublicacion | undefined) ?? null;
}
export function validarPlantillaPublicacion(payload: unknown): PlantillaPublicacion | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload) || !baseValida(payload)) return null;
  const registro = payload as Record<string, unknown>;
  const plantilla: PlantillaPublicacion = {};
  for (const tipo of TIPOS_BLOQUE) {
    const estilo = validarEstiloPublicacion(registro[tipo]);
    if (estilo) plantilla[tipo] = estilo;
  }
  return Object.keys(plantilla).length ? plantilla : null;
}
function validarParte(parte: PartePublicacion, payload: unknown): PayloadPublicacion | null {
  if (parte === "estilo") return validarEstiloPublicacion(payload);
  if (parte === "decoracion") return validarDecoracionPublicacion(payload);
  return validarPlantillaPublicacion(payload);
}
/** Familia y parte de una clave `post:<id>#estilo` o `mensaje:editor#decoracion`. */
export function parteDeClave(clave: string): { familia: FamiliaPublicacion; parte: PartePublicacion } | null {
  if (!leerClave(clave)) return null;
  const [cabecera, parte] = clave.split("#");
  const familia = cabecera.split(":")[0];
  if ((familia !== "post" && familia !== "mensaje") || !PARTES_PUBLICACION.includes(parte as PartePublicacion)) return null;
  return { familia, parte: parte as PartePublicacion };
}
function valorDeParte(borrador: BorradorPublicacion, parte: PartePublicacion): PayloadPublicacion | undefined {
  if (parte === "estilo") return borrador.estilo;
  if (parte === "decoracion") return borrador.decoracion;
  return borrador.plantilla;
}
function capturar(clave: string, puerto: PuertoBorrador): PayloadPublicacion | null {
  const info = parteDeClave(clave);
  if (!info) return null;
  const borrador = puerto.leer(info.familia);
  return borrador ? validarParte(info.parte, valorDeParte(borrador, info.parte)) : null;
}
function aplicar(clave: string, payload: unknown, puerto: PuertoBorrador): () => void {
  const info = parteDeClave(clave);
  if (!info) return () => undefined;
  const validado = validarParte(info.parte, payload);
  if (!validado) return () => undefined;
  const previo = puerto.leer(info.familia) ?? {};
  const anterior = valorDeParte(previo, info.parte);
  puerto.escribirParte(info.familia, info.parte, validado);
  return () => puerto.escribirParte(info.familia, info.parte, anterior);
}
export function crearAdaptadorPublicaciones(familia: FamiliaPublicacion, puerto: PuertoBorrador): AdaptadorFamilia<PayloadPublicacion> {
  return {
    familia,
    nombre: familia === "post" ? "Estilos y plantillas de publicaciones" : "Estilos y decoración de mensajes",
    capturar: (clave) => capturar(clave, puerto),
    validar: (payload) => {
      const validado = validarEstiloPublicacion(payload) ?? validarDecoracionPublicacion(payload) ?? validarPlantillaPublicacion(payload);
      return validado ? { ok: true, payload: validado } : { ok: false, motivos: ["La variación no es un formato de publicación o mensaje válido"] };
    },
    aplicar: (clave, payload) => ({ deshacer: aplicar(clave, payload, puerto) }),
  };
}
/** Registra «post» y «mensaje» en el registro compartido del clic derecho. */
export function registrarAdaptadoresPublicaciones(puerto: PuertoBorrador): void {
  registrarFamilia(crearAdaptadorPublicaciones("post", puerto));
  registrarFamilia(crearAdaptadorPublicaciones("mensaje", puerto));
}
