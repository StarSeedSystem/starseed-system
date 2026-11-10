// PTA1110A · el resolvedor de BitNet de Astraura usa la IA de otra neurona (por la malla) cuando no hay mejor opción.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AJUSTES_PUERTA_POR_DEFECTO } from "@/lib/malla/puerta/politica";
import type { NodoIaMalla } from "@/lib/malla/puerta/ia";

const h = vi.hoisted(() => ({ estado: null as unknown as Record<string, unknown> }));
vi.mock("@/lib/malla/puerta/servicio", () => ({ estadoPuerta: () => h.estado }));
vi.mock("@/lib/astraura/perfil-hardware", async () => {
  const actual = await import("@/lib/astraura/perfil-hardware");
  return { ...actual, medirPerfil: () => ({}), dondeRazona: () => ({ needle: "backend", jev: "red", bitnet: "local" }) };
});
vi.mock("@/lib/astraura/astraura-158-client", async () => {
  const actual = await import("@/lib/astraura/astraura-158-client");
  return { ...actual, astraura158Endpoint: () => "http://127.0.0.1:8000" };
});

import { resolverEndpointBitnet, urlIaPorMalla } from "@/lib/astraura/destino-bitnet";

const nodo: NodoIaMalla = { id: "malla:n1:11434", tipo: "vecino", url: "http://ia.neurona.local:11434", vivo: true, tokS: null, ramLibreMb: null, latenciaMs: null, neurona: "n1", nombre: "MaggaBook", puerto: 11434, enlace: "Bluetooth directo", saltos: 0 };
const estado = (p: Record<string, unknown> = {}) => (h.estado = { ajustes: AJUSTES_PUERTA_POR_DEFECTO, iaPorMalla: [nodo], ...p });

function nodosApi(nodos: unknown[]) {
  vi.stubGlobal("window", globalThis);
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ nodos }), { status: 200 })));
}

beforeEach(() => estado());
afterEach(() => vi.unstubAllGlobals());

describe("IA de otra neurona por la malla en Astraura", () => {
  it("sin ningún nodo mejor, el endpoint es el de la neurona-puerta por la malla", async () => {
    nodosApi([]);
    expect(await resolverEndpointBitnet("local" as never)).toBe("http://ia.neurona.local:11434");
  });
  it("con un nodo local vivo, ese gana (la malla es el último recurso)", async () => {
    nodosApi([{ id: "yo", tipo: "local", url: "http://127.0.0.1:9000", vivo: true, tokS: 20, ramLibreMb: 1000, latenciaMs: 3 }]);
    expect(await resolverEndpointBitnet("local" as never)).toBe("http://127.0.0.1:9000");
  });
  it("con el uso «IA» apagado o «Nunca», no se usa", async () => {
    nodosApi([]);
    estado({ ajustes: { ...AJUSTES_PUERTA_POR_DEFECTO, usos: { ...AJUSTES_PUERTA_POR_DEFECTO.usos, ia: false } } });
    expect(await resolverEndpointBitnet("local" as never)).toBe("http://127.0.0.1:8000");
    estado({ ajustes: { ...AJUSTES_PUERTA_POR_DEFECTO, modoUso: "nunca" } });
    expect(await urlIaPorMalla()).toBeNull();
  });
  it("sin nodos por la malla cae al endpoint de siempre", async () => {
    nodosApi([]);
    estado({ iaPorMalla: [] });
    expect(await resolverEndpointBitnet("local" as never)).toBe("http://127.0.0.1:8000");
  });
});
