/**
 * Pruebas del proveedor «neuronas» de media-gen (IMG1011B). Sin red y sin GPU:
 * las neuronas y el motor de ejecución se inyectan; solo se cubre la lógica pura
 * y la orquestadora de la galería.
 */
import { describe, it, expect } from "vitest";
import {
  leerCapacidadImagenes,
  aNeuronaImg,
  neuronaTab,
  armarOpcion,
  ejecutarOpcionReal,
  extraerResultadoLocal,
  generarGaleriaImagenes,
  type EjecutarOpcion,
} from "../proveedor-neuronas";
import { modeloPorId } from "@/lib/imagenes/modelos";
import type { NeuronaImg, OpcionImagen } from "@/lib/imagenes/plan";

const sdTurbo = modeloPorId("sd-turbo")!;
const sdxl = modeloPorId("sdxl")!;

function neuronaLocal(over: Partial<NeuronaImg> = {}): NeuronaImg {
  return {
    id: "mac-de-casa",
    capa: "dispositivo",
    gpu: "apple",
    vramGB: null,
    ramLibreGB: 8,
    motores: ["sdcpp"],
    instalados: ["sd-turbo"],
    ocupada: false,
    ...over,
  };
}

describe("leerCapacidadImagenes", () => {
  it("devuelve null sin sección imagenes", () => {
    expect(leerCapacidadImagenes(null)).toBeNull();
    expect(leerCapacidadImagenes({})).toBeNull();
    expect(leerCapacidadImagenes("no")).toBeNull();
  });

  it("sanea y conserva lo publicado por la neurona", () => {
    const cap = leerCapacidadImagenes({
      imagenes: {
        endpoint: " http://192.168.1.10:8100 ",
        modelos: ["sd-turbo", 5, ""],
        motores: ["sdcpp", "inventado"],
        ocupada: true,
        vramGB: 6,
        ramLibreGB: 8,
        medidas: { "sd-turbo": 4.5, mal: "x" },
      },
    });
    expect(cap).not.toBeNull();
    expect(cap!.endpoint).toBe("http://192.168.1.10:8100");
    expect(cap!.modelos).toEqual(["sd-turbo"]);
    expect(cap!.motores).toEqual(["sdcpp"]);
    expect(cap!.ocupada).toBe(true);
    expect(cap!.vramGB).toBe(6);
    expect(cap!.ramLibreGB).toBe(8);
    expect(cap!.medidas).toEqual({ "sd-turbo": 4.5 });
  });
});

describe("aNeuronaImg", () => {
  it("rechaza filas sin id o sin capacidades de imagen", () => {
    expect(aNeuronaImg(null, "neurona")).toBeNull();
    expect(aNeuronaImg({ capabilities: {} }, "neurona")).toBeNull();
    expect(aNeuronaImg({ id: "a", capabilities: { imagenes: { modelos: [], motores: [] } } }, "neurona")).toBeNull();
  });

  it("mapea la ficha del registro a una NeuronaImg del plan", () => {
    const n = aNeuronaImg(
      {
        id: "portatil",
        capabilities: {
          gpuVendor: "NVIDIA Corporation",
          gpuRenderer: "GeForce RTX",
          memoryGb: 16,
          imagenes: { modelos: ["sd15"], motores: ["sdcpp"], vramGB: 8, ramLibreGB: 9 },
        },
      },
      "neurona",
    );
    expect(n).not.toBeNull();
    expect(n!.id).toBe("portatil");
    expect(n!.capa).toBe("neurona");
    expect(n!.gpu).toBe("nvidia");
    expect(n!.vramGB).toBe(8);
    expect(n!.ramLibreGB).toBe(9);
    expect(n!.instalados).toEqual(["sd15"]);
  });

  it("usa memoryGb como RAM libre si la neurona no la publica", () => {
    const n = aNeuronaImg(
      { id: "a1", capabilities: { memoryGb: 12, imagenes: { modelos: ["sd-turbo"], motores: ["sdcpp"] } } },
      "malla",
    );
    expect(n!.ramLibreGB).toBe(12);
    expect(n!.gpu).toBe("ninguna");
  });
});

describe("neuronaTab", () => {
  it("solo existe si el generador WebGPU está registrado", () => {
    expect(neuronaTab(false, 8)).toBeNull();
    const t = neuronaTab(true, 8)!;
    expect(t.capa).toBe("navegador");
    expect(t.motores).toEqual(["onnx-web"]);
    expect(t.instalados).toEqual(["sd-turbo"]);
    expect(t.ramLibreGB).toBe(8);
  });
});

