import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AppearanceProvider } from "@/context/appearance-context";
import type { PaqueteModelo } from "@/lib/traductor/tipos";
import type { DependenciasDescarga } from "@/lib/traductor/descargar";
import { GestorPaquetes, type GestorPaquetesProps } from "../gestor-paquetes";

const PAQUETES_EJEMPLO: PaqueteModelo[] = [
  {
    id: "es-en",
    par: { origen: "es", destino: "en" },
    motor: "marian-onnx",
    repo: "Xenova/opus-mt-es-en",
    bytes: 60_000_000,
    hash: "hash-verificado",
    version: "1.0.0",
    verificado: true,
  },
  {
    id: "en-es",
    par: { origen: "en", destino: "es" },
    motor: "marian-onnx",
    repo: "Xenova/opus-mt-en-es",
    bytes: 60_000_000,
    hash: "",
    version: "1.0.0",
    verificado: false,
  },
  {
    id: "fr-en",
    par: { origen: "fr", destino: "en" },
    motor: "marian-onnx",
    repo: "Xenova/opus-mt-fr-en",
    bytes: 60_000_000,
    hash: "hash-verificado",
    version: "1.0.0",
    verificado: true,
  },
];

function crearDepsDescarga(sobrescrituras: Partial<DependenciasDescarga> = {}): DependenciasDescarga {
  const almacen = {
    puedeGuardar: vi.fn(() => true),
    guardar: vi.fn(async () => {}),
    borrar: vi.fn(async () => {}),
    existe: vi.fn(async () => false),
  };
  const indice = {
    registrar: vi.fn(),
    quitar: vi.fn(),
  };
  const datosModelo = new Uint8Array(60_000_000);
  datosModelo.fill(65);

  return {
    fetch: vi.fn(async () => ({
      ok: true,
      status: 200,
      body: new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(datosModelo);
          controller.close();
        },
      }),
      headers: new Headers(),
      bodyUsed: false,
      arrayBuffer: async () => new ArrayBuffer(0),
      blob: async () => new Blob(),
      formData: async () => new FormData(),
      json: async () => ({}),
      text: async () => "",
      bytes: async () => new Uint8Array(0),
      clone: () => ({} as Response),
      redirected: false,
      type: "basic" as ResponseType,
      url: "",
    })) as DependenciasDescarga["fetch"],
    digest: vi.fn(async () => "hash-verificado") as DependenciasDescarga["digest"],
    almacen,
    indice,
    permitirNoVerificado: false,
    ...sobrescrituras,
  };
}

function renderGestor(props: Partial<GestorPaquetesProps> = {}) {
  const deps = crearDepsDescarga();
  const onDescargar = vi.fn(async (id: string, depsDescarga: DependenciasDescarga) => {
    // Simular descarga con progreso sincrónico para tests
    for (let i = 0; i <= 100; i += 25) {
      depsDescarga.alProgreso?.(i * 600_000, 60_000_000);
    }
  });
  return render(
    <AppearanceProvider>
      <GestorPaquetes
        paquetes={PAQUETES_EJEMPLO}
        instalados={["Xenova/opus-mt-es-en"]}
        topeBytes={200_000_000}
        persistente={false}
        conexionMedida={false}
        onDescargar={onDescargar}
        onQuitar={vi.fn()}
        onConfirmarMedida={vi.fn(async () => true)}
        depsDescarga={deps}
        {...props}
      />
    </AppearanceProvider>
  );
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval"] });
});
afterEach(() => {
  vi.useRealTimers();
  cleanup();
});

