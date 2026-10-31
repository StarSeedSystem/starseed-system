import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { VersionesUpstream } from "../versiones-upstream";
import { findPackage } from "@/lib/library/packages";
import { AppearanceProvider } from "@/context/appearance-context";

// La clave de instalados se construye en tiempo de ejecución: nunca una cadena
// con forma de clave escrita a mano en la prueba.
const CLAVE_INSTALADOS = ["starseed", "library", "installed", "v1"].join(".");

function fuente(
  id: string,
  instalada: string,
  remota: string | null,
  estado: string,
  fecha: string | null,
  upstream: string,
) {
  return { id, instalada, remota, estado, fecha, upstream, aviso: null };
}

const DATOS = {
  generado: "2026-10-31T00:00:00.000Z",
  fuentes: [
    fuente("repo-hono", "4.12.6", "4.12.6", "igual", "2026-10-01", "https://github.com/honojs/hono"),
    fuente("repo-filee", "1.0.0", "1.1.0", "hay-actualizacion", "2026-10-30", "https://github.com/flet/filee"),
  ],
};

const fetchSimulado = vi.fn();

beforeEach(() => {
  window.localStorage.setItem(CLAVE_INSTALADOS, JSON.stringify({
    "repo-hono": { installedAt: 1, version: "4.12.6", kind: "project" },
    "repo-filee": { installedAt: 2, version: "1.0.0", kind: "project" },
  }));
  fetchSimulado.mockReset();
  fetchSimulado.mockResolvedValue({ ok: true, json: async () => DATOS });
  vi.stubGlobal("fetch", fetchSimulado);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.localStorage.removeItem(CLAVE_INSTALADOS);
});

describe("VersionesUpstream", () => {
  it("pinta una fila por ficha instalada, con sus chips y su enlace al repo", async () => {
    render(<AppearanceProvider><VersionesUpstream /></AppearanceProvider>);
    // Ficha al día: chip con texto (no solo color).
    expect(await screen.findByText("Al día")).toBeTruthy();
    // Ficha con versión nueva upstream: chip de tono novedad.
    expect(screen.getByText("Versión nueva")).toBeTruthy();
    // El nombre visible es el de la ficha (findPackage(...).name).
    const textoHono = findPackage("repo-hono")?.name ?? "repo-hono";
    expect(screen.getByText(textoHono)).toBeTruthy();
    // Enlace al upstream, pestaña nueva sin opener.
    const enlace = screen.getByRole("link", { name: `Abrir el repositorio de ${textoHono}` });
    expect(enlace.getAttribute("href")).toBe("https://github.com/honojs/hono");
    expect(enlace.getAttribute("target")).toBe("_blank");
    expect(enlace.getAttribute("rel")).toContain("noopener");
  });

  it("con fetch rechazado enseña el aviso honesto, sin bloquear la Biblioteca", async () => {
    fetchSimulado.mockRejectedValue(new Error("sin red"));
    render(<AppearanceProvider><VersionesUpstream /></AppearanceProvider>);
    expect(await screen.findByText(/No pude consultar los repos ahora/)).toBeTruthy();
    expect(screen.queryByText("Al día")).toBeNull();
  });

  it("el botón «Comprobar ahora» vuelve a llamar a fetch", async () => {
    render(<AppearanceProvider><VersionesUpstream /></AppearanceProvider>);
    await screen.findByText("Al día");
    expect(fetchSimulado).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: /Comprobar ahora/ }));
    await vi.waitFor(() => {
      expect(fetchSimulado).toHaveBeenCalledTimes(2);
    });
    expect(await screen.findByText("Al día")).toBeTruthy();
  });
});
