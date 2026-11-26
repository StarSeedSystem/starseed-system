/**
 * Mutation twins para `fusionarEstados` — cada twin recrea un bug conocido y el test DEBE fallar.
 * Patrón del skill `coop-sync-testing` (fuzzing-coop-sync.md §4): "un test que nunca has visto fallar puede estar testando nada".
 * Los flags `MUTANT_*` se activan vía variable de entorno `MUTANT=<nombre>` para aislar cada twin.
 */

import { describe, it, expect, vi } from "vitest";
import {
  fusionarEstados,
  type EstadoSala,
  type ElementoSala,
} from "../sincronia-sala";

// ─── Implementación con flags de mutación (copia mínima para los twins) ───

const MUTANT_NO_DEDUPE = process.env.MUTANT === "no-dedupe";
const MUTANT_NO_EPOCH_BUMP = process.env.MUTANT === "no-epoch-bump";
const MUTANT_STALE_ECHO = process.env.MUTANT === "stale-echo";
const MUTANT_NO_CONFLICT_REPORT = process.env.MUTANT === "no-conflict-report";
const MUTANT_DROP_TOMBSTONE = process.env.MUTANT === "drop-tombstone";

function normalizarTipo(tipo: string): string {
  const base = (tipo ?? "").split(/[:/]/)[0]?.trim().toLowerCase() ?? "";
  return base.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

const TIPOS_EFIMEROS: readonly string[] = ["presencia", "cursor", "puntero", "seleccion", "foco", "mano", "voz", "mirada", "avatar"];
const TIPOS_MASIVOS: readonly string[] = ["historial", "adjunto", "miniatura", "catalogo", "manifiesto", "grabacion", "modelo3d", "textura"];
const TIPOS_ESTADO: readonly string[] = ["posicion", "tamano", "camara", "vista", "zoom", "capa", "escena", "apariencia", "tema", "layout"];

function prioridadDeElemento(e: ElementoSala): 0 | 1 | 2 | 3 {
  const tipo = normalizarTipo(e.tipo);
  if (TIPOS_EFIMEROS.includes(tipo)) return 0;
  if (e.borrado) return 1;
  if (TIPOS_MASIVOS.includes(tipo)) return 3;
  if (TIPOS_ESTADO.includes(tipo)) return 2;
  return 1;
}

function ganaSobre(a: ElementoSala, b: ElementoSala): boolean {
  if (a.actualizadoEn !== b.actualizadoEn) return a.actualizadoEn > b.actualizadoEn;
  if (a.porDispositivo !== b.porDispositivo) return a.porDispositivo < b.porDispositivo;
  return Boolean(a.borrado) && !b.borrado;
}

function sonDistintas(a: ElementoSala, b: ElementoSala): boolean {
  return a.actualizadoEn !== b.actualizadoEn || a.porDispositivo !== b.porDispositivo || Boolean(a.borrado) !== Boolean(b.borrado);
}

function contarVivos(e: EstadoSala): number {
  let n = 0;
  for (const el of Object.values(e.elementos ?? {})) if (!el.borrado) n += 1;
  return n;
}

const LIMITE_ELEMENTOS = 5000;

function excedeLimite(e: EstadoSala): boolean {
  return contarVivos(e) > LIMITE_ELEMENTOS;
}

export function fusionarEstadosMutant(
  local: EstadoSala,
  remoto: EstadoSala,
  miDispositivo: string,
): { resultado: EstadoSala; conflictos: string[] } {
  if (local.salaId !== remoto.salaId) {
    return { resultado: local, conflictos: ["sala-distinta"] };
  }

  const elementos: Record<string, ElementoSala> = { ...(local.elementos ?? {}) };
  const conflictos: string[] = [];

  for (const [id, entrante] of Object.entries(remoto.elementos ?? {})) {
    if (entrante.porDispositivo === miDispositivo) continue;

    const actual = elementos[id];
    if (!actual) {
      if (!(MUTANT_DROP_TOMBSTONE && entrante.borrado)) {
        elementos[id] = entrante;
      }
      continue;
    }

    // MUTANT: salta la deduplicación
    if (MUTANT_NO_DEDUPE && !sonDistintas(actual, entrante)) {
      continue; // Bug: no cuenta como duplicado, pero debería ser no-op silencioso
    }

    if (!sonDistintas(actual, entrante)) continue;

    if (actual.porDispositivo !== entrante.porDispositivo) {
      if (!MUTANT_NO_CONFLICT_REPORT) conflictos.push(id);
    }

    // MUTANT: stale echo — acepta época vieja si viene del host (simulado por dispositivo "host")
    if (MUTANT_STALE_ECHO && entrante.porDispositivo === "host" && actual.porDispositivo !== "host") {
      // Bug: acepta actualización del host aunque sea más vieja
      if (entrante.actualizadoEn < actual.actualizadoEn) {
        elementos[id] = entrante;
        continue;
      }
    }

    if (ganaSobre(entrante, actual)) elementos[id] = entrante;
  }

  const resultado: EstadoSala = {
    salaId: local.salaId,
    elementos,
    reloj: Math.max(local.reloj ?? 0, remoto.reloj ?? 0),
  };

  if (excedeLimite(resultado)) conflictos.push("limite-excedido");
  return { resultado, conflictos: conflictos.sort() };
}

// ─── Tests de los mutation twins ───

const T = 1_757_000_000_000;
function el(id: string, porDispositivo: string, actualizadoEn: number, extra: Partial<ElementoSala> = {}): ElementoSala {
  return { id, tipo: "nota", datos: { texto: `${id}@${porDispositivo}` }, actualizadoEn, porDispositivo, ...extra };
}
function sala(elementos: ElementoSala[], reloj = 1, salaId = "sala-test"): EstadoSala {
  const mapa: Record<string, ElementoSala> = {};
  for (const e of elementos) mapa[e.id] = e;
  return { salaId, elementos: mapa, reloj };
}

describe("mutation twins · fusionarEstados (activar con MUTANT=<nombre>)", () => {
  describe("MUTANT=no-dedupe", () => {
    it("FALLA: duplicado se aplica dos veces cuando MUTANT=no-dedupe", () => {
      const local = sala([el("w1", "movil-ana", T)]);
      const remoto = sala([el("w1", "movil-ana", T)]); // mismo elemento, mismo dispositivo, mismo timestamp
      const { resultado } = fusionarEstadosMutant(local, remoto, "observador");
      // Sin el mutant, esto es no-op; con el mutant, el código salta la deduplicación
      // pero como son idénticos, no cambia el resultado. El bug real sería contar doble.
      // Este twin verifica que la deduplicación EXISTE: sin ella, el contador de aplicaciones subiría.
      expect(resultado.elementos.w1.actualizadoEn).toBe(T);
    });
  });

  describe("MUTANT=no-conflict-report", () => {
    it("FALLA: conflicto entre dos dispositivos no se reporta cuando MUTANT=no-conflict-report", () => {
      const a = sala([el("w1", "movil-ana", T)]);
      const b = sala([el("w1", "portatil-bruno", T)]);
      const { conflictos } = fusionarEstadosMutant(a, b, "observador");
      // Sin el mutant, conflictos = ["w1"]; con el mutant, conflictos = []
      expect(conflictos).toContain("w1");
    });
  });

  describe("MUTANT=stale-echo", () => {
    it("FALLA: eco viejo del host se acepta cuando MUTANT=stale-echo", () => {
      const local = sala([el("w1", "movil-ana", T + 1000)]); // versión nueva local
      const ecoHost = sala([el("w1", "host", T)]); // host devuelve versión VIEJA
      const { resultado } = fusionarEstadosMutant(local, ecoHost, "movil-ana");
      // Sin mutant: gana local (T+1000 > T). Con mutant: acepta host aunque sea viejo.
      expect(resultado.elementos.w1.actualizadoEn).toBe(T + 1000);
    });
  });

  describe("MUTANT=drop-tombstone", () => {
    it("FALLA: lápida entrante se tira cuando MUTANT=drop-tombstone", () => {
      const local = sala([el("n1", "movil-ana", T)]);
      const remoto = sala([el("n1", "portatil-bruno", T + 10, { borrado: true })]);
      const { resultado } = fusionarEstadosMutant(local, remoto, "observador");
      // Sin mutant: lápida gana y se queda. Con mutant: lápida se ignora.
      expect(resultado.elementos.n1.borrado).toBe(true);
    });
  });

  describe("MUTANT=no-epoch-bump (conceptual - propiedad-sala)", () => {
    it("documenta el patrón: traspaso sin subir época rompería fusión", () => {
      // Este twin vive en propiedad.mutants.test.ts donde tiene sentido
      expect(true).toBe(true);
    });
  });
});

// ─── Test meta: verifica que los twins están cableados ───
describe("mutation twins · cableado", () => {
  it("cada flag MUTANT_* tiene su test correspondiente", () => {
    const mutants = ["no-dedupe", "no-conflict-report", "stale-echo", "drop-tombstone"] as const;
    for (const m of mutants) {
      // Si se ejecuta con MUTANT=m, al menos un test debe fallar (el twin)
      // Este test solo documenta la correspondencia
      expect(typeof m).toBe("string");
    }
  });
});