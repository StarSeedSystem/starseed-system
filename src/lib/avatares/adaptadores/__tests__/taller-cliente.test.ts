/**
 * Cliente del taller 3D local (AV1011F): capacidades, plan con lo instalado, envío, espera, procedencia y subida.
 * Sin red: el servicio (servicios/taller-3d/taller.py) es un doble de `fetch` inyectado.
 */
import { describe, expect, it, vi } from "vitest";
import { planOptimizacion } from "../../adn/optimizacion";
import {
  consultarCapacidades, ejecutarEnTaller, leerCapacidades, planDelTaller, procedenciaDeProvenance, subirResultado,
  tallerComoDependencia, type Buscar, type CapacidadesTaller3D,
} from "../taller-cliente";

const TOKEN = "t".repeat(40);
const json = (cuerpo: unknown, status = 200) => new Response(JSON.stringify(cuerpo), { status, headers: { "Content-Type": "application/json" } });
const motores = (listos: string[], otros: Record<string, string> = {}) => ({
  ...Object.fromEntries(listos.map((id) => [id, { listo: true, motivo: null }])),
  ...Object.fromEntries(Object.entries(otros).map(([id, motivo]) => [id, { listo: false, motivo }])),
});
const MAC32 = {
  version: 1, requisitos: ["cpu", "blender", "apple-silicon-32gb", "inventado"], a1: false,
  hierro: { gpu: "apple", ramGB: 32, vramGB: null, blender: true, permiteEspacioHf: true, claveExterna: true },
  motores: motores(["hunyuan3d-mlx", "trellis2", "quadriflow-blender", "blender-voxel"], { "instant-meshes": "Instant Meshes no está instalado (ver README del taller).", unirig: "UniRig necesita CUDA (NVIDIA de 8 GB o más)." }),
  recursos: { memoria_libre_gb: 12, presion: 1, bateria: false },
};
const capsMac = () => leerCapacidades(MAC32) as CapacidadesTaller3D;
const ID = "a".repeat(32);
const PROV = [
  { etapa: "generar", herramienta: "trellis2", licencia: "MIT + licencia de DINOv3", uso: "condicionado", origen: { x: 1 } },
  { etapa: "remallar", herramienta: "quadriflow-blender", licencia: "GPL", uso: "libre" },
];
const trabajo = (estado: string, extra: object = {}) => ({ id: ID, estado, etapas: ["generar", "remallar"], etapa: null, progreso: 0, motivo: null, resultado: null, procedencia: [], ...extra });
const LISTA = trabajo("lista", { progreso: 100, procedencia: PROV, resultado: { archivo: "remallar.glb", formato: "glb", bytes: 4, sha256: "0".repeat(64) } });

/** Doble del servicio: responde por ruta y guarda cada petición. */
function servicio(rutas: Record<string, () => Response>) {
  const llamadas: { url: string; init?: RequestInit }[] = [];
  const buscar: Buscar = async (url, init) => {
    llamadas.push({ url, init });
    const ruta = url.replace("http://127.0.0.1:8797", "");
    const r = rutas[`${init?.method ?? "GET"} ${ruta}`];
    return r ? r() : json({ motivo: "Ruta desconocida." }, 404);
  };
  return { buscar, llamadas };
}

describe("capacidades", () => {
  it("lee solo nombres de REQUISITOS_3D y no se cree permisos del taller", () => {
    const c = capsMac();
    expect(c.requisitos).toEqual(["cpu", "blender", "apple-silicon-32gb"]);
    expect(c.hierro).toMatchObject({ gpu: "apple", permiteEspacioHf: false, claveExterna: false });
    expect(leerCapacidades({ requisitos: [] })).toBeNull();
  });
  it("manda el token en cada petición y dice si el servicio no responde", async () => {
    const { buscar, llamadas } = servicio({ "GET /capacidades": () => json(MAC32) });
    const r = await consultarCapacidades({ token: TOKEN, buscar });
    expect(r.ok).toBe(true);
    expect((llamadas[0].init?.headers as Record<string, string>).Authorization).toBe(`Bearer ${TOKEN}`);
    const caido = await consultarCapacidades({ token: TOKEN, buscar: async () => { throw new TypeError("Failed to fetch"); } });
    expect(caido).toEqual({ ok: false, motivo: expect.stringMatching(/no responde.*taller\.py servir/) });
    const sinToken = await consultarCapacidades({ token: "x", buscar: async () => json({ motivo: "Falta el token del taller o no es el correcto." }, 401) });
    expect(sinToken).toEqual({ ok: false, motivo: "Falta el token del taller o no es el correcto." });
  });
});

