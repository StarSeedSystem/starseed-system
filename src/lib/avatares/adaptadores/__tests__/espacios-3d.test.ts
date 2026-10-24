/**
 * Pruebas del adaptador de Spaces 3D (ESP1011C): flujo Pixal3D → TRELLIS.2 con
 * respaldo, permiso, estado y GLB, procedencia del motor, puente al diálogo de
 * G3D1011E y encargo de cierre a la neurona que pueda. Sin red: los Spaces son
 * dobles de `fetch` inyectado.
 */
import { describe, expect, it } from "vitest";
import { hostPorDefecto, type FetchLike } from "@/lib/espacios/cliente-espacios";
import {
  ESPACIOS_3D,
  cuentaDeIntentos,
  encargoDeCierre,
  espaciosComoDependencia,
  estadoDeResultado,
  generarGlb3d,
  procedenciaDeMotor,
} from "../espacios-3d";

const ALMACEN = () => {
  const datos = new Map<string, string>();
  return { datos, get: (k: string) => datos.get(k) ?? null, set: (k: string, v: string) => (datos.set(k, v), true), remove: (k: string) => void datos.delete(k) };
};
const AHORA = Date.UTC(2026, 9, 24, 12, 0, 0);
const RELOJ = () => { let t = AHORA; return () => (t += 6000); };
const IMAGEN = new Blob([new Uint8Array([137, 80, 78, 71])], { type: "image/png" });
const ARCHIVO_GLB = {
  path: "/tmp/gradio/modelo.glb", url: null, orig_name: "modelo.glb",
  mime_type: "model/gltf-binary", meta: { _type: "gradio.FileData" },
};
const GLB = new Blob([new Uint8Array([103, 108, 84, 70])], { type: "model/gltf-binary" });

interface Simulacion3d {
  /** Endpoint del Space con su API publicada (/info). */
  endpoints: Record<string, Array<{ parameter_name: string; component: string; parameter_has_default?: boolean; parameter_default?: unknown }>>;
  /** Salida del endpoint de generar (el estado del que sale el GLB). */
  salidaGenerar?: unknown[];
  /** Salida del endpoint de extraer (el GLB). */
  salidaExtraer?: unknown[];
  /** Error de Gradio en el endpoint de generar (cuota, lleno…). */
  error?: string;
  /** Estado del Space según Hugging Face (SLEEPING, RUNNING…). */
  etapa?: string;
  /** joinStatus distinto de 200 con su cuerpo. */
  joinStatus?: number;
  joinCuerpo?: unknown;
}

/** Un Space de Gradio simulado: responde por ruta y guarda cada petición. */
function sim3d(id: string, sim: Simulacion3d) {
  const host = hostPorDefecto(id) ?? "";
  const llamadas: Array<{ url: string; init?: RequestInit }> = [];
  const json = (cuerpo: unknown, status = 200) =>
    new Response(JSON.stringify(cuerpo), { status, headers: { "Content-Type": "application/json" } });
  const nombres = Object.keys(sim.endpoints);
  let ultimo = "";
  const f: FetchLike = async (url, init) => {
    llamadas.push({ url, init });
    if (url === `https://huggingface.co/api/spaces/${id}`) return json({ runtime: { stage: sim.etapa ?? "RUNNING" } });
    if (url === `${host}/config`) {
      if (sim.etapa && sim.etapa !== "RUNNING") return new Response("Space sleeping", { status: 503 });
      return json({ version: "5.9.1", api_prefix: "/gradio_api", dependencies: nombres.map((n, i) => ({ id: i + 7, api_name: n.slice(1) })) });
    }
    if (url === `${host}/gradio_api/info`) {
      return json({ named_endpoints: Object.fromEntries(nombres.map((n) => [n, { parameters: sim.endpoints[n] }])) });
    }
    if (url === `${host}/gradio_api/upload`) return json(["/tmp/gradio/referencia.png"]);
    if (url === `${host}/gradio_api/queue/join`) {
      if (sim.joinStatus !== undefined) return json(sim.joinCuerpo ?? {}, sim.joinStatus);
      const cuerpo = JSON.parse(String(init?.body)) as { fn_index: number };
      ultimo = nombres[cuerpo.fn_index - 7] ?? "";
      return json({ event_id: "e1" });
    }
    if (url.startsWith(`${host}/gradio_api/queue/data`)) {
      const esExtraer = (sim.endpoints[ultimo] ?? []).some((p) => p.parameter_name === "state_path");
      const datos = esExtraer ? sim.salidaExtraer ?? [] : sim.salidaGenerar ?? [];
      const terminado = sim.error !== undefined && !esExtraer
        ? { msg: "process_completed", success: false, output: { error: sim.error } }
        : { msg: "process_completed", success: true, output: { data: datos } };
      const mensajes = [{ msg: "estimation", rank: 1, queue_size: 3, rank_eta: 20 }, { msg: "process_starts" }, terminado];
      const sse = mensajes.map((m) => `data: ${JSON.stringify(m)}\n\n`).join("");
      return new Response(sse, { status: 200, headers: { "Content-Type": "text/event-stream" } });
    }
    if (url.startsWith(`${host}/gradio_api/file=`)) return new Response(GLB, { headers: { "Content-Type": "model/gltf-binary" } });
    return json({}, 404);
  };
  return { f, llamadas };
}

