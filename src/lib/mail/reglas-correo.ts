export type AccionRegla =
  | "etiquetar"
  | "mover"
  | "destacar"
  | "esperar-respuesta"
  | "sugerir-borrador";

export interface CondicionesRegla {
  de?: string;
  dominio?: string;
  asuntoContiene?: string;
  tieneAdjunto?: boolean;
  etiqueta?: string;
  antiguedadHorasMin?: number;
}

export interface ReglaCorreo {
  id: string;
  texto: string;
  cuando: CondicionesRegla;
  hacer: AccionRegla;
  parametro?: string;
}

export interface HiloCorreoLite {
  id: string;
  remitente?: string | null;
  dominio?: string | null;
  asunto?: string | null;
  tieneAdjunto?: boolean;
  etiquetas?: string[];
  antiguedadHoras?: number;
}

export interface AccionPropuesta {
  reglaId: string;
  hacer: AccionRegla;
  parametro?: string;
}

const ACCIONES_PERMITIDAS: ReadonlySet<AccionRegla> = new Set([
  "etiquetar",
  "mover",
  "destacar",
  "esperar-respuesta",
  "sugerir-borrador",
]);

const MAX_TEXTO = 200;
const MAX_ID = 100;
const MAX_PARAM = 200;

function esTextoCorto(x: unknown, max: number): x is string {
  if (typeof x !== "string") return false;
  if (x.length === 0 || x.length > max) return false;
  return true;
}

function esTextoOpcionalCorto(x: unknown, max: number): x is string | undefined {
  if (x === undefined) return true;
  return esTextoCorto(x, max);
}

function esBooleanoOpcional(x: unknown): x is boolean | undefined {
  if (x === undefined) return true;
  return typeof x === "boolean";
}

function esNumeroOpcional(x: unknown): x is number | undefined {
  if (x === undefined) return true;
  if (typeof x !== "number") return false;
  if (!Number.isFinite(x) || x < 0) return false;
  return true;
}

function esArrayCadenaOpcionalCorto(x: unknown): x is string[] | undefined {
  if (x === undefined) return true;
  if (!Array.isArray(x)) return false;
  if (x.length === 0) return false;
  for (const e of x) {
    if (!esTextoCorto(e, MAX_TEXTO)) return false;
  }
  return true;
}

export function validarRegla(x: unknown): ReglaCorreo | null {
  if (!x || typeof x !== "object") return null;
  const o = x as Record<string, unknown>;
  const claves = Object.keys(o);
  const permitidas = new Set([
    "id",
    "texto",
    "cuando",
    "hacer",
    "parametro",
  ]);
  for (const k of claves) {
    if (!permitidas.has(k)) return null;
  }
  if (!esTextoCorto(o.id, MAX_ID)) return null;
  if (!esTextoCorto(o.texto, MAX_TEXTO)) return null;
  if (typeof o.hacer !== "string") return null;
  if (!ACCIONES_PERMITIDAS.has(o.hacer as AccionRegla)) return null;
  if (!o.cuando || typeof o.cuando !== "object") return null;
  const c = o.cuando as Record<string, unknown>;
  const clavesC = Object.keys(c);
  const permitidasC = new Set([
    "de",
    "dominio",
    "asuntoContiene",
    "tieneAdjunto",
    "etiqueta",
    "antiguedadHorasMin",
  ]);
  for (const k of clavesC) {
    if (!permitidasC.has(k)) return null;
  }
  if (!esTextoOpcionalCorto(c.de, MAX_TEXTO)) return null;
  if (!esTextoOpcionalCorto(c.dominio, MAX_TEXTO)) return null;
  if (!esTextoOpcionalCorto(c.asuntoContiene, MAX_TEXTO)) return null;
  if (!esTextoOpcionalCorto(c.etiqueta, MAX_TEXTO)) return null;
  if (!esBooleanoOpcional(c.tieneAdjunto)) return null;
  if (!esNumeroOpcional(c.antiguedadHorasMin)) return null;
  if (!esTextoOpcionalCorto(o.parametro, MAX_PARAM)) return null;

  const regla: ReglaCorreo = {
    id: o.id as string,
    texto: o.texto as string,
    cuando: {
      de: c.de as string | undefined,
      dominio: c.dominio as string | undefined,
      asuntoContiene: c.asuntoContiene as string | undefined,
      tieneAdjunto: c.tieneAdjunto as boolean | undefined,
      etiqueta: c.etiqueta as string | undefined,
      antiguedadHorasMin: c.antiguedadHorasMin as number | undefined,
    },
    hacer: o.hacer as AccionRegla,
    parametro: o.parametro as string | undefined,
  };
  return regla;
}

function normalizar(s: string): string {
  return s.toLowerCase();
}

function coincideHilo(regla: ReglaCorreo, hilo: HiloCorreoLite): boolean {
  const c = regla.cuando;
  if (c.de) {
    const d = hilo.remitente || "";
    if (normalizar(d).indexOf(normalizar(c.de)) === -1) return false;
  }
  if (c.dominio) {
    const dom = hilo.dominio || "";
    if (normalizar(dom).indexOf(normalizar(c.dominio)) === -1) return false;
  }
  if (c.asuntoContiene) {
    const as = hilo.asunto || "";
    if (normalizar(as).indexOf(normalizar(c.asuntoContiene)) === -1) return false;
  }
  if (typeof c.tieneAdjunto === "boolean") {
    if (!!hilo.tieneAdjunto !== c.tieneAdjunto) return false;
  }
  if (c.etiqueta) {
    const tags = hilo.etiquetas || [];
    const buscada = normalizar(c.etiqueta);
    let ok = false;
    for (const t of tags) {
      if (normalizar(t).indexOf(buscada) !== -1) {
        ok = true;
        break;
      }
    }
    if (!ok) return false;
  }
  if (typeof c.antiguedadHorasMin === "number") {
    const ah = typeof hilo.antiguedadHoras === "number" ? hilo.antiguedadHoras : 0;
    if (ah < c.antiguedadHorasMin) return false;
  }
  return true;
}

export function aplicarReglas(reglas: unknown[], hilo: HiloCorreoLite): AccionPropuesta[] {
  const propuestas: AccionPropuesta[] = [];
  const vistas = new Set<string>();
  for (const r of reglas) {
    const regla = validarRegla(r);
    if (!regla) continue;
    if (!coincideHilo(regla, hilo)) continue;
    const clave = regla.hacer + "|" + (regla.parametro || "");
    if (vistas.has(clave)) continue;
    vistas.add(clave);
    propuestas.push({
      reglaId: regla.id,
      hacer: regla.hacer,
      parametro: regla.parametro,
    });
  }
  return propuestas;
}
