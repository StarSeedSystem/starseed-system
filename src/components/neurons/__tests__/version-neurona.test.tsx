/**
 * (VER1107B) VersionNeurona: lo que anuncia cada neurona por la presencia, «Nueva versión disponible»,
 * «Pedir actualización» a otra neurona y las instrucciones para una que no lo entiende.
 */
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const presencia = vi.hoisted(() => ({ conectado: true, medios: [] as unknown[] }));
vi.mock("@/lib/neurons/presencia", () => ({ usePresenciaNeuronas: () => presencia }));
vi.mock("@/lib/actualizaciones/ultima-publicada", () => ({ useUltimaPublicada: () => ({ version: "v0.6.0" }) }));
vi.mock("@/lib/neurons/pedir-actualizacion", async (original) => ({
  ...(await original<typeof import("@/lib/neurons/pedir-actualizacion")>()),
  pedirActualizacion: vi.fn(async () => ({ ok: true, texto: "Pedido a «Tablet» por el canal de tu cuenta." })),
}));

import { VersionNeurona } from "../version-neurona";
import { EVENTO_BUSCAR_ACTUALIZACION, pedirActualizacion } from "@/lib/neurons/pedir-actualizacion";
import { registrarEnlaceLocal, type EnlaceLocalVivo } from "@/lib/malla/registro-enlaces-locales";

const medio = (n: string, extra: Record<string, unknown>) => ({ n, m: `${n}-m`, tipo: "app-nativa", etiqueta: "App", visible: true, desde: "", t: 1, s: {}, ...extra });

beforeEach(() => {
  presencia.medios = [];
  vi.mocked(pedirActualizacion).mockClear();
});
afterEach(() => cleanup());

describe("VersionNeurona", () => {
  it("otra neurona atrasada que entiende el pedido: versión, medio, aparato, aviso y «Pedir actualización»", async () => {
    presencia.medios = [
      medio("tablet", {
        sid: "sync-tablet",
        v: { nativa: "0.5.0" },
        d: { medio: "android", app: "os", so: "android", soV: "14", equipo: "Samsung SM-X200", pa: 1 },
      }),
    ];
    render(<VersionNeurona neuronaId="tablet" nombre="Tablet" miNombre="Mac" />);
    expect(screen.getByText(/Versión 0\.5\.0 · App de Android · StarSeed OS · Samsung SM-X200 · Android 14/)).toBeInTheDocument();
    expect(screen.getByText("Nueva versión disponible: 0.6.0")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Pedir actualización a Tablet" }));
    expect(pedirActualizacion).toHaveBeenCalledWith({ neurona: "tablet", nombre: "Tablet", syncDeviceId: "sync-tablet", version: "v0.6.0", miNombre: "Mac" });
    expect(await screen.findByRole("status")).toHaveTextContent("Pedido a «Tablet»");
  });

  it("neurona con una web anterior (sin `d`): no hay botón, se dice cómo actualizarla desde la Librería", () => {
    presencia.medios = [medio("vieja", { v: { nativa: "0.5.0" }, plataforma: "Windows" })];
    render(<VersionNeurona neuronaId="vieja" nombre="PC" />);
    expect(screen.getByText(/Versión 0\.5\.0 · Windows/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /pedir actualización/i })).not.toBeInTheDocument();
    expect(screen.getByText(/no entiende «Pedir actualización»/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Librería" })).toHaveAttribute("href", "/library");
  });

  it("neurona que no anuncia nada o no está abierta: «versión desconocida»", () => {
    render(<VersionNeurona neuronaId="nadie" nombre="Otra" />);
    expect(screen.getByText(/versión desconocida · no está abierta ahora/)).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("esta neurona: «Buscar actualizaciones» pide a la ventana que mire (el mismo camino)", async () => {
    presencia.medios = [medio("esta", { v: { nativa: "0.6.0" }, d: { medio: "escritorio", pa: 1 } })];
    const oido = vi.fn();
    window.addEventListener(EVENTO_BUSCAR_ACTUALIZACION, oido);
    render(<VersionNeurona neuronaId="esta" esEsta />);
    expect(screen.queryByText(/Nueva versión disponible/)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Buscar actualizaciones en esta neurona" }));
    expect(oido).toHaveBeenCalledTimes(1);
    window.removeEventListener(EVENTO_BUSCAR_ACTUALIZACION, oido);
  });
});

describe("(NEU1108A) la misma verdad que el radar", () => {
  it("la tableta sin internet con el enlace local vivo: «en línea · vía red local · 57 ms» y versión y aparato de su fila", () => {
    const baja = registrarEnlaceLocal({
      id: "local:tableta",
      par: { nombre: "Maggaboard", neuronDeviceId: "tablet", syncDeviceId: "sync-127", origen: "red-local-nativa" },
      desde: 1,
      abierto: () => true,
      rttMs: () => 57,
      ruta: () => "misma-red-local",
      capacidadKbps: () => null,
      enviar: () => true,
      enviarBinario: () => true,
      bufferedAmount: () => 0,
      alMensaje: () => () => undefined,
      ponerPistas: async () => true,
      alFlujoRemoto: () => () => undefined,
      cerrar: () => undefined,
    } as unknown as EnlaceLocalVivo);
    try {
      render(
        <VersionNeurona
          neuronaId="tablet"
          nombre="Maggaboard"
          capacidades={{ platform: "Android", aparato: { v: 1, medio: "android", app: "os", so: "android", soV: "14", equipo: "Samsung SM-X205", version: "0.5.0" } }}
        />,
      );
      expect(screen.getByTestId("estado-vivo")).toHaveTextContent("en línea · vía red local · 57 ms");
      expect(screen.getByText(/Versión 0\.5\.0 \(según su registro\) · App de Android · StarSeed OS · Samsung SM-X205 · Android 14/)).toBeInTheDocument();
      expect(screen.queryByText(/no está abierta ahora/)).not.toBeInTheDocument();
    } finally {
      baja();
    }
  });

  it("en la presencia de la cuenta: «en línea · vía internet»", () => {
    presencia.medios = [medio("pc", { v: { nativa: "0.6.0" }, d: { medio: "escritorio", app: "os", so: "macos", pa: 1 } })];
    render(<VersionNeurona neuronaId="pc" nombre="PC" />);
    expect(screen.getByTestId("estado-vivo")).toHaveTextContent("en línea · vía internet");
  });
});