const PIX = ESPACIOS_3D[0].espacioId;
const TRE = ESPACIOS_3D[1].espacioId;

const PARAMS_GENERAR = [
  { parameter_name: "image", component: "Image" },
  { parameter_name: "seed", component: "Slider", parameter_has_default: true, parameter_default: 0 },
  { parameter_name: "resolution", component: "Slider", parameter_has_default: true, parameter_default: 1024 },
];
const ENDPOINTS_PIXAL3D = {
  "/generate_3d": PARAMS_GENERAR,
  "/extract_glb_api": [{ parameter_name: "state_path", component: "File" }, { parameter_name: "decimation_target", component: "Slider", parameter_has_default: true, parameter_default: 120000 }],
};
const ENDPOINTS_TRELLIS2 = {
  "/image_to_3d": PARAMS_GENERAR,
  "/extract_glb": [{ parameter_name: "state_path", component: "File" }, { parameter_name: "textura", component: "Slider", parameter_has_default: true, parameter_default: 1024 }],
};

const pixal3d = (extra: Partial<Simulacion3d> = {}): Simulacion3d => ({
  endpoints: ENDPOINTS_PIXAL3D, salidaGenerar: [{ state_path: "/tmp/gradio/sesion/abc" }], salidaExtraer: [ARCHIVO_GLB], ...extra,
});
const trellis2 = (extra: Partial<Simulacion3d> = {}): Simulacion3d => ({
  endpoints: ENDPOINTS_TRELLIS2, salidaGenerar: [{ state_path: "/tmp/gradio/sesion/xyz" }], salidaExtraer: [ARCHIVO_GLB], ...extra,
});

/** Varios Spaces a la vez, cada uno en su host: la red de prueba completa. */
function red(porEspacio: Record<string, ReturnType<typeof sim3d>>): FetchLike {
  const tabla = Object.entries(porEspacio).map(([id, local]) => ({ id, host: hostPorDefecto(id), local }));
  return async (url, init) => {
    const e = tabla.find((t) => url === `https://huggingface.co/api/spaces/${t.id}` || url.startsWith(`${t.host}/`));
    return e ? e.local.f(url, init) : new Response("sin Space", { status: 404 });
  };
}
const opc = (f: FetchLike, extra: Record<string, unknown> = {}) => ({ fetch: f, almacen: ALMACEN(), token: null, ahora: RELOJ(), ...extra });

