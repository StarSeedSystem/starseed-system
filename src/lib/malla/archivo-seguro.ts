/**
 * archivo-seguro — arma el canal de un archivo: sellado de punta a punta + todas las vías permitidas (MPT1108B · 2026-11-08).
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * Enchufa lo que MPT1108A construyó como biblioteca (`canal-sellado`, `canal-multitrayecto-vias`) en el camino real del
 * archivo. Es la parte PURA: recibe las vías candidatas (ya filtradas por el planificador y por los ajustes del chat),
 * las capacidades del par y cómo resolver las claves, y devuelve el canal que se le da a `motor.enviarArchivo`:
 *
 *   vías (1)  ──►  canal tal cual            ┐
 *   vías (2+) ──►  canal-multitrayecto-vias  ┴─►  crearCanalSellado (si el par anuncia `archivo.e2e.v1`)
 *
 * Reglas:
 *   · Par con `archivo.e2e.v1` y claves del destinatario resueltas → sellado: la clave de contenido y el manifiesto solo
 *     viajan cifrados para cada neurona destinataria (una copia por destinatario).
 *   · Par antiguo, o sin ninguna clave resuelta → como hoy, marcado «sin cifrado de archivo», y SIN relés: un relé nunca
 *     lleva un archivo que no va sellado.
 *   · Relés (neuronas propias, servidor propio, relé de StarSeed): solo en modo «automático», con archivos de al menos
 *     `minBytesRele` (los pequeños van por las vías directas), con su ajuste encendido y con tope de bytes por vía. Los
 *     de terceros, solo con permiso expreso. Si lo único que llega es un relé y el archivo pasa el tope, no hay canal.
 * Sin DOM ni red propios. Nunca lanza.
 */

import type { CanalArchivos } from "@/lib/network/archivos-malla";
import { CAPACIDAD_CIFRADO_ARCHIVO, parCifraArchivo, type DestinatarioArchivo, type FirmarFn, type VerificarFn } from "@/lib/malla/cifrado-archivo";
import { crearCanalSellado, type AlmacenSellos, type CanalSellado } from "@/lib/malla/canal-sellado";
import { crearCanalMultiVias, type CanalMultiVias, type TipoVia, type ViaMulti } from "@/lib/malla/canal-multitrayecto-vias";
import type { AjustesViasArchivo } from "@/lib/malla/ajustes-vias-archivo";

export const CAPACIDAD_MULTITRAYECTO = "multitrayecto.v1";
/** Lo que cada neurona anuncia en su saludo / presencia de cuenta (en este orden: son las primeras de la lista). */
export const CAPACIDADES_ARCHIVO: readonly string[] = [CAPACIDAD_CIFRADO_ARCHIVO, CAPACIDAD_MULTITRAYECTO];

export function parMultitrayecto(caps: readonly string[] | null | undefined): boolean {
  return Array.isArray(caps) && caps.includes(CAPACIDAD_MULTITRAYECTO);
}

export { parCifraArchivo };

export interface ViaCandidata {
  id: string;
  tipo: TipoVia;
  canal: CanalArchivos;
  etiqueta?: string;
  capacidadKbps?: number | null;
  latenciaMs?: number | null;
  tercero?: boolean;
}

export interface EntradaArmado {
  vias: ViaCandidata[];
  bytes: number;
  /** ¿El par anuncia `archivo.e2e.v1`? */
  parCifra: boolean;
  /** Claves de los destinatarios (una copia por neurona). Sin ella no se sella. */
  destinatarios?: () => Promise<DestinatarioArchivo[]>;
  ajustes: AjustesViasArchivo;
  firmar?: FirmarFn | null;
  verificar?: VerificarFn | null;
  almacen?: AlmacenSellos;
  /** Para pruebas: reloj de las vías. */
  ahora?: () => number;
}

export interface Exclusion {
  id: string;
  motivo: string;
}

export interface Armado {
  /** El canal para el motor; null si no hay ninguna vía utilizable. */
  canal: CanalArchivos | null;
  sellado: CanalSellado | null;
  multi: CanalMultiVias | null;
  usadas: ViaCandidata[];
  excluidas: Exclusion[];
  /** «archivo» = cifrado de punta a punta; «sin-cifrado-de-archivo» = par antiguo o sin claves. */
  modo: "archivo" | "sin-cifrado-de-archivo";
  /** Neuronas con copia sellada. */
  copias: number;
  motivo?: string;
}

const esRele = (t: TipoVia): boolean => t === "rele-neurona" || t === "rele-propio" || t === "rele-starseed";

