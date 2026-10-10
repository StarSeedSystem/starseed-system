/**
 * DECISIÓN: ¿esta mejora se aplica sola ahora, se avisa o se pospone? (contrato §4)
 * ════════════════════════════════════════════════════════════════════════════════
 * No inventa otra política: usa la de las actualizaciones por capas (`decidirPolitica`), el
 * momento seguro (`puedeAplicarAhora`: llamada, directo, escritura, batería < 20 %, descarga
 * grande sin Wi-Fi) y la máquina de la canaria. Encima añade lo propio de las mejoras: los
 * ajustes de la neurona por familia, «instalar sistemas nuevos» (apagado por defecto), las
 * licencias condicionadas, la huella sha256 obligatoria de los pesos y que la familia no esté
 * en uso (no se cambia el oído en mitad de un dictado). El primer «no» gana, en este orden.
 *
 * Puro: sin React, sin red, sin `node:*`. Nunca lanza.
 */

import { puedeAplicarAhora, type ContextoMomento, type MotivoEspera } from "@/lib/actualizaciones/momento";
import type { EstadoDespliegue } from "@/lib/actualizaciones/planificador";
import { decidirPolitica, type PoliticaSistema } from "@/lib/actualizaciones/politica";
import type { Hallazgo } from "./hallazgos";
import { CATALOGO_CAPAS, type CapaCatalogo } from "./registro";
import { FAMILIAS, NOMBRE_FAMILIA, type FamiliaSistema } from "./tipos";

export type AjusteFamilia = "auto" | "avisar" | "nunca";

export interface AjustesMejoras {
  /** Por familia: «auto» sigue la política de la entidad; «avisar» nunca aplica solo; «nunca» ni avisa. */
  familias: Record<FamiliaSistema, AjusteFamilia>;
  /** Instalar sistemas que la neurona aún no tiene (no solo actualizar los que usa). */
  instalarNuevos: boolean;
}

export const AJUSTES_POR_DEFECTO: AjustesMejoras = {
  familias: { "voz-tts": "auto", "voz-asr": "auto", sonido: "auto", audiovisual: "auto", codigo: "auto" },
  instalarNuevos: false,
};

const AJUSTES_VALIDOS: readonly AjusteFamilia[] = ["auto", "avisar", "nunca"];

/** Sanea los ajustes guardados: lo que falte o venga mal queda en el valor por defecto. */
export function sanearAjustes(x: unknown): AjustesMejoras {
  const src = x && typeof x === "object" ? (x as Record<string, unknown>) : {};
  const fam = src.familias && typeof src.familias === "object" ? (src.familias as Record<string, unknown>) : {};
  const familias = { ...AJUSTES_POR_DEFECTO.familias };
  for (const f of FAMILIAS) if (AJUSTES_VALIDOS.includes(fam[f] as AjusteFamilia)) familias[f] = fam[f] as AjusteFamilia;
  return { familias, instalarNuevos: src.instalarNuevos === true };
}

export interface ContextoMejora {
  /** Política de la entidad por capa (`politicaPorDefecto("os")` si no hay otra guardada). */
  politica: PoliticaSistema;
  /** Hora local de la neurona (0-23). */
  ahoraH: number;
  /** Esta neurona es la elegida para «automática solo en esta neurona». */
  esNeuronaElegida: boolean;
  momento: ContextoMomento;
  /** Familias que se están usando ahora mismo en la neurona (dictado, voz hablando, generación…). */
  enUso: readonly FamiliaSistema[];
  /** Estado del despliegue de ESTA versión en la cuenta y si esta neurona es la canaria. */
  despliegue?: { estado: EstadoDespliegue; esCanaria: boolean };
  /** Para pruebas: catálogo de capas a usar. */
  catalogo?: Map<string, CapaCatalogo>;
}

export type MotivoMejora =
  | "al-dia"
  | "sin-dato"
  | "con-el-os"
  | "no-cabe"
  | "desactivada"
  | "ajuste-avisar"
  | "nuevo-sin-permiso"
  | "licencia"
  | "sin-huella"
  | "esperando-canaria"
  | "retirada"
  | "politica-avisar"
  | "ventana"
  | "en-uso"
  | MotivoEspera
  | "listo";

export type AccionMejora = "aplicar" | "avisar" | "posponer" | "nada";

export interface DecisionMejora {
  accion: AccionMejora;
  motivo: MotivoMejora;
  texto: string;
}

