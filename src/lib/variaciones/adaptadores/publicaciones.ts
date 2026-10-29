// Familias «post» y «mensaje» de variaciones públicas (architecture/variaciones-publicas.md §5).
// Partes `#estilo`, `#plantilla` o `#decoracion`: SOLO estilos y plantillas del editor rico y del compositor; nunca el texto ni los destinatarios. PURO: el borrador va por un puerto inyectado.
import type { AnimacionFondo, EstiloMensaje } from "@/lib/mensajeria/formato-tipos";
import { leerClave } from "../clave-elemento";
import { registrarFamilia, type AdaptadorFamilia } from "../familias";
import { validarVariacion } from "../validar";
export type FamiliaPublicacion = "post" | "mensaje";
export type PartePublicacion = "estilo" | "plantilla" | "decoracion";
export const PARTES: readonly PartePublicacion[] = ["estilo", "plantilla", "decoracion"];
export interface BloquePlantilla { tipo: string; alineacion?: string }
export interface DecoracionBorrador { fondo?: string; animacionFondo?: AnimacionFondo; colorMarco?: string; grosorMarco?: number }
export interface BorradorPublicacion { estilo?: EstiloMensaje | null; bloques?: Array<{ tipo?: unknown; alineacion?: unknown; texto?: unknown } | null>; destinatarios?: unknown }
export type VariacionBorrador = { parte: "estilo"; estilo: EstiloMensaje } | { parte: "plantilla"; bloques: BloquePlantilla[] } | { parte: "decoracion"; decoracion: DecoracionBorrador };
export interface PuertoBorrador { leer(familia: FamiliaPublicacion): BorradorPublicacion | null; escribir(familia: FamiliaPublicacion, borrador: BorradorPublicacion): void }
export type ResultadoBorrador = { ok: true; payload: VariacionBorrador } | { ok: false; motivos: string[] };
const FUENTES = new Set(["inter", "outfit", "titular", "roboto", "mono", "serif", "manuscrita", "redonda"]);
const ANIM_TEXTO = new Set(["ninguna", "aparecer", "maquina", "ola", "brillo", "latido", "arcoiris", "neon", "flotar", "temblor"]);
const ANIM_FONDO = new Set(["ninguna", "aurora", "estrellas", "gradiente", "pulso", "particulas"]);
const ALINEACIONES = new Set(["izquierda", "centro", "derecha", "justificado"]);
const COLOR = /^#[0-9a-f]{3,8}$/i; const TIPO_BLOQUE = /^[a-z][a-z0-9-]{0,23}$/;
const esObjeto = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const esParte = (v: string): v is PartePublicacion => (PARTES as readonly string[]).includes(v);
const textoEn = (v: unknown, s: Set<string>) => (typeof v === "string" && s.has(v) ? v : undefined);
/** Copia SOLO los campos de estilo conocidos; cualquier texto o destinatario se descarta. */
function sanearEstilo(raw: unknown): EstiloMensaje | null {
  if (!esObjeto(raw)) return null;
  const e: EstiloMensaje = {};
  const fuente = textoEn(raw.fuente, FUENTES); if (fuente) e.fuente = fuente as EstiloMensaje["fuente"];
  const at = textoEn(raw.animacionTexto, ANIM_TEXTO); if (at) e.animacionTexto = at as EstiloMensaje["animacionTexto"];
  const af = textoEn(raw.animacionFondo, ANIM_FONDO); if (af) e.animacionFondo = af as AnimacionFondo;
  const al = textoEn(raw.alineacion, ALINEACIONES); if (al) e.alineacion = al as EstiloMensaje["alineacion"];
  if (typeof raw.fondo === "string" && (COLOR.test(raw.fondo) || TIPO_BLOQUE.test(raw.fondo))) e.fondo = raw.fondo;
  if (typeof raw.color === "string" && COLOR.test(raw.color)) e.color = raw.color;
  if (typeof raw.colorMarco === "string" && COLOR.test(raw.colorMarco)) e.colorMarco = raw.colorMarco;
  if (typeof raw.tamano === "number" && Number.isInteger(raw.tamano) && raw.tamano >= 11 && raw.tamano <= 64) e.tamano = raw.tamano;
  if (typeof raw.grosorMarco === "number" && Number.isInteger(raw.grosorMarco) && raw.grosorMarco >= 0 && raw.grosorMarco <= 6) e.grosorMarco = raw.grosorMarco;
  if (typeof raw.negrita === "boolean") e.negrita = raw.negrita; if (typeof raw.cursiva === "boolean") e.cursiva = raw.cursiva;
  return Object.keys(e).length ? e : null;
}
/** De un estilo completo toma solo la superficie visual: fondo, marco y animación. */
function sanearDecoracion(raw: unknown): DecoracionBorrador | null {
  const e = sanearEstilo(raw); if (!e) return null;
  const d: DecoracionBorrador = {
    ...(e.fondo !== undefined ? { fondo: e.fondo } : {}), ...(e.animacionFondo !== undefined ? { animacionFondo: e.animacionFondo } : {}),
    ...(e.colorMarco !== undefined ? { colorMarco: e.colorMarco } : {}), ...(e.grosorMarco !== undefined ? { grosorMarco: e.grosorMarco } : {}),
  };
  return Object.keys(d).length ? d : null;
}
/** Estructura de la plantilla: tipo y alineación, jamás el texto de cada bloque. */
function sanearPlantilla(raw: unknown): BloquePlantilla[] | null {
  if (!Array.isArray(raw) || raw.length < 1 || raw.length > 40) return null;
  const bloques: BloquePlantilla[] = [];
  for (const item of raw) {
    if (!esObjeto(item) || typeof item.tipo !== "string" || !TIPO_BLOQUE.test(item.tipo)) return null;
    const bloque: BloquePlantilla = { tipo: item.tipo };
    if (typeof item.alineacion === "string" && ALINEACIONES.has(item.alineacion)) bloque.alineacion = item.alineacion;
    bloques.push(bloque);
  }
  return bloques;
}
function capturarParte(parte: PartePublicacion, b: BorradorPublicacion): VariacionBorrador | null {
  if (parte === "estilo") { const estilo = sanearEstilo(b.estilo); return estilo ? { parte, estilo } : null; }
  if (parte === "decoracion") { const decoracion = sanearDecoracion(b.estilo); return decoracion ? { parte, decoracion } : null; }
  const bloques = sanearPlantilla(b.bloques); return bloques ? { parte, bloques } : null;
}
/** Parte `#…` de una clave canónica; `null` si no es una de las tres. */
export function parteDeClave(clave: string): PartePublicacion | null {
  const parte = leerClave(clave)?.split("#")[1] ?? "";
  return esParte(parte) ? parte : null;
}
const fallo = (motivos: string[]): ResultadoBorrador => ({ ok: false, motivos });
/** Valida el payload: JSON plano, sin secretos ni código, y solo campos de su parte. */
export function validarVariacionBorrador(raw: unknown): ResultadoBorrador {
  const base = validarVariacion(raw);
  if (!base.ok) return fallo(base.motivos);
  if (base.requiereAislamiento) return fallo(["Publicación: una variación de estilo o plantilla no es código"]);
  if (!esObjeto(raw) || typeof raw.parte !== "string" || !esParte(raw.parte)) return fallo(["Publicación: la variación debe declarar una parte válida"]);
  const parte = raw.parte;
  if (parte === "estilo") { const estilo = sanearEstilo(raw.estilo); return estilo ? { ok: true, payload: { parte, estilo } } : fallo(["Publicación: el estilo no tiene ningún valor válido"]); }
  if (parte === "decoracion") { const d = sanearDecoracion(raw.decoracion); return d ? { ok: true, payload: { parte, decoracion: d } } : fallo(["Publicación: la decoración no tiene fondo, marco ni animación válidos"]); }
  const bloques = sanearPlantilla(raw.bloques);
  return bloques ? { ok: true, payload: { parte, bloques } } : fallo(["Publicación: la plantilla debe ser de 1 a 40 bloques con tipo válido"]);
}
/** Aplica la variación sobre el borrador actual; lo que no toca, se conserva. */
function aplicarParte(previo: BorradorPublicacion, v: VariacionBorrador): BorradorPublicacion {
  if (v.parte === "plantilla") return { ...previo, bloques: v.bloques.map((b) => ({ ...b })) };
  const cambio = v.parte === "estilo" ? v.estilo : v.decoracion;
  return { ...previo, estilo: { ...(previo.estilo ?? {}), ...cambio } };
}
function crearAdaptador(familia: FamiliaPublicacion, puerto: PuertoBorrador): AdaptadorFamilia<VariacionBorrador> {
  return {
    familia,
    nombre: familia === "mensaje" ? "Estilos del editor de mensajes" : "Estilos del compositor de publicaciones",
    capturar: (clave) => {
      if (leerClave(clave)?.split(":")[0] !== familia) return null;
      const parte = parteDeClave(clave); if (!parte) return null;
      const borrador = puerto.leer(familia);
      return borrador ? capturarParte(parte, borrador) : null;
    },
    validar: (raw) => { const r = validarVariacionBorrador(raw); return r.ok ? { ok: true, payload: r.payload } : { ok: false, motivos: r.motivos }; },
    aplicar: (clave, payload) => {
      if (leerClave(clave)?.split(":")[0] !== familia || parteDeClave(clave) !== payload.parte) return { deshacer: () => undefined };
      const r = validarVariacionBorrador(payload);
      if (!r.ok) return { deshacer: () => undefined };
      const previo = puerto.leer(familia) ?? {};
      puerto.escribir(familia, aplicarParte(previo, r.payload));
      return { deshacer: () => puerto.escribir(familia, previo) };
    },
  };
}
export function crearAdaptadorPublicacion(familia: FamiliaPublicacion, puerto: PuertoBorrador): AdaptadorFamilia<VariacionBorrador> { return crearAdaptador(familia, puerto); }
/** Registra las dos familias en el registro compartido del clic derecho. */
export function registrarAdaptadoresPublicaciones(puerto: PuertoBorrador): void {
  registrarFamilia(crearAdaptadorPublicacion("post", puerto));
  registrarFamilia(crearAdaptadorPublicacion("mensaje", puerto));
}
