/**
 * vinculos-logic.ts — lógica PURA del panel de Vínculos (cierre de deuda:
 * "`genesis-client.ts` ya tiene el CRUD completo de vínculos y nunca se le
 * hizo pantalla").
 * ----------------------------------------------------------------------------
 * Mismo criterio que `genesis-logic.ts`/`herramientas-logic.ts`:
 * determinista, sin red ni DOM, para poder probarla sin montar React ni
 * simular un backend. `vinculos-panel.tsx` solo pinta lo que esto decide.
 *
 * `Vinculo`/`TipoVinculo` viven en el contrato (`genesis-types.ts`, bloque
 * "Linaje y vínculos") desde OLA 1 — este fichero no añade tipos nuevos al
 * contrato, solo el vocabulario y las transformaciones para enseñarlos y
 * crearlos.
 */
import type { SolicitudVinculo } from "@/lib/astraura/genesis-client";
import type { TipoVinculo, Vinculo } from "@/lib/astraura/genesis-types";

/* ══════════════════════════════ Tipo de vínculo ═══════════════════════════
 * Ocho tipos, tal y como los definió el contrato: mentor, aprendiz, pareja,
 * rival, aliado, delegación, supervisión, hermandad. `TIPOS_VINCULO` es la
 * ÚNICA lista de las ocho — el `<select>` del formulario y la validación
 * leen de aquí, nunca de una copia suelta.
 * ══════════════════════════════════════════════════════════════════════ */

export const TIPOS_VINCULO: readonly TipoVinculo[] = [
  "mentor", "aprendiz", "pareja", "rival", "aliado", "delegacion", "supervision", "hermandad",
] as const;

export const TIPO_VINCULO_LABEL: Record<TipoVinculo, string> = {
  mentor: "Mentor",
  aprendiz: "Aprendiz",
  pareja: "Pareja",
  rival: "Rival",
  aliado: "Aliado",
  delegacion: "Delegación",
  supervision: "Supervisión",
  hermandad: "Hermandad",
};

/** Una fuente que un backend futuro podría mandar sin que esta interfaz la conozca aún ⇒ se enseña el texto crudo, nunca se esconde. */
export function etiquetaTipoVinculo(tipo: string): string {
  return TIPO_VINCULO_LABEL[tipo as TipoVinculo] ?? tipo;
}

const TONO_VINCULO: Record<TipoVinculo, string> = {
  mentor: "border-cyan-400/30 bg-cyan-500/10 text-cyan-100",
  aprendiz: "border-sky-400/30 bg-sky-500/10 text-sky-100",
  pareja: "border-pink-400/30 bg-pink-500/10 text-pink-100",
  rival: "border-rose-400/40 bg-rose-500/15 text-rose-100",
  aliado: "border-emerald-400/30 bg-emerald-500/10 text-emerald-100",
  delegacion: "border-amber-400/30 bg-amber-500/10 text-amber-100",
  supervision: "border-indigo-400/30 bg-indigo-500/10 text-indigo-100",
  hermandad: "border-fuchsia-400/30 bg-fuchsia-500/10 text-fuchsia-100",
};

/** Tono neutro para un tipo que esta interfaz no reconoce todavía — nunca revienta, nunca se inventa un color con significado. */
export function tonoTipoVinculo(tipo: string): string {
  return TONO_VINCULO[tipo as TipoVinculo] ?? "border-white/15 bg-white/[0.04] text-white/70";
}

/* ══════════════════════════════ Fuerza (0–1) ══════════════════════════════ */

/** `fuerza` es 0–1 en el contrato; la interfaz la enseña como porcentaje. Fuera de rango o no-numérica ⇒ se recorta, nunca revienta el redondeo. */
export function fuerzaPct(fuerza: number): number {
  const n = Number.isFinite(fuerza) ? fuerza : 0;
  return Math.round(Math.max(0, Math.min(1, n)) * 100);
}

/* ══════════════════════════════ Saneado de la lista ════════════════════════
 * Un backend viejo o a medias puede mandar `fuerza` fuera de 0–1,
 * `bidireccional` ambiguo o `motivo` vacío-mismo-que-ausente: esto le da
 * SIEMPRE una forma completa a la que pintar.
 * ══════════════════════════════════════════════════════════════════════ */

/** Un `Vinculo` con cada campo saneado — nunca cambia `id`/`origenId`/`destinoId`/`tipo`/`creadoEn`, que son lo que el backend dice que es. */
export function vinculoSeguro(v: Vinculo): Vinculo {
  const fuerza = Number.isFinite(v.fuerza) ? Math.max(0, Math.min(1, v.fuerza)) : 0;
  const motivo = typeof v.motivo === "string" && v.motivo.trim() ? v.motivo.trim() : null;
  return { ...v, fuerza, bidireccional: v.bidireccional === true, motivo };
}

