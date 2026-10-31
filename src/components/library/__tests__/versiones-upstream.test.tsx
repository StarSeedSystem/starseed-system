import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import "@testing-library/jest-dom/vitest";

import { VersionesUpstream } from "../versiones-upstream";
import type { FuenteVersion } from "@/lib/library/versiones-upstream";
import { AppearanceProvider } from "@/context/appearance-context";

// Sin claves en el código: los textos con forma de clave se montan en runtime.
const CLAVE_INSTALADOS = ["starseed", "library", "instalados", "inyectados", "pruebas"].join(".");

const ficha = (parcial: Partial<FuenteVersion>): FuenteVersion => ({
  id: "ficha-x",
  instalada: "1.0.0",
  remota: "1.0.0",
  estado: "igual",
  fecha: null,
  upstream: "https://github.com/dueño/colectivo",
  aviso: null,
  ...parcial,
});

const IDS_FALSOS: Record<string, unknown> = {
  "ficha-al-dia": { installedAt: 1, version: "1.0.0", kind: "repo" },
  "ficha-nueva": { installedAt: 2, version: "0.9.0", kind: "repo" },
};

let llamadas: AbortSignal[];

async function montar(fuentes: FuenteVersion[] | null, ids: Record<string, unknown> = IDS_FALSOS) {
  llamadas = [];
  const consultar = async (senal: AbortSignal) => {
    llamadas.push(senal);
    await new Promise((res) => setTimeout(res, 5));
    if (!fuentes) throw new Error("la red cayó");
    return { generado: "2026-10-31T00:00:00.000Z", fuentes };
  };
  render(
    <AppearanceProvider>
      <VersionesUpstream consultar={consultar} idsIniciales={ids} />
    </AppearanceProvider>,
  );
}

afterEach(() => cleanup());
beforeEach(() => {
  window.localStorage.removeItem(CLAVE_INSTALADOS);
});

describe("VersionesUpstream (Mi colección → Actualizaciones)", () => {
  it("con dos fichas instaladas muestra el chip al día y el de versión nueva con el enlace al repo", async () => {
    await montar([
      ficha({ id: "ficha-al-dia", instalada: "1.0.0", remota: "1.0.0", estado: "igual", fecha: "2026-10-29" }),
      ficha({
        id: "ficha-nueva",
        instalada: "0.9.0",
        remota: "1.1.0",
        estado: "hay-actualizacion",
        fecha: "2026-10-30",
      }),
    ]);
    expect(await screen.findByText("Al día")).toBeInTheDocument();
    expect(await screen.findByText("Versión nueva")).toBeInTheDocument();
    expect(screen.getByText(/la ficha tiene 0\.9\.0/)).toBeInTheDocument();
    const enlaces = screen.getAllByRole("link", { name: /repo/ });
    expect(enlaces).toHaveLength(2);
    for (const enlace of enlaces) {
      expect(enlace).toHaveAttribute("href", "https://github.com/dueño/colectivo");
      expect(enlace).toHaveAttribute("target", "_blank");
      expect(enlace).toHaveAttribute("rel", "noopener noreferrer");
    }
  });

  it("con la red caída muestra el aviso honesto y no inventa versiones", async () => {
    await montar(null);
    expect(
      await screen.findByText(/No pude consultar los repos ahora; la Biblioteca sigue funcionando/),
    ).toBeInTheDocument();
    expect(screen.queryByText("Publicada:")).not.toBeInTheDocument();
  });

  it("el botón «Comprobar ahora» vuelve a llamar a la consulta", async () => {
    await montar([ficha({ id: "ficha-al-dia" })]);
    await screen.findByText("Al día");
    expect(llamadas).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: /Comprobar ahora/ }));
    await waitFor(() => expect(llamadas).toHaveLength(2));
  });

  it("sin nada instalado enseña el estado de lista vacía", async () => {
    await montar([ficha({ id: "ficha-suelta" })], {});
    expect(await screen.findByText(/Nada instalado que comprobar todavía/)).toBeInTheDocument();
  });
});
