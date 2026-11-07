/**
 * (VER1107B) Ajustes › Esta neurona: solo los datos que se conocen, «Buscar actualizaciones» (solo busca)
 * y «Actualizar» → «Reiniciar para aplicar» en escritorio.
 */
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const instalada = vi.hoisted(() => ({ valor: null as unknown }));
vi.mock("@/lib/actualizaciones/version-por-medio", () => ({ leerInstalada: vi.fn(async () => instalada.valor) }));
vi.mock("@/lib/actualizaciones/comprobar", () => ({ comprobarActualizacion: vi.fn() }));
vi.mock("@/lib/nativa/actualizador", () => ({
  actualizarEscritorio: vi.fn(),
  reiniciarParaActualizar: vi.fn(async () => ({ ok: true, valor: null })),
}));
vi.mock("@/components/nativa/estado-servidor-local", () => ({ EstadoServidorLocal: () => null }));

import { EstaNeurona, filasEstaNeurona, textoResultado } from "./esta-neurona";
import { comprobarActualizacion } from "@/lib/actualizaciones/comprobar";
import { actualizarEscritorio, reiniciarParaActualizar } from "@/lib/nativa/actualizador";
import { AppearanceProvider } from "@/context/appearance-context";

// Card usa useAppearance: como en la app, dentro de su proveedor.
const pintar = () => render(<AppearanceProvider><EstaNeurona /></AppearanceProvider>);

const INFO = {
  app_version: "0.5.0",
  app_nombre: "StarSeed OS",
  identificador: "app.starseed.os",
  sistema: "os",
  plataforma: "macos",
  so_version: "15.1.0",
  arquitectura: "aarch64",
  equipo: "MacBook-de-Alex",
  modelo: null,
  tauri_version: "2.12.5",
  escritorio: true,
  actualizador: true,
};
const ESCRITORIO = { medio: "escritorio", version: "0.5.0", fuente: "info_neurona", info: INFO };
const WEB_JSON = { build: "mvq6sg7z-kt91hk", sha: "abcdef1234567", version: "2026.11.06" };

beforeEach(() => {
  window.localStorage.clear();
  instalada.valor = ESCRITORIO;
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(WEB_JSON), { status: 200 })));
  vi.mocked(comprobarActualizacion).mockReset();
  vi.mocked(actualizarEscritorio).mockReset();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("filasEstaNeurona (puro)", () => {
  it("solo lo que se conoce, nada inventado", () => {
    expect(filasEstaNeurona(ESCRITORIO as never, { build: "b1", sha: "abcdef1234567", version: "2026.11.06" })).toEqual([
      { etiqueta: "Versión de la app", valor: "0.5.0" },
      { etiqueta: "Medio", valor: "App de escritorio · StarSeed OS" },
      { etiqueta: "Web", valor: "build b1 (2026.11.06 · abcdef1)" },
      { etiqueta: "Sistema operativo", valor: "macOS 15.1.0" },
      { etiqueta: "Arquitectura", valor: "aarch64" },
      { etiqueta: "Equipo", valor: "MacBook-de-Alex" },
      { etiqueta: "Tauri", valor: "2.12.5" },
    ]);
    // App anterior (getVersion): versión y medio, sin sistema ni Tauri.
    expect(filasEstaNeurona({ medio: "escritorio", version: "0.4.3", fuente: "getVersion", info: null }, null)).toEqual([
      { etiqueta: "Versión de la app", valor: "0.4.3" },
      { etiqueta: "Medio", valor: "App de escritorio" },
    ]);
    // Navegador: el build de la web NO es la versión de la app.
    expect(filasEstaNeurona({ medio: "web", version: "mvq6sg7z-kt91hk", fuente: "version.json", info: null }, null)).toEqual([
      { etiqueta: "Medio", valor: "Navegador" },
    ]);
  });

  it("textoResultado", () => {
    const base = { medio: "escritorio" as const, instalada: "0.5.0", publicada: "0.6.0", fecha: "", notas: "" };
    expect(textoResultado({ ...base, decision: { tipo: "ventana", version: "0.6.0", origen: "updater", apk: null } })).toBe(
      "StarSeed OS 0.6.0 está lista para instalar (tienes la 0.5.0).",
    );
    expect(textoResultado({ ...base, decision: { tipo: "preparando", version: "0.6.0", texto: "se prepara" } })).toBe("se prepara");
  });
});

describe("EstaNeurona", () => {
  it("escritorio: busca sin instalar, ofrece «Actualizar» y luego «Reiniciar para aplicar»", async () => {
    vi.mocked(comprobarActualizacion).mockResolvedValue({
      medio: "escritorio",
      instalada: "0.5.0",
      publicada: "0.6.0",
      decision: { tipo: "ventana", version: "0.6.0", origen: "updater", apk: null },
      fecha: "",
      notas: "",
    });
    vi.mocked(actualizarEscritorio).mockResolvedValue({ ok: true, valor: { listaParaReiniciar: true, version: "0.6.0", mensaje: "" } });
    pintar();
    expect(await screen.findByText("MacBook-de-Alex")).toBeInTheDocument();
    expect(screen.getByText("build mvq6sg7z-kt91hk (2026.11.06 · abcdef1)")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /buscar actualizaciones/i }));
    expect(comprobarActualizacion).toHaveBeenCalledWith({ forzar: true });
    expect(actualizarEscritorio).not.toHaveBeenCalled();
    expect(screen.getByRole("status")).toHaveTextContent("StarSeed OS 0.6.0 está lista para instalar");
    await userEvent.click(screen.getByRole("button", { name: "Actualizar a la 0.6.0" }));
    await userEvent.click(await screen.findByRole("button", { name: "Reiniciar para aplicar" }));
    expect(reiniciarParaActualizar).toHaveBeenCalledTimes(1);
  });

  it("publicada pero sin preparar: lo dice y no ofrece «Actualizar»", async () => {
    vi.mocked(comprobarActualizacion).mockResolvedValue({
      medio: "escritorio",
      instalada: "0.5.0",
      publicada: "0.6.0",
      decision: { tipo: "preparando", version: "0.6.0", texto: "StarSeed OS 0.6.0 está publicada, pero aún se está preparando para este sistema." },
      fecha: "",
      notas: "",
    });
    pintar();
    await userEvent.click(await screen.findByRole("button", { name: /buscar actualizaciones/i }));
    expect(screen.getByRole("status")).toHaveTextContent(/aún se está preparando/);
    expect(screen.queryByRole("button", { name: /actualizar a la/i })).not.toBeInTheDocument();
  });

  it("en el navegador no hay botones de app nativa", async () => {
    instalada.valor = { medio: "web", version: "mvq6sg7z-kt91hk", fuente: "version.json", info: null };
    pintar();
    expect(await screen.findByText(/la versión nueva llega sola/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /buscar actualizaciones/i })).not.toBeInTheDocument();
  });
});
