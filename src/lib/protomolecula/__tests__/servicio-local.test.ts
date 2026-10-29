import { describe, expect, it, vi } from "vitest";
import { BINARIOS_PERMITIDOS, SERVICIOS_CONOCIDOS, llamarServicio, pedirLanzamiento, sondearServicio, validarDefinicion } from "../servicio-local";
import type { ContextoLanzamiento, DefinicionServicio, FetchLocal, PeticionLocal, Reloj, RespuestaLocal } from "../servicio-local";

// El valor se monta en tiempo de ejecución: ninguna cadena con forma de clave vive en el repositorio.
const TOKEN = ["valor", "de", "prueba", "4242"].join("-");
const DEF: DefinicionServicio = { id: "comfyui", nombre: "ComfyUI", puerto: 8188, rutaSalud: "/system_stats", variableToken: "COMFYUI_TOKEN" };
const resp = (status: number, texto: string, extra: Partial<RespuestaLocal> = {}): RespuestaLocal =>
  ({ ok: status >= 200 && status < 300, status, headers: { get: () => null }, text: async () => texto, ...extra });
const conToken = (registrar?: (l: string) => void) => ({ leerVariable: (n: string) => (n === "COMFYUI_TOKEN" ? TOKEN : undefined), registrar });
/** Reloj manual: los plazos solo vencen cuando la prueba avanza el tiempo. */
function relojFalso() {
  let t = 1_000;
  const timers: { en: number; r: () => void }[] = [];
  const reloj: Reloj = { ahora: () => t, tras: (ms) => { const p = { en: t + ms, r: (): void => undefined }; timers.push(p);
    return { promesa: new Promise<void>((res) => { p.r = res; }), cancelar: () => { timers.splice(timers.indexOf(p) >>> 0, 1); } }; } };
  return { reloj, timers, avanzar: (ms: number) => { t += ms; for (const p of timers.filter((x) => x.en <= t)) { timers.splice(timers.indexOf(p), 1); p.r(); } } };
}

