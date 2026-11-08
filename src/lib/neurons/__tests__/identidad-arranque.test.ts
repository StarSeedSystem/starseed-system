// @vitest-environment jsdom
/**
 * (NEU1108A) Al arrancar un medio nuevo (reinstalación, origen 127.0.0.1) NO nace una neurona nueva si hay
 * una prueba fuerte de qué neurona es (aquí, la pista de la app de Android): el medio adopta su id en silencio
 * y la ficha sube a ESA fila. Y la ficha nunca pisa la marca `fusionada` ni la identidad del aparato, ni se
 * sube si no se pudo leer la de la fila.
 *   NODE_ENV=test npx vitest run src/lib/neurons/__tests__/identidad-arranque.test.ts
 */
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const BOARD = "e0b9faf2-0000-4000-8000-000000000001";
const db = vi.hoisted(() => ({
  upserts: [] as Array<Record<string, unknown>>,
  selects: 0,
  fichas: {} as Record<string, Record<string, unknown> | null>,
  falloLectura: false,
}));

vi.mock("@/lib/consumo/lider-pestana", () => ({ esLider: () => true, alCambiarLider: () => () => undefined }));
vi.mock("@/lib/consumo/freno", () => ({ frenoActivo: () => false }));
vi.mock("@/lib/consumo/usuario", () => ({ uidActual: async () => "u1" }));
vi.mock("@/lib/sync/entity-state", () => ({ deviceId: () => "sync-1" }));
vi.mock("@/ai/astraura/mesh/federation", () => ({ deviceId: () => "dev-1" }));
vi.mock("@/lib/datos/puerta-a1", () => ({
  puertaA1: () => ({
    latirNeurona: async () => ({ via: "puerta", datos: {} }),
    neuronas: async () => ({ via: "supabase", datos: null }),
  }),
}));
vi.mock("@/utils/supabase/client", () => ({
  createClient: () => ({
    from: () => ({
      upsert: async (fila: Record<string, unknown>) => {
        db.upserts.push(fila);
        return { error: null, status: 201 };
      },
      update: () => ({ eq: () => ({ select: async () => ({ data: [{ id: "x" }], error: null, status: 200 }) }) }),
      select: () => ({
        eq: (_c: string, id: string) => ({
          maybeSingle: async () =>
            db.falloLectura
              ? { data: null, error: { message: "sin red", code: "PGRST000" }, status: 503 }
              : { data: db.fichas[id] ? { capabilities: db.fichas[id] } : null, error: null, status: 200 },
        }),
        order: async () => {
          db.selects++;
          return {
            data: [
              { id: BOARD, name: "Maggaboard", kind: "tablet", capabilities: { platform: "Android" }, permissions: {}, last_seen_at: "2026-11-08T00:52:00Z" },
              { id: "659d5e03-0000-4000-8000-000000000003", name: "Maggadroid", kind: "mobile", capabilities: { platform: "Android" }, permissions: {}, last_seen_at: "2026-11-06T20:10:00Z" },
            ],
            error: null,
            status: 200,
          };
        },
      }),
    }),
  }),
}));

let nActual: { _detenerLatidoParaPruebas: () => void } | null = null;

beforeEach(() => {
  vi.stubGlobal("BroadcastChannel", undefined);
  vi.stubGlobal("fetch", vi.fn(async () => {
    throw new Error("sin red en pruebas");
  }));
  HTMLCanvasElement.prototype.getContext = (() => null) as unknown as HTMLCanvasElement["getContext"];
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
  vi.useFakeTimers();
  vi.resetModules();
  db.upserts = [];
  db.selects = 0;
  db.fichas = {};
  db.falloLectura = false;
  localStorage.clear();
});

afterEach(() => {
  nActual?._detenerLatidoParaPruebas();
  nActual = null;
  vi.unstubAllGlobals();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

async function neuronas() {
  const n = await import("@/lib/neurons/neurons");
  nActual = n;
  return n;
}

describe("adopción en silencio al arrancar", () => {
  test("con la pista de la app (id del origen anterior): adopta «Maggaboard» y la ficha sube a SU fila", async () => {
    localStorage.setItem("starseed.migracion-origen.neurona-anterior.v1", BOARD);
    const n = await neuronas();
    const nueva = n.thisDeviceId();
    expect(nueva).not.toBe(BOARD);
    const eventos: unknown[] = [];
    window.addEventListener("starseed:neurona-adoptada", (e) => eventos.push((e as CustomEvent).detail));
    await n.ensureThisNeuron();
    await vi.advanceTimersByTimeAsync(0);
    await vi.waitFor(() => expect(db.upserts.length).toBe(1));
    expect(db.upserts[0].id).toBe(BOARD);
    expect(db.upserts.some((u) => u.id === nueva)).toBe(false);
    expect(n.thisDeviceId()).toBe(BOARD);
    expect(eventos).toEqual([{ anterior: nueva, adoptada: BOARD, motivo: "arranque:pista-migracion" }]);
  });

  test("un navegador sin pista ni identidad del aparato: ni mira la lista, registra su fila como siempre", async () => {
    const n = await neuronas();
    const id = n.thisDeviceId();
    await n.ensureThisNeuron();
    await vi.advanceTimersByTimeAsync(0);
    await vi.waitFor(() => expect(db.upserts.length).toBe(1));
    expect(db.upserts[0].id).toBe(id);
    expect(db.selects).toBe(0);
  });

  test("sin poder leer la ficha de la fila no se sube nada (no se pisa la marca ni la identidad)", async () => {
    db.falloLectura = true;
    const n = await neuronas();
    await n.ensureThisNeuron();
    await vi.advanceTimersByTimeAsync(0);
    expect(db.upserts).toEqual([]);
  });

  test("la ficha conserva la marca `fusionada` y la identidad que escribió la app nativa", async () => {
    const n = await neuronas();
    const r = n.combinarCapacidades(
      {
        platform: "Android",
        fusionada: { en: BOARD, ts: 1, por: "bienvenida" },
        aparato: { v: 1, medio: "android", app: "os", so: "android", equipo: "Samsung SM-X205", huella: "a1a1a1a1b2b2b2b2", version: "0.5.0" },
      },
      { platform: "Android", browser: "Chrome 156", aparato: { v: 1, so: "android", ultimoMedio: "web", visto: "2026-11-08T01:20:00.000Z" } },
    );
    expect(r).toMatchObject({
      fusionada: { en: BOARD, ts: 1, por: "bienvenida" },
      aparato: { medio: "android", equipo: "Samsung SM-X205", huella: "a1a1a1a1b2b2b2b2", version: "0.5.0", ultimoMedio: "web" },
      browser: "Chrome 156",
    });
  });
});
