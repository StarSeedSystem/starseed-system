// @vitest-environment jsdom
/**
 * PRM1109B · paso 5a del plan de permisos unificados
 * (`architecture/permisos-unificados.md` §4): la pestaña Privacidad deja de ser
 * un cuarto motor — consulta, se suscribe y pide SOLO por la API unificada de
 * `src/lib/aurora/senses/request-permission` (`consultarPermiso`, `pedirPermiso`,
 * `suscribirPermiso`). Los tres accesos van mockeados conservando lo real:
 * aquí se prueba la interfaz, sin red y sin navegador de verdad.
 */
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { EstadoPermiso, ResultadoPermisoOS } from "@/lib/permisos/contrato";
import type {
  EstadoPermisoDispositivo,
  PermisoDispositivo,
} from "@/lib/aurora/senses/request-permission";

vi.mock("@/lib/aurora/senses/request-permission", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/aurora/senses/request-permission")>();
  return {
    ...real,
    consultarPermiso: vi.fn(),
    pedirPermiso: vi.fn(),
    suscribirPermiso: vi.fn(),
  };
});

vi.mock("@/lib/astraura/astraura-158-client", () => {
  const sinRed = { ok: false as const, error: "sin red en pruebas", target: "local" as const, endpoint: "/api/privacy/settings" };
  return {
    fetchAstraura158Privacy: () => Promise.resolve(sinRed),
    updateAstraura158Privacy: () => Promise.resolve(sinRed),
    toggleAstraura158AirGap: () => Promise.resolve(sinRed),
  };
});

import { estadoTab, PrivacidadTab } from "@/components/astraura/s158/privacidad-tab";
import { consultarPermiso, pedirPermiso, suscribirPermiso } from "@/lib/aurora/senses/request-permission";

type Suscripcion = { permiso: PermisoDispositivo; cb: (estado: EstadoPermisoDispositivo) => void; off: () => void };
const suscripciones: Suscripcion[] = [];

function estadosFijos(porId: Partial<Record<PermisoDispositivo, EstadoPermiso>>) {
  vi.mocked(consultarPermiso).mockImplementation(async (id) => porId[id] ?? "no-disponible");
}

function renderTab() {
  return render(<PrivacidadTab target="local" refresh={() => {}} />);
}

afterEach(cleanup);

beforeEach(() => {
  suscripciones.length = 0;
  vi.mocked(pedirPermiso).mockReset();
  vi.mocked(suscribirPermiso).mockReset();
  vi.mocked(suscribirPermiso).mockImplementation((permiso, cb) => {
    const off = vi.fn();
    suscripciones.push({ permiso, cb, off });
    return off;
  });
});

describe("estadoTab (pura)", () => {
  it("traduce el contrato de permisos al vocabulario Permissions API de la pestaña", () => {
    expect(estadoTab("concedido")).toBe("granted");
    expect(estadoTab("denegado")).toBe("denied");
    expect(estadoTab("preguntar")).toBe("prompt");
    expect(estadoTab("no-disponible")).toBe("unsupported");
  });
});

describe("al montar", () => {
  it("consulta los cuatro sensores por la API unificada y pinta las insignias", async () => {
    estadosFijos({ ubicacion: "concedido", microfono: "denegado", camara: "preguntar", almacenamiento: "no-disponible" });
    renderTab();
    expect(consultarPermiso).toHaveBeenCalledWith("ubicacion");
    expect(consultarPermiso).toHaveBeenCalledWith("microfono");
    expect(consultarPermiso).toHaveBeenCalledWith("camara");
    expect(consultarPermiso).toHaveBeenCalledWith("almacenamiento");
    expect(await screen.findByText("concedido")).toBeInTheDocument();
    expect(screen.getByText("denegado")).toBeInTheDocument();
    expect(screen.getByText("pendiente")).toBeInTheDocument();
    expect(screen.getByText("no soportado en este navegador")).toBeInTheDocument();
  });
});

describe("en vivo", () => {
  it("se suscribe a los tres permisos consultables y el callback actualiza la insignia", async () => {
    estadosFijos({ ubicacion: "preguntar", microfono: "preguntar", camara: "preguntar" });
    renderTab();
    await screen.findAllByText("pendiente");
    expect(suscripciones.map((s) => s.permiso).sort()).toEqual(["camara", "microfono", "ubicacion"]);
    const micro = suscripciones.find((s) => s.permiso === "microfono");
    expect(micro).toBeDefined();
    act(() => micro?.cb("denied"));
    expect(screen.getByText("denegado")).toBeInTheDocument();
    expect(screen.getAllByText("pendiente")).toHaveLength(2);
  });
});

describe("al desmontar", () => {
  it("llama a los tres des-suscriptores", async () => {
    estadosFijos({ ubicacion: "preguntar", microfono: "preguntar", camara: "preguntar" });
    const { unmount } = renderTab();
    await screen.findAllByText("pendiente");
    expect(suscripciones).toHaveLength(3);
    unmount();
    expect(suscripciones.every((s) => (s.off as ReturnType<typeof vi.fn>).mock.calls.length > 0)).toBe(true);
  });
});

describe("pedir acceso", () => {
  it("el botón del micrófono pide por la API unificada y vuelve a consultar", async () => {
    estadosFijos({ ubicacion: "preguntar", microfono: "preguntar", camara: "preguntar" });
    vi.mocked(pedirPermiso).mockResolvedValue({ id: "microfono", estado: "concedido" } satisfies ResultadoPermisoOS);
    const usuario = userEvent.setup();
    renderTab();
    const boton = await screen.findByRole("button", { name: "Solicitar acceso: Micrófono" });
    const antes = vi.mocked(consultarPermiso).mock.calls.length;
    await usuario.click(boton);
    await waitFor(() => expect(pedirPermiso).toHaveBeenCalledWith("microfono"));
    await waitFor(() => expect(vi.mocked(consultarPermiso).mock.calls.length).toBeGreaterThan(antes + 3));
  });
});

describe("al desmontar", () => {
  it("llama a los tres des-suscriptores", async () => {
    estadosFijos({ ubicacion: "preguntar", microfono: "preguntar", camara: "preguntar" });
    const { unmount } = renderTab();
    await screen.findAllByText("pendiente");
    expect(suscripciones).toHaveLength(3);
    unmount();
    expect(suscripciones.every((s) => (s.off as ReturnType<typeof vi.fn>).mock.calls.length > 0)).toBe(true);
  });
});
