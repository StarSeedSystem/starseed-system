/**
 * Pruebas del adaptador de la capa «espacio» para imágenes (ESP1011D). Sin red:
 * los Spaces se SIMULAN con un fetch falso; solo funciones puras (cuerpos, mapeo,
 * lectura de resultados y la ejecución con fetch inyectado).
 */
import { describe, it, expect } from "vitest";
import {
  ESPACIOS_IMAGEN,
  atribucionEspacio,
  cuerpoInfer,
  espacioDeModelo,
  espacioDeOpcion,
  espaciosDisponibles,
  ejecutarEspacioImagen,
  semillaDeResultado,
  semillaEspacio,
  urlImagenDeResultado,
  type Fetcher,
  type ResultadoEspacioImagen,
} from "../espacios-imagen";
import { modeloPorId } from "@/lib/imagenes/modelos";
import type { OpcionImagen } from "@/lib/imagenes/plan";

const spaceFlux = espacioDeModelo("flux1-schnell")!;
const spaceQwen = espacioDeModelo("qwen-image")!;

const opDe = (modeloId: string, over: Partial<OpcionImagen> = {}): OpcionImagen => ({
  capa: "espacio",
  modelo: modeloPorId(modeloId) ?? null,
  motor: "espacio-hf",
  cuantizacion: "nativa",
  semilla: 123,
  motivo: "Space público",
  ...over,
});

interface PasoFalso { ok: boolean; json?: unknown; texto?: string }

/** Fetch falso: una «respuesta» por llamada, en orden; guarda qué se llamó y con qué. */
function fetcherFalso(pasos: PasoFalso[]): { f: Fetcher; llamadas: Array<{ url: string; init?: RequestInit }> } {
  const llamadas: Array<{ url: string; init?: RequestInit }> = [];
  const f = async (url: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    llamadas.push({ url: String(url), init });
    const paso = pasos[llamadas.length - 1] ?? { ok: false };
    return {
      ok: paso.ok,
      status: paso.ok ? 200 : 503,
      json: async () => paso.json ?? null,
      text: async () => paso.texto ?? "",
    } as unknown as Response;
  };
  return { f: f as unknown as Fetcher, llamadas };
}

describe("tabla de Spaces", () => {
  it("solo sabe FLUX.1-schnell y Qwen-Image (2.1 corre en CPU básica y NO se usa)", () => {
    expect(ESPACIOS_IMAGEN.map((e) => e.modeloId)).toEqual(["flux1-schnell", "qwen-image"]);
    expect(espacioDeModelo("qwen-image-2.1")).toBeNull();
    expect(espacioDeModelo("sd-turbo")).toBeNull();
    expect(espacioDeModelo(null)).toBeNull();
    expect(espaciosDisponibles()).toEqual(["flux1-schnell", "qwen-image"]);
  });

  it("los dos declaran licencia Apache-2.0 y su id coincide con el catálogo", () => {
    for (const e of ESPACIOS_IMAGEN) {
      const m = modeloPorId(e.modeloId)!;
      expect(m.licencia).toContain("Apache-2.0");
      expect(m.uso).toBe("libre");
      expect(m.espacio).toBe(e.espacioId);
      expect(e.url).toContain(".hf.space");
      expect(e.endpoint).toBe("/infer");
    }
  });

  it("atribución con modelo, licencia y «Space público»", () => {
    const t = atribucionEspacio(modeloPorId("flux1-schnell")!);
    expect(t).toContain("FLUX.1 [schnell]");
    expect(t).toContain("Apache-2.0");
    expect(t).toContain("Space público");
  });
});

describe("espacioDeOpcion", () => {
  it("acepta una opción real del plan y da null fuera de la capa espacio", () => {
    expect(espacioDeOpcion(opDe("qwen-image"))?.url).toBe(spaceQwen.url);
    expect(espacioDeOpcion(opDe("qwen-image-2.1"))).toBeNull();
    expect(espacioDeOpcion(opDe("qwen-image", { motor: "sdcpp" }))).toBeNull();
    expect(espacioDeOpcion(opDe("qwen-image", { capa: "web-gratis" }))).toBeNull();
  });
});

describe("semillaEspacio", () => {
  it("cualquier semilla cabe en el rango que publica el Space", () => {
    expect(semillaEspacio(123)).toBe(123);
    expect(semillaEspacio(-7)).toBe(7);
    expect(semillaEspacio(2147483648 + 5)).toBe(5);
    expect(semillaEspacio(Number.NaN)).toBe(0);
  });
});

