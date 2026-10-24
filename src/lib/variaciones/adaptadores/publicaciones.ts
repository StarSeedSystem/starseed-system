// Familias «post» y «mensaje» de las variaciones públicas (contrato:
// architecture/variaciones-publicas.md §2 y §5, tarea H de la Ola 1019V).
// Capturan SOLO estilo, plantilla y decoración de los editores — nunca el texto
// ni los destinatarios. Módulo PURO: el borrador del compositor y del editor
// rico va en un puerto inyectado; sin Supabase, disco, reloj ni DOM.
import {
  FONDOS_BURBUJA, FUENTES_MENSAJE, LIMITES_FORMATO,
  type AnimacionFondo, type EstiloMensaje,
} from "@/lib/mensajeria/formato-tipos";
import { validarVariacion } from "../validar";
import { registrarFamilia, type AdaptadorFamilia } from "../familias";

/** Partes del editor que una variación puede llevar (contrato §2). */
export type PartePublicacion = "estilo" | "plantilla" | "decoracion";

/** Elemento de una plantilla de lienzo: caja, orden y forma, SIN contenido. */
export interface ElementoPlantilla {
  tipo: "texto" | "forma";
  x: number; y: number; w: number; h: number; z: number;
  rot?: number; radio?: number;
  forma?: { tipo: 'rect' | 'circulo' | 'estrella' | 'linea'; color: string; relleno?: boolean };
}

/** Plantilla del editor: medidas del lienzo, fondo y cajas de composición. */
export interface PlantillaEditor {
  ancho: number;
  alto: number;
  fondo?: string;
  animacionFondo?: AnimacionFondo;
  elementos: ElementoPlantilla[];
}

/** Decoración de la burbuja: fondo, marco y animación, sin texto. */
export interface DecoracionEditor {
  fondo?: string;
  animacionFondo?: AnimacionFondo;
  colorMarco?: string;
  grosorMarco?: number;
}

/** Borrador tal como el compositor o el editor rico lo presta al adaptador. */
export interface BorradorCompositor {
  estilo: EstiloMensaje | null;
  plantilla: PlantillaEditor | null;
  decoracion: DecoracionEditor | null;
}

/** Puerto del borrador actual, inyectado por la UI del editor. */
export interface PuertoBorrador {
  leer(): BorradorCompositor;
  escribir(parche: Partial<BorradorCompositor>): void;
}

/** Variación aplicable sobre el borrador: la parte y su valor, nada más. */
export interface VariacionPublicacion {
  parte: PartePublicacion;
  estilo?: EstiloMensaje;
  plantilla?: PlantillaEditor;
  decoracion?: DecoracionEditor;
}

export type ResultadoParte<T> = { ok: true; valor: T } | { ok: false; motivos: string[] };

export const PARTES_PUBLICACION = ["estilo", "plantilla", "decoracion"] as const;
export const CAMPOS_ESTILO = [
  "fuente", "tamano", "color", "colorMarco", "grosorMarco", "fondo",
  "animacionTexto", "animacionFondo", "alineacion", "negrita", "cursiva",
] as const;
export const CAMPOS_ELEMENTO = ["tipo", "x", "y", "w", "h", "z", "rot", "radio", "forma"] as const;

const ANIMACIONES_TEXTO = new Set<string>(["ninguna", "aparecer", "maquina", "ola", "brillo", "latido", "arcoiris", "neon", "flotar", "temblor"]);
const ANIMACIONES_FONDO = new Set<string>(["ninguna", "aurora", "estrellas", "gradiente", "pulso", "particulas"]);
const ALINEACIONES = new Set<string>(["izquierda", "centro", "derecha", "justificado"]);
const FUENTES = new Set<string>(FUENTES_MENSAJE.map((f) => f.id));
const FONDOS = new Set<string>(FONDOS_BURBUJA.map((f) => f.id));
const FORMAS = new Set<string>(["rect", "circulo", "estrella", "linea"]);
const HEX = /^#[0-9a-f]{6}$/i;

/** Número finito dentro del rango cerrado [min, max]. */
function num(v: unknown, min: number, max: number): v is number {
  return typeof v === "number" && Number.isFinite(v) && v >= min && v <= max;
}

/** Fondo válido: id de `FONDOS_BURBUJA` o color hex, como en el editor. */
function fondoValido(v: unknown): boolean {
  return typeof v === "string" && (FONDOS.has(v) || HEX.test(v));
}

