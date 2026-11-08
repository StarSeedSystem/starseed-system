/*
 * defectos-antenas-aplicar — lleva este aparato a los defectos de antenas de ahora (PER1108A, 2026-11-08).
 * Lógica de decisión: `lib/malla/defectos-antenas.ts` (pura). Aquí solo se lee la app, se aplica el plan y se
 * guarda la marca. Se inyecta todo para probarlo. Nunca lanza.
 */

import {
  CLAVE_DEFECTOS_ANTENAS,
  leerMarca,
  planDefectos,
  serializarMarca,
  type SituacionAntenas,
} from "@/lib/malla/defectos-antenas";
import { CLAVE_AJUSTE_WIFI } from "@/lib/malla/enlace-wifi-orquestacion";

export interface DepsDefectos {
  esNativa(): boolean;
  leerAlmacen(clave: string): string | null;
  escribirAlmacen(clave: string, valor: string): void;
  /** `ble_estado.activo` (null si no hay Bluetooth directo o no responde). */
  bluetoothActivo(): Promise<boolean | null>;
  /** Config de la app (`antenas_config`). */
  leerConfig(): Promise<{ faro_apagado?: boolean } | null>;
  /** Guarda la config ENTERA con un solo campo cambiado (`antenas_configurar`). */
  escribirConfig(c: { faro_apagado?: boolean }): Promise<boolean>;
}

export interface ResultadoDefectos {
  hecho: boolean;
  faroEncendido: boolean;
}

export async function aplicarDefectosAntenas(d: DepsDefectos): Promise<ResultadoDefectos> {
  const nada: ResultadoDefectos = { hecho: false, faroEncendido: false };
  try {
    if (!d.esNativa()) return nada;
    const marca = leerMarca(d.leerAlmacen(CLAVE_DEFECTOS_ANTENAS));
    const cfg = await d.leerConfig();
    const s: SituacionAntenas = {
      bluetoothActivo: await d.bluetoothActivo(),
      faroApagado: cfg ? cfg.faro_apagado === true : null,
      wifiGuardado: d.leerAlmacen(CLAVE_AJUSTE_WIFI),
    };
    const plan = planDefectos(marca, s);
    if (!plan.marca) return nada;
    let faroEncendido = false;
    if (plan.encenderFaro && cfg) {
      faroEncendido = await d.escribirConfig({ ...cfg, faro_apagado: false });
      // Si no se pudo escribir, no se marca: la próxima vez se reintenta.
      if (!faroEncendido) return nada;
    }
    d.escribirAlmacen(CLAVE_DEFECTOS_ANTENAS, serializarMarca(plan.marca));
    return { hecho: true, faroEncendido };
  } catch {
    return nada;
  }
}
