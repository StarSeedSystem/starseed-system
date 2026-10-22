import { describe, expect, it } from "vitest";
import {
  CLAVE_API,
  ErrorEspacio,
  ejecutarEspacio,
  generarConRespaldo,
  guardarTokenHf,
  hostPorDefecto,
  leerApiEspacio,
  leerTokenHf,
  type FetchLike,
  type ProgresoEspacio,
} from "@/lib/espacios/cliente-espacios";
import {
  clasificarErrorEspacio,
  estadoCuota,
  registrarUso,
  segundosRestantesDeError,
  usoDeHoy,
  type AlmacenLocal,
} from "@/lib/espacios/cuota-espacios";

const ID = "black-forest-labs/FLUX.1-schnell";
const HOST = hostPorDefecto(ID);
const AHORA = Date.UTC(2026, 9, 22, 12, 0, 0);

function almacenEnMemoria(): AlmacenLocal & { datos: Map<string, string> } {
  const datos = new Map<string, string>();
  return { datos, get: (k) => datos.get(k) ?? null, set: (k, v) => (datos.set(k, v), true), remove: (k) => void datos.delete(k) };
}

interface Simulacion {
  version?: string;
  dormido?: boolean;
  endpoints?: Record<string, Array<{ parameter_name: string; component: string; parameter_has_default?: boolean; parameter_default?: unknown }>>;
  mensajes?: Array<Record<string, unknown>>;
  joinStatus?: number;
  joinCuerpo?: unknown;
}

/** Un Space de Gradio simulado: sin red, responde por ruta. */
function espacioSimulado(sim: Simulacion) {
  const llamadas: Array<{ url: string; init?: RequestInit }> = [];
  const endpoints = sim.endpoints ?? {
    "/infer": [
      { parameter_name: "prompt", component: "Textbox" },
      { parameter_name: "seed", component: "Slider", parameter_has_default: true, parameter_default: 0 },
    ],
  };
  const f: FetchLike = async (url, init) => {
    llamadas.push({ url, init });
    const json = (c: unknown, status = 200) => new Response(JSON.stringify(c), { status, headers: { "Content-Type": "application/json" } });
    if (url === `https://huggingface.co/api/spaces/${ID}`) return json({ runtime: { stage: sim.dormido ? "SLEEPING" : "RUNNING" } });
    if (url === `${HOST}/config`) {
      if (sim.dormido) return new Response("<html>Space is sleeping</html>", { status: 503 });
      return json({
        version: sim.version ?? "5.9.1",
        api_prefix: "/gradio_api",
        dependencies: Object.keys(endpoints).map((n, i) => ({ id: i + 7, api_name: n.slice(1) })),
      });
    }
    if (url === `${HOST}/gradio_api/info`) return json({ named_endpoints: Object.fromEntries(Object.entries(endpoints).map(([n, parameters]) => [n, { parameters }])) });
    if (url === `${HOST}/gradio_api/upload`) return json(["/tmp/gradio/ref.png"]);
    if (url === `${HOST}/gradio_api/queue/join`) return json(sim.joinCuerpo ?? { event_id: "e1" }, sim.joinStatus ?? 200);
    if (url.startsWith(`${HOST}/gradio_api/queue/data`)) {
      const sse = (sim.mensajes ?? []).map((m) => `data: ${JSON.stringify(m)}\n\n`).join("");
      return new Response(sse, { status: 200, headers: { "Content-Type": "text/event-stream" } });
    }
    if (url.startsWith(`${HOST}/gradio_api/file=`)) return new Response(new Blob([new Uint8Array([137, 80, 78, 71])], { type: "image/png" }));
    return new Response("no", { status: 404 });
  };
  return { f, llamadas };
}

const EXITO = [
  { msg: "estimation", rank: 2, queue_size: 5, rank_eta: 40 },
  { msg: "process_starts", eta: 12 },
  { msg: "process_completed", success: true, output: { data: [{ path: "/tmp/gradio/out.png", url: null, orig_name: "out.png", mime_type: "image/png", meta: { _type: "gradio.FileData" } }, 1234] } },
];

/** Reloj de prueba: cada lectura avanza 6 s (6 s de GPU entre inicio y fin). */
function reloj() {
  let t = AHORA;
  return () => (t += 6000);
}

