// @vitest-environment jsdom
/**
 * MallaNeuronasPanel — Ola 366. Renderiza los dispositivos propios (con su
 * enlace WebRTC) y las neuronas cercanas de otras cuentas, leyendo el estado
 * publicado por el motor (aquí sustituido por un mock: el panel es de solo
 * lectura, no debe arrancar nada por sí mismo).
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import type { MallaNeuronasState } from "@/lib/network/malla-neuronas";

let estado: MallaNeuronasState = { misDispositivos: [], cercanas: [], loading: false };

vi.mock("@/lib/network/malla-neuronas", async () => {
  const actual = await vi.importActual<typeof import("@/lib/network/malla-neuronas")>(
    "@/lib/network/malla-neuronas",
  );
  return {
    ...actual,
    useMallaNeuronasEstado: () => estado,
  };
});

describe("MallaNeuronasPanel", () => {
  test("pinta los dispositivos propios (con su estado de enlace) y las cercanas de otras cuentas", async () => {
    estado = {
      loading: false,
      misDispositivos: [
        {
          neuronId: "n-yo",
          syncDeviceId: "s-yo",
          nombre: "Mi Mac",
          plataforma: "macOS",
          tipo: "desktop",
          online: true,
          esEsteDispositivo: true,
          enlace: { estado: "conectado" },
        },
        {
          neuronId: "n-tablet",
          syncDeviceId: "s-tablet",
          nombre: "Neurona Maggaboard",
          plataforma: "Android",
          tipo: "tablet",
          online: true,
          esEsteDispositivo: false,
          enlace: { estado: "conectado", latenciaMs: 42 },
        },
      ],
      cercanas: [
        { deviceId: "dev-x", etiqueta: "Neurona anónima", detectadaHaceMs: 60_000, ofreceInternetPublico: false },
      ],
    };

    const { MallaNeuronasPanel } = await import("@/components/network/malla-neuronas-panel");
    render(<MallaNeuronasPanel />);

    // Pestaña "Tu malla" por defecto: los dos dispositivos propios.
    expect(screen.getByText("Mi Mac")).toBeTruthy();
    expect(screen.getByText("Neurona Maggaboard")).toBeTruthy();
    // Coincidencia EXACTA (no regex): evita que un ancestro con más texto
    // también "contenga" la subcadena y dispare un falso "multiple elements".
    expect(screen.getByText("conectado · 42 ms")).toBeTruthy();
    expect(screen.getByText("este dispositivo")).toBeTruthy();

    // La pestaña de cercanas existe y anuncia el conteo correcto.
    expect(screen.getByText("Cercanas de otras cuentas (1)")).toBeTruthy();
  });

  test("(Ola 367) muestra «Sirve Astraura 1.58» solo en el dispositivo cuya ficha lo anuncia", async () => {
    estado = {
      loading: false,
      misDispositivos: [
        {
          neuronId: "n-mac",
          syncDeviceId: "s-mac",
          nombre: "Mac de Alex",
          plataforma: "macOS",
          tipo: "desktop",
          online: true,
          esEsteDispositivo: false,
          enlace: { estado: "conectado" },
          ficha: {
            v: 1,
            syncDeviceId: "s-mac",
            neuronDeviceId: "n-mac",
            nombre: "Mac de Alex",
            tipo: "desktop",
            plataforma: "macOS",
            versionOS: "0.2.2",
            ramClase: "8 GB",
            backendLocal: true,
            capas: { local: true, mesh: true, nube: true, colectiva: true },
            at: Date.now(),
            sirveAstraura: true,
            astrauraLatenciaMs: 37,
          },
        },
        {
          neuronId: "n-tablet",
          syncDeviceId: "s-tablet",
          nombre: "Tablet de Alex",
          plataforma: "Android",
          tipo: "tablet",
          online: true,
          esEsteDispositivo: false,
          enlace: { estado: "conectado" },
        },
      ],
      cercanas: [],
    };

    const { MallaNeuronasPanel } = await import("@/components/network/malla-neuronas-panel");
    render(<MallaNeuronasPanel />);

    expect(screen.getByText("Sirve Astraura 1.58 · 37 ms")).toBeTruthy();
  });

  test("degrada a listas vacías sin motor montado (nunca inventa presencia)", async () => {
    estado = { misDispositivos: [], cercanas: [], loading: false };
    const { MallaNeuronasPanel } = await import("@/components/network/malla-neuronas-panel");
    render(<MallaNeuronasPanel />);
    expect(
      screen.getByText("Sin sesión, o aún no se ha registrado ninguna neurona en esta cuenta."),
    ).toBeTruthy();
  });
});
