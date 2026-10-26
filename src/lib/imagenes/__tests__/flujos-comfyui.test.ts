import { describe, expect, it } from "vitest";
import {
  escalar,
  FORMATOS_PUBLICACION,
  imagenAImagen,
  ladosFormato,
  MEGAPIXELES,
  MUESTREADORES_COMFYUI,
  NODOS_NUCLEO,
  PLANIFICADORES_COMFYUI,
  textoAImagen,
  variaciones,
  type EscalaImagen,
  type FormatoPublicacion,
  type GrafoComfyUI,
  type MuestreadorComfyUI,
  type PlanificadorComfyUI,
} from "../flujos-comfyui";

const pet = () => ({
  checkpoint: "sd15.safetensors", positivo: "una órbita dorada", negativo: "borroso",
  formato: "16:9" as const, semilla: 42, pasos: 25, cfg: 7,
  muestreador: "euler" as const, planificador: "karras" as const,
});

/** Ids a los que apunta algún enlace `["<id>", <salida>]` del grafo. */
function idsDeEnlace(g: GrafoComfyUI): string[] {
  return Object.values(g).flatMap((nodo) =>
    Object.values(nodo.inputs).flatMap((valor) =>
      Array.isArray(valor) && valor.length === 2
        ? typeof valor[0] === "string" && typeof valor[1] === "number"
          ? [valor[0]]
          : (() => { throw new Error(`Enlace mal formado: ${JSON.stringify(valor)}`); })()
        : [],
    ),
  );
}

describe("ladosFormato · formatos de publicación", () => {
  const proporcion = { "1:1": 1, "4:5": 0.8, "9:16": 9 / 16, "16:9": 16 / 9 } as const;
  for (const escala of ["estandar", "sd15"] as const) {
    for (const formato of FORMATOS_PUBLICACION) {
      it(`${formato} a ${escala}: múltiplos de 8, proporción fiel (±2 %) y área cerca del objetivo`, () => {
        const { ancho, alto } = ladosFormato(formato, escala);
        expect(ancho % 8).toBe(0);
        expect(alto % 8).toBe(0);
        expect(Math.abs(ancho / alto - proporcion[formato]) / proporcion[formato]).toBeLessThanOrEqual(0.02);
        expect((ancho * alto) / (MEGAPIXELES[escala] * 1_000_000)).toBeGreaterThan(0.9);
        expect((ancho * alto) / (MEGAPIXELES[escala] * 1_000_000)).toBeLessThan(1.2);
        expect(ancho).toBeLessThanOrEqual(2048);
        expect(alto).toBeLessThanOrEqual(2048);
      });
    }
  }
  it("sd15 da una imagen de 512² en 1:1 (~0,26 MP, la gama SD 1.5)", () => {
    expect(ladosFormato("1:1", "sd15")).toEqual({ ancho: 512, alto: 512 });
  });
  it("las cuatro proporciones de publicación son distintas entre sí", () => {
    const proporciones = FORMATOS_PUBLICACION.map((formato) => {
      const { ancho, alto } = ladosFormato(formato);
      return Number((ancho / alto).toFixed(3));
    });
    expect(new Set(proporciones).size).toBe(FORMATOS_PUBLICACION.length);
  });
  it("rechaza formatos y escalas desconocidos con error legible", () => {
    expect(() => ladosFormato("2:3" as FormatoPublicacion)).toThrow(/formato.*no es de publicación/);
    expect(() => ladosFormato("1:1", "xl" as EscalaImagen)).toThrow(/escala.*no existe/);
  });
});

describe("listas del núcleo · contrato de §2", () => {
  it("muestreadores y planificadores son exactamente los admitidos", () => {
    expect([...MUESTREADORES_COMFYUI]).toEqual(["euler", "euler_ancestral", "dpmpp_2m", "dpmpp_sde"]);
    expect([...PLANIFICADORES_COMFYUI]).toEqual(["normal", "karras", "simple"]);
  });
  it("la lista blanca no incluye nodos personalizados de terceros", () => {
    expect([...NODOS_NUCLEO]).toEqual([
      "CheckpointLoaderSimple", "CLIPTextEncode", "EmptyLatentImage", "KSampler",
      "LoadImage", "VAEEncode", "VAEDecode", "ImageScaleBy", "SaveImage",
    ]);
  });
});

describe("todas las plantillas · grafo en formato API", () => {
  const grafos: [string, GrafoComfyUI][] = [
    ["texto a imagen", textoAImagen(pet())],
    ["imagen a imagen", imagenAImagen({ ...pet(), imagen: "entrada.png", denoise: 0.6 })],
    ["escalado", escalar({ imagen: "entrada.png", metodo: "lanczos", factor: 2 })],
    ...[42, 1234].map((semilla) => [`variación ${semilla}`, textoAImagen({ ...pet(), semilla })] as [string, GrafoComfyUI]),
  ];
  for (const [nombre, g] of grafos) {
    it(`${nombre}: solo nodos del núcleo y enlaces que apuntan a nodos que existen`, () => {
      const ids = Object.keys(g);
      expect(ids.length).toBeGreaterThan(0);
      for (const [id, nodo] of Object.entries(g)) {
        expect(NODOS_NUCLEO as readonly string[], `nodo ${id}`).toContain(nodo.class_type);
        expect(Number.isInteger(Number(id)), `id «${id}» numérico como pide el formato API`).toBe(true);
      }
      for (const idApuntado of idsDeEnlace(g)) {
        expect(ids, `el enlace apunta a «${idApuntado}», que tiene que existir`).toContain(idApuntado);
      }
    });
  }
});