describe("helpers puros", () => {
  it("procedencia: los datos del motor de la tabla, o null si no está (no se inventa)", () => {
    const p = procedenciaDeMotor("pixal3d-espacio");
    expect(p).toMatchObject({ herramienta: "pixal3d-espacio", uso: "condicionado" });
    expect(p?.licencia).toContain("MIT");
    expect(procedenciaDeMotor("motor-inventado")).toBeNull();
  });
  it("estadoDeResultado: el estado del que extrae el GLB, o null si el Space no dio ninguno", () => {
    expect(estadoDeResultado([{ estado: { state_path: "/tmp/gradio/sesion/1" } }])).toBe("/tmp/gradio/sesion/1");
    expect(estadoDeResultado([1234, [{ path: "/tmp/gradio/archivo.png" }]])).toBe("/tmp/gradio/archivo.png");
    expect(estadoDeResultado([1234], [{ path: "/tmp/gradio/imagen.png" }])).toBe("/tmp/gradio/imagen.png");
    expect(estadoDeResultado([[1234, null]])).toBeNull();
  });
  it("cuentaDeIntentos: por qué falló cada Space, en una frase", () => {
    expect(cuentaDeIntentos([])).toMatch(/No hubo ningún intento/);
    expect(cuentaDeIntentos([{ espacioId: "a/b", tipo: "cuota", motivo: "sin cuota" }])).toBe("a/b: sin cuota");
  });
});

describe("generarGlb3d · Pixal3D con respaldo en TRELLIS.2", () => {
  it("éxito con Pixal3D: genera, extrae el GLB con la ruta de estado y lo baja", async () => {
    const pix = sim3d(PIX, pixal3d());
    const r = await generarGlb3d({ imagen: IMAGEN }, { ...opc(pix.f, { permiso: true }) });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.motorId).toBe("pixal3d-espacio");
    expect(r.glb.type).toBe("model/gltf-binary");
    expect(r.intentos).toEqual([]);
    const joins = pix.llamadas.filter((l) => l.url.endsWith("/queue/join"));
    expect(joins).toHaveLength(2);
    expect(JSON.parse(String(joins[1].init?.body)).data[0]).toBe("/tmp/gradio/sesion/abc");
  });

  it("Pixal3D dormido: lo dice y TRELLIS.2 lo saca adelante", async () => {
    const pix = sim3d(PIX, { endpoints: ENDPOINTS_PIXAL3D, etapa: "SLEEPING" });
    const tre = sim3d(TRE, trellis2());
    const r = await generarGlb3d({ imagen: IMAGEN }, opc(red({ [PIX]: pix, [TRE]: tre }), { permiso: true }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.motorId).toBe("trellis2-espacio");
    expect(r.intentos[0]).toMatchObject({ espacioId: PIX, tipo: "dormido" });
    expect(r.intentos[0].motivo).toMatch(/dormido/);
  });

  it("sin cuota en Pixal3D: se gasta la de TRELLIS.2 y se dice el porqué", async () => {
    const pix = sim3d(PIX, pixal3d({ error: "You have exceeded your GPU quota (60s requested vs. 29s left)." }));
    const tre = sim3d(TRE, trellis2());
    const r = await generarGlb3d({ imagen: IMAGEN }, opc(red({ [PIX]: pix, [TRE]: tre }), { permiso: true }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.motorId).toBe("trellis2-espacio");
    expect(r.intentos[0]).toMatchObject({ espacioId: PIX, tipo: "cuota" });
  });

  it("si Pixal3D cambió su API (sin estado o sin GLB), se pasa a TRELLIS.2 sin fingir nada", async () => {
    const pix = sim3d(PIX, pixal3d({ salidaExtraer: [1234, "no hay archivo"] }));
    const tre = sim3d(TRE, trellis2());
    const r = await generarGlb3d({ imagen: IMAGEN }, opc(red({ [PIX]: pix, [TRE]: tre }), { permiso: true }));
    expect(r.ok && r.motorId === "trellis2-espacio").toBe(true);
  });

  it("los dos sin GLB: el fracaso se cuenta en palabras, columna por Space", async () => {
    const pix = sim3d(PIX, pixal3d({ salidaExtraer: [1234] }));
    const tre = sim3d(TRE, trellis2({ salidaExtraer: [1234] }));
    const r = await generarGlb3d({ imagen: IMAGEN }, opc(red({ [PIX]: pix, [TRE]: tre }), { permiso: true }));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.motivo).toMatch(/Ningún Space pudo generar/);
    expect(r.intentos.map((i) => i.espacioId)).toEqual([PIX, TRE]);
  });

  it("sin permiso no se envía nada a ningún Space, ni siquiera al respaldo", async () => {
    const pix = sim3d(PIX, pixal3d());
    const r = await generarGlb3d({ imagen: IMAGEN }, opc(pix.f));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.motivo).toMatch(/Falta tu permiso/);
    expect(pix.llamadas).toHaveLength(0);
  });
});

