// @vitest-environment jsdom
/**
 * MallaNeuronasPanel — vínculo entre cuentas (Ola 370). Cubre lo que pide el
 * encargo: el diálogo de solicitud, la tarjeta de solicitud entrante
 * (aceptar/rechazar) y la revocación de un vínculo ya activo. El motor
 * (`useVinculosEntreCuentas`) y la capa de datos se mockean — el panel es de
 * solo lectura + disparo de acciones, nunca arranca red por sí mismo.
 */
import type { ReactElement } from "react";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { describe, expect, test, vi, beforeEach, afterEach } from "vitest";
import { AppearanceProvider } from "@/context/appearance-context";
import type { MallaNeuronasState } from "@/lib/network/malla-neuronas";
import type { VinculoRow, PeerVinculo } from "@/lib/network/vinculos-entre-cuentas";

// El panel usa `Dialog` (de `@/components/ui/dialog`), cuyo `DialogContent`
// lee `useAppearance()` incluso con el diálogo cerrado (el hook corre en el
// wrapper propio, antes de que Radix decida si monta el contenido) — por eso
// hace falta el mismo `AppearanceProvider` que envuelve el resto de pruebas
// de este repo que tocan un `Dialog` (ver `dialogo-instalar.test.tsx`).
function renderPanel(ui: ReactElement) {
  return render(<AppearanceProvider>{ui}</AppearanceProvider>);
}

// Sin `globals: true` en vitest.config.ts, no hay limpieza automática entre
// pruebas: sin esto, cada `render()` deja su árbol anterior en el DOM y las
// consultas por texto/rol pueden encontrar más de un elemento (arrastre entre
// pruebas), igual que en el resto de suites de componentes de este repo.
afterEach(() => cleanup());

let estadoMalla: MallaNeuronasState = { misDispositivos: [], cercanas: [], loading: false };
let filasVinculos: VinculoRow[] = [];
let peersVinculos: PeerVinculo[] = [];

const solicitarVinculo = vi.fn(async () => ({ ok: true, detail: "Solicitud de vínculo enviada.", id: "v-nuevo" }));
const aceptarVinculo = vi.fn(async () => ({ ok: true, detail: "Vínculo aceptado." }));
const rechazarVinculo = vi.fn(async () => ({ ok: true, detail: "Solicitud rechazada." }));
const revocarVinculo = vi.fn(async () => ({ ok: true, detail: "Vínculo revocado." }));
const refrescarVinculosAhora = vi.fn();

vi.mock("@/lib/network/malla-neuronas", async () => {
  const actual = await vi.importActual<typeof import("@/lib/network/malla-neuronas")>("@/lib/network/malla-neuronas");
  return { ...actual, useMallaNeuronasEstado: () => estadoMalla };
});

vi.mock("@/lib/network/vinculos-entre-cuentas", async () => {
  const actual = await vi.importActual<typeof import("@/lib/network/vinculos-entre-cuentas")>(
    "@/lib/network/vinculos-entre-cuentas",
  );
  return {
    ...actual,
    useVinculos: () => filasVinculos,
    useVinculosPeers: () => peersVinculos,
    solicitarVinculo,
    aceptarVinculo,
    rechazarVinculo,
    revocarVinculo,
    refrescarVinculosAhora,
  };
});

vi.mock("sonner", () => ({ toast: vi.fn() }));

function unVinculo(over: Partial<VinculoRow> = {}): VinculoRow {
  return {
    id: "v1",
    deOwner: "uid-otro",
    deDevice: "dev-otro-123456",
    aOwner: "uid-yo",
    aDevice: "dev-yo-abcdef",
    estado: "pendiente",
    mensaje: null,
    permisosSolicitados: { ia: false, archivos: false, capacidades: false },
    permisos: { ia: false, archivos: false, capacidades: false },
    dePub: null,
    aPub: null,
    sal: "sal-de-prueba",
    createdAt: Date.now(),
    rol: "a",
    ...over,
  };
}

beforeEach(() => {
  estadoMalla = { misDispositivos: [], cercanas: [], loading: false };
  filasVinculos = [];
  peersVinculos = [];
  solicitarVinculo.mockClear();
  aceptarVinculo.mockClear();
  rechazarVinculo.mockClear();
  revocarVinculo.mockClear();
  refrescarVinculosAhora.mockClear();
});

