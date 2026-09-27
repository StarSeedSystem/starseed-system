/**
 * IA por la malla P2P, genérica (Ola 368): las piezas puras del enrutador que
 * hacen posible los dos casos de uso de `ia-malla` sin depender de la enorme
 * `astrauraChat` en directo — `construirCandidatoIaMalla` (candidato manual,
 * nunca producido por `rankCandidates`), `viaMallaDeRespuesta` (qué peer
 * sirvió de verdad) y `esFuenteDeMalla` (para el flag `desdeMalla`).
 */
import { describe, expect, it } from "vitest";
import { construirCandidatoIaMalla, viaMallaDeRespuesta, rankCandidates, DEFAULT_INTELLIGENCE, type TaskProfile } from "@/ai/astraura/router";
import { IA_MALLA_SOURCE_ID, ASTRAURA_158_MALLA_SOURCE_ID, esFuenteDeMalla, findSource } from "@/ai/astraura/free-catalog";
import type { SourceAvailability } from "@/ai/astraura/availability";

describe("esFuenteDeMalla", () => {
  it("reconoce los dos relés de malla y nada más", () => {
    expect(esFuenteDeMalla(IA_MALLA_SOURCE_ID)).toBe(true);
    expect(esFuenteDeMalla(ASTRAURA_158_MALLA_SOURCE_ID)).toBe(true);
    expect(esFuenteDeMalla("ollama-local")).toBe(false);
    expect(esFuenteDeMalla("astraura-158-local")).toBe(false);
  });
});

describe("construirCandidatoIaMalla", () => {
  const peer = { syncDeviceId: "mac-de-alex", nombre: "Mac de Alex" };

  it("sin pin (caso b, último recurso): modelo 'auto', razón menciona el peer y 'último recurso'", () => {
    const c = construirCandidatoIaMalla(peer);
    expect(c).toBeTruthy();
    expect(c!.source.id).toBe(IA_MALLA_SOURCE_ID);
    expect(c!.model.id).toBe("auto");
    expect(c!.reason).toContain("Mac de Alex");
    expect(c!.reason).toContain("último recurso");
  });

  it("con pin (caso a, pin no listo aquí): el id del modelo codifica fuente/modelo, razón dice qué fuente pidió", () => {
    const c = construirCandidatoIaMalla(peer, { fuente: "ollama-local", modelo: "llama3.2" });
    expect(c).toBeTruthy();
    expect(c!.model.id).toBe("pin::ollama-local::llama3.2");
    expect(c!.reason).toContain("ollama-local");
    expect(c!.reason).toContain("Mac de Alex");
  });

  it("nunca aparece por sí solo en rankCandidates (availability.ts la marca ready:false)", () => {
    const perfil: TaskProfile = { kind: "chat", needsVision: false, chars: 10, difficulty: 0.1 };
    const source = findSource(IA_MALLA_SOURCE_ID)!;
    // Aunque un llamador (por error) marcara `ready:true` a mano, `rankCandidates`
    // SÍ la incluiría — la garantía real vive en `availability.ts`
    // (`availability-ia-malla.test.ts`), no en `rankCandidates`: aquí se
    // confirma que un `avail` REALISTA (sin la fuente) no la produce.
    const avail: SourceAvailability[] = [{ source: findSource("openrouter-free")!, ready: true }];
    const r = rankCandidates(perfil, avail, DEFAULT_INTELLIGENCE);
    expect(r.some((c) => c.source.id === source.id)).toBe(false);
  });
});

describe("viaMallaDeRespuesta", () => {
  it("solo reconoce la fuente ia-malla con raw.via === 'malla'", () => {
    const res = { raw: { via: "malla", peer: "Tablet de Alex", fuente: "ollama-local", modelo: "llama3.2" } };
    expect(viaMallaDeRespuesta(IA_MALLA_SOURCE_ID, res)).toEqual({
      viaPeer: "Tablet de Alex",
      viaFuente: "ollama-local",
      viaModelo: "llama3.2",
    });
  });

  it("undefined para cualquier otra fuente, o si raw no trae via:'malla'", () => {
    expect(viaMallaDeRespuesta("ollama-local", { raw: { via: "malla", peer: "x" } })).toBeUndefined();
    expect(viaMallaDeRespuesta(IA_MALLA_SOURCE_ID, { raw: { via: "nube" } })).toBeUndefined();
    expect(viaMallaDeRespuesta(IA_MALLA_SOURCE_ID, undefined)).toBeUndefined();
    expect(viaMallaDeRespuesta(IA_MALLA_SOURCE_ID, {})).toBeUndefined();
  });
});
