import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SenalEspectro } from "@/lib/senales/espectro/modelo";
import type { EstadoLectura } from "@/lib/senales/espectro/leer-senales";
import type { MapaVivoRed } from "@/lib/senales/tipos-vivo";

function senalPublicada(overrides: Partial<SenalEspectro> = {}): SenalEspectro {
  return {
    id: `pub-${Date.now()}-${Math.random()}`,
    medio: "wifi",
    banda: "2.4 GHz",
    frecuenciaKhz: 2437000,
    anchoKhz: 20000,
    fuerzaDbm: -45,
    calidad: 0.8,
    origen: "medida",
    capa: "publica",
    fuente: "publicada por su dueño",
    medidoEn: Date.now(),
    zona: "A1",
    vinculo: { tipo: "antena", id: "uid-ajeno-1" },
    compatibles: [],
    ...overrides,
  };
}

function senalPropiaDirectLink(overrides: Partial<SenalEspectro> = {}): SenalEspectro {
  return {
    id: `local-${Date.now()}-${Math.random()}`,
    medio: "malla",
    banda: "local",
    frecuenciaKhz: null,
    anchoKhz: null,
    fuerzaDbm: null,
    calidad: 0.9,
    origen: "medida",
    capa: "propia",
    fuente: "enlace directo sin internet",
    medidoEn: Date.now(),
    zona: null,
    vinculo: { tipo: "neurona", id: "uid-propio" },
    compatibles: [],
    ...overrides,
  };
}

function mockPublicadas(
  senales: SenalEspectro[],
  estado: EstadoLectura = "ok",
  motivo?: string
): { senales: SenalEspectro[]; estado: EstadoLectura; motivo?: string; cargando: boolean; actualizar: () => Promise<void> } {
  return {
    senales,
    estado,
    motivo,
    cargando: false,
    actualizar: vi.fn().mockResolvedValue(undefined),
  };
}

function mockVivoExtras(senales: SenalEspectro[]): { extras: readonly SenalEspectro[] } {
  return { extras: senales };
}

