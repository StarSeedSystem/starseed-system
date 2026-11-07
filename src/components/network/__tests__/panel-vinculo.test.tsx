// @vitest-environment jsdom
/**
 * PanelVinculo + ListaVinculos — lo que ve la persona de una neurona vinculada: vías con su latencia
 * («sin medir» hasta medir; «Medir ahora» mide de verdad por la red local), capas de conciencia
 * compartidas, ajustes (reconectar sola, vías permitidas) y la lista de todas con su mejor vía.
 */
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

vi.mock("@/lib/consumo/usuario", () => ({ uidActual: async () => "u-1" }));
// El diálogo real necesita el proveedor de apariencia; aquí basta con que confirme.
vi.mock("@/components/ui/confirm-dialog", () => ({ useConfirm: () => async () => true }));

import { ListaVinculos, PanelVinculo } from "@/components/network/panel-vinculo";
import { __fijarMotorSyncParaPruebas, crearMotorSync, type DepsMotorSync, type MotorSync } from "@/lib/malla/sincronizacion-neuronas-motor";
import { CLAVE_VINCULOS_LOCAL, serializarVinculos, type NeuronaSync, type VinculoNeurona } from "@/lib/malla/sincronizacion-neuronas";

const T = 1_800_000_000_000;
const YO: NeuronaSync = { neurona: "mac-1", sync: "sync-mac", cuenta: "u-1", nombre: "Mac de Alex", medio: "app-nativa", capacidades: [] };

const VINCULO: VinculoNeurona = {
  neurona: "tab-1",
  sync: "sync-tab",
  cuenta: "u-1",
  nombre: "Tablet de Alex",
  plataforma: "Android",
  medio: "app-nativa",
  huella: "id:tab",
  recordado: true,
  recordadoPorElOtro: true,
  capacidades: ["WebRTC", "capa:mesh", "capa:local", "capa:colectiva"],
  creado: T,
  ultimoEncuentro: T,
  ultimaVia: "red-local-nativa",
  ultimaIp: "192.168.1.20",
};

function montar(opts: { vecino?: boolean; vinculos?: VinculoNeurona[] } = {}): { motor: MotorSync; almacen: Map<string, string> } {
  const almacen = new Map<string, string>();
  const vinculos = opts.vinculos ?? [VINCULO];
  if (vinculos.length) almacen.set(CLAVE_VINCULOS_LOCAL, serializarVinculos(vinculos, "local"));
  const deps: DepsMotorSync = {
    ahora: () => T,
    nuevoId: () => "id",
    neuronaPropia: () => YO.neurona,
    yo: async () => YO,
    miCuenta: async () => "u-1",
    firmar: async (m) => ({ firmado: true, m }),
    verificar: async (s) => ({ cuerpo: (s as { m?: unknown }).m, huella: "id:tab", valido: true }),
    nativa: {
      disponible: () => true,
      estado: async () => ({
        escuchando: true,
        puerto: 47071,
        motivo: "",
        ultimo_seq: 0,
        vecinos: opts.vecino
          ? [{ ip: "192.168.1.20", propia: true, neurona: "tab-1", tipo: "android", puerto: 47071, canal: true, visto_hace_s: 2 }]
          : [],
      }),
      enviar: async () => ({ ok: true, ms: 4 }),
    },
    transporte: {
      enviar: async () => ({ ok: false, confirmado: false, tipo: null, ms: 0 }),
      releCuenta: async () => ({ ok: false }),
      enlacesHacia: async () => [],
      enLinea: () => false,
    },
    almacen: { leer: (k) => almacen.get(k) ?? null, escribir: (k, v) => void almacen.set(k, v) },
  };
  const motor = crearMotorSync(deps);
  __fijarMotorSyncParaPruebas(motor);
  return { motor, almacen };
}

const envuelto = (el: React.ReactElement) => el;

afterEach(() => {
  cleanup();
  __fijarMotorSyncParaPruebas(null);
});

describe("PanelVinculo", () => {
  test("una neurona no vinculada lo dice y no inventa vías", () => {
    montar({ vinculos: [] });
    render(envuelto(<PanelVinculo neurona="otra" ambito={{ propia: false }} />));
    expect(screen.getByTestId("panel-vinculo-vacio").textContent).toContain("No está vinculada todavía");
    expect(screen.getByTestId("panel-vinculo-vacio").textContent).toContain("De otra cuenta · anónima");
  });

  test("vinculada y en tu red: vía disponible «sin medir»; «Medir ahora» mide por la red local", async () => {
    const { motor } = montar({ vecino: true });
    render(envuelto(<PanelVinculo neurona="tab-1" ambito={{ propia: true }} />));
    await act(async () => {
      await motor.refrescarRed();
    });
    expect(screen.getByText("Tablet de Alex")).toBeTruthy();
    expect(screen.getByText("con camino ahora")).toBeTruthy();
    expect(screen.getByText("Personal · privada", { exact: false })).toBeTruthy();
    expect(screen.getAllByText("sin medir").length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("button", { name: /Medir ahora/ }));
    await waitFor(() => expect(screen.getByText("4 ms")).toBeTruthy());
  });

  test("capas de conciencia: las dos encendidas se dicen compartidas, las que solo yo tengo «solo tú»", async () => {
    montar({ vecino: true });
    render(envuelto(<PanelVinculo neurona="tab-1" ambito={{ propia: true }} />));
    // Sin preferencia guardada, mis cuatro capas cuentan como encendidas (regla del enrutador).
    expect(screen.getByText("Mesh · compartida")).toBeTruthy();
    expect(screen.getByText("Local · compartida")).toBeTruthy();
    expect(screen.getByText("Colectiva · compartida")).toBeTruthy();
    expect(screen.getByText("Nube · solo tú")).toBeTruthy();
    expect(screen.getByText("WebRTC")).toBeTruthy();
  });

  test("ajustes: «Reconectar sola» y una vía permitida se guardan en el motor", () => {
    const { motor, almacen } = montar();
    render(envuelto(<PanelVinculo neurona="tab-1" ambito={{ propia: true }} />));
    const interruptor = screen.getByRole("switch", { name: "Reconectar sola" });
    expect(interruptor.getAttribute("aria-checked")).toBe("true");
    fireEvent.click(interruptor);
    expect(motor.ajustes("tab-1").reconectarSola).toBe(false);

    fireEvent.click(screen.getByRole("checkbox", { name: "Relé cifrado" }));
    expect(motor.ajustes("tab-1").viasPermitidas).not.toContain("rele");
    expect(JSON.parse(almacen.get("starseed.malla.vinculos-ajustes.v1")!)["tab-1"].reconectarSola).toBe(false);
  });
});

describe("ListaVinculos", () => {
  test("sin vinculadas lo dice; con una, su mejor vía y el resumen", async () => {
    montar({ vinculos: [] });
    const a = render(envuelto(<ListaVinculos />));
    expect(a.getByText("Ninguna neurona vinculada todavía.")).toBeTruthy();
    cleanup();
    __fijarMotorSyncParaPruebas(null);

    const { motor } = montar({ vecino: true });
    render(envuelto(<ListaVinculos titulo="Neuronas vinculadas" />));
    await act(async () => {
      await motor.refrescarRed();
    });
    expect(screen.getByText("1 vinculada · 1 con camino ahora")).toBeTruthy();
    expect(screen.getByText(/Red local \(app nativa\) · sin medir · Android · app nativa/)).toBeTruthy();
  });
});