describe("extraerResultadoLocal", () => {
  it("reconoce url, ref y base64", () => {
    expect(extraerResultadoLocal({ url: "blob:abc" })).toEqual({ url: "blob:abc" });
    expect(extraerResultadoLocal({ ref: "malla/abc.png" })).toEqual({ ref: "malla/abc.png" });
    expect(extraerResultadoLocal({ base64: "QUJD" })).toEqual({ url: "data:image/png;base64,QUJD" });
    expect(extraerResultadoLocal({ base64: "data:image/png;base64,QUJD" })).toEqual({ url: "data:image/png;base64,QUJD" });
    expect(extraerResultadoLocal({ nada: true })).toBeNull();
    expect(extraerResultadoLocal(null)).toBeNull();
  });
});

describe("armarOpcion", () => {
  const op: OpcionImagen = {
    capa: "dispositivo",
    neuronaId: "mac-de-casa",
    modelo: sdTurbo,
    motor: "sdcpp",
    cuantizacion: "q8",
    semilla: 1001,
    motivo: "cabe",
  };

  it("lleva licencia, uso y atribución SIEMPRE visibles", () => {
    const o = armarOpcion(op, { url: "blob:x", segundos: 12.3 });
    expect(o.url).toBe("blob:x");
    expect(o.modelo).toBe("SD-Turbo");
    expect(o.capa).toBe("dispositivo");
    expect(o.neurona).toBe("mac-de-casa");
    expect(o.semilla).toBe(1001);
    expect(o.licencia).toBe(sdTurbo.licencia);
    expect(o.uso).toBe(sdTurbo.uso);
    expect(o.atribucion).toContain("SD-Turbo");
    expect(o.atribucion).toContain("mac-de-casa");
    expect(o.segundos).toBe(12.3);
  });

  it("una opción de la web gratis declara su licencia también", () => {
    const web: OpcionImagen = { capa: "web-gratis", modelo: null, motor: "pollinations", cuantizacion: "nativa", semilla: 7, motivo: "web" };
    const o = armarOpcion(web, { url: "https://image.pollinations.ai/x", segundos: 3 });
    expect(o.modelo).toBeNull();
    expect(o.uso).toBe("libre");
    expect(o.licencia.toLowerCase()).toContain("pollinations");
    expect(o.atribucion).toContain("Pollinations");
  });

  it("una opción de Space público lleva modelo, licencia y «hecho en un Space público»", () => {
    const space: OpcionImagen = {
      capa: "espacio",
      modelo: modeloPorId("flux1-schnell")!,
      motor: "espacio-hf",
      cuantizacion: "nativa",
      semilla: 9,
      motivo: "Space verificado",
    };
    const o = armarOpcion(space, { url: "blob:space", segundos: 4 });
    expect(o.modelo).toBe("FLUX.1 [schnell]");
    expect(o.licencia).toBe("Apache-2.0");
    expect(o.origen).toBe("hecho en un Space público");
    expect(o.espacio).toBe("black-forest-labs/FLUX.1-schnell");
    expect(o.atribucion).toContain("hecho en un Space público");
  });
});

describe("capa espacio del proveedor", () => {
  it("la galería aplica los Spaces permitidos y devuelve su ficha", async () => {
    const ejecutar: EjecutarOpcion = async (op) =>
      op.motor === "espacio-hf" ? { url: `blob:${op.modelo?.id}`, segundos: 5 } : null;
    const g = await generarGaleriaImagenes(
      {
        prompt: "un faro violeta",
        opciones: 1,
        neuronas: [],
        espacios: ["flux1-schnell", "qwen-image"],
        permisoRemoto: true,
      },
      ejecutar,
    );
    expect(g.ok).toBe(true);
    expect(g.opciones).toHaveLength(1);
    const o = g.opciones[0];
    expect(o.capa).toBe("espacio");
    expect(o.modelo).toBe("Qwen-Image");
    expect(o.licencia).toBe("Apache-2.0");
    expect(o.atribucion).toContain("hecho en un Space público");
  });

  it("un modelo de la capa sin Space verificado no se llama a Hugging Face", async () => {
    const op: OpcionImagen = {
      capa: "espacio",
      modelo: modeloPorId("qwen-image-2.1")!,
      motor: "espacio-hf",
      cuantizacion: "nativa",
      semilla: 1,
      motivo: "CPU básica: no se usa",
    };
    const r = await ejecutarOpcionReal(op, "x", undefined);
    expect(r).toMatchObject({ segundos: 0 });
    expect(r?.motivo).toMatch(/no tiene un Space público verificado/);
  });
});

