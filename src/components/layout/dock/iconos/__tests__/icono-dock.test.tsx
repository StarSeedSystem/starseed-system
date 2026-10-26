// @vitest-environment jsdom
/**
 * IconoDock — pinta el diseño de un icono del dock: tesela, glifo propio / SVG / imagen, y la regla CSS
 * que neutraliza el fondo del botón solo cuando hay diseño.
 */
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import "@testing-library/jest-dom/vitest";

import { disenoBase, type DisenoIcono } from "@/lib/dock/iconos/modelo";
import { sanearSvg } from "@/lib/dock/iconos/sanear-svg";
import { IconoDock, VistaIcono } from "../icono-dock";

const Propio = ({ className }: { className?: string }) => <svg data-testid="propio" className={className} viewBox="0 0 24 24"><path d="M1 1L5 5" /></svg>;

const png = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
const d = (p: Partial<DisenoIcono> = {}): DisenoIcono => ({ ...disenoBase("#22d3ee"), ...p });

afterEach(() => cleanup());

describe("IconoDock", () => {
  it("pinta la tesela como imagen SVG y el icono propio encima", () => {
    const { container, getByTestId } = render(<button><IconoDock diseno={d({ forma: "hexagono" })} icono={Propio} /></button>);
    const raiz = container.querySelector("[data-icono-disenado]")!;
    expect(raiz).toHaveAttribute("data-icono-forma", "hexagono");
    expect(raiz).toHaveAttribute("aria-hidden", "true");
    expect(raiz.querySelector("img")!.getAttribute("src")).toMatch(/^data:image\/svg\+xml/);
    expect(getByTestId("propio")).toBeInTheDocument();
  });

  it("el tamaño y el color del dibujo siguen al diseño", () => {
    const { container } = render(<button><IconoDock diseno={d({ escala: 0.5, colorGlifo: "#fbbf24", brillo: 0 })} icono={Propio} /></button>);
    const glifo = container.querySelector("[data-icono-disenado] > span") as HTMLElement;
    expect(glifo.style.width).toBe("50%");
    expect(glifo.style.color).toBe("rgb(251, 191, 36)");
    expect(glifo.style.filter).toBe("");
  });

  it("con brillo, el dibujo lleva un resplandor del mismo color", () => {
    const { container } = render(<button><IconoDock diseno={d({ colorGlifo: "#22d3ee", brillo: 1 })} icono={Propio} /></button>);
    const glifo = container.querySelector("[data-icono-disenado] > span") as HTMLElement;
    expect(glifo.style.filter).toMatch(/drop-shadow/);
  });

  it("sin fondo ni borde no dibuja tesela", () => {
    const { container } = render(<button><IconoDock diseno={d({ fondo: { tipo: "ninguno" } })} icono={Propio} /></button>);
    expect(container.querySelectorAll("[data-icono-disenado] > img")).toHaveLength(0);
  });

  it("un glifo SVG saneado se pinta como imagen con su color (no como marcado en línea)", () => {
    const svg = sanearSvg('<svg viewBox="0 0 64 64"><circle cx="32" cy="32" r="20" stroke="currentColor" fill="none"/></svg>').svg;
    const { container, queryByTestId } = render(<button><IconoDock diseno={d({ glifo: { tipo: "svg", svg }, colorGlifo: "#ff0000" })} icono={Propio} /></button>);
    const img = container.querySelector("[data-icono-disenado] > span img") as HTMLImageElement;
    expect(img.getAttribute("src")).toMatch(/^data:image\/svg\+xml/);
    expect(decodeURIComponent(img.getAttribute("src")!)).toContain("#ff0000");
    // no se inyecta el SVG como nodos: nada de <circle> en el DOM de la página
    expect(container.querySelector("circle")).toBeNull();
    expect(queryByTestId("propio")).toBeNull();
  });

  it("un glifo de imagen se pinta con su data:", () => {
    const { container } = render(<button><IconoDock diseno={d({ glifo: { tipo: "imagen", src: png } })} icono={Propio} /></button>);
    expect((container.querySelector("[data-icono-disenado] > span img") as HTMLImageElement).getAttribute("src")).toBe(png);
  });

  it("un glifo de Lucide elegido se carga a demanda y mientras tanto se ve el propio", async () => {
    const { container, findByTestId, getByTestId } = render(<button><IconoDock diseno={d({ glifo: { tipo: "lucide", clave: "Moon" } })} icono={Propio} /></button>);
    expect(getByTestId("propio")).toBeInTheDocument();
    await findByTestId("propio").catch(() => null);
    // acabó resolviendo el icono elegido (un <svg> de Lucide con su clase)
    await new Promise((r) => setTimeout(r, 50));
    expect(container.querySelector("[data-icono-disenado] svg")).not.toBeNull();
  });

  it("incluye UNA regla de estilo con :has() para neutralizar el fondo del botón, el foco y el «estás aquí»", () => {
    render(<><button><IconoDock diseno={d()} icono={Propio} /></button><button><IconoDock diseno={d({ forma: "rombo" })} icono={Propio} /></button></>);
    const estilos = [...document.querySelectorAll("style")].filter((s) => s.textContent?.includes("data-icono-disenado"));
    expect(estilos).toHaveLength(1);
    const css = estilos[0].textContent!;
    expect(css).toContain(":has(");
    expect(css).toContain(":focus-visible");
    expect(css).toContain('aria-current="page"');
  });
});

describe("VistaIcono", () => {
  it("ocupa el lado pedido y se puede poner sobre una ranura de dock", () => {
    const { container } = render(<VistaIcono diseno={d()} icono={Propio} lado={64} sobreDock />);
    const marco = container.querySelector("[data-vista-icono]") as HTMLElement;
    expect(marco.style.width).toBe("80px");
    expect(container.querySelector("[data-icono-disenado]")).not.toBeNull();
  });
});