/** Motivos por cualquier campo fuera del vocabulario del editor. */
function camposFuera(obj: Record<string, unknown>, permitidas: readonly string[]): string[] {
  return Object.keys(obj).filter((k) => !permitidas.includes(k)).map((k) => `«${k}» no es un campo de la variación`);
}

/** Valida el estilo del mensaje: vocabulario cerrado del editor y sin texto. */
export function validarEstilo(payload: unknown): ResultadoParte<EstiloMensaje> {
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    return { ok: false, motivos: ["El estilo debe ser un objeto de estilo del editor"] };
  }
  const estilo = payload as Record<string, unknown>;
  const motivos = camposFuera(estilo, CAMPOS_ESTILO);
  const en = (k: string, conjunto: Set<string>, v: unknown): void => {
    if (typeof v !== "string" || !conjunto.has(v)) motivos.push(`«${k}» no está en el vocabulario del editor`);
  };
  if (estilo.fuente !== undefined) en("fuente", FUENTES, estilo.fuente);
  if (estilo.tamano !== undefined && !num(estilo.tamano, LIMITES_FORMATO.tamanoMin, LIMITES_FORMATO.tamanoMax)) motivos.push("«tamano» está fuera del rango del editor");
  if ((estilo.color !== undefined && !HEX.test(estilo.color as string)) || (estilo.colorMarco !== undefined && !HEX.test(estilo.colorMarco as string))) motivos.push("Los colores del estilo son hex o token del OS, nunca otra cosa");
  if (estilo.grosorMarco !== undefined && !num(estilo.grosorMarco, 0, 6)) motivos.push("«grosorMarco» está fuera del rango del editor");
  if (estilo.fondo !== undefined && !fondoValido(estilo.fondo)) motivos.push("«fondo» no es un fondo de burbuja del OS");
  if (estilo.animacionTexto !== undefined) en("animacionTexto", ANIMACIONES_TEXTO, estilo.animacionTexto);
  if (estilo.animacionFondo !== undefined) en("animacionFondo", ANIMACIONES_FONDO, estilo.animacionFondo);
  if (estilo.alineacion !== undefined) en("alineacion", ALINEACIONES, estilo.alineacion);
  if ((estilo.negrita !== undefined && typeof estilo.negrita !== "boolean") || (estilo.cursiva !== undefined && typeof estilo.cursiva !== "boolean")) motivos.push("«negrita» y «cursiva» son booleanos");
  revisar(estilo, motivos);
  return motivos.length === 0 ? { ok: true, valor: estilo as EstiloMensaje } : { ok: false, motivos };
}

/** Higiene común: JSON plano, sin secretos, sin URLs raras (validador puro). */
function revisar(payload: unknown, motivos: string[]): void {
  const r = validarVariacion(payload);
  if (!r.ok) motivos.push(...r.motivos);
  else if (r.requiereAislamiento) motivos.push("La variación parece llevar código: un estilo del editor no es código");
}

/** Valida la plantilla: composición del lienzo SIN contenido ni datos privados. */
export function validarPlantilla(payload: unknown): ResultadoParte<PlantillaEditor> {
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    return { ok: false, motivos: ["La plantilla debe ser un objeto de composición del lienzo"] };
  }
  const plantilla = payload as Record<string, unknown>;
  const motivos = camposFuera(plantilla, ["ancho", "alto", "fondo", "animacionFondo", "elementos"]);
  const tope = LIMITES_FORMATO.lienzoMax;
  if (!num(plantilla.ancho, 1, tope) || !num(plantilla.alto, 1, tope)) motivos.push("Las medidas del lienzo están fuera del rango del editor");
  if (plantilla.fondo !== undefined && !fondoValido(plantilla.fondo)) motivos.push("«fondo» no es un fondo de burbuja del OS");
  if (plantilla.animacionFondo !== undefined && !(typeof plantilla.animacionFondo === "string" && ANIMACIONES_FONDO.has(plantilla.animacionFondo))) motivos.push("«animacionFondo» no está en el vocabulario del editor");
  const elementos = plantilla.elementos;
  if (!Array.isArray(elementos)) motivos.push("«elementos» debe ser la lista de cajas de la composición");
  else {
    if (elementos.length > LIMITES_FORMATO.elementosLienzo) motivos.push("«elementos» pasa del límite del lienzo del editor");
    elementos.forEach((e, i) => revisarElemento(e, `${i}`, motivos));
  }
  revisar(plantilla, motivos);
  return motivos.length === 0 ? { ok: true, valor: plantilla as unknown as PlantillaEditor } : { ok: false, motivos };
}

