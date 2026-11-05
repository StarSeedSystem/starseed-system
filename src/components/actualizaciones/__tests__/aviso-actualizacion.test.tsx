/**
 * (1105 · VER1105J) Ventana «Hay una versión nueva» y su aviso en Notificaciones, con todo simulado.
 */

import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const instalada = vi.hoisted(() => ({ medio: "escritorio", version: "0.3.0" as string | null }));
vi.mock("@/lib/actualizaciones/version-por-medio", () => ({
  leerInstalada: vi.fn(async () => ({ ...instalada })),
}));
vi.mock("@/lib/nativa/actualizador", () => ({
  actualizarEscritorio: vi.fn(),
  reiniciarParaActualizar: vi.fn(async () => ({ ok: true, valor: null })),
}));

import { AvisoActualizacion, CLAVE_VISTAS, debeAvisar, limpiarVersion } from "../aviso-actualizacion";
import { actualizarEscritorio, reiniciarParaActualizar } from "@/lib/nativa/actualizador";
import { getPendingNotifications } from "@/lib/notifications/update-notifications";
import { AppearanceProvider } from "@/context/appearance-context";

// DialogContent usa useAppearance: como en la app, la ventana vive dentro de su proveedor.
const pintar = () => render(<AppearanceProvider><AvisoActualizacion /></AppearanceProvider>);

const VERSIONES = {
  versiones: [
    {
      version: "v0.4.0",
      fecha: "2026-11-06",
      notas: "Centro de Versiones y avisos de actualización.",
      url: "https://github.com/StarSeedSystem/starseed-system/releases/tag/v0.4.0",
      archivos: {
        os: {
          macos: [],
          windows: [],
          linux: [],
          android: [{ nombre: "StarSeed-os-0.4.0.apk", bytes: 1, href: "https://descargas.example/StarSeed-os-0.4.0.apk" }],
          ios: [],
        },
      },
    },
  ],
};

const fetchFalso = vi.fn(async () => new Response(JSON.stringify(VERSIONES), { status: 200 }));

beforeEach(() => {
  window.localStorage.clear();
  instalada.medio = "escritorio";
  instalada.version = "0.3.0";
  fetchFalso.mockClear();
  vi.stubGlobal("fetch", fetchFalso);
  vi.mocked(actualizarEscritorio).mockReset();
  vi.mocked(reiniciarParaActualizar).mockClear();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("debeAvisar (puro)", () => {
  it("solo en escritorio y Android, con una versión publicada más nueva y no vista", () => {
    expect(limpiarVersion(" v0.4.0 ")).toBe("0.4.0");
    expect(debeAvisar("escritorio", "0.3.0", "v0.4.0", {})).toBe(true);
    expect(debeAvisar("android", "v0.3.0", "v0.4.0", {})).toBe(true);
    expect(debeAvisar("escritorio", "0.4.0", "v0.4.0", {})).toBe(false);
    expect(debeAvisar("android", "0.5.0", "v0.4.0", {})).toBe(false);
    expect(debeAvisar("escritorio", "0.3.0", "v0.4.0", { "0.4.0": 1 })).toBe(false);
    for (const medio of ["web", "pwa", "ios"] as const) expect(debeAvisar(medio, "0.3.0", "v0.4.0", {})).toBe(false);
    expect(debeAvisar("escritorio", null, "v0.4.0", {})).toBe(false);
  });
});

describe("AvisoActualizacion", () => {
  it("en escritorio: abre la ventana, actualiza, ofrece reiniciar y deja el aviso en Notificaciones", async () => {
    vi.mocked(actualizarEscritorio).mockResolvedValue({
      ok: true,
      valor: { listaParaReiniciar: true, version: "0.4.0", mensaje: "Actualización a la versión 0.4.0 descargada." },
    });
    pintar();
    expect(await screen.findByText("Hay una versión nueva")).toBeInTheDocument();
    expect(screen.getByText(/StarSeed OS 0\.4\.0 está disponible desde el 2026-11-06/)).toBeInTheDocument();

    const avisos = await getPendingNotifications();
    expect(avisos.some((n) => n.id === "update-app::v0.4.0" && n.kind === "update-app")).toBe(true);

    await userEvent.click(screen.getByRole("button", { name: /actualizar ahora/i }));
    expect(actualizarEscritorio).toHaveBeenCalledTimes(1);
    const reiniciar = await screen.findByRole("button", { name: /reiniciar ahora/i });
    expect(screen.getByRole("status")).toHaveTextContent(/tus datos y ajustes se quedan/);
    await userEvent.click(reiniciar);
    expect(reiniciarParaActualizar).toHaveBeenCalledTimes(1);
  });

  it("si el updater falla, lo dice dentro de la ventana", async () => {
    vi.mocked(actualizarEscritorio).mockResolvedValue({ ok: false, motivo: "sin red con el servidor de actualizaciones" });
    pintar();
    await userEvent.click(await screen.findByRole("button", { name: /actualizar ahora/i }));
    expect(await screen.findByRole("status")).toHaveTextContent("sin red con el servidor de actualizaciones");
  });

  it("en Android abre el .apk de la misma firma", async () => {
    instalada.medio = "android";
    const abrir = vi.spyOn(window, "open").mockImplementation(() => null);
    pintar();
    await userEvent.click(await screen.findByRole("button", { name: /actualizar ahora/i }));
    expect(abrir).toHaveBeenCalledWith("https://descargas.example/StarSeed-os-0.4.0.apk", "_blank", "noopener");
    expect(actualizarEscritorio).not.toHaveBeenCalled();
    abrir.mockRestore();
  });

  it("«Más tarde» la cierra y no vuelve a salir para esa versión", async () => {
    const { unmount } = pintar();
    await userEvent.click(await screen.findByRole("button", { name: /más tarde/i }));
    await waitFor(() => expect(screen.queryByText("Hay una versión nueva")).not.toBeInTheDocument());
    expect(JSON.parse(window.localStorage.getItem(CLAVE_VISTAS) || "{}")).toHaveProperty("0.4.0");
    unmount();
    pintar();
    await waitFor(() => expect(fetchFalso).toHaveBeenCalledTimes(2));
    expect(screen.queryByText("Hay una versión nueva")).not.toBeInTheDocument();
  });

  it("en la web no abre nada ni pregunta (allí manda el banner del service worker)", async () => {
    instalada.medio = "web";
    pintar();
    await new Promise((r) => setTimeout(r, 30));
    expect(fetchFalso).not.toHaveBeenCalled();
    expect(screen.queryByText("Hay una versión nueva")).not.toBeInTheDocument();
  });
});