describe("cuerpoInfer", () => {
  it("FLUX: 6 parámetros, semilla propia con randomize_seed=false y lado topeado", () => {
    const c = cuerpoInfer(spaceFlux, "un faro violeta", 123);
    expect(c.data).toEqual(["un faro violeta", 123, false, 1024, 1024, 4]);
    const tope = cuerpoInfer(spaceFlux, "x", 0, { lado: 9000, pasos: 8 });
    expect(tope.data[3]).toBe(2048);
    expect(tope.data[5]).toBe(8);
    const piso = cuerpoInfer(spaceFlux, "x", 0, { lado: 0 });
    expect(piso.data[3]).toBe(256);
  });

  it("Qwen-Image: 7 parámetros con proporción, guía 4.0 y mejora de prompt del Space", () => {
    const c = cuerpoInfer(spaceQwen, "un faro violeta", 123);
    expect(c.data).toEqual(["un faro violeta", 123, false, "1:1", 4, 50, true]);
    const otra = cuerpoInfer(spaceQwen, "x", -9, { aspecto: "16:9", pasos: 20 });
    expect(otra.data[1]).toBe(9);
    expect(otra.data[3]).toBe("16:9");
    expect(otra.data[5]).toBe(20);
  });
});

describe("leer el resultado de /infer", () => {
  const base = spaceQwen.url;

  it("URL absoluta, relativa con base, o vía path del Space", () => {
    expect(urlImagenDeResultado([{ path: "/tmp/a.png", url: "https://x.com/a.png" }], base)).toBe("https://x.com/a.png");
    expect(urlImagenDeResultado([{ path: "/tmp/a.png", url: "/gradio_api/file=/tmp/a.png" }], base)).toBe(`${base}/gradio_api/file=/tmp/a.png`);
    expect(urlImagenDeResultado([{ path: "/tmp/b.png" }], base)).toBe(`${base}/gradio_api/file=/tmp/b.png`);
    expect(urlImagenDeResultado([], base)).toBeNull();
    expect(urlImagenDeResultado([42], base)).toBeNull();
  });

  it("la semilla devuelta por el Space se lee; si no viene, null", () => {
    expect(semillaDeResultado([{ path: "p" }, 99])).toBe(99);
    expect(semillaDeResultado([{ path: "p" }, 99.7])).toBe(99);
    expect(semillaDeResultado([{ path: "p" }])).toBeNull();
  });
});

describe("ejecutarEspacioImagen (Spaces simulados, sin red)", () => {
  const sseBuena = 'event: complete\ndata: [{"path": "/tmp/r.png", "url": "https://x.com/r.png"}, 99]\n';

  it("llama el Space de la opción con SU semilla y devuelve su URL y semilla", async () => {
    const { f, llamadas } = fetcherFalso([{ ok: true, json: { event_id: "e1" } }, { ok: true, texto: sseBuena }]);
    const r: ResultadoEspacioImagen | null = await ejecutarEspacioImagen(opDe("flux1-schnell", { semilla: -77 }), " un faro ", {}, f);
    expect(r).not.toBeNull();
    expect(r?.url).toBe("https://x.com/r.png");
    expect(r?.semillaUsada).toBe(99);
    expect(llamadas).toHaveLength(2);
    expect(llamadas[0].url).toBe(`${spaceFlux.url}/gradio_api/call/infer`);
    const cuerpo = JSON.parse((llamadas[0].init?.body as string) ?? "{}") as { data: unknown[] };
    expect(cuerpo.data[0]).toBe("un faro");
    expect(cuerpo.data[1]).toBe(77);
    expect(cuerpo.data[2]).toBe(false);
    expect(llamadas[1].url).toBe(`${spaceFlux.url}/gradio_api/call/infer/e1`);
    expect((llamadas[0].init?.credentials ?? llamadas[1].init?.credentials)).toBe("omit");
  });

  it("rechaza lo que no sabe llamar sin abrir la red", async () => {
    const { f, llamadas } = fetcherFalso([]);
    expect(await ejecutarEspacioImagen(opDe("qwen-image-2.1"), "x", {}, f)).toBeNull();
    expect(await ejecutarEspacioImagen(opDe("flux1-schnell", { motor: "sdcpp" }), "x", {}, f)).toBeNull();
    expect(await ejecutarEspacioImagen(opDe("flux1-schnell", { motor: "pollinations" }), "x", {}, f)).toBeNull();
    expect(await ejecutarEspacioImagen(opDe("qwen-image"), "   ", {}, f)).toBeNull();
    expect(llamadas).toHaveLength(0);
  });

  it("«basta de ilusiones»: Space dormido, lleno o con la API cambiada → null honesto", async () => {
    const dormido = fetcherFalso([{ ok: false }]);
    expect(await ejecutarEspacioImagen(opDe("qwen-image"), "x", {}, dormido.f)).toBeNull();
    const sinEvento = fetcherFalso([{ ok: true, json: {} }]);
    expect(await ejecutarEspacioImagen(opDe("qwen-image"), "x", {}, sinEvento.f)).toBeNull();
    const llenoSSE = fetcherFalso([{ ok: true, json: { event_id: "e" } }, { ok: true, texto: "event: error\ndata: null\n" }]);
    expect(await ejecutarEspacioImagen(opDe("qwen-image"), "x", {}, llenoSSE.f)).toBeNull();
    const sinComplete = fetcherFalso([{ ok: true, json: { event_id: "e" } }, { ok: true, texto: "event: heartbeat\ndata: null\n" }]);
    const r = await ejecutarEspacioImagen(opDe("qwen-image"), "x", {}, sinComplete.f);
    expect(r).toBeNull();
    expect(sinComplete.llamadas).toHaveLength(2);
  });
});
