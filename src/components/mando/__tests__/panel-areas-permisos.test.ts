"use client";

import { describe, it, expect, vi } from "vitest";
import { estadoNavegador, leerPermisos } from "../panel-areas";
import { consultarPermiso } from "@/lib/aurora/senses/request-permission";

vi.mock("@/lib/aurora/senses/request-permission", async (importOriginal) => {
  const actual = await importOriginal<typeof consultarPermiso>();
  return {
    __esModule: true,
    ...actual,
    consultarPermiso: vi.fn<typeof consultarPermiso>(),
  };
});

describe("estadoNavegador", () => {
  it("mapea los estados de permiso al estado del navegador", () => {
    expect(estadoNavegador("concedido")).toBe("otorgado");
    expect(estadoNavegador("denegado")).toBe("denegado");
    expect(estadoNavegador("preguntar")).toBe("pendiente");
    expect(estadoNavegador("no-disponible")).toBe("desconocido");
  });
});

describe("leerPermisos", () => {
  it("devuelve el estado esperado cuando un permiso está concedido, denegado y pendiente", async () => {
    const consultarPermisoMock = vi.mocked(consultarPermiso);
    consultarPermisoMock.mockImplementation((id) => {
      switch (id) {
        case "microfono": return Promise.resolve("concedido");
        case "notificaciones": return Promise.resolve("denegado");
        case "almacenamiento": return Promise.resolve("preguntar");
        default: return Promise.reject();
      }
    });

    const permisos = await leerPermisos();

    expect(permisos).toEqual([
      { nombre: "Micrófono", href: "/agent?tab=privacidad", estado: "otorgado" },
      { nombre: "Notificaciones", href: "/notifications", estado: "denegado" },
      { nombre: "Almacenamiento persistente", href: "/almacenes", estado: "pendiente" },
    ]);

    expect(consultarPermisoMock).toHaveBeenCalledTimes(3);
    expect(consultarPermisoMock).toHaveBeenCalledWith("microfono");
    expect(consultarPermisoMock).toHaveBeenCalledWith("notificaciones");
    expect(consultarPermisoMock).toHaveBeenCalledWith("almacenamiento");
  });

  it("devuelve 'desconocido' cuando una consulta rechaza", async () => {
    const consultarPermisoMock = vi.mocked(consultarPermiso);
    consultarPermisoMock.mockImplementation((id) => {
      if (id === "microfono") return Promise.resolve("concedido");
      if (id === "notificaciones") return Promise.resolve("denegado");
      if (id === "almacenamiento") return Promise.reject();
      return Promise.reject();
    });

    const permisos = await leerPermisos();

    expect(permisos).toEqual([
      { nombre: "Micrófono", href: "/agent?tab=privacidad", estado: "otorgado" },
      { nombre: "Notificaciones", href: "/notifications", estado: "denegado" },
      { nombre: "Almacenamiento persistente", href: "/almacenes", estado: "desconocido" },
    ]);
  });
});