function revisarElemento(e: unknown, indice: string, motivos: string[]): void {
  if (typeof e !== "object" || e === null) { motivos.push(`El elemento ${indice} de la plantilla debe ser una caja`); return; }
  const el = e as Record<string, unknown>;
  for (const c of camposFuera(el, CAMPOS_ELEMENTO)) motivos.push(`El elemento ${indice} lleva ${c === "texto" || c === "url" || c === "nombre" || c === "ruta" ? "contenido o datos privados" : c}`); // texto, url, nombre y ruta nunca viajan
  if (el.tipo !== "texto" && el.tipo !== "forma") motivos.push(`El elemento ${indice} no es de un tipo del lienzo`);
  if (!num(el.x, 0, LIMITES_FORMATO.lienzoMax) || !num(el.y, 0, LIMITES_FORMATO.lienzoMax) || !num(el.w, 1, LIMITES_FORMATO.lienzoMax) || !num(el.h, 1, LIMITES_FORMATO.lienzoMax)) motivos.push(`El elemento ${indice} está fuera del lienzo del editor`);
  if (!num(el.z, 1, 4_000)) motivos.push(`La capa del elemento ${indice} no es válida`);
  if (el.rot !== undefined && !num(el.rot, 0, 360)) motivos.push(`La rotación del elemento ${indice} no es válida`);
  if (el.radio !== undefined && !num(el.radio, 0, LIMITES_FORMATO.lienzoMax)) motivos.push(`El radio del elemento ${indice} no es válido`);
  if (el.forma !== undefined) {
    if (typeof el.forma !== "object" || el.forma === null) motivos.push(`La forma del elemento ${indice} debe ser un objeto`);
    else {
      const f = el.forma as Record<string, unknown>;
      if (!FORMAS.has(f.tipo as string)) motivos.push(`La forma del elemento ${indice} no está en el vocabulario del editor`);
      if (!fondoValido(f.color)) motivos.push(`El color de la forma del elemento ${indice} es hex o token del OS`);
      if (f.relleno !== undefined && typeof f.relleno !== "boolean") motivos.push(`El relleno del elemento ${indice} es booleano`);
    }
  }
}

/** Valida la decoración: fondo, marco y animación de la burbuja, sin texto. */
export function validarDecoracion(payload: unknown): ResultadoParte<DecoracionEditor> {
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    return { ok: false, motivos: ["La decoración debe ser un objeto de decoración del editor"] };
  }
  const d = payload as Record<string, unknown>;
  const motivos = camposFuera(d, ["fondo", "animacionFondo", "colorMarco", "grosorMarco"]);
  if (d.fondo !== undefined && !fondoValido(d.fondo)) motivos.push("«fondo» no es un fondo de burbuja del OS");
  if (d.animacionFondo !== undefined && !(typeof d.animacionFondo === "string" && ANIMACIONES_FONDO.has(d.animacionFondo))) motivos.push("«animacionFondo» no está en el vocabulario del editor");
  if (d.colorMarco !== undefined && !HEX.test(d.colorMarco as string)) motivos.push("«colorMarco» es hex o token del OS");
  if (d.grosorMarco !== undefined && !num(d.grosorMarco, 0, 6)) motivos.push("«grosorMarco» está fuera del rango del editor");
  revisar(d, motivos);
  return motivos.length === 0 ? { ok: true, valor: d as DecoracionEditor } : { ok: false, motivos };
}

/** Resuelve `post:<id>#<parte>` y `mensaje:<id>#<parte>`; nulo sin parte válida. */
export function idDePublicacion(clave: string): { familia: "post" | "mensaje"; parte: PartePublicacion } | null {
  const m = /^((?:post|mensaje):[a-z0-9.-]+)#(estilo|plantilla|decoracion)$/.exec(clave);
  if (!m) return null;
  return { familia: m[1].split(":")[0] as "post" | "mensaje", parte: m[2] as PartePublicacion };
}

/** Empaqueta la parte con su valor (o su hueco) en un parche del borrador. */
function parcheDe(
  parte: PartePublicacion,
  valor: EstiloMensaje | PlantillaEditor | DecoracionEditor | null,
): Partial<BorradorCompositor> {
  if (parte === "estilo") return { estilo: valor as EstiloMensaje | null };
  if (parte === "plantilla") return { plantilla: valor as PlantillaEditor | null };
  return { decoracion: valor as DecoracionEditor | null };
}