describe("generarGaleriaImagenes", () => {
  const base = { prompt: "un faro violeta al amanecer", permisoRemoto: true, semillaBase: 1000 };

  it("exige un prompt", async () => {
    const g = await generarGaleriaImagenes({ ...base, prompt: "  ", neuronas: [] }, async () => null);
    expect(g.ok).toBe(false);
    expect(g.error).toContain("Describe");
  });

  it("sin neuronas solo queda la web gratis, con semillas del plan", async () => {
    const ejecutar: EjecutarOpcion = async (op) =>
      op.motor === "pollinations" ? { url: `https://image.pollinations.ai/s${op.semilla}`, segundos: 2 } : null;
    const g = await generarGaleriaImagenes({ ...base, opciones: 3, neuronas: [] }, ejecutar);
    expect(g.ok).toBe(true);
    expect(g.opciones).toHaveLength(3);
    expect(g.opciones.every((o) => o.capa === "web-gratis")).toBe(true);
    expect(new Set(g.opciones.map((o) => o.semilla)).size).toBe(3);
  });

  it("prefiere la neurona propia antes que la web, y cuando falla la sustituye por la siguiente del plan", async () => {
    const ejecutar: EjecutarOpcion = async (op) => {
      if (op.capa === "dispositivo") return null; // su servicio local no responde
      return { url: `https://image.pollinations.ai/s${op.semilla}`, segundos: 1 };
    };
    const g = await generarGaleriaImagenes({ ...base, opciones: 2, neuronas: [neuronaLocal()] }, ejecutar);
    expect(g.ok).toBe(true);
    expect(g.opciones).toHaveLength(2);
    // La primera candidata era local y falló: se contó en los descartes y se sustituyó.
    expect(g.descartes.some((d) => d.includes("dispositivo") && d.includes("no respondió"))).toBe(true);
    expect(g.opciones.every((o) => o.capa === "web-gratis" || o.capa === "dispositivo")).toBe(true);
    // La opción local que salió debe declarar su neurona y licencia.
    const local = g.opciones.find((o) => o.capa === "dispositivo");
    if (local) expect(local.licencia).toBe(sdTurbo.licencia);
  });

  it("una opción local que responde sale en la galería con su neurona", async () => {
    const ejecutar: EjecutarOpcion = async (op) => {
      if (op.capa === "dispositivo") return { ref: "neurona/mac-de-casa/1001.png", segundos: 9.5 };
      return null;
    };
    const g = await generarGaleriaImagenes({ ...base, opciones: 2, neuronas: [neuronaLocal()] }, ejecutar);
    expect(g.ok).toBe(true);
    const local = g.opciones.find((o) => o.capa === "dispositivo")!;
    expect(local.ref).toBe("neurona/mac-de-casa/1001.png");
    expect(local.neurona).toBe("mac-de-casa");
    expect(local.segundos).toBe(9.5);
  });

  it("sin permiso remoto y con imagen de referencia, nada sale de tus neuronas", async () => {
    const ejecutar: EjecutarOpcion = async () => null;
    const g = await generarGaleriaImagenes(
      { prompt: "edítala", conReferencia: true, permisoRemoto: false, neuronas: [] },
      ejecutar,
    );
    expect(g.ok).toBe(false);
    expect(g.descartes.some((d) => d.includes("permiso"))).toBe(true);
  });

  it("nada no comercial entra en un uso comercial", async () => {
    const n = neuronaLocal({ instalados: ["flux1-dev"] });
    const ejecutar: EjecutarOpcion = async (op) =>
      op.motor === "pollinations" ? { url: "https://image.pollinations.ai/x", segundos: 1 } : null;
    const g = await generarGaleriaImagenes(
      { ...base, opciones: 1, comercial: true, neuronas: [n] },
      ejecutar,
    );
    expect(g.descartes.some((d) => d.includes("no permite uso comercial"))).toBe(true);
    expect(g.opciones.every((o) => o.modelo !== "FLUX.1 [dev]")).toBe(true);
  });

  it("las neuronas ocupadas no reciben trabajo", async () => {
    const ejecutar: EjecutarOpcion = async (op) =>
      op.motor === "pollinations" ? { url: "https://image.pollinations.ai/x", segundos: 1 } : null;
    const g = await generarGaleriaImagenes(
      { ...base, opciones: 1, neuronas: [neuronaLocal({ ocupada: true })] },
      ejecutar,
    );
    expect(g.descartes.some((d) => d.includes("ocupada"))).toBe(true);
    expect(g.opciones).toHaveLength(1);
    expect(g.opciones[0].capa).toBe("web-gratis");
  });

  it("si ninguna opción responde, devuelve ok:false con los motivos honestos", async () => {
    const g = await generarGaleriaImagenes({ ...base, opciones: 2, neuronas: [neuronaLocal()] }, async () => null);
    expect(g.ok).toBe(false);
    expect(g.error).toContain("Ninguna");
    expect(g.descartes.length).toBeGreaterThan(0);
  });

  it("la neurona sin memoria suficiente no recibe un modelo que no le cabe", async () => {
    const apretada = neuronaLocal({ ramLibreGB: 3, instalados: ["sd15", "sdxl"] });
    const ejecutar: EjecutarOpcion = async (op) =>
      op.motor === "pollinations" ? { url: "https://image.pollinations.ai/x", segundos: 1 } : null;
    const g = await generarGaleriaImagenes({ ...base, opciones: 2, neuronas: [apretada] }, ejecutar);
    expect(g.descartes.some((d) => d.includes("no cabe"))).toBe(true);
    expect(g.opciones.find((o) => o.modelo === sdxl.nombre)).toBeUndefined();
  });
});