const d = (accion: AccionMejora, motivo: MotivoMejora, texto: string): DecisionMejora => ({ accion, motivo, texto });

/** ¿Los pesos tienen huella sha256 que permita verificar la descarga? (regla §6 de las capas). */
export function tieneHuellaVerificable(h: Hallazgo, catalogo: Map<string, CapaCatalogo> = CATALOGO_CAPAS): boolean {
  if (h.sistema.fuente.tipo === "catalogo-capas") return !!catalogo.get(h.sistema.fuente.ref)?.sha256;
  return h.verificable;
}

/** Bytes aproximados de la descarga (para la regla de Wi-Fi). */
function bytesDe(h: Hallazgo): number {
  return (h.sistema.requisitos.discoMb ?? 0) * 1024 * 1024;
}

/** Qué hacer con un hallazgo en esta neurona. */
export function decidirMejora(h: Hallazgo, ajustes: AjustesMejoras, ctx: ContextoMejora): DecisionMejora {
  try {
    const s = h.sistema;
    const nombre = s.nombre;
    if (h.estado === "al-dia") return d("nada", "al-dia", `${nombre} está al día.`);
    if (h.estado === "sin-dato") return d("nada", "sin-dato", h.errorFuente ? `Sin dato de versión: ${h.errorFuente}` : "Sin dato suficiente para decidir.");
    if (h.estado === "con-el-os") return d("nada", "con-el-os", "Llega con la próxima versión del OS (MetaGenesis › Publicación), no por neurona.");
    if (h.estado === "no-cabe") {
      const falta = h.encaje.carencias[0]?.texto ?? "No cabe en este aparato.";
      const donde = h.alternativa ? ` Cabe en ${h.alternativa.nombre ?? h.alternativa.neuronaId}.` : "";
      return d("nada", "no-cabe", `${falta}${donde}`);
    }

    const ajuste = ajustes.familias[s.familia] ?? "auto";
    if (ajuste === "nunca") return d("nada", "desactivada", `${NOMBRE_FAMILIA[s.familia]}: desactivado en los ajustes de esta neurona.`);
    if (ajuste === "avisar") return d("avisar", "ajuste-avisar", `${NOMBRE_FAMILIA[s.familia]}: esta neurona pide aviso antes de aplicar.`);
    if (h.estado === "instalable-nuevo" && !ajustes.instalarNuevos)
      return d("avisar", "nuevo-sin-permiso", `${nombre} mejoraría ${NOMBRE_FAMILIA[s.familia].toLowerCase()} aquí; instalar sistemas nuevos está apagado en los ajustes.`);
    if (s.requiereAceptarLicencia) return d("avisar", "licencia", `${nombre} tiene acceso condicionado: hay que aceptar sus términos antes.`);
    if (s.capa === "modelos" && !tieneHuellaVerificable(h, ctx.catalogo))
      return d("avisar", "sin-huella", "La fuente no da la huella sha256 de los pesos: sin ella no se instala solo.");

    const dep = ctx.despliegue;
    if (dep && (dep.estado === "revirtiendo" || dep.estado === "revertido"))
      return d("nada", "retirada", "Esta versión falló en la neurona canaria y se retiró.");
    if (dep && !dep.esCanaria && (dep.estado === "pendiente" || dep.estado === "canaria"))
      return d("posponer", "esperando-canaria", "Esperando a que la neurona canaria la pruebe.");

    const capa = s.capa;
    const pol = decidirPolitica(ctx.politica[capa], { ahoraH: ctx.ahoraH, esNeuronaElegida: ctx.esNeuronaElegida || !!dep?.esCanaria });
    if (pol === "avisar") return d("avisar", "politica-avisar", "La política de esta capa es avisar antes de aplicar.");
    if (pol === "esperar") return d("posponer", "ventana", "Fuera de la ventana programada: se aplicará dentro de ella.");

    if (ctx.enUso.includes(s.familia)) return d("posponer", "en-uso", `${NOMBRE_FAMILIA[s.familia]} está en uso: se aplica al terminar.`);
    const m = puedeAplicarAhora(ctx.momento, bytesDe(h), capa);
    if (!m.ok) return d("posponer", m.motivo, m.texto);
    return d("aplicar", "listo", h.estado === "nueva-version" ? `Buen momento: ${nombre} ${h.instalada ?? ""} → ${h.disponible ?? ""}.` : `Buen momento: se instala ${nombre}.`);
  } catch {
    return d("avisar", "sin-dato", "No se pudo decidir: se avisa en vez de aplicar.");
  }
}
