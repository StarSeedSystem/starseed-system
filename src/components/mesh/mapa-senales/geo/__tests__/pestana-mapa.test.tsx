/**
 * AUD1117 — la pestaña «Mapa» no deja un mapa en blanco cuando la base geográfica no carga:
 * cae al esquema plano con las MISMAS marcas y su aviso, y vuelve al mapa del mundo al recuperar la base.
 * La costura es la extensión de `MapView` (`onBaseEstado`), la misma que usa Leaflet en producción.
 */
import "@testing-library/jest-dom/vitest";
import React from "react";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AHORA, fila } from "@/lib/senales/__fixtures__/vivo";
import { ESTADO_INICIAL } from "@/lib/senales/geo/canal-posicion";
import { construirMarcas } from "@/lib/senales/geo/marcas";
import { posicionEnEsquema } from "../../vista-plana";
import { VistaMapa, type VistaMapaProps } from "../pestana-mapa";
import type { EstadoSenalesPublicadas } from "@/lib/senales/espectro/usar-senales-publicadas";
import type { MapaVivoRed } from "@/lib/senales/tipos-vivo";
import type { SenalEspectro } from "@/lib/senales/espectro/modelo";

type EstadoBase = "cargando" | "ok" | "fallo";

const control = vi.hoisted(() => ({
  avisar: null as null | ((estado: "cargando" | "ok" | "fallo") => void),
  montajes: 0,
}));

const espectroMock = vi.hoisted(() => ({
  EspectroVista: ({ red, mediosSinFuente }: { red: MapaVivoRed; mediosSinFuente: number }) => (
    <div data-testid="espectro-vista">
      <p data-testid="estado-espectro">
        {red.senales.length} señales · {red.otrasCuentasPublicando} publicadas por otros dueños · {mediosSinFuente} medios sin fuente
      </p>
    </div>
  ),
}));

const dynamicMock = vi.hoisted(() => {
  let ResolvedComponent: React.ComponentType<any> | null = null;
  return {
    default: (loader: () => Promise<{ EspectroVista: React.ComponentType<any> }>) => {
      if (!ResolvedComponent) {
        loader().then((mod) => { ResolvedComponent = mod.EspectroVista; });
      }
      const Comp = (props: any) => ResolvedComponent ? React.createElement(ResolvedComponent, props) : null;
      Comp.displayName = "DynamicComponent";
      return Comp;
    },
  };
});

vi.mock("@/components/map/map-view", () => ({
  MapView: ({ extension }: { extension?: { onBaseEstado?: (estado: EstadoBase) => void } }) => {
    control.avisar = extension?.onBaseEstado ?? null;
    control.montajes += 1;
    return <div data-testid="mapa-mundo" />;
  },
}));

vi.mock("../use-marcas-geo", () => ({
  useMarcasGeo: () => { throw new Error("la prueba pinta VistaMapa con datos fijos"); },
}));

vi.mock("next/dynamic", () => dynamicMock);

vi.mock("../../espectro-vista", () => espectroMock);

const senalesEspectroPrueba: SenalEspectro[] = [
  { id: "s1", medio: "wifi", banda: "Wi-Fi 2.4 GHz", frecuenciaKhz: 2450000, anchoKhz: 20000, fuerzaDbm: -45, calidad: 80, origen: "medida", capa: "propia", fuente: "este aparato", medidoEn: AHORA, zona: null, vinculo: undefined, compatibles: [] },
  { id: "s2", medio: "bluetooth", banda: "Bluetooth", frecuenciaKhz: 2440000, anchoKhz: 1000, fuerzaDbm: -60, calidad: 65, origen: "medida", capa: "propia", fuente: "este aparato", medidoEn: AHORA, zona: null, vinculo: undefined, compatibles: [] },
];

const redPrueba: MapaVivoRed = {
  senales: senalesEspectroPrueba,
  estado: "ok",
  motivo: undefined,
  otrasCuentasPublicando: 3,
};

