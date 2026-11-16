// Pruebas de la siembra de `respuestasLaya` del planificador (JLA1116A · JL10). Sin red ni reloj
// real: `fetch` y el reloj de Laya van INYECTADOS; las respuestas usan la forma real de system_one
// (score/noul, probabilities y answer_confidence). Solo se prueba el comportamiento público.
import { describe, expect, it } from "vitest";
import type { MedioLaya } from "../puntos-decision";
import type { DepsLaya, RelojLaya } from "../cliente-laya";
import { PUNTO_PLAN, respuestasDePlan, respuestasParaPlan, type DepsPlan } from "../preguntar-plan";

const RESPUESTA = {
  dificultad: { type: "score", score: "alta", probabilities: { baja: 0.05, media: 0.15, alta: 0.8 }, answer_confidence: 0.82 },
  basta_pequeno: { type: "noul", noul: 0.18, probabilities: { "sí": 0.18, "no": 0.82 }, answer_confidence: 0.77 },
};

const ok = (json: unknown, estado = 200): Response =>
  new Response(JSON.stringify(json), { status: estado, headers: { "Content-Type": "application/json" } });

/** Reloj falso: con `vencer` las siestas vencen en el siguiente microtask; sin él, nunca vencen. */
function relojFalso(vencer: boolean): { reloj: RelojLaya; dormidos: number[] } {
  const dormidos: number[] = [];
  let t = 0;
  const reloj: RelojLaya = {
    ahora: () => t,
    dormir: (ms) => {
      dormidos.push(ms);
      let cancelado = false;
      const promesa = vencer
        ? Promise.resolve().then(() => { if (!cancelado) t += ms; })
        : new Promise<void>(() => {});
      return { promesa, cancelar: () => { cancelado = true; } };
    },
  };
  return { reloj, dormidos };
}

/** Dependencias mínimas: solo el servidor local (sin relé de malla), como en la primera pasada. */
function depsCon(fetchFalso: typeof fetch, vencer = false, medio: MedioLaya = "a1"): {
  deps: DepsPlan;
  dormidos: number[];
  peticiones: string[];
} {
  const { reloj, dormidos } = relojFalso(vencer);
  const peticiones: string[] = [];
  const fetchConRegistro: typeof fetch = (url: RequestInfo | URL, init?: RequestInit) => {
    peticiones.push(String(init?.body ?? ""));
    return fetchFalso(url, init);
  };
  const deps: DepsLaya = { ...reloj, fetch: fetchConRegistro };
  return { deps: { ...deps, medio }, dormidos, peticiones };
}

const fetchQueResponde = (json: unknown, estado = 200): typeof fetch => async () => ok(json, estado);
const fetchQueNunca: typeof fetch = () => new Promise<Response>(() => {});
const fetchQueFalla: typeof fetch = async () => { throw new Error("red caída"); };

describe("respuestasParaPlan · punto plan.dificultad", () => {
  it("respuesta a tiempo: devuelve las respuestas y pregunta por el plan", async () => {
    const { deps, dormidos, peticiones } = depsCon(fetchQueResponde({ answers: RESPUESTA }));
    await expect(respuestasParaPlan("ordena esta lista", deps)).resolves.toEqual(RESPUESTA);
    expect(dormidos[0]).toBe(PUNTO_PLAN.plazoMsPorMedio.a1);
    const cuerpo = JSON.parse(peticiones[0] ?? "{}") as { state?: unknown; questions?: Record<string, unknown> };
    expect(cuerpo.state).toBe("ordena esta lista");
    expect(Object.keys(cuerpo.questions ?? {}).sort()).toEqual(["basta_pequeno", "dificultad"]);
  });

  it("plazo vencido: null, sin esperar más que el plazo del medio", async () => {
    const { deps, dormidos } = depsCon(fetchQueNunca, true);
    await expect(respuestasParaPlan("x", deps)).resolves.toBeNull();
    expect(dormidos).toContain(PUNTO_PLAN.plazoMsPorMedio.a1);
  });

  it("error de red: null", async () => {
    const { deps } = depsCon(fetchQueFalla);
    await expect(respuestasParaPlan("x", deps)).resolves.toBeNull();
  });

  it("respuesta mal formada: null", async () => {
    for (const mala of [{ answers: { dificultad: "alta" } }, { answers: [] }, { answers: {} }, {}]) {
      const { deps } = depsCon(fetchQueResponde(mala));
      await expect(respuestasParaPlan("x", deps)).resolves.toBeNull();
    }
  });
});

describe("respuestasDePlan · validación pura", () => {
  it("acepta la forma de Laya con alguna pregunta del plan y rechaza el resto", () => {
    expect(respuestasDePlan(RESPUESTA)).toEqual(RESPUESTA);
    expect(respuestasDePlan({ dificultad: { score: "alta" } })).toEqual({ dificultad: { score: "alta" } });
    expect(respuestasDePlan({ dificultad: "alta" })).toBeNull();
    expect(respuestasDePlan({ otra: { score: "alta" } })).toBeNull();
    expect(respuestasDePlan({})).toBeNull();
    expect(respuestasDePlan(null)).toBeNull();
  });
});
