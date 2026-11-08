/**
 * (1105 · VER1105J) Ventana «Hay una versión nueva» y su aviso en Notificaciones, con todo simulado.
 * (VER1107B) + la versión instalada que no es semver, «se está preparando» y «Ya tienes la X.Y.Z».
 */

import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const instalada = vi.hoisted(() => ({ medio: "escritorio", version: "0.3.0" as string | null }));
vi.mock("@/lib/actualizaciones/version-por-medio", () => ({
  leerInstalada: vi.fn(async () => ({ ...instalada, fuente: "getVersion", info: null })),
}));
vi.mock("@/lib/nativa/actualizador", () => ({
  actualizarEscritorio: vi.fn(),
  reiniciarParaActualizar: vi.fn(async () => ({ ok: true, valor: null })),
}));
// (VER1107B) En escritorio, antes de abrir, se pregunta al canal del updater SIN instalar.
vi.mock("@/lib/nativa/info-neurona", () => ({
  buscarActualizacionNativa: vi.fn(),
}));
// La escucha de pedidos de otras neuronas (red y firmas) se prueba aparte (pedir-actualizacion.test.ts).
vi.mock("@/lib/neurons/pedir-actualizacion", async (original) => ({
  ...(await original<typeof import("@/lib/neurons/pedir-actualizacion")>()),
  iniciarEscuchaPedidos: vi.fn(() => () => undefined),
}));

import { AvisoActualizacion, CLAVE_VISTAS, debeAvisar, limpiarVersion } from "../aviso-actualizacion";
import { actualizarEscritorio, reiniciarParaActualizar } from "@/lib/nativa/actualizador";
import { buscarActualizacionNativa } from "@/lib/nativa/info-neurona";
import { leerUltimaComprobacion } from "@/lib/actualizaciones/ultima-comprobacion";
import { EVENTO_BUSCAR_ACTUALIZACION, iniciarEscuchaPedidos } from "@/lib/neurons/pedir-actualizacion";
import { act } from "@testing-library/react";
import { getPendingNotifications } from "@/lib/notifications/update-notifications";
import { AppearanceProvider } from "@/context/appearance-context";

// DialogContent usa useAppearance: como en la app, la ventana vive dentro de su proveedor.
// (ACT1108B) La búsqueda automática espera ~20 s tras arrancar; aquí, 0 para no esperar de verdad.
const pintar = () => render(<AppearanceProvider><AvisoActualizacion inicioMs={0} /></AppearanceProvider>);

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
const canalOfrece = (disponible: string | null) =>
  vi.mocked(buscarActualizacionNativa).mockResolvedValue({
    estado: "ok",
    busqueda: { actual: "0.3.0", disponible, notas: disponible ? "Notas del canal" : null, fecha: null },
  });

beforeEach(() => {
  window.localStorage.clear();
  instalada.medio = "escritorio";
  instalada.version = "0.3.0";
  fetchFalso.mockClear();
  vi.stubGlobal("fetch", fetchFalso);
  vi.mocked(actualizarEscritorio).mockReset();
  vi.mocked(reiniciarParaActualizar).mockClear();
  vi.mocked(buscarActualizacionNativa).mockReset();
  canalOfrece("0.4.0");
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

  it("(VER1107B) con una versión instalada que no es semver (el build de la web) NUNCA avisa", () => {
    expect(debeAvisar("escritorio", "mvq6sg7z-kt91hk", "v0.5.0", {})).toBe(false);
    expect(debeAvisar("android", "build-123", "0.5.0", {})).toBe(false);
    expect(debeAvisar("escritorio", "0.5.0", "latest", {})).toBe(false);
    expect(debeAvisar("escritorio", "", "0.5.0", {})).toBe(false);
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
    expect(buscarActualizacionNativa).toHaveBeenCalledTimes(1);

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
    expect(buscarActualizacionNativa).not.toHaveBeenCalled();
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

  it("(VER1107B) sin versión instalada conocida no pregunta ni abre nada", async () => {
    instalada.version = null;
    pintar();
    await waitFor(() => expect(leerUltimaComprobacion()?.resultado).toBe("desconocida"));
    expect(fetchFalso).not.toHaveBeenCalled();
    expect(screen.queryByText("Hay una versión nueva")).not.toBeInTheDocument();
  });

  it("(VER1107B) publicada más nueva pero el canal de la app no la ofrece: «se está preparando», sin ventana", async () => {
    canalOfrece(null);
    pintar();
    await waitFor(() => expect(leerUltimaComprobacion()?.resultado).toBe("preparando"));
    expect(leerUltimaComprobacion()?.texto).toMatch(/0\.4\.0 está publicada, pero aún se está preparando/);
    expect(screen.queryByText("Hay una versión nueva")).not.toBeInTheDocument();
    const avisos = await getPendingNotifications();
    expect(avisos.some((n) => n.id === "update-app::v0.4.0")).toBe(false);
  });

  it("(VER1107B) app anterior sin buscar_actualizacion: decide con la lista (versión bien leída)", async () => {
    vi.mocked(buscarActualizacionNativa).mockResolvedValue({ estado: "sin-comando", motivo: "Command buscar_actualizacion not allowed by ACL" });
    pintar();
    expect(await screen.findByText("Hay una versión nueva")).toBeInTheDocument();
  });

  it("(VER1107B) «Actualizar ahora» y el updater dice al día: «Ya tienes la X.Y.Z» y la versión queda vista", async () => {
    vi.mocked(actualizarEscritorio).mockResolvedValue({
      ok: true,
      valor: { listaParaReiniciar: false, version: null, mensaje: "Ya estás en la última versión." },
    });
    pintar();
    await userEvent.click(await screen.findByRole("button", { name: /actualizar ahora/i }));
    expect(await screen.findByRole("status")).toHaveTextContent(/^Ya tienes la 0\.3\.0\./);
    expect(JSON.parse(window.localStorage.getItem(CLAVE_VISTAS) || "{}")).toHaveProperty("0.4.0");
    expect(leerUltimaComprobacion()?.resultado).toBe("al-dia");
    await userEvent.click(screen.getByRole("button", { name: /entendido/i }));
    await waitFor(() => expect(screen.queryByText("Hay una versión nueva")).not.toBeInTheDocument());
  });

  it("(VER1107B) un pedido («Buscar actualizaciones» u otra neurona) mira aunque ya se viera y dice quién lo pide", async () => {
    window.localStorage.setItem(CLAVE_VISTAS, JSON.stringify({ "0.4.0": 1 }));
    pintar();
    await waitFor(() => expect(leerUltimaComprobacion()?.texto).toMatch(/ya se te enseñó/));
    expect(screen.queryByText("Hay una versión nueva")).not.toBeInTheDocument();
    await waitFor(() => expect(iniciarEscuchaPedidos).toHaveBeenCalled());
    act(() => {
      window.dispatchEvent(new CustomEvent(EVENTO_BUSCAR_ACTUALIZACION, { detail: { pedidaPor: "Mac de Alex" } }));
    });
    expect(await screen.findByText(/Te lo pide «Mac de Alex»: tú decides si se instala/)).toBeInTheDocument();
    expect(actualizarEscritorio).not.toHaveBeenCalled();
  });
});
