/**
 * Avatares 3D · SINCRONÍA EN ESCENAS COMPARTIDAS Y XR (AV1011E). Contrato: architecture/astraura-avatares-3d.md §3, §6.
 *
 * Tres piezas, sin red propia (todo viaja por el MISMO canal de la escena, evento `adn`):
 *   · Receptor: al entrar alguien con `adnRef`/`adnRev` en su presencia, se lee su ADN UNA vez por
 *     ref+revisión y sesión (caché, también de los fallos: nada de reintentos en bucle). Los lotes en
 *     vivo `{ref, rev, cambios}` se filtran con `sanearCambio` y se aplican SOLO si la revisión es más
 *     nueva y la ref es la que esa persona anuncia (nadie cambia el avatar de otro).
 *   · Emisor: cada cambio se ve al instante en tu pantalla; a los demás les llega agrupado por `lote()`
 *     (≤ 10 Hz; 6,7 Hz con 4–7; 4 Hz con 8 o más) y NUNCA si no hay nadie mirando ni con la pestaña
 *     oculta. A quien entra se le manda lo que aún no está guardado (`diffAdn` contra lo guardado).
 *   · XR: el nivel de avatar sale de la calidad actual (`PERFILES[nivel].avatar`) y se dibuja con
 *     `adnParaCalidad`.
 *
 * El guardado (5 s de calma, como mucho uno cada 30 s: `debeGuardar`) es del editor; aquí no se guarda nada.
 * Quien guarde debe hacerlo con la revisión del emisor (`actual().rev`) y anunciarla en su presencia.
 * PURO: el reloj y la lectura del ADN se inyectan.
 */
import { esRefInterna, type AdnAvatar } from "@/lib/avatares/adn/adn";
import {
  aplicarCambio, crearColaEnvio, diffAdn, encolar, intervaloEnvioMs, lote, sanearCambio, type CambioAvatar,
} from "@/lib/avatares/adn/cambios";
import { adnParaCalidad, type PresupuestoAvatar } from "@/lib/avatares/adn/calidad";
import { PERFILES, type AvatarCalidad } from "@/lib/xr/calidad-perfiles";
import type { NivelCalidad } from "@/lib/xr/tipos";
import type { MetaAvatar } from "@/lib/vivo/espacial/avatares";
import type { ConexionEscena } from "@/lib/vivo/espacial/canal";

export const EVENTO_ADN = "adn" as const;
/** Un ADN completo cabe en ~80 cambios (`diffAdn`); más que esto en un lote no es una edición en vivo. */
export const MAX_CAMBIOS_POR_LOTE = 96;
/** Lotes que se guardan mientras llega el ADN de alguien (los más nuevos). */
export const MAX_LOTES_EN_ESPERA = 32;

export interface LoteAdn { ref: string; rev: number; cambios: CambioAvatar[] }

/** Lote que llega de fuera → lote válido o `null` (ref interna, revisión entera, cambios saneados). */
export function sanearLoteAdn(v: unknown): LoteAdn | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  if (!esRefInterna(o.ref) || typeof o.rev !== "number" || !Number.isFinite(o.rev) || o.rev < 0) return null;
  if (!Array.isArray(o.cambios) || o.cambios.length > MAX_CAMBIOS_POR_LOTE) return null;
  const cambios = o.cambios.map(sanearCambio).filter((c): c is CambioAvatar => c !== null);
  return cambios.length > 0 ? { ref: o.ref, rev: Math.floor(o.rev), cambios } : null;
}

/** Campos de presencia para anunciar tu ADN (se suman a la meta que ya publica la escena). */
export function presenciaConAdn<T extends Record<string, unknown>>(meta: T, ref: string | null, rev: number): T {
  if (!ref || !esRefInterna(ref)) return meta;
  return { ...meta, adnRef: ref, adnRev: Math.max(0, Math.floor(rev)) };
}

/** ¿Es este ADN el que nombra la ref? (`biblioteca:<id>` o `genesis:<id>`). */
export const adnEsDeRef = (adn: AdnAvatar, ref: string): boolean => ref.slice(ref.indexOf(":") + 1) === adn.id;

/* ── Receptor ─────────────────────────────────────────────────────────────── */

/** Lee un ADN guardado (Biblioteca). Debe devolver esa revisión o una más nueva, o `null` si no puede. */
export type LeerAdn = (ref: string, rev: number) => Promise<AdnAvatar | null>;

export interface AdnRemoto {
  estado: "cargando" | "listo" | "sin-adn";
  adn: AdnAvatar | null;
  /** Por qué no se ve su avatar (se enseña tal cual). */
  motivo?: string;
}

