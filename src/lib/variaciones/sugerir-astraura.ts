// src/lib/variaciones/sugerir-astraura.ts
// Sugerencias de Astraura para las variaciones públicas (architecture/variaciones-publicas.md §4).
// Escalera de `genesis-conectores-abiertos.md` §2: los motores llegan en orden local primero y el
// módulo pide a cada uno por orden, relevando al siguiente ante un fallo (429/402, indisponibilidad,
// lista vacía) sin insistir. Toda candidata pasa `validar.ts` (tamaño, JSON plano, privacidad, https)
// y las pruebas del ADN del contexto (memory/diseno/adn/<slug>/dna.json, dado por quien llama).
// Sin sugerencia no hay rojo: si no pudo nadie, no se ofrece nada.

import { leerClave, type ClaveElemento } from "./clave-elemento";
import { validarVariacion } from "./validar";

export const CUANTAS_SUGERIDAS = 3;

/** Prueba del ADN tal como vive en dna.json: binaria; `auto` = que un script la puede decidir. */
export interface PruebaAdn { id: string; comprobacion: string; auto: boolean }

/** Lo que se lee de dna.json; el resto del fichero no toca aquí. */
export interface AdnContexto {
  slug: string;
  paleta?: Array<{ rol: string; hex: string; nombre?: string }>;
  prohibiciones?: string[];
  pruebas?: PruebaAdn[];
}

export interface VariacionCandidata { titulo: string; payload: unknown; etiquetas?: string[] }
export interface PedidoVariaciones { clave: ClaveElemento; familia: string; contexto: unknown; cuantas: number }

/** Un peldaño de la escalera: `astraura-158-local` es el 1; las nubes caen detrás. */
export interface MotorAstraura {
  id: string;
  peldano: number;
  generarVariaciones(pedido: PedidoVariaciones): Promise<VariacionCandidata[]>;
}

/** Una sugerencia ya validada, lista para «Probar» o «Publicar mi variación». */
export interface Sugerida { titulo: string; payload: unknown; etiquetas?: string[]; motor: string; motivo: string }

export type ResultadoSugerencias =
  | { ok: true; variaciones: Sugerida[]; motor: string; desechadas: number }
  | { ok: false; motivo: string; desechadas: number };

export interface DepsSugerir {
  motores: MotorAstraura[];
  adn?: AdnContexto;
  probarAdn?: (payload: unknown, adn: AdnContexto) => string[];
  /** La familia declara que su variación es código (p. ej. `atomo:`, `herramienta:`): solo aislada. */
  codigo?: boolean;
}

const MAXIMO_HEX_SUELTOS = 4;
const PROFUNDIDAD_ADN = 12;
const PATRON_HEX = /^(?:#[0-9a-f]{3}|#[0-9a-f]{6}[0-9a-f]{2})$/i;

/** Prueba general del ADN: «nada de hexadecimales sueltos» (memory/diseno/identidades.md): marca cada
 *  color `#…` que no esté en la paleta del ADN; vacío = pasa. Sin paleta no puede juzgar y no molesta. */
export function pruebasAdnGeneral(payload: unknown, adn: AdnContexto): string[] {
  const paleta = new Set((adn.paleta ?? []).map((color) => color.hex.toLowerCase()).filter((hex) => PATRON_HEX.test(hex)));
  const sueltos: string[] = [];
  const recorrer = (valor: unknown, fondo: number, vistos: Set<object>): void => {
    if (sueltos.length >= MAXIMO_HEX_SUELTOS || fondo > PROFUNDIDAD_ADN || valor === null) return;
    if (typeof valor === "string") {
      if (paleta.size > 0 && PATRON_HEX.test(valor) && !paleta.has(valor.toLowerCase()))
        sueltos.push(`Adn: «${valor}» hex suelto fuera de la paleta del ADN; usa tokens o la paleta del contexto`);
      return;
    }
    if (typeof valor !== "object" || vistos.has(valor)) return;
    vistos.add(valor);
    for (const cuerpo of Array.isArray(valor) ? valor : Object.values(valor as Record<string, unknown>)) recorrer(cuerpo, fondo + 1, vistos);
    vistos.delete(valor);
  };
  recorrer(payload, 0, new Set<object>());
  return sueltos;
}

/** Pide variaciones a la escalera de Astraura (local primero) y devuelve solo las que pasan
 *  `validar.ts` y las pruebas del ADN del contexto. Nunca lanza. */
export async function sugerirVariaciones(clave: string, contexto: unknown, deps: DepsSugerir): Promise<ResultadoSugerencias> {
  const claveValida = leerClave(clave);
  if (!claveValida) return { ok: false, motivo: `Clave: «${clave}» no es una clave de elemento válida`, desechadas: 0 };
  const escalera = [...deps.motores].sort((a, b) => a.peldano - b.peldano);
  if (escalera.length === 0) return { ok: false, motivo: "Astraura: la escalera no trae motores", desechadas: 0 };
  const familia = claveValida.split(":")[0];
  const adn = deps.adn;
  let desechadas = 0;
  let ultimoFallo = "sin probar nada";
  const probar = (p: unknown): string[] =>
    deps.probarAdn && adn ? deps.probarAdn(p, adn) : (adn ? pruebasAdnGeneral(p, adn) : []);
  for (const motor of escalera) {
    let candidatas: VariacionCandidata[];
    try {
      candidatas =
        (await Promise.resolve(motor.generarVariaciones({ clave: claveValida, familia, contexto, cuantas: CUANTAS_SUGERIDAS }))) ?? [];
    } catch {
      ultimoFallo = `${motor.id} (peldaño ${motor.peldano}) falló sin explicar`;
      continue;
    }
    const pasadas: Sugerida[] = [];
    for (const candidata of candidatas.slice(0, CUANTAS_SUGERIDAS)) {
      const titulo = typeof candidata?.titulo === "string" ? candidata.titulo.trim() : "";
      if (!titulo) { desechadas += 1; ultimoFallo = `${motor.id}: candidata sin título`; continue; }
      if (!validarVariacion(candidata.payload, { codigo: deps.codigo === true }).ok) {
        desechadas += 1; ultimoFallo = `${motor.id}: «${titulo}» no pasa la validación de variaciones`; continue;
      }
      const faltas = probar(candidata.payload);
      if (faltas.length) { desechadas += 1; ultimoFallo = `${motor.id}: «${titulo}» falla el ADN (${faltas[0]})`; continue; }
      pasadas.push({
        titulo, payload: candidata.payload, etiquetas: candidata.etiquetas, motor: motor.id,
        motivo: `Astraura (${motor.id}, peldaño ${motor.peldano}): pasa la validación${adn ? ` y las pruebas del ADN «${adn.slug}»` : ""}`,
      });
    }
    if (pasadas.length > 0) return { ok: true, variaciones: pasadas, motor: motor.id, desechadas };
  }
  return { ok: false, motivo: `Astraura: ninguna sugerencia disponible (último fallo: ${ultimoFallo})`, desechadas };
}
