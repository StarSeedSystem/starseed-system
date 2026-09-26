/**
 * (G9 · 2026-09-26) Jev por la NUBE cuando el despliegue no es la propia Mac:
 * `decidirPorNube` (bridging puro sobre `POST /api/jev/decidir` del backend
 * 1.58), sin `spawn("python3", …)`. Sin `NextRequest` real: se prueba la
 * función exportada directamente, mockeando `fetch` (sonda de `destinoNube` +
 * la llamada a `/api/jev/decidir`).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { decidirPorNube } from "../systemone/route";
import { invalidarDestino } from "@/lib/astraura/destino-nube";
import { normalizarPreguntas, type Peticion } from "@/lib/mando/jev-contrato";

describe("decidirPorNube", () => {
  const entorno = { ...process.env };

  beforeEach(() => {
    invalidarDestino();
    process.env.ASTRAURA_CLOUD_URL = "https://mi-mac.trycloudflare.com";
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    delete process.env.ASTRAURA_158_URL;
  });

  afterEach(() => {
    process.env = { ...entorno };
    vi.unstubAllGlobals();
    invalidarDestino();
  });

  function peticion(): Peticion {
    return normalizarPreguntas({
      state: { pantalla: "publicar" },
      questions: [
        { id: "q1", type: "choice", question: "¿Publicar ahora?", options: ["si", "no"] },
        { id: "q2", type: "score", question: "¿Cuánta prisa?", levels: ["baja", "media", "alta"] },
        { id: "q3", type: "noul", question: "¿Algo más?" },
      ],
    });
  }

  it("sin destino de nube sano, devuelve [] (quien llama cae a su regla determinista)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 503 })));
    expect(await decidirPorNube(peticion())).toEqual([]);
  });

  it("con destino sano, llama a /api/jev/decidir POR CADA pregunta choice/score y NUNCA para las 'noul'", async () => {
    const llamadasDecidir: unknown[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (entrada: string | URL, init?: RequestInit) => {
        const url = String(entrada);
        if (url.endsWith("/api/ping")) return new Response("{}", { status: 200 });
        if (url.endsWith("/api/jev/decidir")) {
          const cuerpo = JSON.parse(String(init?.body ?? "{}"));
          llamadasDecidir.push(cuerpo);
          const opcion = cuerpo.opciones[0];
          return new Response(
            JSON.stringify({ opcion, probabilidades: { [opcion]: 0.9, [cuerpo.opciones[1]]: 0.1 }, motor: "bitnet-nprobs", ms: 12 }),
            { status: 200 },
          );
        }
        return new Response("{}", { status: 404 });
      }),
    );

    const answers = await decidirPorNube(peticion());

    expect(llamadasDecidir).toHaveLength(2); // q1 y q2 — nunca q3 (noul)
    expect(answers).toHaveLength(2);
    expect(answers.find((a) => a.id === "q1")).toMatchObject({ answer: "si", confidence: 0.9 });
    expect(answers.find((a) => a.id === "q2")).toMatchObject({ answer: "baja", confidence: 0.9 });
    expect(answers.some((a) => a.id === "q3")).toBe(false);
  });

  it("si una pregunta falla (HTTP no-ok), las demás se responden igual", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (entrada: string | URL, init?: RequestInit) => {
        const url = String(entrada);
        if (url.endsWith("/api/ping")) return new Response("{}", { status: 200 });
        if (url.endsWith("/api/jev/decidir")) {
          const cuerpo = JSON.parse(String(init?.body ?? "{}"));
          if (cuerpo.pregunta.includes("prisa")) return new Response("error", { status: 500 });
          const opcion = cuerpo.opciones[0];
          return new Response(JSON.stringify({ opcion, probabilidades: { [opcion]: 0.7 } }), { status: 200 });
        }
        return new Response("{}", { status: 404 });
      }),
    );

    const answers = await decidirPorNube(peticion());
    expect(answers).toHaveLength(1);
    expect(answers[0].id).toBe("q1");
  });
});