export const MOTIVO_SIN_ADN = "No se pudo leer su avatar 3D desde la Biblioteca: se ve su orbe.";

export interface ReceptorAdn {
  /** Presentes según la presencia (sin mí). Lee lo que falte y olvida a quien se fue. */
  presentes(avatares: readonly MetaAvatar[]): void;
  /** Evento `adn` de `de`. Devuelve `true` si cambió su avatar. */
  recibir(de: string, payload: unknown): boolean;
  de(clave: string): AdnRemoto | null;
  /** Lecturas hechas a la Biblioteca (diagnóstico y pruebas). */
  lecturas(): number;
  suscribir(cb: () => void): () => void;
  destruir(): void;
}

interface Remoto { ref: string; anunciada: number; adn: AdnAvatar | null; estado: AdnRemoto["estado"]; espera: LoteAdn[] }

export function crearReceptorAdn(leer: LeerAdn): ReceptorAdn {
  const remotos = new Map<string, Remoto>();
  const cache = new Map<string, Promise<AdnAvatar | null>>();
  const oyentes = new Set<() => void>();
  let total = 0;
  let vivo = true;
  const avisar = () => { for (const cb of Array.from(oyentes)) { try { cb(); } catch { /* un oyente roto no tumba a los demás */ } } };

  const leerUnaVez = (ref: string, rev: number): Promise<AdnAvatar | null> => {
    const k = `${ref}@${rev}`;
    let p = cache.get(k);
    if (!p) {
      total += 1;
      p = leer(ref, rev).then((a) => (a && adnEsDeRef(a, ref) ? a : null), () => null);
      cache.set(k, p);
    }
    return p;
  };

  const aplicarLote = (r: Remoto, l: LoteAdn): boolean => {
    if (!r.adn || l.rev <= r.adn.rev) return false;
    let n = r.adn;
    for (const c of l.cambios) n = aplicarCambio(n, c);
    r.adn = { ...n, rev: l.rev };
    return true;
  };

  const cargar = (clave: string, r: Remoto) => {
    const { ref, anunciada } = r;
    void leerUnaVez(ref, anunciada).then((adn) => {
      if (!vivo || remotos.get(clave) !== r || r.ref !== ref) return;
      if (adn && (!r.adn || adn.rev > r.adn.rev)) r.adn = adn;
      if (r.adn) {
        r.estado = "listo";
        for (const l of r.espera.sort((a, b) => a.rev - b.rev)) aplicarLote(r, l);
      } else if (r.anunciada === anunciada) r.estado = "sin-adn";
      r.espera = [];
      avisar();
    });
  };

  return {
    presentes(avatares) {
      if (!vivo) return;
      const vistos = new Set<string>();
      let cambio = false;
      for (const m of avatares) {
        if (!m.adnRef) continue;
        vistos.add(m.clave);
        const rev = m.adnRev ?? 0;
        let r = remotos.get(m.clave);
        if (!r || r.ref !== m.adnRef) {
          r = { ref: m.adnRef, anunciada: rev, adn: null, estado: "cargando", espera: [] };
          remotos.set(m.clave, r);
          cambio = true;
          cargar(m.clave, r);
        } else if (rev > r.anunciada && (!r.adn || rev > r.adn.rev)) {
          r.anunciada = rev;
          cargar(m.clave, r);
        }
      }
      for (const k of Array.from(remotos.keys())) if (!vistos.has(k)) { remotos.delete(k); cambio = true; }
      if (cambio) avisar();
    },
    recibir(de, payload) {
      const r = remotos.get(de);
      const l = sanearLoteAdn(payload);
      if (!vivo || !r || !l || l.ref !== r.ref) return false;
      if (!r.adn) {
        if (r.estado === "cargando") r.espera = [...r.espera, l].slice(-MAX_LOTES_EN_ESPERA);
        return false;
      }
      const ok = aplicarLote(r, l);
      if (ok) avisar();
      return ok;
    },
    de(clave) {
      const r = remotos.get(clave);
      if (!r) return null;
      return r.estado === "sin-adn" ? { estado: r.estado, adn: null, motivo: MOTIVO_SIN_ADN } : { estado: r.estado, adn: r.adn };
    },
    lecturas: () => total,
    suscribir(cb) { oyentes.add(cb); return () => { oyentes.delete(cb); }; },
    destruir() { vivo = false; remotos.clear(); oyentes.clear(); },
  };
}

/* ── Emisor ───────────────────────────────────────────────────────────────── */

export interface OpcionesEmisorAdn {
  enviar: (l: LoteAdn) => void;
  ahora?: () => number;
  programar?: (fn: () => void, ms: number) => unknown;
  cancelar?: (id: unknown) => void;
}