describe("MapaVivoRed: combinación de señales propias y publicadas", () => {
  it("con dos cuentas publicando, salen las dos y otrasCuentasPublicando = 2", () => {
    const pub1 = senalPublicada({ id: "pub-1", vinculo: { tipo: "antena", id: "uid-cuenta-1" } });
    const pub2 = senalPublicada({ id: "pub-2", vinculo: { tipo: "antena", id: "uid-cuenta-2" } });
    const publicadas = mockPublicadas([pub1, pub2]);
    const vivo = mockVivoExtras([]);

    const red: MapaVivoRed = {
      senales: [...publicadas.senales, ...vivo.extras],
      estado: publicadas.estado,
      motivo: publicadas.motivo,
      otrasCuentasPublicando: new Set(publicadas.senales.map((s) => s.vinculo?.id).filter((id): id is string => !!id)).size,
    };

    expect(red.senales.length).toBe(2);
    expect(red.otrasCuentasPublicando).toBe(2);
    expect(red.estado).toBe("ok");
  });

  it("con una cuenta publicando y una señal propia direct-link, salen ambas y otrasCuentasPublicando = 1", () => {
    const pub1 = senalPublicada({ id: "pub-1", vinculo: { tipo: "antena", id: "uid-cuenta-1" } });
    const propia = senalPropiaDirectLink({ id: "local-1" });
    const publicadas = mockPublicadas([pub1]);
    const vivo = mockVivoExtras([propia]);

    const red: MapaVivoRed = {
      senales: [...publicadas.senales, ...vivo.extras],
      estado: publicadas.estado,
      motivo: publicadas.motivo,
      otrasCuentasPublicando: new Set(publicadas.senales.map((s) => s.vinculo?.id).filter((id): id is string => !!id)).size,
    };

    expect(red.senales.length).toBe(2);
    expect(red.senales.some((s) => s.id === "pub-1")).toBe(true);
    expect(red.senales.some((s) => s.id === "local-1")).toBe(true);
    expect(red.otrasCuentasPublicando).toBe(1);
  });

  it("sin tabla (estado sin-tabla), el motivo dice que las señales públicas no están activadas", () => {
    const publicadas = mockPublicadas([], "sin-tabla", "la tabla os_senales_publicas no existe en este proyecto");
    const vivo = mockVivoExtras([]);

    let motivo = publicadas.motivo;
    if (publicadas.estado === "sin-tabla") {
      motivo = "las señales públicas aún no están activadas en este servidor";
    }

    const red: MapaVivoRed = {
      senales: [...publicadas.senales, ...vivo.extras],
      estado: publicadas.estado,
      motivo,
      otrasCuentasPublicando: 0,
    };

    expect(red.estado).toBe("sin-tabla");
    expect(red.motivo).toBe("las señales públicas aún no están activadas en este servidor");
    expect(red.senales.length).toBe(0);
    expect(red.otrasCuentasPublicando).toBe(0);
  });

  it("lectura ok pero vacía (nadie más publicó), el motivo dice que nadie más ha publicado", () => {
    const publicadas = mockPublicadas([], "ok");
    const vivo = mockVivoExtras([]);

    let motivo = publicadas.motivo;
    if (publicadas.estado === "ok" && publicadas.senales.length === 0 && !motivo) {
      motivo = "nadie más ha publicado en esta capa todavía";
    }

    const red: MapaVivoRed = {
      senales: [...publicadas.senales, ...vivo.extras],
      estado: publicadas.estado,
      motivo,
      otrasCuentasPublicando: 0,
    };

    expect(red.estado).toBe("ok");
    expect(red.motivo).toBe("nadie más ha publicado en esta capa todavía");
    expect(red.senales.length).toBe(0);
    expect(red.otrasCuentasPublicando).toBe(0);
  });

  it("lectura ok con señales pero motivo previo, no sobrescribe el motivo", () => {
    const pub1 = senalPublicada({ id: "pub-1", vinculo: { tipo: "antena", id: "uid-cuenta-1" } });
    const publicadas = mockPublicadas([pub1], "ok", "motivo previo");
    const vivo = mockVivoExtras([]);

    let motivo = publicadas.motivo;
    if (publicadas.estado === "ok" && publicadas.senales.length === 0 && !motivo) {
      motivo = "nadie más ha publicado en esta capa todavía";
    }

    const red: MapaVivoRed = {
      senales: [...publicadas.senales, ...vivo.extras],
      estado: publicadas.estado,
      motivo,
      otrasCuentasPublicando: new Set(publicadas.senales.map((s) => s.vinculo?.id).filter((id): id is string => !!id)).size,
    };

    expect(red.motivo).toBe("motivo previo");
  });

  it("estado error, mantiene el motivo del error", () => {
    const publicadas = mockPublicadas([], "error", "permission denied");
    const vivo = mockVivoExtras([]);

    let motivo = publicadas.motivo;
    if (publicadas.estado === "ok" && publicadas.senales.length === 0 && !motivo) {
      motivo = "nadie más ha publicado en esta capa todavía";
    } else if (publicadas.estado === "sin-tabla") {
      motivo = "las señales públicas aún no están activadas en este servidor";
    }

    const red: MapaVivoRed = {
      senales: [...publicadas.senales, ...vivo.extras],
      estado: publicadas.estado,
      motivo,
      otrasCuentasPublicando: 0,
    };

    expect(red.estado).toBe("error");
    expect(red.motivo).toBe("permission denied");
  });

  it("cuenta cuentas distintas aunque haya varias señales de la misma cuenta", () => {
    const pub1 = senalPublicada({ id: "pub-1", vinculo: { tipo: "antena", id: "uid-cuenta-1" } });
    const pub2 = senalPublicada({ id: "pub-2", vinculo: { tipo: "antena", id: "uid-cuenta-1" } });
    const pub3 = senalPublicada({ id: "pub-3", vinculo: { tipo: "antena", id: "uid-cuenta-2" } });
    const publicadas = mockPublicadas([pub1, pub2, pub3]);
    const vivo = mockVivoExtras([]);

    const red: MapaVivoRed = {
      senales: [...publicadas.senales, ...vivo.extras],
      estado: publicadas.estado,
      motivo: publicadas.motivo,
      otrasCuentasPublicando: new Set(publicadas.senales.map((s) => s.vinculo?.id).filter((id): id is string => !!id)).size,
    };

    expect(red.senales.length).toBe(3);
    expect(red.otrasCuentasPublicando).toBe(2);
  });

  it("señales sin vinculo no cuentan como otras cuentas", () => {
    const pub1 = senalPublicada({ id: "pub-1", vinculo: { tipo: "antena", id: "uid-cuenta-1" } });
    const pub2 = { ...senalPublicada({ id: "pub-2" }), vinculo: undefined };
    const publicadas = mockPublicadas([pub1, pub2]);
    const vivo = mockVivoExtras([]);

    const red: MapaVivoRed = {
      senales: [...publicadas.senales, ...vivo.extras],
      estado: publicadas.estado,
      motivo: publicadas.motivo,
      otrasCuentasPublicando: new Set(publicadas.senales.map((s) => s.vinculo?.id).filter((id): id is string => !!id)).size,
    };

    expect(red.senales.length).toBe(2);
    expect(red.otrasCuentasPublicando).toBe(1);
  });
});