// Pruebas del cliente único de Laya por medio (LYS1018B). Sin red y sin reloj real: fetch, malla y
// reloj inyectados; las respuestas de Laya son de ejemplo con la forma real de system_one.
import { describe, expect, it } from "vitest";
import { construirPeticion } from "@/lib/jev/decisiones";
import { puntoDecision, type MedioLaya, type PuntoDecision } from "../puntos-decision";
import { preguntarALaya, puntoDeLlamada, leerAnswers, URL_LAYA_LOCAL, type DepsLaya } from "../cliente-laya";

const PUNTO: PuntoDecision = puntoDecision("reflejo.herramienta") as PuntoDecision;
const RESPUESTA_LOCAL = {
  herramienta: { choice: "chat", probabilities: { chat: 0.71, ninguna: 0.29 }, confidence: 0.68, answer_confidence: 0.83 },
};
const RESPUESTA_MALLA = {
  herramienta: { choice: "buscar", probabilities: { buscar: 0.9, ninguna: 0.1 }, confidence: 0.5, answer_confidence: 0.71 },
};
const ok = (json: unknown, estado = 200): Response =>
  new Response(JSON.stringify(json), { status: estado, headers: { "Content-Type": "application/json" } });

function falsoDeps(opciones: {
  local?: { responde?: unknown; estado?: number; nunca?: boolean };
  malla?: { trae?: unknown; a1Propio?: boolean; roto?: boolean };
}): { deps: DepsLaya; g: { t: number; dormidos: number[]; locales: { url: string; init?: RequestInit }[]; reles: string[] } } {
  const g = { t: 0, dormidos: [] as number[], locales: [] as { url: string; init?: RequestInit }[], reles: [] as string[] };
  const deps: DepsLaya = {
    ahora: () => g.t,
    dormir: (ms) => {
      g.dormidos.push(ms);
      let id: ReturnType<typeof setTimeout>;
      return {
        promesa: new Promise<void>((res) => { id = setTimeout(() => { g.t += ms; res(); }, ms); }),
        cancelar: () => clearTimeout(id),
      };
    },
    fetch: async (url: string | URL | Request, init?: RequestInit) => {
      g.locales.push({ url: String(url), init });
      const local = opciones.local ?? {};
      if (local.nunca) return new Promise<Response>(() => {});
      if (local.responde === undefined) return new Response(null, { status: local.estado ?? 500 });
      return ok(local.responde, local.estado);
    },
    a1Propio: opciones.malla?.a1Propio,
    relevoMalla: opciones.malla === undefined
      ? undefined
      : async (cuerpo: string) => {
          g.reles.push(cuerpo);
          if (opciones.malla?.roto || opciones.malla?.trae === undefined) return null;
          return opciones.malla.trae;
        },
  };
  return { deps, g };
}

const cabecerasDe = (init: RequestInit | undefined): Record<string, string> =>
  ({ ...(init?.headers as Record<string, string> | undefined) });
/** Plazos cortos por medio: la espera que de verdad vence no alarga el test. */
const pCorto = (plazos: Record<MedioLaya, number>): PuntoDecision => ({ ...PUNTO, plazoMsPorMedio: plazos });