describe("textoAImagen", () => {
  it("encadena carga → texto (positivo y negativo) → latente vacío con el tamaño del formato → muestreo → VAE → guardar", () => {
    const g = textoAImagen(pet());
    expect(g["4"].inputs.width).toBe(ladosFormato("16:9").ancho);
    expect(g["4"].inputs.height).toBe(ladosFormato("16:9").alto);
    expect(g["5"].inputs.denoise).toBe(1);
    expect(g["5"].inputs.sampler_name).toBe("euler");
    expect(g["5"].inputs.scheduler).toBe("karras");
    expect(g["2"].inputs.text).toBe("una órbita dorada");
    expect(g["3"].inputs.text).toBe("borroso");
  });
  it("el muestreador toma el positivo del nodo 2 y el negativo del nodo 3, ambos del CLIP del checkpoint", () => {
    const g = textoAImagen(pet());
    expect(g["5"].inputs.positive).toEqual(["2", 0]);
    expect(g["5"].inputs.negative).toEqual(["3", 0]);
    expect(g["2"].inputs.clip).toEqual(["1", 1]);
    expect(g["3"].inputs.clip).toEqual(["1", 1]);
    expect(g["6"].inputs.vae).toEqual(["1", 2]);
    expect(g["7"].inputs.images).toEqual(["6", 0]);
  });
  it("rechaza con error legible los parámetros fuera de rango", () => {
    expect(() => textoAImagen({ ...pet(), pasos: 61 })).toThrow(/pasos.*60/);
    expect(() => textoAImagen({ ...pet(), cfg: 0 })).toThrow(/CFG.*15/);
    expect(() => textoAImagen({ ...pet(), semilla: -1 })).toThrow(/semilla/);
    expect(() => textoAImagen({ ...pet(), muestreador: "ddim" as MuestreadorComfyUI })).toThrow(/muestreador/);
    expect(() => textoAImagen({ ...pet(), planificador: "ddim_uniform" as PlanificadorComfyUI })).toThrow(/planificador/);
    expect(() => textoAImagen({ ...pet(), checkpoint: "  " })).toThrow(/checkpoint/);
  });
});

describe("imagenAImagen y escalar", () => {
  it("imagen a imagen codifica la entrada (VAEEncode) y muestrea con el denoise que da quien llama", () => {
    const g = imagenAImagen({ ...pet(), imagen: "entrada.png", denoise: 0.6 });
    expect(g["1"].class_type).toBe("LoadImage");
    expect(g["5"].class_type).toBe("VAEEncode");
    expect(g["6"].inputs.denoise).toBe(0.6);
    expect(() => imagenAImagen({ ...pet(), imagen: "entrada.png", denoise: 1.5 })).toThrow(/denoise/);
    expect(() => imagenAImagen({ ...pet(), imagen: " ", denoise: 0.5 })).toThrow(/imagen de entrada/);
  });
  it("escalado: LoadImage → ImageScaleBy con el método del núcleo y el factor acotado", () => {
    const g = escalar({ imagen: "entrada.png", metodo: "bicubic", factor: 1.5 });
    expect(g["2"].class_type).toBe("ImageScaleBy");
    expect(g["2"].inputs.upscale_method).toBe("bicubic");
    expect(g["2"].inputs.scale_by).toBe(1.5);
    expect(g["2"].inputs.image).toEqual(["1", 0]);
    expect(() => escalar({ imagen: "x.png", metodo: "lanczos", factor: 9 })).toThrow(/factor/);
    expect(() => escalar({ imagen: "x.png", metodo: "lanczos", factor: 0 })).toThrow(/factor/);
    expect(() => escalar({ imagen: " ", metodo: "lanczos", factor: 2 })).toThrow(/imagen de entrada/);
  });
  it("escalado admite todos los métodos del núcleo ImageScaleBy", () => {
    for (const metodo of ["nearest-exact", "bilinear", "area", "bicubic", "lanczos"] as const) {
      expect(escalar({ imagen: "x.png", metodo, factor: 2 })["2"].inputs.upscale_method).toBe(metodo);
    }
  });
});

describe("variaciones", () => {
  it("un grafo completo por cada semilla, idéntico salvo la semilla", () => {
    const gs = variaciones(pet(), [1, 2, 3]);
    expect(gs).toHaveLength(3);
    for (const [i, g] of gs.entries()) {
      expect(g["5"].class_type).toBe("KSampler");
      expect(g["5"].inputs.seed).toBe([1, 2, 3][i]);
      expect(Object.keys(g)).toEqual(Object.keys(gs[0]));
    }
    expect(gs[0]["5"].inputs).toEqual({ ...gs[1]["5"].inputs, seed: 1 });
  });
  it("exige al menos una semilla (error legible)", () => {
    expect(() => variaciones(pet(), [])).toThrow(/semilla/);
  });
});
