import { describe, expect, it } from "vitest";
import { HISTERESIS_M, anuncioDeEntrada, cambiosDeZona, dentroDeZona, destinoDePortal, efectosActivos, zona } from "../zonas";

const set = (...nombres: string[]) => new Set(nombres);
/** Caja alineada de tamaño completo [2, 2, 2] centrada en [0, 1, 0]: del -1 al 1 en x. */
const caja = zona("caja", { pos: [0, 1, 0], tam: [2, 2, 2] });
const esfera = zona("esfera", { pos: [0, 1, 0], radio: 1 });

describe("dentroDeZona", () => {
  it("la esfera respeta su radio y cuenta el borde como dentro", () => {
    expect(dentroDeZona(esfera, [0, 1, 0])).toBe(true);
    expect(dentroDeZona(esfera, [1, 1, 0])).toBe(true);
    expect(dentroDeZona(esfera, [1.01, 1, 0])).toBe(false);
    expect(dentroDeZona(esfera, [0, 2.01, 0])).toBe(false);
  });
  it("la caja alineada usa tam como tamaño completo", () => {
    expect(dentroDeZona(caja, [0, 1, 0])).toBe(true);
    expect(dentroDeZona(caja, [1, 2, 1])).toBe(true);
    expect(dentroDeZona(caja, [1.01, 1, 0])).toBe(false);
    expect(dentroDeZona(caja, [0, 2.01, 0])).toBe(false);
  });
});

describe("cambiosDeZona", () => {
  it("entra al cruzar y sale al alejarse", () => {
    const entra = cambiosDeZona([caja], set(), [0, 1, 0]);
    expect(entra.entra).toEqual(["caja"]);
    expect(entra.sale).toEqual([]);
    const sale = cambiosDeZona([caja], entra.ahora, [5, 1, 0]);
    expect(sale.entra).toEqual([]);
    expect(sale.sale).toEqual(["caja"]);
    expect(sale.ahora.size).toBe(0);
  });

  it("la histéresis de 5 cm evita el parpadeo en el borde", () => {
    const fueraCerca: [number, number, number] = [1 + HISTERESIS_M / 2, 1, 0];
    expect(cambiosDeZona([caja], set(), fueraCerca).ahora.has("caja")).toBe(false);
    expect(cambiosDeZona([caja], set("caja"), fueraCerca).ahora.has("caja")).toBe(true);
    const fueraLejos: [number, number, number] = [1 + HISTERESIS_M * 2, 1, 0];
    expect(cambiosDeZona([caja], set("caja"), fueraLejos).sale).toEqual(["caja"]);
  });

  it("seguir dentro no repite el aviso de entrada", () => {
    const r = cambiosDeZona([caja], set("caja"), [0, 1, 0]);
    expect(r.entra).toEqual([]);
    expect(r.sale).toEqual([]);
  });

  it("varias zonas a la vez y una que ya no existe", () => {
    const otra = zona("otra", { pos: [0, 1, -1], radio: 1 });
    const r = cambiosDeZona([caja, otra], set("caja", "fantasma"), [0, 1, -0.9]);
    expect(r.entra).toEqual(["otra"]);
    expect(r.sale).toEqual(["fantasma"]);
  });
});

describe("efectosActivos", () => {
  it("sin zonas activas todo está apagado", () => {
    expect(efectosActivos([caja], set())).toEqual({ silencio: false, audioPrivado: null, gravedadCero: false, zonaSegura: false, escenario: null });
  });

  it("varios efectos a la vez se suman", () => {
    const zonas = [
      zona("s", { efecto: "silencio" }),
      zona("a", { efecto: "audio-privado" }),
      zona("g", { efecto: "gravedad-cero" }),
      zona("z", { efecto: "zona-segura" }),
      zona("e", { efecto: "escenario" }),
    ];
    expect(efectosActivos(zonas, set("s", "a", "g", "z", "e"))).toEqual({ silencio: true, audioPrivado: "a", gravedadCero: true, zonaSegura: true, escenario: "e" });
  });

  it("punto-reunión no cambia nada pero se anuncia", () => {
    const reunion = zona("Fuente", { efecto: "punto-reunion" });
    expect(efectosActivos([reunion], set("Fuente"))).toEqual(efectosActivos([], set()));
    expect(anuncioDeEntrada(reunion)).toContain("Fuente");
    expect(anuncioDeEntrada(caja)).toBeNull();
  });
});

describe("destinoDePortal", () => {
  it("un portal público se marca privado: false", () => {
    expect(destinoDePortal({ tipo: "mundo", id: "mundo-1" }).privado).toBe(false);
  });

  it("un portal privado se marca privado: true", () => {
    expect(destinoDePortal({ tipo: "estacion", id: "cumbre", privado: true })).toEqual({ tipo: "ruta", ruta: "/estaciones/cumbre", privado: true });
  });

  it("mundo y sala abren la sala XR real", () => {
    expect(destinoDePortal({ tipo: "mundo", id: "mundo-1" })).toEqual({ tipo: "ruta", ruta: "/sala-xr/mundo-1", privado: false });
    expect(destinoDePortal({ tipo: "sala", id: "sala 1" })).toEqual({ tipo: "ruta", ruta: "/sala-xr/sala%201", privado: false });
  });

  it("estación y servidor usan sus páginas existentes", () => {
    expect(destinoDePortal({ tipo: "estacion", id: "cumbre" })).toEqual({ tipo: "ruta", ruta: "/estaciones/cumbre", privado: false });
    expect(destinoDePortal({ tipo: "servidor", id: "cualquiera" })).toEqual({ tipo: "ruta", ruta: "/servidores", privado: false });
  });

  it("un punto de reunión devuelve su spawn", () => {
    expect(destinoDePortal({ tipo: "punto", spawn: "entrada" })).toEqual({ tipo: "punto", spawn: "entrada", privado: false });
  });

  it("sin ruta conocida devuelve no-disponible", () => {
    expect(destinoDePortal({ tipo: "ovni" as never })).toEqual({ tipo: "no-disponible", ruta: "", privado: true });
  });
});
