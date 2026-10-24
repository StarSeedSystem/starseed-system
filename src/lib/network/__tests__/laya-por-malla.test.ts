/**
 * laya-por-malla (Ola 1018L · tarea G) — pruebas SIN RED: se inyecta un fetch
 * falso y respuestas de Laya de ejemplo con la forma real de system_one
 * (choice/probabilities/answer_confidence, score, noul).
 */
import { describe, it, expect } from "vitest";
import {
  LAYA_MALLA_NS,
  LAYA_MALLA_MAX_PREGUNTAS,
  LAYA_MALLA_MAX_TOKENS,
  LAYA_MALLA_URL_DEFECTO,
  estimarTokensLaya,
  tokensEstimadosPeticionLaya,
  admiteLayaMalla,
  validarPeticionLayaMalla,
  manejarPeticionLayaMalla,
} from "@/lib/network/laya-por-malla";

/* ══════════════════════════ TestData ══════════════════════════ */

const PETICION_OK = {
  cuentaId: "acct-alex",
  estado: "El vecino pide una decisión sobre dos rutinas del agente",
  preguntas: {
    herramienta: {
      type: "choice",
      instructions: "Elige la rutina más adecuada",
      criteria: { "rutina-a": "Enciende luces", "rutina-b": "Cierra persianas" },
    },
    basta: { type: "noul", instructions: "¿Basta un modelo pequeño?" },
  },
};

/* Respuestas de ejemplo con la forma real de system_one. */
const ANSWERS_REALES = {
  herramienta: {
    choice: "rutina-a",
    probabilities: { "rutina-a": 0.71, "rutina-b": 0.05 },
    confidence: 0.68,
    answer_confidence: 0.83,
  },
  basta: { noul: 0.42, probabilities: [0.58, 0.42], confidence: 0.9, answer_confidence: 0.44 },
  dificultad: { score: 1.5, probabilities: [0.4, 0.45, 0.15], answer_confidence: 0.7 },
};

function fetchQueResponde(
  cuerpo: unknown,
  estado = 200,
  fallo?: { lanzar?: Error; alLlamar?: (url: string, init: RequestInit) => void },
): typeof fetch {
  return (async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    fallo?.alLlamar?.(String(input), init ?? {});
    if (fallo?.lanzar) throw fallo.lanzar;
    return new Response(cuerpo === undefined ? null : JSON.stringify(cuerpo), { status: estado });
  }) as typeof fetch;
}

function admisionCualquiera() {
  return { mismaCuenta: true, privado: false, presta: true };
}

/* ══════════════════════════ Topes ══════════════════════════ */

describe("constantes y estimación de tokens", () => {
  it("el namespace del relé y los topes coinciden con el contrato", () => {
    expect(LAYA_MALLA_NS).toBe("capacidad.decision.laya.");
    expect(LAYA_MALLA_MAX_PREGUNTAS).toBe(20);
    expect(LAYA_MALLA_MAX_TOKENS).toBe(8_192);
    expect(LAYA_MALLA_URL_DEFECTO).toBe("http://127.0.0.1:4470/v1/systemone");
  });

  it("estimarTokensLaya nunca devuelve cero y usa ~4 caracteres por token", () => {
    expect(estimarTokensLaya("hola")).toBe(1);
    expect(estimarTokensLaya("")).toBe(1);
    expect(estimarTokensLaya("a".repeat(40))).toBe(10);
    expect(estimarTokensLaya("a".repeat(41))).toBe(11);
  });

  it("tokensEstimadosPeticionLaya suma estado, instrucciones y criterios", () => {
    const p = {
      cuentaId: "a",
      estado: "x".repeat(64), // 16
      preguntas: {
        q: { type: "choice" as const, instructions: "y".repeat(40), criteria: { z: "w".repeat(8) } }, // 10 + 2
      },
    };
    expect(tokensEstimadosPeticionLaya(p)).toBe(28);
  });
});

/* ══════════════════════════ Admisión ══════════════════════════ */

describe("admiteLayaMalla (privacidad que nunca baja)", () => {
  it("la misma cuenta siempre entra", () => {
    expect(admiteLayaMalla({ mismaCuenta: true, privado: true, presta: false }).ok).toBe(true);
  });

  it("el estado privado de OTRA cuenta nunca sale de las neuronas de su dueño", () => {
    const r = admiteLayaMalla({ mismaCuenta: false, privado: true, presta: true });
    expect(r.ok).toBe(false);
    expect(r.motivo).toContain("privado");
  });

  it("de otras cuenta solo si el anfitrión presta y el estado no es privado", () => {
    const noPresta = admiteLayaMalla({ mismaCuenta: false, privado: false, presta: false });
    expect(noPresta.ok).toBe(false);
    expect(noPresta.motivo).toContain("presta Laya");
    expect(admiteLayaMalla({ mismaCuenta: false, privado: false, presta: true }).ok).toBe(true);
  });
});

/* ═════════════════ Determinadores de la validación ═════════════════ */