describe("cliente de Spaces en el navegador", () => {
  it("éxito: lee la API real, enseña la cola, descarga la imagen y cuenta la GPU", async () => {
    const { f, llamadas } = espacioSimulado({ mensajes: EXITO });
    const almacen = almacenEnMemoria();
    const progreso: ProgresoEspacio[] = [];
    const r = await generarConRespaldo([{ espacioId: ID, endpoint: "infer" }], { texto: "un gato astronauta" }, {
      fetch: f, almacen, token: null, ahora: reloj(), alProgreso: (p) => progreso.push(p),
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.archivo.tipo).toBe("imagen");
    expect(r.archivo.nombre).toBe("out.png");
    expect(r.archivo.blob.size).toBe(4);
    expect(progreso[0]).toEqual({ fase: "cola", posicion: 3, enCola: 5, segundosEstimados: 40 });
    expect(progreso.some((p) => p.fase === "procesando")).toBe(true);

    const join = llamadas.find((l) => l.url.endsWith("/queue/join"));
    const cuerpo = JSON.parse(String(join?.init?.body));
    expect(cuerpo.data).toEqual(["un gato astronauta", 0]);
    expect(cuerpo.fn_index).toBe(7);
    // sin token no se manda Authorization
    expect(JSON.stringify(llamadas.map((l) => l.init?.headers ?? {}))).not.toContain("Authorization");

    expect(usoDeHoy(almacen, AHORA)[ID]).toMatchObject({ llamadas: 1 });
    expect(usoDeHoy(almacen, AHORA)[ID].segundos).toBeGreaterThan(0);
  });

  it("guarda la API por versión y solo vuelve a leer /info si la versión cambia", async () => {
    const almacen = almacenEnMemoria();
    const a = espacioSimulado({});
    await leerApiEspacio(ID, { fetch: a.f, almacen, token: null });
    await leerApiEspacio(ID, { fetch: a.f, almacen, token: null });
    expect(a.llamadas.filter((l) => l.url.endsWith("/info"))).toHaveLength(1);
    expect(JSON.parse(almacen.get(CLAVE_API) ?? "{}")[ID].version).toBe("5.9.1");

    const b = espacioSimulado({ version: "6.0.0" });
    const api = await leerApiEspacio(ID, { fetch: b.f, almacen, token: null });
    expect(api.version).toBe("6.0.0");
    expect(b.llamadas.filter((l) => l.url.endsWith("/info"))).toHaveLength(1);
  });

  it("con token de la persona lo manda solo a Hugging Face y nunca lo pone en un error", async () => {
    const almacen = almacenEnMemoria();
    const token = ["hf", "_fake", "A".repeat(24)].join("");
    expect(guardarTokenHf("no-es-token", almacen)).toMatch(/hf_/);
    expect(guardarTokenHf(token, almacen)).toBeNull();
    expect(leerTokenHf(almacen)).toBe(token);
    const { f, llamadas } = espacioSimulado({ mensajes: [{ msg: "process_completed", success: false, output: { error: "boom" } }] });
    const err = await ejecutarEspacio(ID, "infer", { texto: "x" }, { fetch: f, almacen, ahora: reloj() }).catch((e) => e);
    expect(err).toBeInstanceOf(ErrorEspacio);
    expect(String(err.message)).not.toContain(token);
    const conToken = llamadas.filter((l) => JSON.stringify(l.init?.headers ?? {}).includes(token));
    expect(conToken.length).toBeGreaterThan(0);
    expect(conToken.every((l) => l.url.startsWith("https://") && new URL(l.url).hostname.endsWith(".hf.space"))).toBe(true);
  });

  it("cuota agotada: lo reconoce, lo anota y pasa a la siguiente opción", async () => {
    const almacen = almacenEnMemoria();
    const agotado = espacioSimulado({
      mensajes: [
        { msg: "process_starts" },
        { msg: "process_completed", success: false, output: { error: "You have exceeded your GPU quota (60s requested vs. 29s left)." } },
      ],
    });
    const OTRO = "Qwen/Qwen-Image";
    const otroHost = hostPorDefecto(OTRO);
    const bueno = espacioSimulado({ mensajes: EXITO });
    const f: FetchLike = (url, init) =>
      url.startsWith(otroHost) ? bueno.f(url.replace(otroHost, HOST), init) : agotado.f(url, init);

    const r = await generarConRespaldo(
      [{ espacioId: ID, endpoint: "infer" }, { espacioId: OTRO, endpoint: "infer" }],
      { texto: "paisaje" },
      { fetch: f, almacen, token: null, ahora: reloj() },
    );
    expect(r.ok).toBe(true);
    expect(r.intentos[0]).toMatchObject({ espacioId: ID, tipo: "cuota" });
    if (r.ok) expect(r.espacioId).toBe(OTRO);

    const estado = estadoCuota("sin-cuenta", almacen, AHORA);
    expect(estado.quedanMin).toBeLessThanOrEqual(29 / 60);
    expect(estado.texto).toMatch(/Te quedan unos .* min de GPU gratis hoy/);

    // otra petición el mismo día ni siquiera llama al Space agotado
    agotado.llamadas.length = 0;
    const r2 = await generarConRespaldo([{ espacioId: ID, endpoint: "infer" }], { texto: "x" }, { fetch: f, almacen, token: null, ahora: () => AHORA });
    expect(r2.ok).toBe(false);
    expect(agotado.llamadas).toHaveLength(0);
  });

  it("API cambiada: si el Space ya no publica la función, lo dice y borra la copia guardada", async () => {
    const almacen = almacenEnMemoria();
    await leerApiEspacio(ID, { fetch: espacioSimulado({}).f, almacen, token: null });
    const cambiado = espacioSimulado({ version: "6.1.0", endpoints: { "/generate": [{ parameter_name: "prompt", component: "Textbox" }] } });
    const r = await generarConRespaldo([{ espacioId: ID, endpoint: "infer" }], { texto: "x" }, { fetch: cambiado.f, almacen, token: null });
    expect(r.ok).toBe(false);
    expect(r.intentos[0]).toMatchObject({ tipo: "api-cambiada" });
    expect(r.intentos[0].motivo).toMatch(/su API cambió/);
    expect(JSON.parse(almacen.get(CLAVE_API) ?? "{}")[ID]).toBeUndefined();
  });

  it("API cambiada: un parámetro nuevo obligatorio que no sabemos rellenar no se adivina", async () => {
    const sim = espacioSimulado({ endpoints: { "/infer": [{ parameter_name: "prompt", component: "Textbox" }, { parameter_name: "lora", component: "Dropdown" }] } });
    const err = await ejecutarEspacio(ID, "infer", { texto: "x" }, { fetch: sim.f, almacen: almacenEnMemoria(), token: null }).catch((e) => e);
    expect(err).toMatchObject({ tipo: "api-cambiada" });
    expect(sim.llamadas.some((l) => l.url.endsWith("/queue/join"))).toBe(false);
  });

  it("Space dormido o cola llena: se dice tal cual", async () => {
    const dormido = await ejecutarEspacio(ID, "infer", { texto: "x" }, { fetch: espacioSimulado({ dormido: true }).f, almacen: almacenEnMemoria(), token: null }).catch((e) => e);
    expect(dormido).toMatchObject({ tipo: "dormido" });
    expect(dormido.message).toMatch(/dormido/);
    const lleno = await ejecutarEspacio(ID, "infer", { texto: "x" }, { fetch: espacioSimulado({ joinStatus: 429, joinCuerpo: {} }).f, almacen: almacenEnMemoria(), token: null }).catch((e) => e);
    expect(lleno).toMatchObject({ tipo: "lleno" });
  });

  it("imagen de referencia: sin permiso o sin consentimiento de las personas no sale del aparato", async () => {
    const sim = espacioSimulado({ endpoints: { "/run": [{ parameter_name: "image", component: "Image" }] }, mensajes: EXITO });
    const imagen = new Blob([new Uint8Array([1, 2, 3])], { type: "image/png" });
    const op = { fetch: sim.f, almacen: almacenEnMemoria(), token: null, ahora: reloj() };
    await expect(ejecutarEspacio(ID, "run", { imagen }, op)).rejects.toMatchObject({ tipo: "permiso" });
    await expect(ejecutarEspacio(ID, "run", { imagen }, { ...op, permiso: true, esFotoDePersonas: true })).rejects.toMatchObject({ tipo: "permiso" });
    expect(sim.llamadas).toHaveLength(0);
    const r = await ejecutarEspacio(ID, "run", { imagen }, { ...op, permiso: true });
    expect(r.archivos[0].path).toBe("/tmp/gradio/out.png");
    const join = JSON.parse(String(sim.llamadas.find((l) => l.url.endsWith("/queue/join"))?.init?.body));
    expect(join.data[0]).toMatchObject({ path: "/tmp/gradio/ref.png", meta: { _type: "gradio.FileData" } });
  });
});

describe("cuota de GPU en el aparato", () => {
  it("reconoce los errores de cuota de ZeroGPU y los segundos que quedan", () => {
    expect(clasificarErrorEspacio("You have exceeded your GPU quota (60s requested vs. 29s left).")).toBe("cuota");
    expect(clasificarErrorEspacio("ZeroGPU quota exceeded")).toBe("cuota");
    expect(clasificarErrorEspacio("Queue is full")).toBe("lleno");
    expect(clasificarErrorEspacio("CUDA out of memory")).toBe("otro");
    expect(segundosRestantesDeError("(60s requested vs. 29s left)")).toBe(29);
    expect(segundosRestantesDeError("nada")).toBeNull();
  });

  it("enseña lo que queda por nivel de cuenta y se reinicia al cambiar de día", () => {
    const almacen = almacenEnMemoria();
    expect(estadoCuota("gratis", almacen, AHORA).texto).toMatch(/unos 5 min .* aún no has usado nada/);
    registrarUso(ID, 90, almacen, AHORA);
    const e = estadoCuota("gratis", almacen, AHORA);
    expect(e.quedanMin).toBeCloseTo(3.5);
    expect(e.texto).toBe("Te quedan unos 3 min de GPU gratis hoy en Hugging Face.");
    expect(estadoCuota("sin-cuenta", almacen, AHORA).texto).toMatch(/cuenta gratis serían 5 min/);
    registrarUso(ID, 60, almacen, AHORA);
    expect(estadoCuota("sin-cuenta", almacen, AHORA).agotado).toBe(true);
    expect(estadoCuota("pro", almacen, AHORA + 24 * 3600 * 1000).gastadoMin).toBe(0);
  });
});
