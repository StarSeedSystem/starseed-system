/**
 * Sincronía del ADN del avatar en escenas compartidas y XR (AV1011E).
 * Contrato: architecture/astraura-avatares-3d.md (§3 velocidades, §6 calidad, §12 referencias).
 *
 * El ADN elegido (ref `biblioteca:<id>`, §12) viaja en la PRESENCIA como `adnRef`+`adnRev`
 * (MetaAvatar): al entrar alguien, los presentes leen su ADN UNA vez por ref+rev (caché, nunca un
 * sondeo). Los lotes de `lote()` (§3, mismos presupuestos que las poses) viajan por el MISMO canal
 * de la escena como evento `adn` con `{ref, rev, cambios}`; quien recibe filtra con `sanearCambio`
 * y solo aplica revisión MÁS NUEVA. En XR el nivel de avatar sale de la calidad actual
 * (`PERFILES` de `src/lib/xr/`) y se dibuja con `adnParaCalidad` (§6). PURO: red, reloj y almacén
 * se inyectan.
 */
import { esRefInterna, sanearAdn, type AdnAvatar } from "@/lib/avatares/adn/adn";
import { aplicarCambios, crearColaEnvio, encolar, lote, sanearCambio, type CambioAvatar, type ColaEnvio } from "@/lib/avatares/adn/cambios";
import { adnParaCalidad } from "@/lib/avatares/adn/calidad";
import { PERFILES, type AvatarCalidad } from "@/lib/xr/calidad-perfiles";
import type { NivelCalidad } from "@/lib/xr/tipos";

/** Nombre del evento en el canal de la escena (`EventoEscena` de `src/lib/vivo/espacial/canal.ts`). */
export const EVENTO_ADN = "adn";

export interface EventoAdn { ref: string; rev: number; cambios: CambioAvatar[] }

/** Payload crudo del canal → evento válido (≥ 1 cambio bien formado) o `null`. */
export function sanearEventoAdn(v: unknown): EventoAdn | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  if (!esRefInterna(o.ref)) return null;
  const rev = typeof o.rev === "number" && Number.isFinite(o.rev) ? Math.floor(o.rev) : -1;
  if (rev < 0 || !Array.isArray(o.cambios) || o.cambios.length === 0) return null;
  const cambios = o.cambios.slice(0, 64).map(sanearCambio).filter((c): c is CambioAvatar => c !== null);
  return cambios.length > 0 ? { ref: o.ref, rev, cambios } : null;
}

export interface EstadoAdnRemoto { ref: string; rev: number; adn: AdnAvatar }

export const estadoDeAdn = (adn: AdnAvatar): EstadoAdnRemoto => ({ ref: `biblioteca:${adn.id}`, rev: adn.rev, adn });

/**
 * Aplica un lote recibido SOLO si su revisión es más nueva y trae algo que aplicar; los cambios
 * pasan otra vez por `sanearCambio`. Devuelve el estado nuevo o `null` si no se aplica (lote
 * viejo, repetido, de otro ADN o sin cambios válidos): el receptor se queda como estaba.
 */
export function aplicarEventoAdn(estado: EstadoAdnRemoto, crudo: unknown): { estado: EstadoAdnRemoto; aplicados: number } | null {
  const e = sanearEventoAdn(crudo);
  if (!e || e.ref !== estado.ref || e.rev <= estado.rev) return null;
  // El emisor ya aplicó estos cambios y su ADN quedó en `e.rev`: el receptor aterriza en esa misma revisión.
  const adn = sanearAdn({ ...aplicarCambios(estado.adn, e.cambios), rev: e.rev });
  if (!adn) return null;
  return { estado: { ref: estado.ref, rev: e.rev, adn }, aplicados: e.cambios.length };
}

export interface CacheAdn { leer(ref: string, rev: number): Promise<AdnAvatar | null>; tiene(ref: string, rev: number): boolean }

/**
 * Caché del ADN de los presentes: UNA lectura compartida por `ref|rev` (dos llamadas a la vez
 * comparten el mismo vuelo) y un tope por si alguien entra y sale. Lo que no trajo nada no se
 * cachea: se podrá reintentar cuando el ADN de verdad llegue al almacén local. Nunca sondea.
 */
export function crearCacheAdn(leerOriginal: (ref: string, rev: number) => Promise<AdnAvatar | null>, tope = 24): CacheAdn {
  const enVuelo = new Map<string, Promise<AdnAvatar | null>>();
  const leer1 = (ref: string, rev: number): Promise<AdnAvatar | null> => {
    const clave = `${ref}|${rev}`;
    const previa = enVuelo.get(clave);
    if (previa) return previa;
    const vuelo = leerOriginal(ref, rev).then(
      (a) => a,
      () => null, // la red o el almacén fallaron: no se cachea el fallo
    );
    vuelo.then((a) => {
      if (!a) enVuelo.delete(clave);
    });
    enVuelo.set(clave, vuelo);
    if (enVuelo.size > tope) { const vieja = enVuelo.keys().next(); if (!vieja.done) enVuelo.delete(vieja.value); }
    return vuelo;
  };
  return { leer: leer1, tiene: (ref, rev) => enVuelo.has(`${ref}|${rev}`) };
}

export interface EmisorAdn { encolar(c: CambioAvatar): void; bombear(): void; lotesEnviados(): number }

/**
 * Emisor de la edición en vivo: agrupa con la cola de `cambios.ts` y suelta con `lote()` (nada a
 * solas, ≤ 10 Hz). `bombear()` se llama en cada fotograma o tick; el evento lleva el ref y la
 * revisión VIVOS del ADN del dueño (`actual()`), que es la revisión en la que aterrizará el receptor.
 */
export function crearEmisorAdn(o: { enviar: (e: EventoAdn) => void; actual: () => { ref: string; rev: number } | null; otros: () => number; ahora: () => number }): EmisorAdn {
  const cola: ColaEnvio = crearColaEnvio();
  let total = 0;
  return {
    encolar(c) { encolar(cola, c); },
    bombear() {
      const a = o.actual();
      if (!a) return;
      const l = lote(cola, o.ahora(), o.otros());
      if (!l || l.length === 0) return;
      total += 1;
      try {
        o.enviar({ ref: a.ref, rev: a.rev, cambios: l });
      } catch {
        /* el canal decide; aquí no se reintenta */
      }
    },
    lotesEnviados: () => total,
  };
}

/** El nivel de avatar que toca para un nivel de calidad de XR (§6: vive en `PERFILES[nivel].avatar`). */
export const avatarDeNivelXR = (nivel: NivelCalidad): AvatarCalidad => PERFILES[nivel].avatar;

/** El ADN recortado para el nivel actual de XR: misma persona, se dibuja lo que el aparato aguanta (§6). */
export const adnParaXR = (adn: AdnAvatar, nivel: NivelCalidad) => adnParaCalidad(adn, PERFILES[nivel].avatar);
