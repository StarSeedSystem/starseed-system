// @vitest-environment jsdom
/**
 * Latido de neuronas · contrato «consumo» (2026-09-29). `neuron_devices` recibía ~1.200
 * peticiones/h: latido de 60 s en cada pestaña (también oculta) y, sobre todo, `listNeurons()`
 * re-registrando el dispositivo (upsert + 2 getUser) en CADA lectura de la malla (cada 20 s).
 * Aquí se fija: latido cada 5 min solo en la líder y con el dispositivo a la vista, «online»
 * con 12 min de ventana, parada ante 400, y una caché de lista compartida que no escribe.
 */
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const g1 = vi.hoisted(() => ({ lider: true, freno: false, oyentes: new Set<(l: boolean) => void>() }));
const db = vi.hoisted(() => ({
  upserts: 0,
  selects: 0,
  respuestaUpsert: { error: null as unknown, status: 201 },
}));

vi.mock("@/lib/consumo/lider-pestana", () => ({
  esLider: () => g1.lider,
  alCambiarLider: (cb: (l: boolean) => void) => {
    g1.oyentes.add(cb);
    return () => g1.oyentes.delete(cb);
  },
}));
vi.mock("@/lib/consumo/freno", () => ({ frenoActivo: () => g1.freno }));
vi.mock("@/lib/consumo/usuario", () => ({ uidActual: async () => "u1" }));
vi.mock("@/lib/sync/entity-state", () => ({ deviceId: () => "sync-1" }));
vi.mock("@/ai/astraura/mesh/federation", () => ({ deviceId: () => "dev-1" }));
vi.mock("@/utils/supabase/client", () => ({
  createClient: () => ({
    from: () => ({
      upsert: async () => {
        db.upserts++;
        return db.respuestaUpsert;
      },
      select: () => ({
        order: async () => {
          db.selects++;
          return {
            data: [{ id: "n-otra", name: "Otra", kind: "desktop", capabilities: {}, permissions: {}, last_seen_at: new Date().toISOString() }],
            error: null,
            status: 200,
          };
        },
      }),
    }),
  }),
}));

let visibilidad: DocumentVisibilityState = "visible";
Object.defineProperty(document, "visibilityState", { configurable: true, get: () => visibilidad });
function ponerVisibilidad(v: DocumentVisibilityState): void {
  visibilidad = v;
  document.dispatchEvent(new Event("visibilitychange"));
}
function cambiarLider(v: boolean): void {
  g1.lider = v;
  for (const cb of g1.oyentes) cb(v);
}

const MIN = 60_000;

beforeEach(() => {
  // Aislamiento entre instancias de módulo del mismo proceso (ver bucle-fondo.test.ts).
  vi.stubGlobal("BroadcastChannel", undefined);
  // Las sondas locales (Ollama, LM Studio, Astraura) no deben salir a la red en la prueba.
  vi.stubGlobal("fetch", vi.fn(async () => {
    throw new Error("sin red en pruebas");
  }));
  HTMLCanvasElement.prototype.getContext = (() => null) as unknown as HTMLCanvasElement["getContext"];
  vi.useFakeTimers();
  vi.resetModules();
  g1.lider = true;
  g1.freno = false;
  g1.oyentes.clear();
  visibilidad = "visible";
  db.upserts = 0;
  db.selects = 0;
  db.respuestaUpsert = { error: null, status: 201 };
  localStorage.clear();
});

let nActual: { _detenerLatidoParaPruebas: () => void } | null = null;

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

describe("latido de neuronas (neuron_devices)", () => {
  test("latido cada 5 min y «online» con 12 min de ventana", async () => {
    const n = await neuronas();
    expect(n.HEARTBEAT_MS).toBe(5 * MIN);
    expect(n.ONLINE_WINDOW_MS).toBe(12 * MIN);
    await n.ensureThisNeuron();
    await vi.advanceTimersByTimeAsync(0);
    expect(db.upserts).toBe(1); // registro inicial (ficha completa)
    await vi.advanceTimersByTimeAsync(5 * MIN - 1);
    expect(db.upserts).toBe(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(db.upserts).toBe(2);
    // Llamar otra vez a ensureThisNeuron (lo hacen 6 superficies) no escribe nada.
    await n.ensureThisNeuron();
    await n.ensureThisNeuron();
    expect(db.upserts).toBe(2);
  });

  test("una pestaña que no es líder no late; al heredar el liderazgo, sí", async () => {
    g1.lider = false;
    const n = await neuronas();
    await n.ensureThisNeuron();
    await vi.advanceTimersByTimeAsync(30 * MIN);
    expect(db.upserts).toBe(0);
    cambiarLider(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(db.upserts).toBe(1);
  });

  test("con el dispositivo oculto no late; al volver, un latido de puesta al día", async () => {
    const n = await neuronas();
    await n.ensureThisNeuron();
    await vi.advanceTimersByTimeAsync(0);
    expect(db.upserts).toBe(1);
    ponerVisibilidad("hidden");
    await vi.advanceTimersByTimeAsync(60 * MIN);
    expect(db.upserts).toBe(1);
    ponerVisibilidad("visible");
    await vi.advanceTimersByTimeAsync(0);
    expect(db.upserts).toBe(2);
  });

  test("un 400 (columna/tabla que no encaja) para el latido hasta recargar, con un aviso", async () => {
    const aviso = vi.spyOn(console, "warn").mockImplementation(() => {});
    db.respuestaUpsert = { error: { code: "PGRST204", message: "Could not find the 'capabilities' column" }, status: 400 };
    const n = await neuronas();
    await n.ensureThisNeuron();
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(2 * 60 * MIN);
    ponerVisibilidad("hidden");
    ponerVisibilidad("visible");
    await vi.advanceTimersByTimeAsync(10 * MIN);
    expect(db.upserts).toBe(1);
    expect(aviso.mock.calls.filter((c) => String(c[0]).includes("neuronas · latido"))).toHaveLength(1);
  });

  test("listNeurons comparte caché (5 min) y NO re-registra el dispositivo", async () => {
    g1.lider = false; // sin latido: se ve solo lo que hace la lista
    const n = await neuronas();
    const a = await n.listNeurons();
    const b = await n.listNeurons();
    expect(db.selects).toBe(1);
    expect(db.upserts).toBe(0);
    expect(a.some((x) => x.id === "n-otra" && x.online)).toBe(true);
    expect(b.length).toBe(a.length);
    await vi.advanceTimersByTimeAsync(5 * MIN + 1);
    await n.listNeurons();
    expect(db.selects).toBe(2);
    // Con la pestaña oculta se sirve la caché aunque haya caducado.
    ponerVisibilidad("hidden");
    await vi.advanceTimersByTimeAsync(10 * MIN);
    await n.listNeurons();
    expect(db.selects).toBe(2);
  });
});
