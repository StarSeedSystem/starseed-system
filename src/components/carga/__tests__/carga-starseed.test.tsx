import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";

// El motor three.js no corre en jsdom: se sustituye por uno de mentira (o por «sin WebGL»).
const motor = vi.hoisted(() => ({
  fijarModo: vi.fn(), fijarProgreso: vi.fn(), redimensionar: vi.fn(), destruir: vi.fn(),
}));
const crear = vi.hoisted(() => vi.fn((..._a: unknown[]): unknown => motor));
vi.mock("@/lib/protomolecula/orbe4d/motor", () => ({ crearMotor: crear }));

import { ALTO_SIMBOLO, CargaStarSeed, DIAMETRO_ESFERA, RETRASO_3D_MS } from "../carga-starseed";

/** `prefers-reduced-motion` de mentira: jsdom no trae matchMedia. */
function movimientoReducido(reducido: boolean) {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: (consulta: string) => ({
      matches: reducido && consulta.includes("prefers-reduced-motion"),
      media: consulta,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }),
  });
}

const raiz = () => screen.getByTestId("carga-starseed");

describe("CargaStarSeed · la carga 3D con el símbolo dentro de su esfera", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    crear.mockImplementation(() => motor);
    movimientoReducido(false);
    delete document.documentElement.dataset.perf;
  });
  afterEach(() => { cleanup(); });

  it("pinta AL INSTANTE el respaldo: halo y flor de la vida, símbolo y «Abriendo StarSeed…», sin esperar al 3D", () => {
    render(<CargaStarSeed />);
    expect(raiz().getAttribute("role")).toBe("status");
    expect(raiz().getAttribute("aria-label")).toBe("Abriendo StarSeed");
    expect(screen.getByText("Abriendo StarSeed…")).toBeTruthy();
    const respaldo = screen.getByTestId("carga-respaldo");
    // 19 círculos de la flor + la envolvente + el disco del halo.
    expect(respaldo.querySelectorAll("circle")).toHaveLength(19 + 1 + 1);
    expect(screen.getByAltText("StarSeed")).toBeTruthy();
    // El motor todavía no se ha pedido: nada de three.js antes de pintar.
    expect(crear).not.toHaveBeenCalled();
  });

  it("el símbolo oficial va CENTRADO dentro de la esfera, con el 40 % del alto de la escena y sin deformarse", () => {
    render(<CargaStarSeed />);
    const caja = screen.getByTestId("carga-simbolo");
    // Centrado por flexbox en la escena entera: no depende de desplazamientos.
    expect(caja.className).toContain("absolute");
    expect(caja.className).toContain("inset-0");
    expect(caja.className).toContain("items-center");
    expect(caja.className).toContain("justify-center");
    const imagen = screen.getByAltText("StarSeed") as HTMLImageElement;
    expect(decodeURIComponent(imagen.getAttribute("src") ?? "")).toContain("starseed-symbol.png");
    expect(ALTO_SIMBOLO).toBe(0.4);
    expect((imagen.parentElement as HTMLElement).style.height).toBe("40%");
    // Proporciones propias del PNG (1000×1497): alto manda, ancho automático.
    expect(imagen.getAttribute("width")).toBe("1000");
    expect(imagen.getAttribute("height")).toBe("1497");
    expect(imagen.style.width).toBe("auto");
    expect(imagen.style.height).toBe("100%");
    // Dentro del disco de cristal: la esfera ocupa la mitad centrada y el símbolo cabe en ella.
    const esfera = screen.getByTestId("carga-esfera");
    expect(esfera.style.inset).toBe("25%");
    expect(DIAMETRO_ESFERA).toBe(0.5);
    const mitadAncho = (ALTO_SIMBOLO * (1000 / 1497)) / 2;
    expect(Math.hypot(mitadAncho, ALTO_SIMBOLO / 2)).toBeLessThan(DIAMETRO_ESFERA / 2);
  });

  it("el símbolo respira suave (animación que el CSS global apaga con movimiento reducido)", () => {
    render(<CargaStarSeed />);
    const imagen = screen.getByAltText("StarSeed");
    expect((imagen.parentElement as HTMLElement).className).toContain("ss-respirar");
  });

  it("sin WebGL (el motor devuelve null) se queda el respaldo estático, nunca una página en blanco", async () => {
    crear.mockImplementation(() => null);
    render(<CargaStarSeed />);
    await waitFor(() => expect(crear).toHaveBeenCalled(), { timeout: 2000 });
    await waitFor(() => expect(raiz().getAttribute("data-fase")).toBe("estatico"));
    // El lienzo sobra y se quita; el símbolo, la esfera, la flor y el texto siguen ahí.
    expect(screen.queryByTestId("carga-3d")).toBeNull();
    expect(screen.getByTestId("carga-respaldo").querySelectorAll("circle")).toHaveLength(21);
    expect(screen.getByAltText("StarSeed")).toBeTruthy();
    expect(screen.getByTestId("carga-esfera")).toBeTruthy();
    expect(screen.getByText("Abriendo StarSeed…")).toBeTruthy();
    expect(screen.getByTestId("carga-respaldo").querySelector("g")?.getAttribute("class")).not.toContain("animate-");
  });

  it("si el motor no llega a cargar (sin red) también se queda el respaldo", async () => {
    crear.mockImplementation(() => { throw new Error("sin motor"); });
    render(<CargaStarSeed />);
    await waitFor(() => expect(raiz().getAttribute("data-fase")).toBe("estatico"), { timeout: 2000 });
    expect(screen.getByAltText("StarSeed")).toBeTruthy();
  });

  it("con prefers-reduced-motion NO enciende el 3D: respaldo estático, sin lienzo y sin giro", async () => {
    movimientoReducido(true);
    render(<CargaStarSeed />);
    await waitFor(() => expect(raiz().getAttribute("data-fase")).toBe("estatico"));
    await new Promise((r) => setTimeout(r, RETRASO_3D_MS + 150));
    expect(crear).not.toHaveBeenCalled();
    expect(screen.queryByTestId("carga-3d")).toBeNull();
    expect(screen.getByTestId("carga-respaldo").querySelector("g")?.getAttribute("class")).not.toContain("animate-");
    expect(screen.getByAltText("StarSeed")).toBeTruthy();
  });

  it("en modo eco del OS (data-perf=eco) tampoco enciende el 3D", async () => {
    document.documentElement.dataset.perf = "eco";
    render(<CargaStarSeed />);
    await waitFor(() => expect(raiz().getAttribute("data-fase")).toBe("estatico"));
    await new Promise((r) => setTimeout(r, RETRASO_3D_MS + 150));
    expect(crear).not.toHaveBeenCalled();
  });

  it("con WebGL enciende el motor de la orbe en modo `cargando` con el acabado de carga, y lo destruye al irse", async () => {
    const { unmount } = render(<CargaStarSeed />);
    await waitFor(() => expect(crear).toHaveBeenCalledTimes(1), { timeout: 2000 });
    const [lienzo, opciones] = crear.mock.calls[0] as [HTMLCanvasElement, Record<string, unknown>];
    expect(lienzo.tagName).toBe("CANVAS");
    expect(opciones).toMatchObject({ estilo: "expresiva", registro: "trinity", reducido: false, acabado: "carga" });
    expect(typeof opciones.tamano).toBe("number");
    expect(motor.fijarModo).toHaveBeenCalledWith("cargando");
    await waitFor(() => expect(raiz().getAttribute("data-fase")).toBe("3d"));
    expect(screen.getByTestId("carga-3d").className).toContain("opacity-100");
    // El respaldo con la flor y el símbolo siguen debajo: el 3D se funde SOBRE ellos.
    expect(screen.getByTestId("carga-respaldo")).toBeTruthy();
    expect(screen.getByAltText("StarSeed")).toBeTruthy();
    unmount();
    expect(motor.destruir).toHaveBeenCalledTimes(1);
  });

  it("si la carga termina antes del retraso, ni se descarga ni se enciende el motor", async () => {
    const { unmount } = render(<CargaStarSeed />);
    unmount();
    await new Promise((r) => setTimeout(r, RETRASO_3D_MS + 200));
    expect(crear).not.toHaveBeenCalled();
    expect(motor.destruir).not.toHaveBeenCalled();
  });

  it("el texto y la etiqueta se pueden cambiar para otras cargas", () => {
    render(<CargaStarSeed texto="Abriendo tu escritorio…" etiqueta="Abriendo tu escritorio" />);
    expect(screen.getByText("Abriendo tu escritorio…")).toBeTruthy();
    expect(raiz().getAttribute("aria-label")).toBe("Abriendo tu escritorio");
  });

  it("la escena se adapta a la pantalla: 132 px en móvil estrecho, 148 en móvil ancho y hasta 192 en escritorio", () => {
    render(<CargaStarSeed />);
    const clases = screen.getByTestId("carga-escena").className;
    expect(clases).toContain("size-[132px]");
    expect(clases).toContain("min-[400px]:size-[148px]");
    expect(clases).toContain("min-[640px]:size-[176px]");
    expect(clases).toContain("min-[1024px]:size-[192px]");
  });
});
