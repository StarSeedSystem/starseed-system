/* ═══════════════════════════════════════════════════════════════════════════
   StarSeed OS · Reglas de correo inteligente — módulo puro (INV1025I)
   Patrón Inbox Zero (AGPL con términos adicionales): datos, no código copiado.
   Una regla = DATO {id, texto, cuando, hacer, parametro?}; nunca envía ni borra.
   ═══════════════════════════════════════════════════════════════════════════ */

const ACCIONES_VALIDAS: AccionRegla[] = [
  "etiquetar",
  "mover",
  "destacar",
  "esperar-respuesta",
  "sugerir-borrador",
];

const MAX_LONGITUD_TEXTO = 500;

export type AccionRegla =
  | "etiquetar"
  | "mover"
  | "destacar"
  | "esperar-respuesta"
  | "sugerir-borrador";

export interface CondicionRegla {
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
  cuando: CondicionRegla;
  hacer: AccionRegla;
  parametro?: string;
}

/* Esqueleto: exportaciones y firmas. Se completa en ediciones sucesivas. */

export function validarRegla(x: unknown): ReglaCorreo | null {
  if (typeof x !== "object" || x === null) return null;
  const obj = x as Record<string, unknown>;

  const id = typeof obj.id === "string" ? obj.id.trim() : "";
  if (!id) return null;

  const texto = typeof obj.texto === "string" ? obj.texto.trim() : "";
  if (!texto || texto.length > MAX_LONGITUD_TEXTO) return null;

  const hacerRaw = obj.hacer;
  if (typeof hacerRaw !== "string" || !ACCIONES_VALIDAS.includes(hacerRaw as AccionRegla)) return null;
  const hacer = hacerRaw as AccionRegla;

  const cuando = obj.cuando;
  if (typeof cuando !== "object" || cuando === null) return null;
  const cond = cuando as Record<string, unknown>;
  const cuandoNormalizado: CondicionRegla = {};
  if (cond.de !== undefined) {
    if (typeof cond.de !== "string") return null;
    cuandoNormalizado.de = cond.de.trim();
  }
  if (cond.dominio !== undefined) {
    if (typeof cond.dominio !== "string") return null;
    cuandoNormalizado.dominio = cond.dominio.trim();
  }
  if (cond.asuntoContiene !== undefined) {
    if (typeof cond.asuntoContiene !== "string") return null;
    cuandoNormalizado.asuntoContiene = cond.asuntoContiene.trim();
  }
  if (cond.tieneAdjunto !== undefined) {
    if (typeof cond.tieneAdjunto !== "boolean") return null;
    cuandoNormalizado.tieneAdjunto = cond.tieneAdjunto;
  }
  if (cond.etiqueta !== undefined) {
    if (typeof cond.etiqueta !== "string") return null;
    cuandoNormalizado.etiqueta = cond.etiqueta.trim();
  }
  if (cond.antiguedadHorasMin !== undefined) {
    if (typeof cond.antiguedadHorasMin !== "number") return null;
    cuandoNormalizado.antiguedadHorasMin = cond.antiguedadHorasMin;
  }

  // Rechaza campos extra en la raíz (que no sean los definidos en ReglaCorreo)
  const clavesPermitidas = new Set([
    "id", "texto", "cuando", "hacer", "parametro",
  ]);
  for (const clave of Object.keys(obj)) {
    if (!clavesPermitidas.has(clave)) return null;
  }

  // Rechaza campos extra dentro de `cuando`
  const clavesCuandoPermitidas = new Set([
    "de", "dominio", "asuntoContiene", "tieneAdjunto", "etiqueta", "antiguedadHorasMin",
  ]);
  for (const clave of Object.keys(cond)) {
    if (!clavesCuandoPermitidas.has(clave)) return null;
  }

  const parametro =
    obj.parametro !== undefined
      ? typeof obj.parametro === "string" ? obj.parametro.trim() : null
      : undefined;
  if (obj.parametro !== undefined && parametro === null) return null;

  const regla: ReglaCorreo = {
    id,
    texto,
    cuando: cuandoNormalizado,
    hacer,
    parametro: parametro ?? undefined,
  };
  return regla;
}

export interface HiloParaReglas {
  asunto?: string;
  de?: string;
  dominioRemitente?: string;
  tieneAdjunto?: boolean;
  etiquetas?: string[];
  creadoEn?: string | Date;
}

export function aplicarReglas(
  reglas: ReglaCorreo[],
  hilo: unknown,
): { accion: AccionRegla; parametro?: string; reglaId: string }[] {
  const datos = hilo as Record<string, unknown> | null;
  const asunto = typeof datos?.asunto === "string" ? datos.asunto : (typeof datos?.subject === "string" ? datos.subject : "");
  const de = typeof datos?.de === "string" ? datos.de : (typeof datos?.sender === "string" ? datos.sender : (typeof datos?.from === "string" ? datos.from : ""));
  const dominioRemitente = typeof datos?.dominioRemitente === "string" ? datos.dominioRemitente : "";
  const tieneAdjunto = datos?.tieneAdjunto === true || (Array.isArray(datos?.attachments) && datos.attachments.length > 0);
  const etiquetas = Array.isArray(datos?.etiquetas)
    ? datos.etiquetas.filter((e: unknown) => typeof e === "string")
    : (Array.isArray(datos?.tags) ? datos.tags.filter((e: unknown) => typeof e === "string") : []);
  const creadoEnRaw = datos?.creadoEn ?? datos?.createdAt ?? datos?.created_at;
  const creadoEn = creadoEnRaw instanceof Date ? creadoEnRaw : new Date(creadoEnRaw ? String(creadoEnRaw) : "1970-01-01");

  const resultados: { accion: AccionRegla; parametro?: string; reglaId: string }[] = [];
  const vistos = new Set<string>();

  for (const regla of reglas) {
    if (vistos.has(regla.id)) continue;
    const c = regla.cuando;
    let coincide = true;

    if (c.de !== undefined) {
      const valor = de.toLowerCase();
      coincide = coincide && valor.includes(c.de.toLowerCase());
    }
    if (coincide && c.dominio !== undefined) {
      coincide = coincide && dominioRemitente.toLowerCase().includes(c.dominio.toLowerCase());
    }
    if (coincide && c.asuntoContiene !== undefined) {
      coincide = coincide && asunto.toLowerCase().includes(c.asuntoContiene.toLowerCase());
    }
    if (coincide && c.tieneAdjunto !== undefined) {
      coincide = coincide && (tieneAdjunto === c.tieneAdjunto);
    }
    if (coincide && c.etiqueta !== undefined) {
      coincide = coincide && etiquetas.some((e) => e.toLowerCase() === c.etiqueta!.toLowerCase());
    }
    if (coincide && c.antiguedadHorasMin !== undefined) {
      const horas = (Date.now() - creadoEn.getTime()) / (1000 * 60 * 60);
      coincide = coincide && horas >= c.antiguedadHorasMin;
    }

    if (coincide) {
      resultados.push({ accion: regla.hacer, parametro: regla.parametro, reglaId: regla.id });
      vistos.add(regla.id);
    }
  }
  return resultados;
}
