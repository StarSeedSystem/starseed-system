import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

vi.mock("next/dynamic", () => ({ default: () => () => <div data-testid="mapa-leaflet" /> }));
vi.mock("../use-marcas-geo", () => ({ useMarcasGeo: () => ({ marcas: [], pref: { cuenta: "no", publica: "no", autorizados: {} }, cruda: null, presenciaConectada: false, ahora: 0 }) }));

import { VistaMapa } from "../pestana-mapa";
import { construirMarcas } from "@/lib/senales/geo/marcas";
import { PREFERENCIA_POSICION_DEFECTO, anuncioParaAmbito } from "@/lib/senales/geo/modelo-geo";

const AHORA = 1_800_000_000_000;
const sen = { internet: { enLinea: true }, malla: { pares: 1, otrasCuentas: 0 }, lora: { estado: "sin-radio" as const, nodos: 0 }, bluetooth: { disponible: null }, serie: { disponible: false, puertos: 0 }, reticulum: { disponible: false as const, motivo: "x" } };
const fila = (id: string, o = {}) => ({ neuronId: id, nombre: `Nombre ${id}`, plataforma: "Android", tipo: "mobile" as const, online: true, esEsteDispositivo: false, enlace: { estado: "sin-vinculo" as const }, ...o });
const yo = (posicion: unknown) => ({ neuronaId: "yo", nombre: "Mi Mac", senales: sen, capas: ["capa:local"], posicion: posicion as never, pref: PREFERENCIA_POSICION_DEFECTO });
const conDatos = () => construirMarcas({
  filas: [fila("yo", { esEsteDispositivo: true }), fila("tab", { enlace: { estado: "conectado" as const, latenciaMs: 40 } })],
  medios: [{ n: "tab", m: "m", tipo: "navegador", etiqueta: "web", visible: true, desde: "", t: AHORA, s: sen, g: anuncioParaAmbito({ lat: 40.4, lon: -3.7, t: AHORA, fuente: "gps" }, { ...PREFERENCIA_POSICION_DEFECTO, cuenta: "zona" }, { tipo: "cuenta" })! }],
  yo: yo({ lat: 40.41, lon: -3.71, t: AHORA, fuente: "gps" }), ahora: AHORA,
});
const props = { pref: PREFERENCIA_POSICION_DEFECTO, presenciaConectada: true, enLinea: true };

afterEach(cleanup);

describe("VistaMapa (fase 1)", () => {
  it("con datos y red muestra el mapa geográfico, la leyenda y la barra de capas y filtro en una fila", () => {
    render(<VistaMapa {...props} marcas={conDatos()} />);
    expect(screen.getByTestId("mapa-leaflet")).toBeTruthy();
    expect(screen.queryByTestId("esquema-sin-base")).toBeNull();
    expect(screen.getByTestId("leyenda").textContent).toContain("Señal");
    expect(screen.getByTestId("barra-capas").children.length).toBeGreaterThanOrEqual(9);
  });

  it("sin red cae al esquema de la malla y lo dice, nunca un mapa en blanco", () => {
    render(<VistaMapa {...props} enLinea={false} marcas={conDatos()} />);
    expect(screen.getByTestId("esquema-sin-base").textContent).toContain("Sin base geográfica: esquema de la malla");
    expect(screen.getByTestId("esquema-sin-base").textContent).toContain("No hay conexión a internet");
    expect(screen.queryByTestId("mapa-leaflet")).toBeNull();
  });

  it("sin ninguna posición conocida usa el esquema y explica por qué", () => {
    const marcas = construirMarcas({ filas: [fila("yo", { esEsteDispositivo: true })], medios: [], yo: yo(null), ahora: AHORA });
    render(<VistaMapa {...props} marcas={marcas} />);
    expect(screen.getByTestId("esquema-sin-base").textContent).toContain("Ninguna neurona tiene posición conocida");
    expect(screen.getByLabelText("Esquema de la malla")).toBeTruthy();
  });

  it("sin neuronas ni datos (vacío total) no revienta y avisa de que no hay posición", () => {
    render(<VistaMapa {...props} presenciaConectada={false} marcas={[]} />);
    expect(screen.getByTestId("esquema-sin-base").textContent).toContain("Todavía no hay neuronas");
    expect(screen.getByText(/presencia en vivo no está conectada/)).toBeTruthy();
  });

  it("las capas y filtros de otras fases salen desactivados «próximamente»", () => {
    render(<VistaMapa {...props} marcas={conDatos()} />);
    for (const t of ["Capacidades", "Público / privado", "Grupos", "Público"]) {
      const b = screen.getByText(t, { selector: "button" }) as HTMLButtonElement;
      expect(b.disabled).toBe(true);
      expect(b.textContent).toContain("próximamente");
    }
    expect((screen.getByText("Señal", { selector: "button" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("cambiar de capa cambia la leyenda", () => {
    render(<VistaMapa {...props} marcas={conDatos()} />);
    fireEvent.click(screen.getByText("Capas de conciencia", { selector: "button" }));
    expect(screen.getByTestId("leyenda").textContent).toContain("Colectiva");
  });

  it("tocar una marca del esquema abre la ficha: «desconocido» donde no se sabe, botones de permisos desactivados", () => {
    const marcas = construirMarcas({ filas: [fila("yo", { esEsteDispositivo: true }), fila("tab")], medios: [], yo: yo(null), ahora: AHORA });
    render(<VistaMapa {...props} marcas={marcas} />);
    fireEvent.click(screen.getByLabelText("Nombre tab"));
    const ficha = screen.getByTestId("ficha-geo");
    expect(ficha.textContent).toContain("desconocido");
    expect(ficha.textContent).toContain("próximamente");
    for (const n of ["Ver", "Pedir acceso", "Configurar"]) expect((screen.getByText(n, { selector: "button" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByTestId("privacidad-posicion")).toBeNull();
  });

  it("en MI ficha aparece el control de quién ve mi posición, con «Nadie» marcado por defecto", () => {
    const marcas = construirMarcas({ filas: [fila("yo", { esEsteDispositivo: true })], medios: [], yo: yo(null), ahora: AHORA });
    render(<VistaMapa {...props} marcas={marcas} />);
    fireEvent.click(screen.getByLabelText("Mi Mac"));
    expect(screen.getByTestId("privacidad-posicion")).toBeTruthy();
    expect(screen.getByRole("radio", { name: "Nadie" }).getAttribute("aria-checked")).toBe("true");
    expect(screen.getByRole("radio", { name: "Punto exacto" }).getAttribute("aria-checked")).toBe("false");
  });
});