describe("espaciosComoDependencia · el puente con el diálogo de G3D1011E", () => {
  it("genera el GLB desde el navegador y lo entrega con la procedencia del motor", async () => {
    const pix = sim3d(PIX, pixal3d());
    const deps = espaciosComoDependencia(opc(pix.f));
    const r = await deps(IMAGEN, { titulo: "gato", permisoRemoto: true, esFotoDePersonas: false, consentimientoPersonas: false });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.glb.type).toBe("model/gltf-binary");
    expect(r.procedencia).toHaveLength(1);
    expect(r.procedencia[0]).toMatchObject({ herramienta: "pixal3d-espacio" });
  });

  it("sin permiso o con una imagen demasiado grande no sale nada del aparato", async () => {
    const pix = sim3d(PIX, pixal3d());
    const deps = espaciosComoDependencia(opc(pix.f));
    const sinPermiso = await deps(IMAGEN, { titulo: "gato", permisoRemoto: false, esFotoDePersonas: false, consentimientoPersonas: false });
    expect(sinPermiso).toMatchObject({ ok: false, fallo: "otro" });
    expect((sinPermiso as { motivo: string }).motivo).toMatch(/Falta tu permiso/);
    const grande = await deps(new Blob([new Uint8Array(1024 * 1024 * 9)], { type: "image/png" }),
      { titulo: "x", permisoRemoto: true, esFotoDePersonas: false, consentimientoPersonas: false });
    expect((grande as { motivo: string }).motivo).toMatch(/pesa más de lo permitido/);
    expect(pix.llamadas).toHaveLength(0);
  });
});

describe("encargoDeCierre · la malla cerrada y los LOD van a la neurona que pueda", () => {
  // La A1: hierro pequeño pero con Blender en CPU (`blender-voxel` cierra la malla).
  const A1 = { id: "a1", cuenta: "alex", ofrecidaPor: [], carga: 0, viva: true, hierro: { gpu: "ninguna" as const, ramGB: 8, vramGB: null, blender: true, permiteEspacioHf: false, claveExterna: false } };
  const ctx = { cuenta: "alex", region: "US", comercial: false } as const;

  it("lo saca el plan: bot pide cerrada + LOD y la A1 puede (orden lista para el bus)", () => {
    const c = encargoDeCierre("bot", ctx, [A1]);
    expect(c.encargado).toBe(true);
    if (!c.encargado) return;
    expect(c.orden).toMatchObject({ bus: "mg_orden", accion: "taller_3d", para: "a1", encargo: { destino: "bot", partida: "malla", cerrada: true, esqueleto: "ninguno" } });
  });

  it("si aquí no se leyó el registro de neuronas, queda pendiente y se dice en vez de callarse", () => {
    const c = encargoDeCierre("bot", ctx, null);
    expect(c).toMatchObject({ encargado: false, orden: null });
    expect(c.motivo).toMatch(/pendiente|registro/);
  });

  it("si ninguna neurona viva puede, también se dice: basta de ilusiones", () => {
    const conBlenderYMuerta = { ...A1, id: "nv1", viva: false };
    const c = encargoDeCierre("pieza", ctx, [conBlenderYMuerta]);
    expect(c).toMatchObject({ encargado: false, orden: null });
    expect(c.motivo).toMatch(/ninguna neurona viva/);
  });

  it("en el encargo que sale, el motivo menciona a la neurona elegida", () => {
    const c = encargoDeCierre("avatar", { ...ctx, grupos: ["potencia"] }, [A1]);
    expect(c.encargado).toBe(true);
    expect(c.motivo).toContain("a1");
  });
});





