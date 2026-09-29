// @vitest-environment jsdom
/**
 * Capa sináptica · contrato «consumo» (2026-09-29). La bandeja de relé (`os_mesh_relay`) era
 * la ruta más pedida tras /auth/v1/user: cada 30 s, en cada pestaña, oculta o no. Aquí se fija:
 * solo la pestaña líder la sondea, nada con el dispositivo oculto (y una puesta al día al
 * volver), cada 5 min (15 en calma), el broadcast de cuenta la adelanta, y un 400 la para.
 */
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const g1 = vi.hoisted(() => ({ lider: true, freno: false, oyentes: new Set<(l: boolean) => void>() }));
const relevo = vi.hoisted(() => ({
  inbox: [] as Array<{ items: unknown[]; next: number; fallo?: unknown }>,
  llamadasInbox: 0,
  llamadasFaros: 0,
  despertar: null as null | (() => void),
}));

vi.mock("@/lib/consumo/lider-pestana", () => ({
  esLider: () => g1.lider,
  alCambiarLider: (cb: (l: boolean) => void) => {
    g1.oyentes.add(cb);
    return () => g1.oyentes.delete(cb);
  },
}));
vi.mock("@/lib/consumo/freno", () => ({ frenoActivo: () => g1.freno }));
vi.mock("@/lib/sync/realtime-sync", () => ({
  onAccountBroadcast: (_ev: string, cb: () => void) => {
    relevo.despertar = cb;
    return () => {
      relevo.despertar = null;
    };
  },
}));
vi.mock("@/ai/astraura/mesh/server-relay", () => ({
  EVENTO_DESPERTAR_RELE: "malla:rele",
  emitBeaconDetallado: async () => {
    relevo.llamadasFaros++;
    return { ok: true, fallo: null };
  },
  pullBeaconsDetallado: async () => ({ faros: [], fallo: null }),
  pullRelayInbox: async (since: number) => {
    relevo.llamadasInbox++;
    return relevo.inbox.shift() ?? { items: [], next: since, fallo: null };
  },
  pullRelayExtra: async () => [],
  pullPublicFeed: async (since: unknown) => ({ items: [], next: since, fallo: null }),
  pullPublicExtra: async () => [],
  subscribeEndpointStream: () => () => {},
  registerIdentity: async () => {},
  refreshIdentities: async () => null,
  refreshRevocations: async () => null,
  isRevoked: () => false,
  purgeBeacon: async () => {},
}));
vi.mock("@/ai/astraura/mesh/device-revocation", () => ({ refreshDeviceCertRevocations: async () => null }));
vi.mock("@/ai/astraura/mesh/master-identity", () => ({ masterFingerprint: async () => null }));
vi.mock("@/ai/astraura/mesh/sync", () => ({ deliverInbound: vi.fn() }));

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
let parar: (() => void) | null = null;

async function arrancar() {
  const m = await import("@/ai/astraura/mesh/synaptic");
  m.startSynapticLayer();
  parar = m.stopSynapticLayer;
  await vi.advanceTimersByTimeAsync(0);
  return m;
}

beforeEach(() => {
  // Aislamiento: cada `vi.resetModules()` crea otra instancia de bucle-fondo en el MISMO proceso
  // y el BroadcastChannel real de Node las conecta entre sí (mensajes de pruebas anteriores).
  vi.stubGlobal("BroadcastChannel", undefined);
  vi.useFakeTimers();
  vi.resetModules();
  g1.lider = true;
  g1.freno = false;
  g1.oyentes.clear();
  visibilidad = "visible";
  relevo.inbox = [];
  relevo.llamadasInbox = 0;
  relevo.llamadasFaros = 0;
  relevo.despertar = null;
});

afterEach(() => {
  vi.unstubAllGlobals();
  parar?.();
  parar = null;
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("bandeja de relé (os_mesh_relay) bajo el contrato de consumo", () => {
  test("una pestaña que NO es líder no sondea; al heredar el liderazgo, sí", async () => {
    g1.lider = false;
    await arrancar();
    await vi.advanceTimersByTimeAsync(60 * MIN);
    expect(relevo.llamadasInbox).toBe(0);
    expect(relevo.llamadasFaros).toBe(0);

    cambiarLider(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(relevo.llamadasInbox).toBe(1);
    expect(relevo.llamadasFaros).toBe(1);
  });

  test("cada 5 min con la pestaña a la vista (antes: cada 30 s)", async () => {
    await arrancar();
    expect(relevo.llamadasInbox).toBe(1);
    await vi.advanceTimersByTimeAsync(5 * MIN - 1);
    expect(relevo.llamadasInbox).toBe(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(relevo.llamadasInbox).toBe(2);
  });

  test("con el dispositivo oculto no hay sondeo; al volver, UNA puesta al día", async () => {
    await arrancar();
    ponerVisibilidad("hidden");
    await vi.advanceTimersByTimeAsync(2 * 60 * MIN);
    expect(relevo.llamadasInbox).toBe(1);
    ponerVisibilidad("visible");
    await vi.advanceTimersByTimeAsync(0);
    expect(relevo.llamadasInbox).toBe(2);
    await vi.advanceTimersByTimeAsync(1 * MIN);
    expect(relevo.llamadasInbox).toBe(2);
  });

  test("un 400 para la bandeja hasta recargar, con un solo aviso", async () => {
    const aviso = vi.spyOn(console, "warn").mockImplementation(() => {});
    relevo.inbox.push({ items: [], next: 0, fallo: { status: 400, code: "PGRST100", message: "failed to parse filter" } });
    await arrancar();
    expect(relevo.llamadasInbox).toBe(1);
    await vi.advanceTimersByTimeAsync(3 * 60 * MIN);
    relevo.despertar?.();
    await vi.advanceTimersByTimeAsync(10 * MIN);
    expect(relevo.llamadasInbox).toBe(1);
    const avisosBandeja = aviso.mock.calls.filter((c) => String(c[0]).includes("bandeja de relé"));
    expect(avisosBandeja).toHaveLength(1);
  });

  test("en calma (3 vueltas vacías) pasa a 15 min; el broadcast de cuenta la adelanta", async () => {
    await arrancar(); // vacía 1
    await vi.advanceTimersByTimeAsync(5 * MIN); // vacía 2
    await vi.advanceTimersByTimeAsync(5 * MIN); // vacía 3 → calma
    expect(relevo.llamadasInbox).toBe(3);
    await vi.advanceTimersByTimeAsync(14 * MIN);
    expect(relevo.llamadasInbox).toBe(3);

    expect(relevo.despertar).toBeTypeOf("function");
    relevo.despertar!(); // otra neurona de mi cuenta subió un relé
    await vi.advanceTimersByTimeAsync(0);
    expect(relevo.llamadasInbox).toBe(4);
  });

  test("un 503 no para: espera y vuelve", async () => {
    relevo.inbox.push({ items: [], next: 0, fallo: { status: 503 } });
    await arrancar();
    await vi.advanceTimersByTimeAsync(5 * MIN);
    expect(relevo.llamadasInbox).toBe(2);
  });
});
