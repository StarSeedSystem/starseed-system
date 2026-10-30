/**
 * Avatares 3D · SINCRONÍA DEL ADN EN ESCENAS COMPARTIDAS (AV1011E).
 * Contrato: architecture/astraura-avatares-3d.md §3 y §6.
 *
 * El ADN de un avatar viaja por el MISMO canal de la escena (`escena3d:<id>`) como evento `adn`
 * con `{ref, rev, cambios}`: nada de tablas nuevas ni de sondeos. Quien entra lee el ADN de cada
 * presente UNA vez por sesión y revisión (caché por `ref+rev`); quien recibe un lote lo filtra con
 * `sanearCambio` y solo lo aplica si su revisión es más nueva. En XR, el nivel de avatar sale de la
 * calidad actual (`PERFILES`) y se dibuja con `adnParaCalidad`.
 *
 * PURO: sin red, sin disco, sin reloj. La lectura se inyecta.
 */
import { esRefInterna, sanearAdn, type AdnAvatar } from "@/lib/avatares/adn/adn";
import { aplicarCambios, claveCambio, sanearCambio, type CambioAvatar } from "@/lib/avatares/adn/cambios";
import { adnParaCalidad, type PresupuestoAvatar } from "@/lib/avatares/adn/calidad";
import { PERFILES, type AvatarCalidad } from "@/lib/xr/calidad-perfiles";
import type { NivelCalidad } from "@/lib/xr/tipos";

/** Nombre del evento en el canal de la escena. */
export const EVENTO_ADN = "adn" as const;
/** Tope de cambios por evento (el lote ya viene agrupado por clave). */
export const MAX_CAMBIOS_EVENTO = 64;
export interface EventoAdn {
  ref: string;
  rev: number;
  cambios: CambioAvatar[];
}

export type MotivoNoAplicado = "invalido" | "ref-distinta" | "revision-vieja";
export interface ResultadoEventoAdn {
  adn: AdnAvatar;
  aplicado: boolean;
  motivo: MotivoNoAplicado | null;
}

export interface CacheAdn {
  lecturas: Map<string, Promise<AdnAvatar | null>>;
}
export const crearCacheAdn = (): CacheAdn => ({ lecturas: new Map() });
export const claveAdn = (ref: string, rev: number): string => `${ref}@${Math.max(0, Math.floor(rev))}`;

export type CargarAdn = (ref: string, rev: number) => Promise<AdnAvatar | null>;
/** Lee un ADN UNA vez por sesión y revisión. Las llamadas simultáneas comparten la misma promesa. */
export function leerAdnUnaVez(cache: CacheAdn, ref: string, rev: number, cargar: CargarAdn): Promise<AdnAvatar | null> {
  if (!ref) return Promise.resolve(null);
  const r = Number.isFinite(rev) ? Math.max(0, Math.floor(rev)) : 0;
  const clave = claveAdn(ref, r);
  const ya = cache.lecturas.get(clave);
  if (ya) return ya;
  const lectura = (async () => {
    try {
      const crudo = await cargar(ref, r);
      return crudo ? sanearAdn(crudo) : null;
    } catch {
      return null;
    }
  })();
  cache.lecturas.set(clave, lectura);
  return lectura;
}

export interface AvatarConAdn {
  adnRef?: string;
  adnRev?: number;
}
/** Lee el ADN de cada presente (una vez por ref+rev). Devuelve un mapa `ref → ADN`. */
export async function leerAdnsDePresentes(cache: CacheAdn, avatares: readonly AvatarConAdn[], cargar: CargarAdn): Promise<Map<string, AdnAvatar>> {
  const out = new Map<string, AdnAvatar>();
  await Promise.all(avatares.map(async (a) => {
    const ref = a.adnRef;
    if (!ref) return;
    const adn = await leerAdnUnaVez(cache, ref, a.adnRev ?? 0, cargar);
    if (adn) out.set(ref, adn);
  }));
  return out;
}

/** Sanea un evento `adn` de fuera: ref interna, revisión entera y cambios válidos (agrupados por clave). */
export function sanearEventoAdn(v: unknown): EventoAdn | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  if (!esRefInterna(o.ref)) return null;
  if (typeof o.rev !== "number" || !Number.isFinite(o.rev) || o.rev < 0) return null;
  const porClave = new Map<string, CambioAvatar>();
  for (const crudo of (Array.isArray(o.cambios) ? o.cambios : []).slice(0, MAX_CAMBIOS_EVENTO)) {
    const c = sanearCambio(crudo);
    if (c) porClave.set(claveCambio(c), c);
  }
  if (porClave.size === 0) return null;
  return { ref: o.ref, rev: Math.floor(o.rev), cambios: [...porClave.values()] };
}

/** Lote de `lote()` → evento `adn` listo para el canal, o null si no queda ningún cambio válido. */
export function crearEventoAdn(ref: string, rev: number, cambios: readonly unknown[]): EventoAdn | null {
  return sanearEventoAdn({ ref, rev, cambios });
}

/** Aplica un evento recibido SOLO si es de este ADN y su revisión es más nueva. */
export function aplicarEventoAdn(adn: AdnAvatar, evento: unknown, refActual = `biblioteca:${adn.id}`): ResultadoEventoAdn {
  const ev = sanearEventoAdn(evento);
  if (!ev) return { adn, aplicado: false, motivo: "invalido" };
  if (ev.ref !== refActual) return { adn, aplicado: false, motivo: "ref-distinta" };
  if (ev.rev <= adn.rev) return { adn, aplicado: false, motivo: "revision-vieja" };
  const aplicado = aplicarCambios(adn, ev.cambios);
  const final = sanearAdn({ ...aplicado, rev: ev.rev });
  return final ? { adn: final, aplicado: true, motivo: null } : { adn, aplicado: false, motivo: "invalido" };
}

export interface AdnEnXr {
  adn: AdnAvatar;
  calidad: AvatarCalidad;
  presupuesto: PresupuestoAvatar;
}

/** El nivel de avatar de XR sale de la calidad actual; luego `adnParaCalidad` recorta el ADN. */
export function adnParaNivelXr(adn: AdnAvatar, nivel: NivelCalidad): AdnEnXr {
  const calidad = PERFILES[nivel].avatar;
  const { adn: recortado, presupuesto } = adnParaCalidad(adn, calidad);
  return { adn: recortado, calidad, presupuesto };
}
