import { describe, expect, it } from "vitest";
import {
  ESPACIOS_IMAGEN,
  datosConSemilla,
  ejecutarOpcionEspacio,
  elegirEndpoint,
  espacioDeModelo,
  fichaDeEspacio,
  opcionesEspacioDelPlan,
} from "../espacios-imagen";
import { hostPorDefecto, type FetchLike } from "@/lib/espacios/cliente-espacios";
import type { AlmacenLocal } from "@/lib/espacios/cuota-espacios";
import { modeloPorId } from "@/lib/imagenes/modelos";
import type { OpcionImagen } from "@/lib/imagenes/plan";

const FLUX = "black-forest-labs/FLUX.1-schnell";
const AHORA = Date.UTC(2026, 9, 22, 12, 0, 0);

function almacen(): AlmacenLocal {
  const datos = new Map<string, string>();
  return { get: (k) => datos.get(k) ?? null, set: (k, v) => (datos.set(k, v), true), remove: (k) => void datos.delete(k) };
}

function opcion(modelo: string, semilla = 7): OpcionImagen {
  return { capa: "espacio", modelo: modeloPorId(modelo)!, motor: "espacio-hf", cuantizacion: "nativa", semilla, motivo: "Space" };
}

interface Sim {
  dormido?: boolean;
  parametros?: Array<{ parameter_name: string; component: string; parameter_has_default?: boolean; parameter_default?: unknown }>;
}

function spaceSimulado(sim: Sim = {}, espacioId = FLUX) {
  const host = hostPorDefecto(espacioId);
  const llamadas: Array<{ url: string; init?: RequestInit }> = [];
  const parametros = sim.parametros ?? [
    { parameter_name: "prompt", component: "Textbox" },
    { parameter_name: "seed", component: "Slider", parameter_has_default: true, parameter_default: 0 },
    { parameter_name: "randomize_seed", component: "Checkbox", parameter_has_default: true, parameter_default: true },
  ];
  const f: FetchLike = async (url, init) => {
    llamadas.push({ url, init });
    const json = (c: unknown, status = 200) => new Response(JSON.stringify(c), { status });
    if (url === `https://huggingface.co/api/spaces/${espacioId}`) return json({ runtime: { stage: sim.dormido ? "SLEEPING" : "RUNNING" } });
    if (url === `${host}/config`) {
      if (sim.dormido) return new Response("dormido", { status: 503 });
      return json({ version: "5.9.1", api_prefix: "/gradio_api", dependencies: [{ id: 7, api_name: "infer" }] });
    }
    if (url === `${host}/gradio_api/info`) return json({ named_endpoints: { "/infer": { parameters: parametros } } });
    if (url === `${host}/gradio_api/queue/join`) return json({ event_id: "e1" });
    if (url.startsWith(`${host}/gradio_api/queue/data`)) {
      const sse = [
        { msg: "process_starts", eta: 2 },
        { msg: "process_completed", success: true, output: { data: [{ path: "/tmp/out.png", orig_name: "out.png", mime_type: "image/png", meta: { _type: "gradio.FileData" } }] } },
      ].map((m) => `data: ${JSON.stringify(m)}\n\n`).join("");
      return new Response(sse, { status: 200 });
    }
    if (url.startsWith(`${host}/gradio_api/file=`)) return new Response(new Blob([new Uint8Array([1, 2])], { type: "image/png" }));
    return new Response("no", { status: 404 });
  };
  return { f, llamadas };
}

describe("catálogo de Spaces de imagen", () => {
  it("FLUX.1 schnell y Qwen-Image, ambos Apache-2.0 y con su Space verificado", () => {
    expect(espacioDeModelo("flux1-schnell")?.espacioId).toBe(FLUX);
    expect(espacioDeModelo("qwen-image")?.espacioId).toBe("Qwen/Qwen-Image");
    expect(espacioDeModelo("qwen-image-2.1")).toBeNull();
    expect(fichaDeEspacio("flux1-schnell")).toMatchObject({ modelo: "FLUX.1 [schnell]", licencia: "Apache-2.0", origen: "hecho en un Space público" });
    expect(Object.values(ESPACIOS_IMAGEN).every((e) => e.licencia === "Apache-2.0")).toBe(true);
  });

  it("solo las opciones de la capa espacio con Space verificado pasan al adaptador", () => {
    const local: OpcionImagen = { capa: "dispositivo", modelo: modeloPorId("sd15")!, motor: "sdcpp", cuantizacion: "nativa", semilla: 1, motivo: "local" };
    const desconocido: OpcionImagen = { capa: "espacio", modelo: modeloPorId("qwen-image-2.1")!, motor: "espacio-hf", cuantizacion: "nativa", semilla: 2, motivo: "no" };
    expect(opcionesEspacioDelPlan([opcion("flux1-schnell"), local, desconocido]).map((o) => o.modelo!.id)).toEqual(["flux1-schnell"]);
  });
});

describe("API real del Space", () => {
  const api = {
    endpoints: [
      { nombre: "/limpiar", fnIndex: 1, parametros: [{ nombre: "x", componente: "Slider", tieneDefecto: true }] },
      { nombre: "/infer", fnIndex: 7, parametros: [{ nombre: "prompt", componente: "Textbox", tieneDefecto: false }] },
    ],
  };
  it("elige una función con texto y no adivina si no hay ninguna", () => {
    expect(elegirEndpoint(api, ["generate", "infer"])?.nombre).toBe("/infer");
    expect(elegirEndpoint({ endpoints: [api.endpoints[0]] }, ["infer"])).toBeNull();
  });

  it("manda la semilla solo a los parámetros que la aceptan y apaga el aleatorio", () => {
    const ep = { parametros: [
      { nombre: "prompt", componente: "Textbox", tieneDefecto: false },
      { nombre: "seed", componente: "Slider", tieneDefecto: true },
      { nombre: "randomize_seed", componente: "Checkbox", tieneDefecto: true },
    ] };
    expect(datosConSemilla(ep, 42.9)).toEqual({ seed: 42, randomize_seed: false });
    expect(datosConSemilla({ parametros: [ep.parametros[0]] }, 42)).toEqual({});
  });
});

describe("ejecutarOpcionEspacio (sin red: Space simulado)", () => {
  it("manda prompt y semilla, descarga la imagen y devuelve modelo, licencia y origen", async () => {
    const sim = spaceSimulado();
    let t = AHORA;
    const r = await ejecutarOpcionEspacio(opcion("flux1-schnell", 123), "un faro violeta", {
      fetch: sim.f, almacen: almacen(), token: null, ahora: () => (t += 3000), crearUrl: () => "blob:space",
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.url).toBe("blob:space");
    expect(r.ficha).toMatchObject({ licencia: "Apache-2.0", origen: "hecho en un Space público" });
    const join = sim.llamadas.find((l) => l.url.endsWith("/queue/join"));
    expect(JSON.parse(String(join?.init?.body)).data).toEqual(["un faro violeta", 123, false]);
  });

  it("Space dormido: lo dice y no lanza", async () => {
    const r = await ejecutarOpcionEspacio(opcion("qwen-image"), "x", { fetch: spaceSimulado({ dormido: true }, "Qwen/Qwen-Image").f, almacen: almacen(), token: null });
    expect(r).toMatchObject({ ok: false });
    if (!r.ok) expect(r.motivo).toMatch(/dormido/);
  });

  it("un modelo sin Space verificado no se inventa", async () => {
    const r = await ejecutarOpcionEspacio(opcion("qwen-image-2.1"), "x");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toMatch(/no está verificado/);
  });
});