describe("servicio-local · llamadas a 127.0.0.1", () => {
  it("token ausente: no llama y dice qué variable falta, por su nombre", async () => {
    const f = vi.fn<FetchLocal>();
    const r = await llamarServicio(DEF, "/prompt", { a: 1 }, f, { leerVariable: () => undefined });
    expect(r).toMatchObject({ ok: false, fallo: "token-ausente", motivo: expect.stringContaining("COMFYUI_TOKEN") });
    expect(f).not.toHaveBeenCalled();
  });
  it("con token: POST JSON a 127.0.0.1 con el puerto declarado y la cabecera de autorización", async () => {
    const f = vi.fn<FetchLocal>(async () => resp(200, '{"prompt_id":"p1"}'));
    const r = await llamarServicio(DEF, "/prompt", { a: 1 }, f, conToken());
    const [url, init] = f.mock.calls[0] as [string, PeticionLocal];
    expect(url).toBe("http://127.0.0.1:8188/prompt");
    expect(init).toMatchObject({ method: "POST", body: '{"a":1}', redirect: "manual", headers: { "content-type": "application/json", authorization: `Bearer ${TOKEN}` } });
    expect(r).toMatchObject({ ok: true, estado: 200, datos: { prompt_id: "p1" } });
  });
  it("ningún registro ni error contiene el valor del token, aunque el servicio lo repita", async () => {
    const lineas: string[] = [];
    const eco: FetchLocal = async (_u, i) => resp(401, `token inválido: ${i.headers.authorization}`);
    const r = await llamarServicio(DEF, "/prompt", {}, eco, conToken((l) => lineas.push(l)));
    const bien = await llamarServicio(DEF, "/queue", undefined, async () => resp(200, TOKEN), conToken((l) => lineas.push(l)));
    const borde = await llamarServicio(DEF, "/p", {}, async () => resp(500, "x".repeat(150) + TOKEN), conToken((l) => lineas.push(l))); // el recorte de 160 caería dentro del token
    expect(r).toMatchObject({ ok: false, fallo: "http", motivo: expect.stringContaining("401") });
    for (const x of [r, borde]) expect(JSON.stringify(x)).not.toContain(TOKEN.slice(0, 8));
    expect(bien.ok && lineas.length).toBe(3); for (const l of lineas) expect(l).not.toContain(TOKEN.slice(0, 8));
  });
  it("servicio caído: error en español y sin lanzar", async () => {
    const r = await llamarServicio(DEF, "/prompt", {}, async () => { throw new TypeError("fetch failed"); }, conToken());
    expect(r).toMatchObject({ ok: false, fallo: "caido", motivo: expect.stringMatching(/no contesta en 127\.0\.0\.1:8188/) });
  });
  it("tiempo agotado: corta la petición (aborta) con el reloj inyectado", async () => {
    const { reloj, avanzar, timers } = relojFalso();
    let senal: AbortSignal | undefined;
    const colgado: FetchLocal = (_u, i) => { senal = i.signal; return new Promise((_, rej) => i.signal.addEventListener("abort", () => rej(new Error("abortado")))); };
    const p = llamarServicio({ ...DEF, tiempoMs: 5_000 }, "/prompt", {}, colgado, { ...conToken(), reloj });
    avanzar(4_999); expect(senal?.aborted).toBe(false);
    avanzar(1);
    expect(await p).toMatchObject({ ok: false, fallo: "tiempo", ms: 5_000 });
    expect(senal?.aborted).toBe(true); expect(timers).toHaveLength(0);
  });
  it("tiempo agotado también mientras se lee un cuerpo que nunca acaba", async () => {
    const { reloj, avanzar } = relojFalso();
    const p = llamarServicio(DEF, "/x", undefined, async () => resp(200, "", { text: () => new Promise<string>(() => undefined) }), { ...conToken(), reloj });
    await Promise.resolve();
    avanzar(30_000);
    expect(await p).toMatchObject({ ok: false, fallo: "tiempo" });
  });
  it("respuesta enorme: por content-length no se lee, y por flujo se corta y se cancela", async () => {
    const text = vi.fn(async () => "x");
    const grande = await llamarServicio({ ...DEF, maxBytes: 2_000_000_000 }, "/x", undefined, async () => resp(200, "", { headers: { get: () => "999999999" }, text }), conToken()); // 2 GB declarados no suben el techo de 8 MB
    expect(grande).toMatchObject({ ok: false, fallo: "enorme" }); expect(text).not.toHaveBeenCalled();
    const cancel = vi.fn(async () => undefined);
    const lector = { read: async () => ({ done: false, value: new Uint8Array(1024) }), cancel };
    const flujo = await llamarServicio({ ...DEF, maxBytes: 4096 }, "/x", undefined, async () => resp(200, "", { body: { getReader: () => lector } }), conToken());
    expect(flujo).toMatchObject({ ok: false, fallo: "enorme" }); expect(cancel).toHaveBeenCalled();
    expect(await llamarServicio({ ...DEF, maxBytes: 10 }, "/x", undefined, async () => resp(200, "ñ".repeat(6)), conToken())).toMatchObject({ fallo: "enorme" });
  });
  it("petición enorme o ruta que intenta salir de 127.0.0.1: no se envía", async () => {
    const f = vi.fn<FetchLocal>();
    expect(await llamarServicio(DEF, "/x", { b: "a".repeat(1024 * 1024) }, f, conToken())).toMatchObject({ fallo: "enorme" });
    for (const ruta of ["//otro.host/x", "/\\otro", "x", "/a@otro.host", "/a#b"]) expect(await llamarServicio(DEF, ruta, undefined, f, conToken())).toMatchObject({ fallo: "definicion" });
    expect(f).not.toHaveBeenCalled();
  });
  it("la definición declara un NOMBRE de variable; si trae un valor, se rechaza sin repetirlo", () => {
    const valor = ["sk", "abcdefghijklmnop"].join("-");
    const motivo = validarDefinicion({ ...DEF, variableToken: valor });
    expect(motivo).toMatch(/NOMBRE de la variable/);
    expect(motivo).not.toContain(valor);
    expect(validarDefinicion({ ...DEF, puerto: 70_000 })).toMatch(/puerto/);
    for (const mal of [{ tiempoMs: -1 }, { tiempoMs: Number.NaN }, { maxBytes: 0 }, { tiempoMs: 3e9 }]) expect(validarDefinicion({ ...DEF, ...mal })).toMatch(/límites/);
    for (const d of SERVICIOS_CONOCIDOS) expect(validarDefinicion(d)).toBeNull();
  });
  it("sondear: GET a la ruta de salud, sin exigir token; caído = no vivo; el fetch real encaja con FetchLocal", async () => {
    const compat: FetchLocal = globalThis.fetch; expect(typeof compat).toBe("function");
    const f = vi.fn<FetchLocal>(async () => resp(200, '{"system":{}}'));
    expect((await sondearServicio(DEF, f, { leerVariable: () => undefined })).vivo).toBe(true);
    expect(f.mock.calls[0]?.[0]).toBe("http://127.0.0.1:8188/system_stats");
    expect(f.mock.calls[0]?.[1]).toMatchObject({ method: "GET", headers: { accept: "application/json" } });
    expect(f.mock.calls[0]?.[1].headers.authorization).toBeUndefined();
    const caido = await sondearServicio(DEF, async () => { throw new Error("ECONNREFUSED"); });
    expect(caido).toMatchObject({ vivo: false, motivo: expect.stringMatching(/no contesta/) });
  });
  it("hyperframes: definición válida y salud consultada SOLO en 127.0.0.1:4490/salud", async () => {
    const hf = SERVICIOS_CONOCIDOS.find((d) => d.id === "hyperframes");
    expect(hf).toEqual({ id: "hyperframes", nombre: "HyperFrames", puerto: 4490, rutaSalud: "/salud", tiempoMs: 900000 });
    expect(validarDefinicion(hf as DefinicionServicio)).toBeNull();
    const f = vi.fn<FetchLocal>(async () => resp(200, '{"ok":true}'));
    const s = await sondearServicio(hf as DefinicionServicio, f, { leerVariable: () => undefined });
    expect(s.vivo).toBe(true);
    const [url, init] = f.mock.calls[0] as [string, PeticionLocal];
    expect(url).toBe("http://127.0.0.1:4490/salud");
    expect(new URL(url).hostname).toBe("127.0.0.1");
    expect(init).toMatchObject({ method: "GET", headers: { accept: "application/json" } });
    expect(init.headers.authorization).toBeUndefined();
  });
});

