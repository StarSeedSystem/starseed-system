import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Sin red: las ventanas por sistema, cuando no reciben release, usan el respaldo del OS.
vi.mock("@/lib/apps-oficiales/ultima-version", async () => {
  const real = await vi.importActual<typeof import("@/lib/apps-oficiales/apps-oficiales")>(
    "@/lib/apps-oficiales/apps-oficiales",
  );
  return {
    useUltimaVersion: (id: string) => {
      const app = real.APPS_OFICIALES[id];
      return app
        ? { release: app.respaldo, instalables: [], origen: "respaldo", cargando: false }
        : { release: null, instalables: [], origen: "respaldo", cargando: false };
    },
    obtenerUltimaVersion: async () => null,
  };
});

import { VersionesOs, esPosteriorAEstaVersion, normalizarRespuestaVersiones } from "../versiones-os";
import { AppearanceProvider } from "@/context/appearance-context";
import { OS_FECHA, OS_VERSION } from "@/lib/version/os-release";

const BASE = "https://github.com/StarSeedSystem/starseed-system/releases/download/v9.0.0";
const archivo = (nombre: string, bytes: number) => ({ nombre, bytes, href: `${BASE}/${nombre}` });

/** Una fecha siempre POSTERIOR a esta compilación (la prueba no caduca al subir OS_FECHA). */
const FUTURA = `${Number(OS_FECHA.slice(0, 4)) + 1}-01-15`;

/** La forma REAL de /api/os/versiones: lista de versiones con los archivos agrupados por sistema. */
function respuestaApi(fecha: string) {
  return {
    versiones: [
      {
        version: "v9.0.0",
        fecha,
        notas: "Actualización de seguridad y nuevas features",
        url: "https://github.com/StarSeedSystem/starseed-system/releases/tag/v9.0.0",
        archivos: {
          os: {
            macos: [archivo("StarSeed.OS_9.0.0_universal.dmg", 7_025_536)],
            windows: [archivo("StarSeed.OS_9.0.0_x64-setup.exe", 2_516_582), archivo("StarSeed.OS_9.0.0_x64_en-US.msi", 3_460_352)],
            linux: [archivo("StarSeed.OS_9.0.0_amd64.AppImage", 81_800_000), archivo("StarSeed.OS_9.0.0_amd64.deb", 3_774_874)],
            android: [archivo("StarSeed-os-9.0.0.apk", 28_665_472)],
            ios: [],
          },
        },
      },
      {
        version: "v8.9.0",
        fecha: "2026-10-01",
        notas: "Versión anterior",
        url: "https://github.com/StarSeedSystem/starseed-system/releases/tag/v8.9.0",
        archivos: { os: { macos: [], windows: [], linux: [], android: [], ios: [] } },
      },
    ],
    generadoEn: "2026-11-07T00:00:00Z",
  };
}

let respuesta: { status: number; body: unknown };
let llamadas = 0;