/** Decide qué vías entran. Pura y probada aparte. */
export function filtrarVias(vias: readonly ViaCandidata[], e: { bytes: number; sellable: boolean; ajustes: AjustesViasArchivo }): { usadas: ViaCandidata[]; excluidas: Exclusion[] } {
  const usadas: ViaCandidata[] = [];
  const excluidas: Exclusion[] = [];
  const a = e.ajustes;
  const hayDirecta = vias.some((v) => !esRele(v.tipo));
  const vistos = new Set<string>();
  for (const v of vias) {
    if (!v || vistos.has(v.id) || !v.canal) continue;
    vistos.add(v.id);
    if (esRele(v.tipo)) {
      const no = (motivo: string) => excluidas.push({ id: v.id, motivo });
      if (!e.sellable) no("el archivo no va cifrado de punta a punta (par antiguo): un relé no lo lleva");
      else if (a.modo === "directas") no("el ajuste solo usa vías directas");
      else if (v.tercero && !a.releTerceros) no("es un relé de un tercero y no está permitido");
      else if (v.tipo === "rele-neurona" && !a.releNeuronas) no("hacer de relé tus otras neuronas está apagado");
      else if ((v.tipo === "rele-propio" || v.tipo === "rele-starseed") && !a.releServidor) no("el relé del servidor está apagado");
      else if (a.maxBytesRele <= 0) no("el tope de bytes por relé es 0");
      else if (hayDirecta && e.bytes < a.minBytesRele) no("archivo pequeño: basta con las vías directas");
      else usadas.push(v);
    } else usadas.push(v);
  }
  return { usadas, excluidas };
}

/** Arma el canal del archivo. Nunca lanza. */
export async function armarCanalArchivo(e: EntradaArmado): Promise<Armado> {
  let destinatarios: DestinatarioArchivo[] = [];
  if (e.parCifra && e.destinatarios) {
    try {
      destinatarios = await e.destinatarios();
    } catch {
      destinatarios = [];
    }
  }
  const sellable = e.parCifra && destinatarios.length > 0;
  const { usadas, excluidas } = filtrarVias(e.vias, { bytes: e.bytes, sellable, ajustes: e.ajustes });
  const vacio = (motivo: string): Armado => ({ canal: null, sellado: null, multi: null, usadas: [], excluidas, modo: sellable ? "archivo" : "sin-cifrado-de-archivo", copias: 0, motivo });
  if (!usadas.length) return vacio("No hay ninguna vía permitida hacia ese aparato.");
  if (usadas.every((v) => esRele(v.tipo)) && e.bytes > e.ajustes.maxBytesRele) {
    const mb = Math.round(e.ajustes.maxBytesRele / (1024 * 1024));
    return vacio(`Solo llega por relé y el archivo supera el tope de ${mb} MiB por relé: espera a una vía directa.`);
  }

  let multi: CanalMultiVias | null = null;
  let base: CanalArchivos;
  if (usadas.length === 1) base = usadas[0].canal;
  else {
    const vm: ViaMulti[] = usadas.map((v) => ({
      id: v.id,
      tipo: v.tipo,
      canal: v.canal,
      ...(v.etiqueta ? { etiqueta: v.etiqueta } : {}),
      capacidadKbps: v.capacidadKbps ?? null,
      latenciaMs: v.latenciaMs ?? null,
      ...(v.tercero ? { tercero: true } : {}),
    }));
    multi = crearCanalMultiVias(vm, {
      permitirTerceros: e.ajustes.releTerceros,
      maxBytesRele: e.ajustes.maxBytesRele,
      ...(e.ahora ? { ahora: e.ahora } : {}),
    });
    base = multi;
  }

  if (!sellable) {
    // Par antiguo (o sin claves): EXACTAMENTE el camino de siempre —sin cola asíncrona, un envío fallido sigue devolviendo false—;
    // solo se le añade la marca para la interfaz.
    const marcado: CanalArchivos & { modoCifrado(id: string): "sin-cifrado-de-archivo" } = { ...base, modoCifrado: () => "sin-cifrado-de-archivo" };
    return { canal: marcado, sellado: null, multi, usadas, excluidas, modo: "sin-cifrado-de-archivo", copias: 0 };
  }
  const sellado = crearCanalSellado(base, {
    destinatarios: async () => destinatarios,
    parCifra: () => true,
    ...(e.firmar !== undefined ? { firmar: e.firmar } : {}),
    ...(e.verificar !== undefined ? { verificar: e.verificar } : {}),
    ...(e.almacen ? { almacen: e.almacen } : {}),
  });
  return { canal: sellado, sellado, multi, usadas, excluidas, modo: "archivo", copias: destinatarios.length };
}