describe("planDelTaller", () => {
  it("Mac de 32 GB: genera con lo instalado, remalla con Blender y dice por qué no Instant Meshes ni UniRig", () => {
    const plan = planDelTaller({ partida: "imagen", esqueleto: "vrm-humanoide", region: "US", comercial: false, permitirDePago: false, prioridad: "calidad" }, capsMac());
    const paso = (e: string) => plan.pasos.find((x) => x.etapa === e)!;
    expect(paso("generar").motor?.id).toBe("trellis2"); // más libre que Hunyuan (restringido por región)
    expect(paso("remallar").motor?.id).toBe("quadriflow-blender");
    expect(paso("remallar").descartes.some((d) => d.startsWith("Instant Meshes: Instant Meshes no está instalado"))).toBe(true);
    expect(paso("riggear").motor).toBeNull();
    expect(paso("riggear").descartes.some((d) => d.includes("CUDA"))).toBe(true);
    expect(paso("animar").motor?.id).toBe("procedural"); // el navegador anima siempre
    expect(plan.pasos.flatMap((x) => (x.motor ? [x.motor] : [])).some((m) => m.remoto)).toBe(false);
  });
  it("en la UE no elige Hunyuan aunque esté instalado", () => {
    const caps = { ...capsMac(), motores: motores(["hunyuan3d-mlx", "quadriflow-blender"]) };
    const plan = planDelTaller({ partida: "imagen", esqueleto: "ninguno", region: "ES", comercial: false, permitirDePago: false }, caps);
    expect(plan.pasos[0].motor).toBeNull();
    expect(plan.pasos[0].descartes.join(" ")).toMatch(/no cubre tu región \(ES\)/);
  });
});

describe("procedenciaDeProvenance", () => {
  it("convierte el .provenance.json y completa con la tabla de motores", () => {
    expect(procedenciaDeProvenance(PROV[0])).toEqual({ herramienta: "trellis2", licencia: "MIT + licencia de DINOv3", uso: "condicionado" });
    expect(procedenciaDeProvenance({ herramienta: "hunyuan3d-mlx", licencia: "x", uso: "raro" })).toMatchObject({ uso: "restringido-region", regionesExcluidas: ["EU", "GB", "KR"] });
    expect(procedenciaDeProvenance({ herramienta: "desconocido", uso: "raro" })).toEqual({ herramienta: "desconocido", licencia: "sin declarar", uso: "condicionado" });
    expect(procedenciaDeProvenance({ uso: "libre" })).toBeNull();
  });
});

describe("ejecutarEnTaller", () => {
  const plan = () => planDelTaller({ partida: "imagen", esqueleto: "ninguno", region: "US", comercial: false, permitirDePago: false }, capsMac());
  const entrada = { nombre: "gato.png", bytes: new Uint8Array([137, 80, 78, 71]) };

  it("envía plan y entrada, espera a 127.0.0.1 y baja el GLB con su procedencia", async () => {
    const estados = [trabajo("trabajando", { etapa: "generar", progreso: 0 }), LISTA];
    const { buscar, llamadas } = servicio({
      "POST /trabajos": () => json(trabajo("en-cola"), 202),
      [`GET /trabajos/${ID}`]: () => json(estados.shift()),
      [`GET /trabajos/${ID}/resultado`]: () => new Response(new Uint8Array([1, 2, 3, 4])),
    });
    const esperar = vi.fn(async () => {});
    const progreso = vi.fn();
    const r = await ejecutarEnTaller({ token: TOKEN, buscar }, plan(), entrada, { esperar, progreso, optimizacion: planOptimizacion("bot") });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.glb.size).toBe(4);
    expect(r.glb.type).toBe("model/gltf-binary");
    expect(r.procedencia.map((p) => p.herramienta)).toEqual(["trellis2", "quadriflow-blender"]);
    const cuerpo = JSON.parse(String(llamadas[0].init?.body));
    expect(cuerpo.entrada).toEqual({ nombre: "gato.png", base64: "iVBORw==" });
    expect(cuerpo.optimizacion.destino).toBe("bot");
    expect(cuerpo.plan.pasos[0].motor.id).toBe("trellis2");
    expect(esperar).toHaveBeenCalledTimes(2);
    expect(progreso).toHaveBeenLastCalledWith(100, "Listo en el taller.");
    expect(llamadas.every((l) => l.url.startsWith("http://127.0.0.1:8797/"))).toBe(true);
  });

  it("sin ninguna etapa posible no llama al taller y dice por qué", async () => {
    const caps = { ...capsMac(), motores: {} };
    const buscar = vi.fn();
    const r = await ejecutarEnTaller({ token: TOKEN, buscar }, planDelTaller({ partida: "imagen", esqueleto: "ninguno", region: "US", comercial: false, permitirDePago: false }, caps), entrada);
    expect(r).toMatchObject({ ok: false, fallo: "otro" });
    expect(buscar).not.toHaveBeenCalled();
  });

  it("el rechazo del gobernador y los fallos del motor llegan con su motivo y su tipo", async () => {
    const gob = servicio({ "POST /trabajos": () => json({ motivo: "Solo quedan 3.0 GB de memoria libre; un trabajo pesado pide 6 GB." }, 503) });
    expect(await ejecutarEnTaller({ token: TOKEN, buscar: gob.buscar }, plan(), entrada)).toEqual({ ok: false, fallo: "sin-memoria", motivo: expect.stringMatching(/memoria libre/) });
    const lento = servicio({ "POST /trabajos": () => json(trabajo("fallida", { motivo: "generar: tiempo agotado (120 min)." }), 202) });
    expect(await ejecutarEnTaller({ token: TOKEN, buscar: lento.buscar }, plan(), entrada)).toMatchObject({ ok: false, fallo: "lento" });
  });

  it("un OBJ (sin Blender en esa neurona) no se hace pasar por GLB", async () => {
    const obj = trabajo("lista", { resultado: { archivo: "remallar.obj", formato: "obj", bytes: 4, sha256: "" } });
    const s = servicio({ "POST /trabajos": () => json(obj, 202) });
    const r = await ejecutarEnTaller({ token: TOKEN, buscar: s.buscar }, plan(), entrada);
    expect(r).toMatchObject({ ok: false, motivo: expect.stringMatching(/OBJ.*Blender/) });
  });

  it("deja de esperar al tope sin cancelar el trabajo", async () => {
    const s = servicio({ "POST /trabajos": () => json(trabajo("trabajando"), 202), [`GET /trabajos/${ID}`]: () => json(trabajo("trabajando")) });
    const r = await ejecutarEnTaller({ token: TOKEN, buscar: s.buscar }, plan(), entrada, { esperar: async () => {}, intervaloMs: 1000, topeMs: 3000 });
    expect(r).toMatchObject({ ok: false, fallo: "lento", motivo: expect.stringMatching(/no se cancela/) });
  });
});

