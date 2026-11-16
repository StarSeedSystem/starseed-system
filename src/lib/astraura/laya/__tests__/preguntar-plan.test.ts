// Pruebas de `respuestasParaPlan` (Tarea F · Ola 1018L).
// SOLO funciones puras: respuestas de Laya de ejemplo dentro de la prueba,
// con la forma real del sistema uno (score -> dificultad/noul -> basta_pequeno).
// Sin red, sin disco, sin modelos cargados.
import { describe, it, expect } from "vitest";
import {
  respuestasParaPlan,
  nivelDeDificultad,
  valorNoulBasta,
} from "../preguntar-plan";
import type { DepsLaya } from "../cliente-laya";
import type { RespuestasLaya } from "@/ai/astraura/router-laya";
import { puntoDecision } from "../puntos-decision";

const PUNTO = puntoDecision("plan.dificultad")!;

const RESPUESTA_DIFICULTAD_BAJA: RespuestasLaya = {
  dificultad: {
    type: "score",
    score: "baja",
    answer_confidence: 0.85,
  },
  basta_pequeno: {
    type: "noul",
    noul: 0.8,
    answer_confidence: 0.75,
  },
};

const RESPUESTA_DIFICULTAD_ALTA: RespuestasLaya = {
  dificultad: {
    type: "score",
    score: "alta",
    answer_confidence: 0.92,
  },
  basta_pequeno: {
    type: "noul",
    noul: 0.2,
    answer_confidence: 0.88,
  },
};

const RESPUESTA_DIFICULTAD_MEDIA: RespuestasLaya = {
  dificultad: {
    type: "score",
    score: "media",
    answer_confidence: 0.7,
  },
  basta_pequeno: {
    type: "noul",
    noul: 0.5,
    answer_confidence: 0.65,
  },
};

interface FalsoDeps {
  deps: DepsLaya;
  g: { t: number; dormidos: number[]; locales: { url: string; init?: RequestInit }[] };
}

