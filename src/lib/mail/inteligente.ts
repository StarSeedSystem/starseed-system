/**
 * Correos inteligentes (INV1025I): reglas como DATOS.
 * Módulo puro: reloj inyectado, sin red, sin disco y sin efectos. Nada envía.
 */

export type TipoRegla = "etiquetar" | "mover" | "destacar" | "esperar-respuesta" | "sugerir-borrador";

export const TIPOS_VALIDOS: readonly TipoRegla[] = ["etiquetar", "mover", "destacar", "esperar-respuesta", "sugerir-borrador"];

export interface CuandoRegla {
  de?: string; dominio?: string; asuntoContiene?: string;
  tieneAdjunto?: boolean; etiqueta?: string; antiguedadHorasMin?: number;
}

export interface Regla { id?: string; tipo: TipoRegla; cuando: CuandoRegla; parametro?: string; texto?: string }

export interface Correo {
  id: string; remitente: string; fecha: string; asunto?: string;
  etiqueta?: string; tieneAdjunto?: boolean; dominio?: string;
}

export interface AccionPropuesta { reglaId: string; tipo: TipoRegla; parametro?: string }

const CLAVES_REGLA = new Set(["id", "tipo", "cuando", "parametro", "texto"]);
const CLAVES_CUANDO = new Set(["de", "dominio", "asuntoContiene", "tieneAdjunto", "etiqueta", "antiguedadHorasMin"]);

function esObjeto(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function textoOk(v: unknown, max: number): boolean {
  return typeof v === "string" && v.trim().length > 0 && v.length <= max;
}

function enMinusculas(v: string | undefined): string {
  return (v ?? "").trim().toLowerCase();
}

export function R(tipo: TipoRegla, cuando: CuandoRegla = {}, parametro?: string, id?: string): Regla {
  return { tipo, cuando, parametro, id };
}

export function R0(tipo: TipoRegla): Regla {
  return { tipo, cuando: {} };
}

export function M(correos: Correo[]): Correo[] {
  return correos;
}

/** Rechaza acciones fuera de la lista, campos extra, textos largos y condiciones inválidas. */
export function validarRegla(x: unknown): boolean {
  if (!esObjeto(x)) return false;
  if (!Object.keys(x).every((k) => CLAVES_REGLA.has(k))) return false;
  if (!TIPOS_VALIDOS.includes(x.tipo as TipoRegla)) return false;
  if (x.id !== undefined && !textoOk(x.id, 80)) return false;
  if (x.texto !== undefined && (typeof x.texto !== "string" || x.texto.length > 200)) return false;
  if (x.parametro !== undefined && (typeof x.parametro !== "string" || x.parametro.length > 100)) return false;
  if (!esObjeto(x.cuando) || !Object.keys(x.cuando).every((k) => CLAVES_CUANDO.has(k))) return false;
  const c = x.cuando;
  for (const k of ["de", "dominio", "asuntoContiene", "etiqueta"] as const) {
    if (c[k] !== undefined && !textoOk(c[k], 160)) return false;
  }
  if (c.tieneAdjunto !== undefined && typeof c.tieneAdjunto !== "boolean") return false;
  const horas = c.antiguedadHorasMin;
  if (horas !== undefined && (typeof horas !== "number" || !Number.isFinite(horas) || horas < 0)) return false;
  return true;
}

function coincide(c: CuandoRegla, correo: Correo, ahoraMs: number): boolean {
  const remitente = enMinusculas(correo.remitente);
  if (c.de !== undefined && remitente !== enMinusculas(c.de)) return false;
  const dominio = enMinusculas(correo.dominio ?? (remitente.includes("@") ? remitente.split("@").pop() : ""));
  if (c.dominio !== undefined && dominio !== enMinusculas(c.dominio)) return false;
  if (c.asuntoContiene !== undefined && !enMinusculas(correo.asunto).includes(enMinusculas(c.asuntoContiene))) return false;
  if (c.etiqueta !== undefined && enMinusculas(correo.etiqueta) !== enMinusculas(c.etiqueta)) return false;
  if (c.tieneAdjunto !== undefined && Boolean(correo.tieneAdjunto) !== c.tieneAdjunto) return false;
  if (c.antiguedadHorasMin !== undefined) {
    const hora = Date.parse(correo.fecha);
    if (!Number.isFinite(hora) || (ahoraMs - hora) / 36e5 < c.antiguedadHorasMin) return false;
  }
  return true;
}

/** Acciones PROPUESTAS, en orden, sin repetir acción+parámetro y descartando reglas inválidas. */
export function aplicarReglas(
  reglas: readonly unknown[],
  correo: Correo,
  ahora: Date | number = new Date(),
): AccionPropuesta[] {
  if (!Array.isArray(reglas) || !correo) return [];
  const ahoraMs = typeof ahora === "number" ? ahora : ahora.getTime();
  const vistas = new Set<string>();
  const salida: AccionPropuesta[] = [];
  for (const r of reglas) {
    if (!validarRegla(r)) continue;
    const regla = r as Regla;
    if (!coincide(regla.cuando, correo, ahoraMs)) continue;
    const clave = `${regla.tipo}|${regla.parametro ?? ""}`;
    if (vistas.has(clave)) continue;
    vistas.add(clave);
    salida.push({
      reglaId: regla.id ?? `r${salida.length + 1}`,
      tipo: regla.tipo,
      ...(regla.parametro !== undefined ? { parametro: regla.parametro } : {}),
    });
  }
  return salida;
}