export interface EmisorAdn {
  /** Tu ADN guardado (al abrir el editor o tras guardar): base de lo que se manda a quien entra. */
  fijarGuardado(adn: AdnAvatar, ref: string): void;
  /** Aplica el cambio en tu pantalla al instante y lo encola para los demás. Devuelve el ADN nuevo. */
  cambiar(c: CambioAvatar): AdnAvatar | null;
  fijarOtros(n: number): void;
  pausar(): void;
  reanudar(): void;
  actual(): AdnAvatar | null;
  enviados(): number;
  destruir(): void;
}

export function crearEmisorAdn(o: OpcionesEmisorAdn): EmisorAdn {
  const ahora = o.ahora ?? (() => Date.now());
  const programar = o.programar ?? ((fn: () => void, ms: number) => setTimeout(fn, ms));
  const cancelar = o.cancelar ?? ((id: unknown) => clearTimeout(id as ReturnType<typeof setTimeout>));
  const cola = crearColaEnvio();
  let ref: string | null = null;
  let guardado: AdnAvatar | null = null;
  let actual: AdnAvatar | null = null;
  let otros = 0;
  let pausado = false;
  let vivo = true;
  let id: unknown = null;
  let total = 0;

  const limpiar = () => { if (id !== null) { cancelar(id); id = null; } };
  const intentar = () => {
    if (!vivo || pausado || !ref || !actual) return;
    const l = lote(cola, ahora(), otros);
    if (l) {
      limpiar();
      total += 1;
      try { o.enviar({ ref, rev: actual.rev, cambios: l.slice(0, MAX_CAMBIOS_POR_LOTE) }); } catch { /* el canal decide */ }
    } else if (cola.pendientes.size > 0 && id === null) {
      id = programar(() => { id = null; intentar(); }, Math.max(0, intervaloEnvioMs(otros) - (ahora() - cola.ultimoEnvio)));
    }
  };

  return {
    fijarGuardado(adn, r) {
      if (!esRefInterna(r)) return;
      if (r !== ref) { cola.pendientes.clear(); actual = adn; }
      else if (!actual || adn.rev >= actual.rev) actual = adn;
      ref = r;
      guardado = adn;
    },
    cambiar(c) {
      if (!actual) return null;
      const n = aplicarCambio(actual, c);
      if (n === actual) return actual;
      actual = n;
      encolar(cola, sanearCambio(c)!);
      intentar();
      return actual;
    },
    fijarOtros(n) {
      const antes = otros;
      otros = Math.max(0, Math.floor(n));
      if (otros === 0) { limpiar(); cola.pendientes.clear(); return; }
      // Alguien entró: leerá lo guardado; le falta lo que aún no se guardó.
      if (otros > antes && guardado && actual && actual.rev > guardado.rev) for (const c of diffAdn(guardado, actual)) encolar(cola, c);
      intentar();
    },
    pausar() { pausado = true; limpiar(); },
    reanudar() { pausado = false; intentar(); },
    actual: () => actual,
    enviados: () => total,
    destruir() { vivo = false; limpiar(); cola.pendientes.clear(); },
  };
}

/* ── Canal de la escena ───────────────────────────────────────────────────── */

/** Engancha receptor y emisor al canal de la escena (el mismo de las poses). Devuelve cómo soltarlo. */
export function conectarSincroniaAdn(
  canal: Pick<ConexionEscena, "enviar" | "onMensaje">, miClave: string, receptor: ReceptorAdn,
): { enviar: (l: LoteAdn) => void; soltar: () => void } {
  const soltar = canal.onMensaje((evento, p) => {
    if (evento !== EVENTO_ADN || !p || typeof p !== "object") return;
    const de = (p as Record<string, unknown>).de;
    if (typeof de === "string" && de && de !== miClave) receptor.recibir(de, p);
  });
  return { enviar: (l) => canal.enviar(EVENTO_ADN, { de: miClave, ref: l.ref, rev: l.rev, cambios: l.cambios }), soltar };
}

/* ── XR ───────────────────────────────────────────────────────────────────── */

/** Nivel de avatar que toca con la calidad XR actual. */
export const nivelAvatarXr = (nivel: NivelCalidad): AvatarCalidad => PERFILES[nivel].avatar;

/** Lo que se dibuja de un avatar en XR, o `null` si no hay ADN (se dibuja la orbe de color de siempre). */
export function adnParaXr(adn: AdnAvatar | null, nivel: NivelCalidad): { adn: AdnAvatar; presupuesto: PresupuestoAvatar; calidad: AvatarCalidad } | null {
  if (!adn) return null;
  const calidad = nivelAvatarXr(nivel);
  return { ...adnParaCalidad(adn, calidad), calidad };
}