/** Forma inesperada (backend viejo/roto) ⇒ lista vacía, nunca revienta un `.map()`. Cada entrada real pasa por `vinculoSeguro`. */
export function vinculosSeguros(lista: readonly Vinculo[] | null | undefined): Vinculo[] {
  return Array.isArray(lista) ? lista.map(vinculoSeguro) : [];
}

/** Más recientes primero — nunca muta la lista de entrada. `creadoEn` ausente/no-numérico se trata como el más antiguo posible, nunca revienta la comparación. */
export function ordenarVinculosPorFecha(lista: readonly Vinculo[]): Vinculo[] {
  return [...lista].sort((a, b) => (Number(b.creadoEn) || 0) - (Number(a.creadoEn) || 0));
}

/** Los vínculos donde este ser participa, en cualquiera de los dos extremos. */
export function vinculosDeSer(lista: readonly Vinculo[], serId: string): Vinculo[] {
  return lista.filter((v) => v.origenId === serId || v.destinoId === serId);
}

export interface ResumenVinculos {
  total: number;
  bidireccionales: number;
}

export function resumirVinculos(lista: readonly Vinculo[] | null | undefined): ResumenVinculos {
  const seguros = vinculosSeguros(lista);
  return { total: seguros.length, bidireccionales: seguros.filter((v) => v.bidireccional).length };
}

/**
 * Frase honesta de una fila, lista para `aria-label`/lectura: "Ada → Boro ·
 * Mentor · fuerza 70% · para enseñarle astrofísica". Los nombres ya
 * resueltos llegan de fuera (`nombrePorId`, de `../genesis-logic`): esta
 * función no conoce la lista de seres, solo compone la frase.
 */
export function describirVinculo(v: Pick<Vinculo, "tipo" | "fuerza" | "bidireccional" | "motivo">, origenNombre: string, destinoNombre: string): string {
  const flecha = v.bidireccional ? "↔" : "→";
  const base = `${origenNombre} ${flecha} ${destinoNombre} · ${etiquetaTipoVinculo(v.tipo)} · fuerza ${fuerzaPct(v.fuerza)}%`;
  const motivo = typeof v.motivo === "string" ? v.motivo.trim() : "";
  return motivo ? `${base} · ${motivo}` : base;
}

/* ══════════════════════════ Crear un vínculo (formulario) ══════════════════ */

/** Forma controlada del formulario de creación — todo texto/booleano simple, sin `null` a mitad de edición. */
export interface FormularioVinculo {
  origenId: string;
  destinoId: string;
  tipo: string;
  fuerza: number;
  bidireccional: boolean;
  motivo: string;
}

export const FORMULARIO_VINCULO_VACIO: FormularioVinculo = {
  origenId: "",
  destinoId: "",
  tipo: "",
  fuerza: 0.5,
  bidireccional: false,
  motivo: "",
};

/**
 * Valida ANTES de llamar al backend — mismo criterio que
 * `validarSolicitudGenesis` en `genesis-logic.ts`: un mensaje humano o
 * `null` si está todo bien. Nunca deja crear un vínculo de un ser consigo
 * mismo, ni con un tipo fuera de las ocho del contrato.
 */
export function validarFormularioVinculo(f: FormularioVinculo): string | null {
  if (!f.origenId.trim()) return "Elige quién origina el vínculo.";
  if (!f.destinoId.trim()) return "Elige a quién se dirige el vínculo.";
  if (f.origenId === f.destinoId) return "Un ser no puede tener un vínculo consigo mismo.";
  if (!TIPOS_VINCULO.includes(f.tipo as TipoVinculo)) return "Elige un tipo de vínculo de la lista.";
  if (!Number.isFinite(f.fuerza) || f.fuerza < 0 || f.fuerza > 1) return "La fuerza debe estar entre 0 y 1.";
  return null;
}

/** El formulario, ya válido, traducido al cuerpo que pide `createGenesisVinculo`. Llamar solo tras `validarFormularioVinculo(f) === null`. */
export function solicitudDesdeFormulario(f: FormularioVinculo): SolicitudVinculo {
  return {
    origenId: f.origenId,
    destinoId: f.destinoId,
    tipo: f.tipo as TipoVinculo,
    fuerza: Math.max(0, Math.min(1, f.fuerza)),
    bidireccional: f.bidireccional,
    motivo: f.motivo.trim() || null,
  };
}