describe("GestorPaquetes", () => {
  describe("renderizado inicial", () => {
    it("muestra la lista de pares con tamaño, estado y botones", () => {
      renderGestor();
      expect(screen.getByText(/español → inglés/i)).toBeInTheDocument();
      expect(screen.getByText(/inglés → español/i)).toBeInTheDocument();
      expect(screen.getByText(/francés → inglés/i)).toBeInTheDocument();
      expect(screen.getAllByText(/60 MB/i).length).toBeGreaterThanOrEqual(3);
      expect(screen.getByRole("button", { name: /quitar español → inglés/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /descargar inglés → español/i })).toBeInTheDocument();
    });

    it("marca los instalados como 'Sin conexión'", () => {
      renderGestor();
      const badges = screen.getAllByText(/sin conexión/i);
      expect(badges.length).toBeGreaterThanOrEqual(1);
    });

    it("muestra etiqueta 'Sin verificar' en paquetes no verificados", () => {
      renderGestor();
      expect(screen.getByText(/sin verificar/i)).toBeInTheDocument();
    });

    it("muestra resumen de espacio 'Usado X de Y'", () => {
      renderGestor();
      expect(screen.getByText(/usado 60 mb de 200 mb/i)).toBeInTheDocument();
    });

    it("avisa 'Se perderá al cerrar' cuando el almacén no es persistente", () => {
      renderGestor({ persistente: false });
      const allText = screen.getByTestId("persistencia-aviso")?.textContent ?? "";
      expect(allText).toContain("perderá al cerrar");
    });

    it("no muestra aviso de persistencia cuando sí es persistente", () => {
      renderGestor({ persistente: true });
      expect(screen.queryByText((content, element) => 
        element.textContent?.includes("perderá al cerrar") ?? false
      )).not.toBeInTheDocument();
    });
  });

  describe("descarga", () => {
    it("muestra barra de progreso al descargar", async () => {
      renderGestor();
      fireEvent.click(screen.getByRole("button", { name: /descargar inglés → español/i }));
      await waitFor(() => {
        expect(screen.getByRole("progressbar")).toBeInTheDocument();
      });
      expect(screen.getByRole("button", { name: /cancelar/i })).toBeInTheDocument();
      vi.runAllTimers();
    });

    it("cancelar restaura el estado anterior", async () => {
      renderGestor();
      fireEvent.click(screen.getByRole("button", { name: /descargar inglés → español/i }));
      await waitFor(() => expect(screen.getByRole("progressbar")).toBeInTheDocument());
      fireEvent.click(screen.getByRole("button", { name: /cancelar/i }));
      await waitFor(() => {
        expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
      });
      expect(screen.getByRole("button", { name: /descargar inglés → español/i })).toBeInTheDocument();
      vi.runAllTimers();
    });

    it("pide confirmación al descargar paquete sin verificar", async () => {
      const confirmar = vi.fn(async () => true);
      renderGestor({ onConfirmarNoVerificado: confirmar });
      fireEvent.click(screen.getByRole("button", { name: /descargar inglés → español/i }));
      await waitFor(() => {
        expect(screen.getByRole("dialog")).toBeInTheDocument();
      });
      expect(screen.getByText(/sin verificar/i)).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: /confirmar/i }));
      await waitFor(() => expect(confirmar).toHaveBeenCalled());
    });

    it("pide confirmación en conexión medida con el tamaño", async () => {
      const confirmarMedida = vi.fn(async () => true);
      renderGestor({ conexionMedida: true, onConfirmarMedida: confirmarMedida });
      fireEvent.click(screen.getByRole("button", { name: /descargar francés → inglés/i }));
      await waitFor(() => {
        expect(screen.getByRole("dialog")).toBeInTheDocument();
      });
      expect(screen.getByText(/60 mb/i)).toBeInTheDocument();
      expect(screen.getByText(/conexión medida/i)).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: /continuar/i }));
      await waitFor(() => expect(confirmarMedida).toHaveBeenCalledWith(60_000_000));
    });
  });

  describe("quitar", () => {
    it("pide confirmación antes de quitar", async () => {
      const onQuitar = vi.fn();
      renderGestor({ onQuitar, instalados: ["Xenova/opus-mt-es-en", "Xenova/opus-mt-en-es"] });
      fireEvent.click(screen.getByRole("button", { name: /quitar español → inglés/i }));
      await waitFor(() => {
        expect(screen.getByRole("dialog")).toBeInTheDocument();
      });
      expect(screen.getByText(/quitar/i)).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: /confirmar/i }));
      await waitFor(() => expect(onQuitar).toHaveBeenCalledWith("es-en"));
    });

    it("no quita si se cancela la confirmación", async () => {
      const onQuitar = vi.fn();
      renderGestor({ onQuitar, instalados: ["Xenova/opus-mt-es-en"] });
      fireEvent.click(screen.getByRole("button", { name: /quitar español → inglés/i }));
      await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());
      fireEvent.click(screen.getByRole("button", { name: /cancelar/i }));
      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
      expect(onQuitar).not.toHaveBeenCalled();
    });
  });
});