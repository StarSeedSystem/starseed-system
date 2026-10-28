import { describe, expect, it } from "vitest";
import {
  etiquetaUso, galeriaPresentable, licenciaTexto, nombreCapa, semillaTexto, tituloOpcion,
} from "../presentacion";
import type { OpcionGaleria } from "@/ai/astraura/media/proveedor-neuronas";

const opcion = (mas: Partial<OpcionGaleria> = {}): OpcionGaleria => ({
  url: "blob:opcion-a",
  modelo: "SDXL 1.0",
  capa: "neurona",
  neurona: "a1",
  semilla: 7,
  licencia: "CreativeML OpenRAIL++-M",
  uso: "libre",
  atribucion: "",
  segundos: 2.5,
  ...mas,
});

describe("nombres y etiquetas", () => {
  it("cada capa se dice en palabras, no con su identificador", () => {
    expect(nombreCapa("dispositivo")).toBe("Este aparato");
    expect(nombreCapa("navegador")).toBe("La pestaña (WebGPU)");
    expect(nombreCapa("web-gratis")).toBe("Web gratis");
  });

  it("la licencia no comercial se marca en uso comercial y se deja clara en uso personal", () => {
    expect(etiquetaUso("no-comercial", true)).toMatch(/no vale aquí/);
    expect(etiquetaUso("no-comercial", false)).toBe("NO comercial");
    expect(etiquetaUso("libre", true)).toBe("libre");
    expect(etiquetaUso("atribucion", false)).toBe("libre con atribución");
  });
});

describe("título, semilla y licencia de una opción", () => {
  it("el título lleva la capa y el modelo; sin modelo no inventa uno", () => {
    expect(tituloOpcion(opcion())).toBe("Tu otra neurona · SDXL 1.0");
    expect(tituloOpcion(opcion({ modelo: null, capa: "web-gratis" }))).toBe("Web gratis");
  });

  it("la semilla muestra los segundos solo cuando se midieron", () => {
    expect(semillaTexto(opcion())).toBe("Semilla 7 · 2.5 s");
    expect(semillaTexto(opcion({ segundos: 0 }))).toBe("Semilla 7");
  });

  it("la licencia incluye la atribución cuando existe", () => {
    expect(licenciaTexto(opcion())).toBe("Licencia: CreativeML OpenRAIL++-M");
    expect(licenciaTexto(opcion({ atribucion: "© Stability AI" })))
      .toBe("Licencia: CreativeML OpenRAIL++-M · © Stability AI");
  });
});

describe("galeriaPresentable", () => {
  it("sin galería o sin ninguna opción con url no hay nada que pintar", () => {
    expect(galeriaPresentable(null)).toBeNull();
    expect(galeriaPresentable(undefined)).toBeNull();
    expect(galeriaPresentable({ opciones: [] })).toBeNull();
    expect(galeriaPresentable({ opciones: [opcion({ url: undefined }), opcion({ url: "" })] })).toBeNull();
  });

  it("se queda solo con las opciones con url y les pone sus textos", () => {
    const g = galeriaPresentable({
      opciones: [opcion(), opcion({ url: undefined, semilla: 9 }), opcion({ url: "blob:b", capa: "malla" })],
      descartes: ["FLUX no cabe en esta neurona."],
    });
    expect(g).not.toBeNull();
    expect(g!.opciones).toHaveLength(2);
    expect(g!.opciones.map((o) => o.url)).toEqual(["blob:opcion-a", "blob:b"]);
    expect(g!.opciones[0].titulo).toBe("Tu otra neurona · SDXL 1.0");
    expect(g!.opciones[1].semillaTexto).toBe("Semilla 7 · 2.5 s");
    expect(g!.descartes).toEqual(["FLUX no cabe en esta neurona."]);
  });

  it("el error se conserva para enseñarlo, no se esconde", () => {
    const g = galeriaPresentable({ opciones: [opcion()], descartes: [], error: "Una opción falló" });
    expect(g!.error).toBe("Una opción falló");
  });
});