describe("preguntarALaya · servidor local", () => {
  it("pregunta a 127.0.0.1:4470 con el formato nativo, plazo del catálogo por medio y sin X-Prioridad", async () => {
    const { deps, g } = falsoDeps({ local: { responde: { answers: RESPUESTA_LOCAL } } });
    const salida = await preguntarALaya({ punto: PUNTO, estado: "encuentra un libro", medio: "a1" }, deps);
    expect(g.locales.map((l) => l.url)).toEqual([URL_LAYA_LOCAL]);
    const init = g.locales[0].init ?? {};
    expect(init.method).toBe("POST");
    expect(construirPeticion("encuentra un libro", { ...PUNTO.preguntas })).toEqual(
      JSON.parse(String(init.body)) as unknown);
    expect(cabecerasDe(init)).toEqual({ "Content-Type": "application/json" });
    expect(salida).toEqual({ respuestas: RESPUESTA_LOCAL, donde: "local", ms: 0 });
    expect(g.dormidos).toEqual([PUNTO.plazoMsPorMedio.a1]);
  });

  it("la cabecera X-Prioridad aparece solo si la decisión vive en una conversación", async () => {
    const { deps, g } = falsoDeps({ local: { responde: { answers: RESPUESTA_LOCAL } } });
    await preguntarALaya({ punto: PUNTO, estado: "x", medio: "a1", conversacion: true }, deps);
    expect(cabecerasDe(g.locales[0].init)?.["X-Prioridad"]).toBe("conversacion");
    const sinConversacion = falsoDeps({ local: { responde: { answers: RESPUESTA_LOCAL } } });
    await preguntarALaya({ punto: PUNTO, estado: "x", medio: "a1" }, sinConversacion.deps);
    expect(cabecerasDe(sinConversacion.g.locales[0].init)?.["X-Prioridad"]).toBeUndefined();
  });
});
describe("preguntarALaya · A1 por la malla", () => {
  it("si el local no llega, el cuerpo nativo va a la malla y vuelve su respuesta, cada intento con su plazo", async () => {
    const { deps, g } = falsoDeps({ local: { nunca: true }, malla: { trae: { answers: RESPUESTA_MALLA } } });
    const salida = await preguntarALaya({ punto: pCorto({ a1: 5, mac: 5, navegador: 8, malla: 12 }), estado: "encuentra un libro", medio: "a1" }, deps);
    expect(salida).toEqual({ respuestas: RESPUESTA_MALLA, donde: "malla", ms: 5 });
    expect(g.dormidos).toEqual([5, 5]); // local y malla pedirán cada uno su plazo
    expect(JSON.parse(g.reles[0] ?? "")).toEqual(construirPeticion("encuentra un libro", { ...PUNTO.preguntas }));
    const otro = falsoDeps({ local: { nunca: true }, malla: { trae: { answers: RESPUESTA_MALLA } } });
    await preguntarALaya({ punto: pCorto({ a1: 8, mac: 6, navegador: 10, malla: 12 }), estado: "x", medio: "malla" }, otro.deps);
    expect(otro.g.dormidos).toEqual([12, 12]);
    expect(otro.g.t).toBe(12); // el reloj solo avanza con esperas que de verdad vencen
  });
  it("lo privado no sale de la malla sin servidor propio; a un A1 propio sí", async () => {
    const privado = falsoDeps({ local: { estado: 503 } });
    const salidaPrivada = await preguntarALaya({ punto: PUNTO, estado: "x", medio: "a1", privado: true }, privado.deps);
    expect(salidaPrivada).toMatchObject({ respuestas: null, donde: null, motivo: /no sale de la malla/ });
    expect(privado.g.reles).toHaveLength(0);
    const propia = falsoDeps({ local: { estado: 503 }, malla: { trae: { answers: RESPUESTA_MALLA }, a1Propio: true } });
    const salidaPropia = await preguntarALaya({ punto: PUNTO, estado: "x", medio: "a1", privado: true }, propia.deps);
    expect(salidaPropia).toMatchObject({ respuestas: RESPUESTA_MALLA, donde: "malla" });
  });
  it("nada de nada: null con el motivo del respaldo del punto de decisión", async () => {
    const sinRelé = falsoDeps({ local: { estado: 503 } });
    const salida = await preguntarALaya({ punto: PUNTO, estado: "x", medio: "a1" }, sinRelé.deps);
    expect(salida).toMatchObject({ respuestas: null, donde: null, motivo: /sin Laya local ni relé de malla: Jev remoto/ });
    const roto = falsoDeps({ local: { estado: 503 }, malla: { roto: true } });
    const salidaRota = await preguntarALaya({ punto: PUNTO, estado: "x", medio: "a1" }, roto.deps);
    expect(salidaRota).toMatchObject({ respuestas: null, donde: null, motivo: /no llegó ni local ni por la malla/ });
    // Id desconocido: el catálogo solo permite ids tipados, así que uno de fuera cae por la excepción en ejecución.
    const idAjeno = "no.existe.tal" as unknown as Parameters<typeof puntoDeLlamada>[0];
    expect(() => puntoDeLlamada(idAjeno)).toThrow(/punto de decisión desconocido/);
  });
});
describe("lectura del formato nativo", () => {
  it("leerAnswers: answers reales sí, cuerpos sin answers no", () => {
    expect(leerAnswers({ answers: RESPUESTA_LOCAL })).toEqual(RESPUESTA_LOCAL);
    expect(leerAnswers({ answers: ["a"] })).toBeNull();
    expect(leerAnswers({ sinAnswers: true })).toBeNull();
    expect(leerAnswers(null)).toBeNull();
  });
});