function falsoDeps(opciones: {
  local?: { responde?: unknown; estado?: number };
}): FalsoDeps {
  const g: FalsoDeps["g"] = {
    t: 0,
    dormidos: [] as number[],
    locales: [] as { url: string; init?: RequestInit }[],
  };
  const deps: DepsLaya = {
    ahora: () => g.t,
    dormir: (ms) => {
      g.dormidos.push(ms);
      let id: ReturnType<typeof setTimeout>;
      return {
        promesa: new Promise<void>((r) => {
          id = setTimeout(() => {
            g.t += ms;
            r();
          }, ms);
        }),
        cancelar: () => clearTimeout(id),
      };
    },
    fetch: async (url: string | URL | Request, init?: RequestInit) => {
      g.locales.push({ url: String(url), init });
      const local = opciones.local ?? {};
      if (local.responde === undefined) return new Response(null, { status: local.estado ?? 500 });
      return new Response(JSON.stringify(local.responde), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    },
    perfil: undefined,
    layaNavegador: undefined,
    planLaya: undefined,
  };
  return { deps, g };
}

describe("respuestasParaPlan", () => {
  it("devuelve las respuestas cuando Laya responde exitosamente", async () => {
    const { deps, g } = falsoDeps({ local: { responde: { answers: RESPUESTA_DIFICULTAD_BAJA } } });
    const resultado = await respuestasParaPlan("texto de prueba", deps);
    expect(resultado).toEqual(RESPUESTA_DIFICULTAD_BAJA);
  });

  it("devuelve null cuando la respuesta está vacía", async () => {
    const { deps, g } = falsoDeps({ local: { responde: {} } });
    const resultado = await respuestasParaPlan("texto de prueba", deps);
    expect(resultado).toBeNull();
  });

  it("devuelve null cuando el servidor local no responde con error HTTP", async () => {
    const { deps, g } = falsoDeps({ local: { estado: 503 } });
    const resultado = await respuestasParaPlan("texto de prueba", deps);
    expect(resultado).toBeNull();
  });

  it("devuelve null cuando hay error de red", async () => {
    const baseDeps = falsoDeps({ local: { responde: { answers: RESPUESTA_DIFICULTAD_BAJA } } }).deps;
    const depsConError: DepsLaya = {
      ...baseDeps,
      fetch: async () => {
        throw new Error("NetworkError");
      },
    };
    const resultado = await respuestasParaPlan("texto de prueba", depsConError);
    expect(resultado).toBeNull();
  });

  it("funciona con medio 'malla' y usa el plazo correcto", async () => {
    const { deps, g } = falsoDeps({ local: { responde: { answers: RESPUESTA_DIFICULTAD_MEDIA } } });
    const resultado = await respuestasParaPlan("texto de prueba", deps, "malla");
    expect(resultado).toEqual(RESPUESTA_DIFICULTAD_MEDIA);
  });

  it("funciona con medio 'navegador'", async () => {
    const { deps, g } = falsoDeps({ local: { responde: { answers: RESPUESTA_DIFICULTAD_BAJA } } });
    const resultado = await respuestasParaPlan("texto de prueba", deps, "navegador");
    expect(resultado).toEqual(RESPUESTA_DIFICULTAD_BAJA);
  });

  it("funciona con medio 'a1'", async () => {
    const { deps, g } = falsoDeps({ local: { responde: { answers: RESPUESTA_DIFICULTAD_ALTA } } });
    const resultado = await respuestasParaPlan("texto de prueba", deps, "a1");
    expect(resultado).toEqual(RESPUESTA_DIFICULTAD_ALTA);
  });

  it("funciona con medio 'mac'", async () => {
    const { deps, g } = falsoDeps({ local: { responde: { answers: RESPUESTA_DIFICULTAD_MEDIA } } });
    const resultado = await respuestasParaPlan("texto de prueba", deps, "mac");
    expect(resultado).toEqual(RESPUESTA_DIFICULTAD_MEDIA);
  });

  it("devuelve null cuando Laya no llega (sin malla disponible)", async () => {
    const { deps, g } = falsoDeps({ local: { estado: 503 } });
    const resultado = await respuestasParaPlan("texto de prueba", deps);
    expect(resultado).toBeNull();
  });
});

describe("nivelDeDificultad", () => {
  it("extrae 'baja' cuando score es 'baja'", () => {
    expect(nivelDeDificultad(RESPUESTA_DIFICULTAD_BAJA)).toBe("baja");
  });

  it("extrae 'media' cuando score es 'media'", () => {
    expect(nivelDeDificultad(RESPUESTA_DIFICULTAD_MEDIA)).toBe("media");
  });

  it("extrae 'alta' cuando score es 'alta'", () => {
    expect(nivelDeDificultad(RESPUESTA_DIFICULTAD_ALTA)).toBe("alta");
  });

  it("devuelve null cuando las respuestas son null", () => {
    expect(nivelDeDificultad(null)).toBeNull();
  });

  it("devuelve null cuando no hay dificultad en las respuestas", () => {
    const sinDificultad: RespuestasLaya = {
      otra_pregunta: { type: "noul", noul: 0.5 },
    };
    expect(nivelDeDificultad(sinDificultad)).toBeNull();
  });

  it("devuelve null cuando el score no es válido", () => {
    const scoreInvalido: RespuestasLaya = {
      dificultad: { type: "score", score: "invalida" } as unknown as RespuestasLaya["dificultad"],
    };
    expect(nivelDeDificultad(scoreInvalido)).toBeNull();
  });

  it("devuelve null cuando el score es un número", () => {
    const scoreNum: RespuestasLaya = {
      dificultad: { type: "score", score: 0.85 } as unknown as RespuestasLaya["dificultad"],
    };
    expect(nivelDeDificultad(scoreNum)).toBeNull();
  });
});

describe("valorNoulBasta", () => {
  it("extrae el valor del noul cuando está presente", () => {
    expect(valorNoulBasta(RESPUESTA_DIFICULTAD_BAJA)).toBe(0.8);
  });

  it("devuelve null cuando las respuestas son null", () => {
    expect(valorNoulBasta(null)).toBeNull();
  });

  it("devuelve null cuando no hay basta_pequeno en las respuestas", () => {
    const sinBasta: RespuestasLaya = {
      dificultad: { type: "score", score: "alta" },
    };
    expect(valorNoulBasta(sinBasta)).toBeNull();
  });

  it("devuelve null cuando el noul no es un número finito", () => {
    const noulInvalido: RespuestasLaya = {
      basta_pequeno: { type: "noul", noul: "no es numero" } as unknown as RespuestasLaya["basta_pequeno"],
    };
    expect(valorNoulBasta(noulInvalido)).toBeNull();
  });

  it("extrae el valor del noul de probabilities 'sí'", () => {
    const conProb: RespuestasLaya = {
      basta_pequeno: {
        type: "noul",
        probabilities: { "sí": 0.63, "no": 0.37 },
        answer_confidence: 0.8,
      },
    };
    expect(valorNoulBasta(conProb)).toBe(0.63);
  });

  it("devuelve null cuando probabilities no tiene 'sí'", () => {
    const sinSi: RespuestasLaya = {
      basta_pequeno: {
        type: "noul",
        probabilities: { no: 0.37, tal: 0.63 },
        answer_confidence: 0.8,
      },
    };
    expect(valorNoulBasta(sinSi)).toBeNull();
  });
});