beforeEach(() => {
  llamadas = 0;
  respuesta = { status: 200, body: respuestaApi(FUTURA) };
  vi.stubGlobal("fetch", async (input: RequestInfo) => {
    const url = typeof input === "string" ? input : input.url;
    if (url.includes("/api/os/versiones")) {
      llamadas += 1;
      return new Response(JSON.stringify(respuesta.body), {
        status: respuesta.status,
        headers: { "Content-Type": "application/json; charset=utf-8" },
      });
    }
    return new Response(null, { status: 404 });
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function pintar() {
  return render(
    <AppearanceProvider>
      <VersionesOs />
    </AppearanceProvider>,
  );
}

describe("VersionesOs - Centro de versiones", () => {
  it("muestra la versión instalada (fuente única) y la nueva disponible con Actualizar", async () => {
    pintar();
    expect(screen.getByText("Versión instalada")).toBeInTheDocument();
    expect(screen.getByText(OS_VERSION)).toBeInTheDocument();
    expect(await screen.findByText("Actualización disponible")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Actualizar" })).toBeInTheDocument();
    // El símbolo de StarSeed encabeza el Centro de versiones.
    expect(screen.getAllByAltText("StarSeed").length).toBeGreaterThanOrEqual(1);
  });

  it("pulsar Actualizar avisa al actualizador con la versión publicada", async () => {
    const avisos: unknown[] = [];
    const oir = (e: Event) => avisos.push((e as CustomEvent).detail);
    window.addEventListener("starseed:actualizar-version", oir);
    pintar();
    fireEvent.click(await screen.findByRole("button", { name: "Actualizar" }));
    window.removeEventListener("starseed:actualizar-version", oir);
    expect(avisos).toEqual([{ version: "v9.0.0" }]);
  });

  it("muestra el historial de versiones", async () => {
    pintar();
    expect(await screen.findByText("Historial de versiones")).toBeInTheDocument();
    expect(screen.getByText(/Actualización de seguridad/)).toBeInTheDocument();
    expect(screen.getByText("Versión anterior")).toBeInTheDocument();
    expect(screen.getByText("Última")).toBeInTheDocument();
  });

  it("muestra los archivos por sistema con tamaño y enlace directo", async () => {
    pintar();
    expect(await screen.findByText("Archivos por sistema")).toBeInTheDocument();
    const mac = screen.getByTestId("ventana-os-macos");
    const enlace = mac.querySelector(`a[href="${BASE}/StarSeed.OS_9.0.0_universal.dmg"]`);
    expect(enlace).not.toBeNull();
    expect(enlace?.textContent).toMatch(/Descargar \.dmg/);
    expect(mac.textContent).toContain("6,7 MB");
    expect(screen.getByTestId("ventana-os-windows").textContent).toContain(".msi");
    expect(screen.getAllByText(/Descargar/i).length).toBeGreaterThanOrEqual(4);
  });

  it("con una versión publicada que no es posterior a esta, dice que está al día y no ofrece Actualizar", async () => {
    respuesta = { status: 200, body: respuestaApi(OS_FECHA) };
    pintar();
    expect(await screen.findByText(/Al día/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Actualizar" })).toBeNull();
  });

  it("si la API falla, lo dice dentro del bloque, deja reintentar y sigue ofreciendo las descargas", async () => {
    respuesta = { status: 500, body: {} };
    pintar();
    const reintentar = await screen.findByRole("button", { name: "Reintentar" });
    expect(screen.getByRole("alert").textContent).toContain("No se pudo cargar el historial");
    // Las ventanas por sistema usan la última versión conocida.
    expect(screen.getByTestId("ventanas-descarga-os")).toBeInTheDocument();
    respuesta = { status: 200, body: respuestaApi(FUTURA) };
    fireEvent.click(reintentar);
    expect(await screen.findByText("Actualización disponible")).toBeInTheDocument();
    expect(llamadas).toBe(2);
  });

  it("muestra estado de carga inicialmente", () => {
    pintar();
    expect(screen.getByText("Cargando información de versiones…")).toBeInTheDocument();
  });
});

describe("normalizarRespuestaVersiones", () => {
  it("lee la forma real de la API (archivos agrupados por sistema) y el aviso", () => {
    const r = normalizarRespuestaVersiones({ ...respuestaApi(FUTURA), aviso: "GitHub no disponible" });
    expect(r.aviso).toBe("GitHub no disponible");
    expect(r.versiones.map((v) => v.version)).toEqual(["v9.0.0", "v8.9.0"]);
    expect(r.versiones[0].archivos).toHaveLength(6);
    expect(r.versiones[0].archivos[0]).toEqual({
      nombre: "StarSeed.OS_9.0.0_universal.dmg",
      url: `${BASE}/StarSeed.OS_9.0.0_universal.dmg`,
      bytes: 7_025_536,
    });
  });

  it("acepta la forma antigua (una versión suelta con los archivos de GitHub en lista)", () => {
    const r = normalizarRespuestaVersiones({
      version: "2026.11.05",
      fecha: "2026-11-05",
      notas: "n",
      url: "u",
      archivos: { os: [{ nombre: "StarSeed-os-2026.11.05.apk", browser_download_url: "https://x/a.apk", size: 10 }] },
    });
    expect(r.versiones).toHaveLength(1);
    expect(r.versiones[0].archivos).toEqual([{ nombre: "StarSeed-os-2026.11.05.apk", url: "https://x/a.apk", bytes: 10 }]);
  });

  it("nunca lanza con basura", () => {
    expect(normalizarRespuestaVersiones(null)).toEqual({ versiones: [] });
    expect(normalizarRespuestaVersiones("x")).toEqual({ versiones: [] });
    expect(normalizarRespuestaVersiones({ versiones: [null, 3, { version: "" }] })).toEqual({ versiones: [] });
  });

  it("esPosteriorAEstaVersion compara fechas AAAA-MM-DD y es tolerante", () => {
    expect(esPosteriorAEstaVersion("2026-11-07", "2026-11-06")).toBe(true);
    expect(esPosteriorAEstaVersion("2026-11-06", "2026-11-06")).toBe(false);
    expect(esPosteriorAEstaVersion("2026-11-07T10:00:00Z", "2026-11-06")).toBe(true);
    expect(esPosteriorAEstaVersion("", "2026-11-06")).toBe(false);
    expect(esPosteriorAEstaVersion("basura", "2026-11-06")).toBe(false);
  });
});