describe("servicio-local · lanzador nativo (lista blanca y confirmación siempre)", () => {
  const ctx: ContextoLanzamiento = { rol: "dueno", origen: "mano", ambito: "personal", appNativa: true, ahora: 7 };
  it("binario fuera de la lista blanca cerrada: rechazado", () => {
    for (const id of ["rm", "/bin/sh", "__proto__", "toString", "blender --python x.py"]) expect(pedirLanzamiento(id, { ...ctx, confirmado: true }).estado).toBe("rechazado");
    expect(Object.isFrozen(BINARIOS_PERMITIDOS)).toBe(true);
  });
  it("un agente o una IA nunca lo arranca, ni diciendo que está confirmado; un observador tampoco", () => {
    for (const origen of ["agente", "ia"] as const) expect(pedirLanzamiento("blender", { ...ctx, origen, confirmado: true })).toMatchObject({ estado: "rechazado", motivo: expect.stringMatching(/IA no arranca/) });
    expect(pedirLanzamiento("blender", { ...ctx, rol: "observador", confirmado: true }).estado).toBe("rechazado");
  });
  it("una persona: primero se pregunta y solo con su confirmación sale la solicitud", () => {
    expect(pedirLanzamiento("blender", ctx)).toMatchObject({ estado: "confirmar", pregunta: expect.stringContaining("Blender") });
    expect(pedirLanzamiento("blender", { ...ctx, confirmado: true })).toMatchObject({ estado: "solicitud", solicitud: { tipo: "lanzar-externo", binarioId: "blender", origen: "mano", confirmadoEn: 7 } });
  });
  it("sin app nativa conectada se dice «próximamente», sin fingir", () => {
    expect(pedirLanzamiento("krita", { ...ctx, appNativa: false, confirmado: true })).toEqual({ estado: "proximamente", motivo: "próximamente: no hay app nativa conectada" });
  });
});
