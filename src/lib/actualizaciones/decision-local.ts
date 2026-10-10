/**
 * Decisión en ESTA neurona: ¿la capa se aplica sola ahora o se avisa? (contrato §4 + §5).
 * ══════════════════════════════════════════════════════════════════════════════════════
 * Une la política guardada del sistema (por defecto la del OS: interfaz automática, que es lo
 * que ya hacía `RegisterSW`), la neurona elegida para «automática solo en esta neurona» y el
 * momento medido (llamada, directo, escritura, batería, Wi-Fi). La usa `RegisterSW` antes de
 * recargar por una versión nueva de la interfaz.
 *
 * SSR-safe, sin `node:*`. Nunca lanza: ante cualquier fallo devuelve «avisar» (nunca recarga
 * por sorpresa).
 */

import { idSistema, leerNeuronaElegida, leerPoliticaSistema } from "./almacen-politicas";
import type { CapaActualizacion } from "./manifiesto";
import { medirMomento } from "./momento-navegador";
import { puedeAplicarAhora } from "./momento";
import { decidirPolitica, type Decision, type TipoEntidad } from "./politica";

async function idEstaNeurona(): Promise<string | null> {
  try {
    const { thisDeviceId, resolverAliasEsteMedio } = await import("@/lib/neurons/neurons");
    return resolverAliasEsteMedio() || thisDeviceId() || null;
  } catch {
    return null;
  }
}

export interface DecisionLocal {
  decision: Decision;
  texto: string;
}

/** Qué hacer AHORA en este medio con una capa pendiente de un sistema. */
export async function decidirCapaLocal(
  capa: CapaActualizacion,
  opciones: { tipo?: TipoEntidad; id?: string | null; tamanoBytes?: number } = {},
): Promise<DecisionLocal> {
  try {
    const tipo = opciones.tipo ?? "os";
    const politica = leerPoliticaSistema(idSistema(tipo, opciones.id), tipo);
    const elegida = leerNeuronaElegida();
    const yo = elegida ? await idEstaNeurona() : null;
    const d = decidirPolitica(politica[capa], { ahoraH: new Date().getHours(), esNeuronaElegida: !!elegida && elegida === yo });
    if (d === "avisar") return { decision: "avisar", texto: "Tu política para esta capa es avisar antes de aplicar." };
    if (d === "esperar") return { decision: "esperar", texto: "Fuera de la ventana programada: se aplicará dentro de ella." };
    const m = await medirMomento();
    const r = puedeAplicarAhora(m, opciones.tamanoBytes ?? 0, capa);
    return r.ok ? { decision: "aplicar", texto: "Buen momento: se aplica." } : { decision: "esperar", texto: r.texto };
  } catch {
    return { decision: "avisar", texto: "No se pudo decidir: se avisa en vez de aplicar." };
  }
}