/** Valida que la variación declare una parte, solo esa, y siga su forma. */
export function validarVariacionPublicacion(payload: unknown): ResultadoParte<VariacionPublicacion> {
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    return { ok: false, motivos: ["La variación del editor debe declarar su parte y su valor"] };
  }
  const v = payload as Record<string, unknown>;
  if (typeof v.parte !== "string" || !PARTES_PUBLICACION.includes(v.parte as PartePublicacion)) {
    return { ok: false, motivos: ["La variación no declara una parte válida (estilo, plantilla o decoración)"] };
  }
  const parte = v.parte as PartePublicacion;
  const otras = PARTES_PUBLICACION.filter((p) => p !== parte && v[p] !== undefined);
  const motivos = otras.length > 0
    ? [`La variación es de ${parte}, no lleva ${otras.join(", ")}`]
    : [];
  const fuenteDelValor = (): EstiloMensaje | PlantillaEditor | DecoracionEditor | undefined =>
    parte === "estilo" ? validarEstiloGuard(v[parte], motivos)
    : parte === "plantilla" ? validarPlantillaGuard(v[parte], motivos)
    : validarDecoracionGuard(v[parte], motivos);
  const valor = fuenteDelValor();
  if (valor !== undefined && v[parte] === undefined) motivos.push(`La variación es de ${parte} pero no lleva su valor`);
  return valor === undefined || motivos.length > 0
    ? { ok: false, motivos: motivos.length > 0 ? motivos : ["La variación no siguió la forma de su parte"] }
    : { ok: true, valor: { parte, [parte]: valor } as VariacionPublicacion };
}

function validarEstiloGuard(valor: unknown, motivos: string[]): EstiloMensaje | undefined {
  const r = validarEstilo(valor);
  if (r.ok) return r.valor;
  motivos.push(...r.motivos);
  return undefined;
}

function validarPlantillaGuard(valor: unknown, motivos: string[]): PlantillaEditor | undefined {
  const r = validarPlantilla(valor);
  if (r.ok) return r.valor;
  motivos.push(...r.motivos);
  return undefined;
}

function validarDecoracionGuard(valor: unknown, motivos: string[]): DecoracionEditor | undefined {
  const r = validarDecoracion(valor);
  if (r.ok) return r.valor;
  motivos.push(...r.motivos);
  return undefined;
}

/** Crea el adaptador de una familia con el puerto del borrador inyectado. */
export function crearAdaptadorPublicaciones(
  familia: "post" | "mensaje", puerto: PuertoBorrador,
): AdaptadorFamilia<VariacionPublicacion> {
  return {
    familia,
    nombre: familia === "post" ? "Estilos del compositor de publicaciones" : "Estilos del editor de mensajes",
    capturar: (clave) => {
      const r = idDePublicacion(clave);
      if (!r) return null;
      const borrador = puerto.leer();
      const valor = r.parte === "estilo" ? borrador.estilo : r.parte === "plantilla" ? borrador.plantilla : borrador.decoracion;
      if (valor === undefined || valor === null) return null;
      const variacion: VariacionPublicacion = { parte: r.parte };
      if (r.parte === "estilo") variacion.estilo = valor as EstiloMensaje;
      else if (r.parte === "plantilla") variacion.plantilla = valor as PlantillaEditor;
      else variacion.decoracion = valor as DecoracionEditor;
      return variacion;
    },
    validar: (payload) => {
      const r = validarVariacionPublicacion(payload);
      return r.ok ? { ok: true, payload: r.valor } : { ok: false, motivos: r.motivos };
    },
    aplicar: (_clave, payload) => {
      const r = validarVariacionPublicacion(payload);
      if (!r.ok) throw new Error(`Variación del editor rechazada: ${r.motivos.join(" · ")}`);
      const anterior = parcheDe(r.valor.parte, puerto.leer()[r.valor.parte] ?? null);
      puerto.escribir(parcheDe(r.valor.parte, r.valor[r.valor.parte]));
      return { deshacer: () => puerto.escribir(anterior) };
    },
  };
}

/** Registra las familias «post» y «mensaje» en el registro del clic derecho. */
export function registrarAdaptadoresPublicaciones(puertos: { post: PuertoBorrador; mensaje: PuertoBorrador }): void {
  registrarFamilia(crearAdaptadorPublicaciones("post", puertos.post));
  registrarFamilia(crearAdaptadorPublicaciones("mensaje", puertos.mensaje));
}
