import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import {
  AsistenteConectores,
  estadoCloudroom,
  sugerenciaCloudroom,
  type EntradaEstadoCloudroom,
} from "../asistente-conectores";
import type { GrupoSugerencias, Sugerencia } from "@/lib/genesis/conectores/sugerir";

const SUGERENCIA: Sugerencia = {
  id: "cloudroom",
  nombre: "Cloudroom",
  tipo: "contenedor",
  papeles: [],
  enlaceAlta: "https://cloudroom.dev",
  enlaceClave: null,
  limite: null,
  verificado: true,
  privacidad: "nube-con-retencion",
  variables: [],
  motivo: "Cuenta con 100 agentes en la nube por ciclo de 30 días.",
};

const grupo = (s: Sugerencia): GrupoSugerencias => ({
  clave: "gratis-por-vincular",
  titulo: "Gratis por vincular",
  opciones: [s],
});

afterEach(cleanup);

const BASE: EntradaEstadoCloudroom = {
  instalacion: "instalada",
  plan: { tipo: "gratis" },
  consumos: [],
  inicioCiclo: "2026-10-01T00:00:00Z",
  ahora: "2026-10-02T12:00:00Z",
  diasQueQuedan: 30,
};

describe("estadoCloudroom", () => {
  it("calcula el cupo restante y el ritmo diario del contexto", () => {
    const estado = estadoCloudroom(BASE);
    expect(estado.cupo).toBe(100);
    expect(estado.ritmo).toBe(3);
    expect(estado.ofrecible).toBe(false);
    expect(estado.texto).toContain("instalada en esta neurona");
  });

  it("descuenta lo consumido en el ciclo", () => {
    const estado = estadoCloudroom({
      ...BASE,
      consumos: [{ contextoId: "personal", t: "2026-10-02T00:00:00Z", n: 10 }],
    });
    expect(estado.cupo).toBe(90);
    expect(estado.ritmo).toBe(3);
  });

  it("no inventa el cupo de un plan de pago que no declara cifra", () => {
    const estado = estadoCloudroom({ ...BASE, plan: { tipo: "pro" } });
    expect(estado.cupo).toBeNull();
    expect(estado.texto).toContain("cupo sin lectura");
  });

  it("solo ofrece Cloudroom cuando el sugeridor la devuelve", () => {
    const estado = estadoCloudroom({ ...BASE, sugerencias: [grupo(SUGERENCIA)] });
    expect(estado.sugerencia?.id).toBe("cloudroom");
    expect(estado.ofrecible).toBe(true);
    expect(estado.texto).toContain("100 agentes");
  });

  it("no la ofrece si no está instalada aunque el sugeridor la devuelva", () => {
    const estado = estadoCloudroom({
      ...BASE,
      instalacion: "no-instalada",
      sugerencias: [grupo(SUGERENCIA)],
    });
    expect(estado.ofrecible).toBe(false);
  });

  it("sin grupos del sugeridor no hay sugerencia", () => {
    expect(sugerenciaCloudroom([])).toBeNull();
    expect(sugerenciaCloudroom([
      { clave: "local-por-activar", titulo: "Local por activar", opciones: [] },
      { clave: "sin-opcion", titulo: "Sin opción", papeles: [] },
    ])).toBeNull();
  });
});

describe("AsistenteConectores", () => {
  it("pinta la instalación y el cupo sin adornarlos", () => {
    render(<AsistenteConectores entrada={BASE} />);
    expect(screen.getByTestId("cloudroom-instalacion").textContent).toContain("instalada");
    expect(screen.getByTestId("cloudroom-cupo").textContent).toContain("100");
    expect(screen.getByRole("status").textContent).toContain("No se sugiere");
  });

  it("pinta la sugerencia y el enlace de alta cuando el sugeridor la devuelve", () => {
    render(<AsistenteConectores entrada={{ ...BASE, sugerencias: [grupo(SUGERENCIA)] }} />);
    expect(screen.getByRole("status").textContent).toContain("Sugerida");
    expect(screen.getByRole("link", { name: /Abrir Cloudroom/ }).getAttribute("href")).toBe(
      "https://cloudroom.dev",
    );
  });

  it("sin dato no finge que está instalada ni que hay cupo", () => {
    render(<AsistenteConectores entrada={{ instalacion: "sin-dato" }} />);
    expect(screen.getByTestId("cloudroom-instalacion").textContent).toContain("sin comprobar");
    expect(screen.getByTestId("cloudroom-cupo").textContent).toContain("sin lectura");
  });
});