describe("MallaNeuronasPanel — solicitud de vínculo (radar de cercanas)", () => {
  test("el botón está deshabilitado sin syncId, y habilitado con él", async () => {
    estadoMalla = {
      misDispositivos: [],
      loading: false,
      cercanas: [
        { deviceId: "sin-sync", etiqueta: "Neurona anónima", detectadaHaceMs: 1000, ofreceInternetPublico: false },
        { deviceId: "con-sync", etiqueta: "Neurona con sync", detectadaHaceMs: 1000, ofreceInternetPublico: false, syncId: "sync-123" },
      ],
    };
    const { MallaNeuronasPanel } = await import("@/components/network/malla-neuronas-panel");
    renderPanel(<MallaNeuronasPanel />);
    fireEvent.click(screen.getByText(/Cercanas de otras cuentas/));

    const botones = screen.getAllByText("Solicitar vínculo") as HTMLElement[];
    expect(botones).toHaveLength(2);
    expect((botones[0].closest("button") as HTMLButtonElement).disabled).toBe(true);
    expect((botones[1].closest("button") as HTMLButtonElement).disabled).toBe(false);
  });

  test("abre el diálogo y envía la solicitud con el mensaje y los permisos marcados", async () => {
    estadoMalla = {
      misDispositivos: [],
      loading: false,
      cercanas: [{ deviceId: "con-sync", etiqueta: "Neurona con sync", detectadaHaceMs: 1000, ofreceInternetPublico: false, syncId: "sync-123" }],
    };
    const { MallaNeuronasPanel } = await import("@/components/network/malla-neuronas-panel");
    renderPanel(<MallaNeuronasPanel />);
    fireEvent.click(screen.getByText(/Cercanas de otras cuentas/));
    fireEvent.click(screen.getByText("Solicitar vínculo"));

    expect(screen.getByText("Solicitar vínculo con Neurona con sync")).toBeTruthy();
    fireEvent.change(screen.getByPlaceholderText("Mensaje opcional (máx. 280 caracteres)"), {
      target: { value: "hola, vinculémonos" },
    });
    fireEvent.click(screen.getByText("IA"));

    fireEvent.click(screen.getByText("Enviar solicitud"));

    await waitFor(() => expect(solicitarVinculo).toHaveBeenCalledTimes(1));
    expect(solicitarVinculo).toHaveBeenCalledWith("sync-123", "hola, vinculémonos", { ia: true, archivos: false, capacidades: false });
    await waitFor(() => expect(refrescarVinculosAhora).toHaveBeenCalled());
  });
});

describe("MallaNeuronasPanel — solicitudes entrantes y vínculos activos", () => {
  test("una solicitud entrante se muestra como tarjeta con Aceptar/Rechazar", async () => {
    filasVinculos = [unVinculo({ mensaje: "¿Nos vinculamos?" })];
    const { MallaNeuronasPanel } = await import("@/components/network/malla-neuronas-panel");
    renderPanel(<MallaNeuronasPanel />);
    fireEvent.click(screen.getByRole("button", { name: /Vínculos/ }));

    expect(screen.getByText(/quiere vincularse contigo/)).toBeTruthy();
    expect(screen.getByText("«¿Nos vinculamos?»")).toBeTruthy();
    expect(screen.getByText("Aceptar")).toBeTruthy();
    expect(screen.getByText("Rechazar")).toBeTruthy();
  });

  test("Rechazar llama a rechazarVinculo con el id correcto", async () => {
    filasVinculos = [unVinculo({ id: "v-rechazo" })];
    const { MallaNeuronasPanel } = await import("@/components/network/malla-neuronas-panel");
    renderPanel(<MallaNeuronasPanel />);
    fireEvent.click(screen.getByRole("button", { name: /Vínculos/ }));
    fireEvent.click(screen.getByText("Rechazar"));

    await waitFor(() => expect(rechazarVinculo).toHaveBeenCalledWith("v-rechazo"));
    await waitFor(() => expect(refrescarVinculosAhora).toHaveBeenCalled());
  });

  test("Aceptar abre el diálogo de permisos y llama a aceptarVinculo con lo marcado", async () => {
    filasVinculos = [unVinculo({ id: "v-aceptar" })];
    const { MallaNeuronasPanel } = await import("@/components/network/malla-neuronas-panel");
    renderPanel(<MallaNeuronasPanel />);
    fireEvent.click(screen.getByRole("button", { name: /Vínculos/ }));
    fireEvent.click(screen.getByText("Aceptar"));

    expect(screen.getByRole("heading", { name: "Aceptar vínculo" })).toBeTruthy();
    fireEvent.click(screen.getByText("Archivos"));
    fireEvent.click(screen.getByText("Aceptar vínculo", { selector: "button" }));

    await waitFor(() => expect(aceptarVinculo).toHaveBeenCalledWith("v-aceptar", { ia: false, archivos: true, capacidades: false }));
    await waitFor(() => expect(refrescarVinculosAhora).toHaveBeenCalled());
  });

  test("un vínculo activo muestra Revocar, y lo llama con su id", async () => {
    filasVinculos = [
      unVinculo({
        id: "v-activo",
        estado: "aceptado",
        rol: "de",
        permisos: { ia: true, archivos: false, capacidades: false },
      }),
    ];
    peersVinculos = [{ vinculoId: "v-activo", deviceId: "dev-otro", ownerOtro: "uid-otro", permisos: { ia: true, archivos: false, capacidades: false }, canal: "conectado", latenciaMs: 55 }];

    const { MallaNeuronasPanel } = await import("@/components/network/malla-neuronas-panel");
    renderPanel(<MallaNeuronasPanel />);
    fireEvent.click(screen.getByRole("button", { name: /Vínculos/ }));

    expect(screen.getByText("conectado · 55 ms")).toBeTruthy();
    expect(screen.getByText("IA")).toBeTruthy();
    fireEvent.click(screen.getByText("Revocar"));

    await waitFor(() => expect(revocarVinculo).toHaveBeenCalledWith("v-activo"));
  });

  test("sin vínculos, la sección lo dice honestamente (nunca inventa filas)", async () => {
    filasVinculos = [];
    const { MallaNeuronasPanel } = await import("@/components/network/malla-neuronas-panel");
    renderPanel(<MallaNeuronasPanel />);
    fireEvent.click(screen.getByRole("button", { name: /Vínculos/ }));
    expect(screen.getByText(/Ningún vínculo todavía/)).toBeTruthy();
  });
});