describe("tallerComoDependencia y subirResultado", () => {
  it("encaja como `taller` de use-generar-3d y sube por el `guardar` que ya existe, con atribuciones", async () => {
    const s = servicio({
      "GET /capacidades": () => json(MAC32),
      "POST /trabajos": () => json(LISTA, 202),
      [`GET /trabajos/${ID}/resultado`]: () => new Response(new Uint8Array([9])),
    });
    const taller = tallerComoDependencia({ token: TOKEN, buscar: s.buscar }, { region: "US", comercial: false, esqueleto: "ninguno" });
    const r = await taller(new Blob([new Uint8Array([1])], { type: "image/webp" }), planOptimizacion("pieza"), () => {});
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(JSON.parse(String(s.llamadas[1].init?.body)).entrada.nombre).toBe("entrada.webp");
    const guardar = vi.fn(async () => ({ ok: true as const, ref: "biblioteca:modelo-3d-1" }));
    const meshy = { ...r, procedencia: [...r.procedencia, { herramienta: "meshy", licencia: "CC BY 4.0", uso: "atribucion" as const, atribucion: "Modelo 3D generado con Meshy" }] };
    expect(await subirResultado(meshy, { titulo: "Pieza", destino: "pieza", region: "US", comercial: false }, guardar)).toEqual({ ok: true, ref: "biblioteca:modelo-3d-1" });
    expect(guardar).toHaveBeenCalledWith(expect.objectContaining({ titulo: "Pieza", destino: "pieza", atribuciones: ["Modelo 3D generado con Meshy"] }));
  });
  it("lo que impide usarlo así se dice en el aviso", async () => {
    const guardar = vi.fn(async () => ({ ok: true as const, ref: "biblioteca:m" }));
    const r = { ok: true as const, glb: new Blob([]), lods: [], procedencia: [{ herramienta: "hunyuan3d-mlx", licencia: "x", uso: "restringido-region" as const, regionesExcluidas: ["EU"] }] };
    const g = await subirResultado(r, { titulo: "A", destino: "avatar", region: "ES", comercial: false }, guardar);
    expect(g).toMatchObject({ ok: true, aviso: expect.stringMatching(/no cubre esta región/) });
  });
  it("si el taller no responde, la dependencia lo dice", async () => {
    const taller = tallerComoDependencia({ token: TOKEN, buscar: async () => { throw new Error("x"); } }, { region: null, comercial: false, esqueleto: "ninguno" });
    expect(await taller(new Blob([]), planOptimizacion("bot"), () => {})).toMatchObject({ ok: false, fallo: "otro", motivo: expect.stringMatching(/no responde/) });
  });
});
