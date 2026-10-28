/**
 * Pruebas de la tarjeta de opciones de imagen (IMG1011C · parte 1 de 3). Sin red: todo es render
 * y funciones puras. El estado real y las llamadas a generadores quedan en el adaptador (parte 2).
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import TarjetaImagenes, { DONDE_SE_HIZO, licenciaDe, abrirProtomolecula, type OpcionResultado } from "../tarjeta-imagenes";
import { PROTO_ORB_ABRIR_EVENT } from "@/lib/protomolecula/orbe-bus";
import { MODELOS_IMAGEN } from "@/lib/imagenes/modelos";
import type { CapaImg } from "@/lib/imagenes/plan";

const sd15 = MODELOS_IMAGEN.find((m) => m.id === "sd15")!;
const opDe = (campos: Partial<OpcionResultado> & { capa: CapaImg }): OpcionResultado => ({
  capa: campos.capa, modelo: campos.modelo ?? null, motor: campos.motor ?? "sdcpp",
  cuantizacion: "nativa", semilla: 41, motivo: "porque sí", estado: campos.estado ?? "lista",
  url: campos.url, atribucion: campos.atribucion,
});
const TODAS = [opDe({ capa: "neurona", modelo: sd15 }), opDe({ capa: "web-gratis", estado: "pendiente" })];

describe("funciones puras de la tarjeta (modelo, capa, licencia)", () => {
  afterEach(() => cleanup());

  it("cada capa se dice en palabras de la persona y ninguna falta en el mapa", () => {
    const capas: CapaImg[] = ["dispositivo", "navegador", "neurona", "malla", "espacio", "web-gratis", "externo"];
    expect(capas.filter((c) => !DONDE_SE_HIZO[c])).toEqual([]);
    expect(DONDE_SE_HIZO.dispositivo).toBe("En tu aparato");
    expect(DONDE_SE_HIZO["web-gratis"]).toContain("la web");
  });

  it("la licencia nombra el mote de uso; sin modelo, el motor manda", () => {
    expect(licenciaDe(opDe({ capa: "neurona", modelo: sd15 }))).toContain("OpenRAIL-M");
    expect(licenciaDe(opDe({ capa: "web-gratis", motor: "pollinations" }))).toContain("sin licencia");
    expect(licenciaDe(opDe({ capa: "externo", motor: "externo" }))).toContain("Servicio de pago");
    expect(licenciaDe(opDe({ capa: "espacio", motor: "espacio-hf" }))).toContain("Space");
  });
});

describe("TarjetaImagenes", () => {
  afterEach(() => cleanup());

  it("sin opciones ni carga: lo dice y no inventa rejilla", () => {
    render(<TarjetaImagenes opciones={[]} cargando={false} error={null} acciones={{}} />);
    expect(screen.queryByRole("group")).toBeNull();
    expect(screen.getByText(/No hay opciones/)).toBeTruthy();
  });

  it("cargando: aria-busy y sin rejilla", () => {
    render(<TarjetaImagenes opciones={[]} cargando error={null} acciones={{}} />);
    expect(screen.getByText("Preparando opciones de imagen…")).toBeTruthy();
    expect(screen.getByText(/Preparando/).closest("section")!.hasAttribute("aria-busy")).toBe(true);
  });

  it("error: con role alert", () => {
    render(<TarjetaImagenes opciones={[]} cargando={false} error="Falló la neurona" acciones={{}} />);
    expect(screen.getByRole("alert").textContent).toContain("Falló la neurona");
  });

  it("las opciones van en rejilla con modelo, capa, licencia y atribución visibles", () => {
    render(
      <TarjetaImagenes
        opciones={[{ ...TODAS[0], atribucion: "Autoría del modelo en Hugging Face" }, TODAS[1]]}
        cargando={false} error={null} acciones={{}}
      />,
    );
    expect(screen.getByRole("group", { name: "Opciones de imagen de Astraura" })).toBeTruthy();
    expect(screen.getByText(/Stable Diffusion 1\.5/)).toBeTruthy();
    expect(screen.getByText("En otra neurona tuya")).toBeTruthy();
    expect(screen.getByText(/OpenRAIL-M/)).toBeTruthy();
    expect(screen.getByText("Autoría del modelo en Hugging Face")).toBeTruthy();
    expect(screen.getByText(DONDE_SE_HIZO["web-gratis"])).toBeTruthy();
  });

  it("acción nula no pinta su botón; con acciones, cada botón llama una sola vez", () => {
    const elegir = vi.fn();
    render(
      <TarjetaImagenes opciones={TODAS} cargando={false} error={null}
        acciones={{ elegir, usarComoReferencia3D: elegir }} />,
    );
    expect(screen.queryAllByRole("button", { name: /Variar la opción/ })).toEqual([]);
    const elegir2 = screen.getAllByRole("button", { name: "Elegir la opción 1" });
    fireEvent.click(elegir2[0]);
    expect(elegir).toHaveBeenCalledTimes(1);
    screen.getAllByRole("button", { name: "Usar la opción 1 como referencia 3D" })[0].click();
    expect(elegir).toHaveBeenCalledTimes(2);
  });

  it("la elegida se marca con ring y aria-current", () => {
    render(<TarjetaImagenes opciones={TODAS} cargando={false} error={null} acciones={{}} elegida={1} />);
    const marcada = screen.getByText("Opción 2 · Web gratis (Pollinations)").closest("article")!;
    expect(marcada.getAttribute("aria-current")).toBe("true");
    expect(marcada.className).toContain("ring-2");
  });

  it("con URL hay imagen con texto alternativo y con error una explicación", () => {
    render(
      <TarjetaImagenes
        opciones={[
          opDe({ capa: "neurona", modelo: sd15, url: "data:image/png;base64,aa" }),
          opDe({ capa: "neurona", modelo: sd15, estado: "error" }),
        ]}
        cargando={false} error={null} acciones={{}} prompt="un atardecer"
      />,
    );
    expect((screen.getByRole("img") as HTMLImageElement).alt).toContain("un atardecer");
    expect(screen.getByText(/No salió esta opción/)).toBeTruthy();
  });

  it("sin manejo, Editar abre el panel con el bus de la Protomolécula", () => {
    const visto: string[] = [];
    const oyente = () => visto.push("abrir");
    window.addEventListener(PROTO_ORB_ABRIR_EVENT, oyente);
    try {
      render(<TarjetaImagenes opciones={TODAS} cargando={false} error={null} acciones={{}} />);
      fireEvent.click(screen.getAllByRole("button", { name: /Editar la opción 1/ })[0]);
      expect(visto.length).toBeGreaterThan(0);
      abrirProtomolecula();
      expect(visto.length).toBeGreaterThan(1);
    } finally {
      window.removeEventListener(PROTO_ORB_ABRIR_EVENT, oyente);
    }
  });
});