function datosDePrueba(): VistaMapaProps["datos"] {
  const marcas = construirMarcas({
    filas: [
      fila("yo", { esEsteDispositivo: true, nombre: "Este aparato" }),
      fila("b", { nombre: "Móvil de Ana" }),
    ],
    medios: [],
    yo: {
      neuronaId: "yo", nombre: "Este aparato", plataforma: "macOS",
      senales: null, capas: null, posicion: { lat: 19.4, lon: -99.1, precisionM: null, t: AHORA },
    },
    ahora: AHORA,
    canal: { unido: true, motivo: null },
  });
  const publicadas: EstadoSenalesPublicadas = {
    senales: [],
    estado: "ok",
    cargando: false,
    actualizar: async () => { /* prueba */ },
  };
  return {
    marcas,
    presenciaConectada: true,
    ahora: AHORA,
    permiso: "concedido",
    compartir: true,
    fijarCompartir: () => { /* prueba */ },
    alMiPosicion: () => { /* prueba */ },
    errorUbicacion: null,
    alErrorUbicacion: () => { /* prueba */ },
    desde: AHORA,
    canal: ESTADO_INICIAL,
    enlaces: [],
    publicadas,
    senales: null,
    deviceId: "yo",
    medio: { id: "m-test", tipo: "navegador", etiqueta: "Navegador de prueba" },
  };
}

afterEach(() => {
  cleanup();
  control.avisar = null;
  control.montajes = 0;
});

describe("VistaMapa sin base geográfica (AUD1117)", () => {
  it("con las teselas fallando cae al esquema con las mismas marcas y el aviso, y vuelve al mapa al cargar", () => {
    render(<VistaMapa datos={datosDePrueba()} enLinea />);
    expect(screen.getByTestId("mapa-mundo")).toBeInTheDocument();
    expect(screen.queryByTestId("esquema-sin-base")).toBeNull();

    act(() => control.avisar?.("fallo"));

    expect(screen.queryByTestId("mapa-mundo")).toBeNull();
    expect(screen.getByTestId("esquema-sin-base")).toBeInTheDocument();
    expect(screen.getByText(/sin base geográfica/i)).toBeInTheDocument();
    expect(screen.getByText("Móvil de Ana")).toBeInTheDocument();
    expect(screen.getByText("sin posición")).toBeInTheDocument();

    act(() => control.avisar?.("ok"));

    expect(screen.getByTestId("mapa-mundo")).toBeInTheDocument();
    expect(screen.queryByTestId("esquema-sin-base")).toBeNull();
  });

  it("sin conexión también cae al esquema y vuelve al mapa cuando vuelve la red", () => {
    const datos = datosDePrueba();
    const { rerender } = render(<VistaMapa datos={datos} enLinea={false} />);
    expect(screen.queryByTestId("mapa-mundo")).toBeNull();
    expect(screen.getByTestId("esquema-sin-base")).toBeInTheDocument();
    expect(screen.getByText(/sin conexión/i)).toBeInTheDocument();

    rerender(<VistaMapa datos={datos} enLinea />);

    expect(screen.getByTestId("mapa-mundo")).toBeInTheDocument();
    expect(screen.queryByTestId("esquema-sin-base")).toBeNull();
  });

  it("reparte las marcas por relación, sin coordenadas: primer punto arriba y todos dentro del disco", () => {
    const primero = posicionEnEsquema(0, 4);
    expect(primero.x).toBeCloseTo(50, 5);
    expect(primero.y).toBeCloseTo(20, 5);
    for (let i = 0; i < 4; i += 1) {
      const p = posicionEnEsquema(i, 4);
      expect(Math.hypot(p.x - 50, p.y - 50)).toBeCloseTo(30, 5);
      expect(Number.isFinite(p.x) && Number.isFinite(p.y)).toBe(true);
    }
    const solo = posicionEnEsquema(0, 0);
    expect(Number.isFinite(solo.x) && Number.isFinite(solo.y)).toBe(true);
  });
});

describe("VistaMapa pestaña Espectro (MAP1116B)", () => {
  it("muestra la pestaña Espectro cuando hay red y al pulsarla cambia la pestaña activa", () => {
    render(<VistaMapa datos={datosDePrueba()} enLinea red={redPrueba} mediosSinFuente={5} />);

    expect(screen.getByTestId("mapa-mundo")).toBeInTheDocument();

    const pestanaMapa = screen.getByRole("tab", { name: /mapa/i });
    const pestanaEspectro = screen.getByRole("tab", { name: /espectro/i });
    expect(pestanaMapa).toHaveAttribute("aria-selected", "true");
    expect(pestanaEspectro).toHaveAttribute("aria-selected", "false");

    act(() => { pestanaEspectro.click(); });

    expect(pestanaEspectro).toHaveAttribute("aria-selected", "true");
    expect(pestanaMapa).toHaveAttribute("aria-selected", "false");
  });

  it("sin red ni mediosSinFuente no muestra la pestaña Espectro", () => {
    render(<VistaMapa datos={datosDePrueba()} enLinea />);
    expect(screen.queryByRole("tab", { name: /espectro/i })).toBeNull();
  });
});
