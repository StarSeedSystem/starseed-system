/*
 * capas-nativas — qué capas de Astraura baja la app nativa a su disco (2026-10-10).
 * Contratos: architecture/capas-autoadaptables.md §4 y §6 + architecture/apps-nativas-segundo-plano.md §6.
 *
 * Puro. Reglas que no se saltan:
 *  · solo entradas `usable` (SHA-256 del catálogo + recomendado/respaldo) con medio «nativo»;
 *  · presupuesto = el que mide la app (15 % de libre + ocupado, tope 8 GB): nunca se adivina;
 *  · orden de papeles: reflejo → memoria → palabra → razón → voz (la «profunda» vive en servidores);
 *  · por papel, el mejor candidato que CABE; si no cabe ninguno, se dice cuánto falta.
 * La descarga real (curl reanudable + SHA) la hace Rust: `capas_descargar`.
 */

import { candidatosDe, usable, type Capa, type CatalogoCapas, type EntradaCapa } from "@/lib/astraura/capas/catalogo";
import type { EstadoCapasDisco, PeticionDescarga } from "./tipos";

export const ORDEN_PAPELES_NATIVOS: readonly Capa[] = ["reflejo", "memoria", "palabra", "razon", "voz"];

type EntradaConArchivo = EntradaCapa & { archivo?: string; tamano_bytes?: number };

const MB = 1024 * 1024;

/** Nombre local seguro (mismo criterio que `disco::nombre_seguro` en Rust). */
export function nombreLocal(archivo: string): string | null {
  const n = archivo.replace(/\//g, "__");
  return /^[A-Za-z0-9._-]{1,160}$/.test(n) && !n.startsWith(".") ? n : null;
}

/** URL directa del archivo en Hugging Face (`fuente_oficial` + `/resolve/main/` + archivo). */
export function urlDescarga(e: EntradaConArchivo): string | null {
  if (!e.archivo || !/^https:\/\/huggingface\.co\/[^/]+\/[^/]+$/.test(e.fuente_oficial)) return null;
  return `${e.fuente_oficial}/resolve/main/${e.archivo.split("/").map(encodeURIComponent).join("/")}`;
}

export function peticionDe(e: EntradaConArchivo): PeticionDescarga | null {
  const url = urlDescarga(e);
  const nombre = e.archivo ? nombreLocal(e.archivo) : null;
  if (!url || !nombre || !usable(e) || !e.tamano_bytes || e.tamano_bytes <= 0) return null;
  return { url, sha256: e.sha256, nombre, tamano_bytes: e.tamano_bytes };
}

export interface PlanDescarga {
  ok: boolean;
  motivo?: string;
  descargar: Array<PeticionDescarga & { id: string; capa: Capa }>;
  ya: Array<{ id: string; capa: Capa; nombre: string }>;
  saltadas: Array<{ capa: Capa; motivo: string }>;
  bytesNuevos: number;
  presupuestoBytes: number;
  restanteBytes: number;
}

export function planDescargaNativa(
  catalogo: CatalogoCapas,
  disco: EstadoCapasDisco | null | undefined,
  papeles: readonly Capa[] = ORDEN_PAPELES_NATIVOS,
): PlanDescarga {
  const vacio = { descargar: [], ya: [], saltadas: [], bytesNuevos: 0, presupuestoBytes: 0, restanteBytes: 0 };
  if (!disco || disco.presupuesto_bytes == null) {
    return { ok: false, motivo: "No se pudo medir el disco: no se baja nada a ciegas.", ...vacio };
  }
  const instaladas = new Set(disco.instaladas.map((c) => c.nombre));
  let restante = Math.max(0, disco.presupuesto_bytes - disco.ocupado_bytes);
  const plan: PlanDescarga = { ok: true, ...vacio, presupuestoBytes: disco.presupuesto_bytes, restanteBytes: restante };
  for (const capa of papeles) {
    const candidatos = candidatosDe(catalogo, capa, "nativo") as EntradaConArchivo[];
    const validos = candidatos.map((e) => ({ e, p: peticionDe(e) })).filter((x) => x.p !== null) as Array<{
      e: EntradaConArchivo;
      p: PeticionDescarga;
    }>;
    if (validos.length === 0) {
      plan.saltadas.push({ capa, motivo: "El catálogo no tiene para la app nativa ninguna capa con SHA-256 y archivo." });
      continue;
    }
    const puesta = validos.find((x) => instaladas.has(x.p.nombre));
    if (puesta) {
      plan.ya.push({ id: puesta.e.id, capa, nombre: puesta.p.nombre });
      continue;
    }
    const cabe = validos.find((x) => x.p.tamano_bytes <= restante);
    if (!cabe) {
      const menor = Math.min(...validos.map((x) => x.p.tamano_bytes));
      plan.saltadas.push({
        capa,
        motivo: `No cabe: la más ligera necesita ${Math.ceil(menor / MB)} MB y quedan ${Math.floor(restante / MB)} MB del 15 % del disco.`,
      });
      continue;
    }
    plan.descargar.push({ ...cabe.p, id: cabe.e.id, capa });
    plan.bytesNuevos += cabe.p.tamano_bytes;
    restante -= cabe.p.tamano_bytes;
  }
  plan.restanteBytes = restante;
  return plan;
}