describe("validarPeticionLayaMalla", () => {
  it("acepta una petición íntegra y la devuelve", () => {
    const r = validarPeticionLayaMalla(PETICION_OK);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.peticion.estado).toBe(PETICION_OK.estado);
  });

  it("rechaza basura, cuenta ausente, estado vacío y petición sin preguntas", () => {
    expect(validarPeticionLayaMalla(null).ok).toBe(false);
    expect(validarPeticionLayaMalla({ estado: "x", preguntas: { a: { type: "score" } } }).ok).toBe(false);
    expect(validarPeticionLayaMalla({ cuentaId: "a", estado: "   ", preguntas: { a: { type: "score" } } }).ok).toBe(false);
    expect(validarPeticionLayaMalla({ cuentaId: "a", estado: "x" }).ok).toBe(false);
  });

  it("rechaza preguntas que no son choice, score ni noul", () => {
    const r = validarPeticionLayaMalla({
      cuentaId: "a", estado: "x", preguntas: { a: { type: "poema" } },
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toContain("no es choice");
  });

  it("limita a 20 preguntas por petición", () => {
    const preguntas: Record<string, { type: "noul" }> = {};
    for (let i = 0; i < LAYA_MALLA_MAX_PREGUNTAS + 1; i++) preguntas[`p${i}`] = { type: "noul" };
    const sobre = validarPeticionLayaMalla({ cuentaId: "a", estado: "x", preguntas });
    expect(sobre.ok).toBe(false);
    if (!sobre.ok) expect(sobre.motivo).toContain("máximo 20");
    delete preguntas.p20;
    expect(validarPeticionLayaMalla({ cuentaId: "a", estado: "x", preguntas }).ok).toBe(true);
  });

  it("limita a 8.192 tokens estimados por petición", () => {
    const r = validarPeticionLayaMalla({
      cuentaId: "a", estado: "t".repeat(LAYA_MALLA_MAX_TOKENS * 4 + 4),
      preguntas: { a: { type: "score" } },
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toContain("tokens estimados");
  });
});

/* ════════════════ Manejador del relé (fetch inyectado) ════════════════ */

describe("manejarPeticionLayaMalla", () => {
  it("reenvía al servidor local en el formato de decision-hibrida y devuelve { respuestas, ms }", async () => {
    let peticionRecibida: unknown = null;
    let url = "";
    const res = await manejarPeticionLayaMalla(PETICION_OK, admisionCualquiera(), {
      transporte: fetchQueResponde({ answers: ANSWERS_REALES, ms: 1900 }, 200, {
        alLlamar: (u, init) => { url = u; peticionRecibida = JSON.parse(String(init.body)); },
      }),
      ahora: () => 0,
    });
    expect(res.ok).toBe(true);
    if (!res.ok) throw new Error(res.motivo);
    expect(url).toBe(LAYA_MALLA_URL_DEFECTO);
    expect(peticionRecibida).toEqual({ state: PETICION_OK.estado, questions: PETICION_OK.preguntas });
    expect(res.ms).toBe(1900);
    expect(res.respuestas.herramienta.choice).toBe("rutina-a");
    expect(res.respuestas.herramienta.answer_confidence).toBe(0.83);
    expect(res.respuestas.basta.answer_confidence).toBe(0.44);
    expect(res.respuestas.dificultad.score).toBe(1.5);
  });

  it("ms calculado por el reloj inyectado si el servidor no lo da", async () => {
    let t = 1000;
    const res = await manejarPeticionLayaMalla(PETICION_OK, admisionCualquiera(), {
      transporte: fetchQueResponde({ answers: ANSWERS_REALES }),
      ahora: () => { t += 500; return t; },
    });
    if (!res.ok) throw new Error(res.motivo);
    expect(res.ms).toBe(500); // el reloj avanza 500 entre la lectura inicial y la final
  });

  it("rechazo legible con 503 (motivo del servidor local) sin preguntarle a Laya dos veces", async () => {
    const res = await manejarPeticionLayaMalla(PETICION_OK, admisionCualquiera(), {
      transporte: fetchQueResponde({ motivo: "sin RAM para Laya" }, 503),
      ahora: () => 0,
    });
    expect(res.ok).toBe(false);
    if (res.ok) throw new Error("no debía servir");
    expect(res.motivo).toContain("sin RAM para Laya");
  });

  it("400 del servidor (cuerpo con error) también da un rechazo legible", async () => {
    const res = await manejarPeticionLayaMalla(PETICION_OK, admisionCualquiera(), {
      transporte: fetchQueResponde({ error: "error procesando petición" }, 400),
    });
    expect(res.ok).toBe(false);
    if (res.ok) throw new Error("no debía servir");
    expect(res.motivo).toContain("error procesando petición");
  });

  it("fallo de red (fetch lanza) da un rechazo legible y nunca lanza", async () => {
    const res = await manejarPeticionLayaMalla(PETICION_OK, admisionCualquiera(), {
      transporte: fetchQueResponde(undefined, 200, { lanzar: new Error("conexión rehusada") }),
      ahora: () => 0,
    });
    expect(res.ok).toBe(false);
    if (res.ok) throw new Error("no debía servir");
    expect(res.motivo).toContain("conexión rehusada");
  });

  it("respuestas ausentes ⇒ rechazo legible", async () => {
    const res = await manejarPeticionLayaMalla(PETICION_OK, admisionCualquiera(), {
      transporte: fetchQueResponde({ answers: null }, 200),
    });
    expect(res.ok).toBe(false);
  });

  it("la admisión corta ANTES de gastar el servidor local (petition de otra cuenta privada)", async () => {
    let llamadas = 0;
    const res = await manejarPeticionLayaMalla(
      { ...PETICION_OK, cuentaId: "acct-otra", privado: true },
      { mismaCuenta: false, privado: true, presta: false },
      { transporte: fetchQueResponde({ answers: ANSWERS_REALES }, 200, { alLlamar: () => { llamadas++; } }) },
    );
    expect(res.ok).toBe(false);
    if (res.ok) throw new Error("no debía servir");
    expect(res.motivo).toContain("privado");
    expect(llamadas).toBe(0);
  });

  it("la petición inválida corta antes del fetch", async () => {
    let llamadas = 0;
    const res = await manejarPeticionLayaMalla(null, admisionCualquiera(), {
      transporte: fetchQueResponde({ answers: ANSWERS_REALES }, 200, { alLlamar: () => { llamadas++; } }),
    });
    expect(res.ok).toBe(false);
    expect(llamadas).toBe(0);
  });
});
