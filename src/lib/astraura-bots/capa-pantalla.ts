/**
 * Bots/dots de Astraura · CAPAS DEL BOT SOBRE LA PANTALLA (BOT1011V). Contrato: architecture/astraura-bots.md
 * §6.1 (`capa-pantalla`, riesgo bajo, se deshace retirándola) y §12.
 *
 * Un bot señala la pantalla con cuatro formas: resaltar un elemento, dejar una nota, apuntar con una flecha o
 * poner un widget `UiSpec`. El widget es un DATO validado con `validarUiSpec`: nada de código ni HTML. Llega
 * aquí DESPUÉS de `validarAccion` + `decidirAccion` y del bucle; esto solo normaliza y apila. PURO: sin
 * React, sin red, sin DOM, sin reloj (el orden lo da la posición en la lista; el id lo pone quien llama).
 */
import { pareceCodigo, validarUiSpec, type UiSpec } from "@/lib/nucleo/ui-spec";
import { tieneSecreto } from "./acciones";

export const FORMAS_CAPA = ["resaltar", "nota", "flecha", "widget"] as const;
export type FormaCapa = (typeof FORMAS_CAPA)[number];

/** Texto de una capa: una frase corta, no un documento. */
export const MAX_TEXTO_CAPA = 280;
/** Capas de UN bot a la vez; la que hace nueve retira la más vieja de ese bot. */
export const MAX_CAPAS_POR_BOT = 8;

export interface CapaNormalizada {
  forma: FormaCapa;
  /** Id del elemento del OS al que se ancla (resaltar y flecha lo exigen). */
  objetivo?: string;
  texto?: string;
  /** Solo en `widget`: la copia DEPURADA que devuelve `validarUiSpec`. */
  uiSpec?: UiSpec;
}

/** Capa ya pintada: quién la puso y con qué id se retira (`previo.idEnviado` del deshacer). */
export interface CapaActiva extends CapaNormalizada {
  id: string;
  botId: string;
  nombreBot: string;
}

const PATRON_ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,119}$/;
const esForma = (v: unknown): v is FormaCapa => typeof v === "string" && (FORMAS_CAPA as readonly string[]).includes(v);

/** Valida el texto: corto, sin código y sin nada con forma de clave o ruta del disco. */
function revisarTexto(v: unknown, problemas: string[]): string | undefined {
  if (v === undefined) return undefined;
  if (typeof v !== "string" || !v.trim()) { problemas.push("El texto debe ser una frase no vacía."); return undefined; }
  const t = v.trim();
  if (t.length > MAX_TEXTO_CAPA) problemas.push(`El texto supera ${MAX_TEXTO_CAPA} caracteres.`);
  else if (pareceCodigo(t)) problemas.push("El texto parece código: una capa solo lleva palabras.");
  else if (tieneSecreto(t)) problemas.push("El texto lleva algo con forma de clave o de ruta del disco.");
  else return t;
  return undefined;
}

/**
 * Normaliza los argumentos de una acción `capa-pantalla`. Desconfía de todo, nunca lanza y no inventa:
 * o devuelve la capa limpia o la lista de problemas. Los campos que no son de la capa no pasan.
 */
export function normalizarCapa(args: unknown): CapaNormalizada | { problemas: string[] } {
  if (typeof args !== "object" || args === null) return { problemas: ["La capa no es un objeto."] };
  const a = args as Record<string, unknown>;
  const problemas: string[] = [];
  // Sin `String(a.forma)`: con un objeto sin prototipo lanzaría, y una cadena enorme no se repite entera.
  const dicho = typeof a.forma === "string" ? a.forma.slice(0, 40) : typeof a.forma;
  if (!esForma(a.forma)) return { problemas: [`Forma desconocida: ${dicho} (resaltar, nota, flecha o widget).`] };
  const forma = a.forma;

  let objetivo: string | undefined;
  if (a.objetivo !== undefined) {
    if (typeof a.objetivo === "string" && PATRON_ID.test(a.objetivo)) objetivo = a.objetivo;
    else problemas.push("El objetivo no es un identificador de elemento válido.");
  } else if (forma === "resaltar" || forma === "flecha") {
    problemas.push(`«${forma}» necesita un objetivo en la pantalla.`);
  }

  const texto = revisarTexto(a.texto, problemas);
  if (forma === "nota" && a.texto === undefined) problemas.push("Una nota necesita texto.");

  let uiSpec: UiSpec | undefined;
  if (forma === "widget") {
    if (a.uiSpec === undefined) problemas.push("Un widget necesita su UiSpec.");
    else {
      const r = validarUiSpec(a.uiSpec);
      if (r.spec) uiSpec = r.spec;
      else problemas.push(`UiSpec inválida: ${r.problemas.join(" ") || "sin motivo"}`);
    }
  } else if (a.uiSpec !== undefined) {
    problemas.push("La UiSpec solo cabe en la forma «widget».");
  }

  if (problemas.length) return { problemas };
  const capa: CapaNormalizada = { forma };
  if (objetivo) capa.objetivo = objetivo;
  if (texto) capa.texto = texto;
  if (uiSpec) capa.uiSpec = uiSpec;
  return capa;
}

export const esCapaValida = (r: CapaNormalizada | { problemas: string[] }): r is CapaNormalizada => !("problemas" in r);

/**
 * Añade una capa. Mismo id → la sustituye en su sitio. Si su bot ya tiene `MAX_CAPAS_POR_BOT`, se retira
 * la más vieja DE ESE BOT (la primera de la lista); las capas de los demás bots no se tocan. Inmutable.
 */
export function apilar(capas: readonly CapaActiva[], nueva: CapaActiva): CapaActiva[] {
  if (capas.some((c) => c.id === nueva.id)) return capas.map((c) => (c.id === nueva.id ? nueva : c));
  let sobran = capas.filter((c) => c.botId === nueva.botId).length + 1 - MAX_CAPAS_POR_BOT;
  const quedan = capas.filter((c) => {
    if (sobran > 0 && c.botId === nueva.botId) { sobran -= 1; return false; }
    return true;
  });
  return [...quedan, nueva];
}

/** Retira una capa por su id (el «Quitar» de la persona o el deshacer `{retirar: id}`). */
export const retirar = (capas: readonly CapaActiva[], id: string): CapaActiva[] => capas.filter((c) => c.id !== id);

/** Retira todas las capas de un bot (al pausarlo o cerrarlo: nada suyo queda en pantalla). */
export const retirarDeBot = (capas: readonly CapaActiva[], botId: string): CapaActiva[] =>
  capas.filter((c) => c.botId !== botId);
