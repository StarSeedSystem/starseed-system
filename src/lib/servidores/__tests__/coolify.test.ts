import { describe, expect, it, vi } from "vitest";
import { listarServidores, sondear, validarCredenciales } from "../coolify";
import type { CredencialesCoolify, FalloCoolify, FetchCoolify, PeticionCoolify, RelojCoolify, RespuestaCoolifyFetch, ResultadoCoolify } from "../coolify";

/** Estrecha sin fingir: el motivo solo existe en la rama de error. */
const elFallo = (r: ResultadoCoolify<unknown>): FalloCoolify | null => (r.ok ? null : r.fallo);

// El valor se monta en tiempo de ejecución: ninguna cadena con forma de clave vive entera en el repositorio.
const TOKEN = ["4", "secreto-coolify-9182"].join("|");
const CRED: CredencialesCoolify = { url: "https://panel.servidores.local", token: TOKEN };
const resp = (estado: number, texto: string, extra: Partial<RespuestaCoolifyFetch> = {}): RespuestaCoolifyFetch =>
  ({ ok: estado >= 200 && estado < 300, status: estado, headers: { get: () => null }, text: async () => texto, ...extra });

/** Reloj manual: los plazos solo vencen cuando la prueba avanza el tiempo. */
function relojFalso() {
  let t = 1_000;
  const timers: { en: number; r: () => void }[] = [];
  const reloj: RelojCoolify = { ahora: () => t, tras: (ms) => { const p = { en: t + ms, r: (): void => undefined }; timers.push(p);
    return { promesa: new Promise<void>((res) => { p.r = res; }), cancelar: () => { timers.splice(timers.indexOf(p) >>> 0, 1); } }; } };
  return { reloj, avanzar: (ms: number) => { t += ms; for (const p of timers.filter((x) => x.en <= t)) { timers.splice(timers.indexOf(p), 1); p.r(); } } };
}

describe("coolify · credenciales y sonda del equipo", () => {
  it("credenciales inválidas: no llama y dice por qué, sin repetir el token", async () => {
    const f = vi.fn<FetchCoolify>();
    expect(validarCredenciales({ url: "no es url", token: TOKEN })).toMatch(/URL válida/);
    expect(validarCredenciales({ url: "javascript:alerta", token: TOKEN })).toMatch(/http(s)?/);
    expect(validarCredenciales({ url: `https://user:clave@xxxx.invalid`, token: TOKEN })).toMatch(/usuario ni clave/);
    expect(validarCredenciales({ url: "https://xxxx.invalid", token: "" })).toMatch(/Falta el token/);
    expect(elFallo(await sondear({ url: "https://xxxx.invalid", token: "" }, f))).toBe("credenciales");
    expect(elFallo(await listarServidores({ url: "https://xxxx.invalid", token: "" }, f))).toBe("credenciales");
    expect(f).not.toHaveBeenCalled();
  });

  it("sondear (ruta verificada el 2026-10-20): GET /api/v1/teams/current con Bearer entero, redirect manual", async () => {
    const f = vi.fn<FetchCoolify>(async () => resp(200, '{"id":2,"name":"Capas de conciencia","description":"Oracle y vecinos"}'));
    const r = await sondear(CRED, f);
    const [url, init] = f.mock.calls[0] as [string, PeticionCoolify];
    expect(url).toBe("https://panel.servidores.local/api/v1/teams/current");
    expect(init).toMatchObject({ method: "GET", redirect: "manual", headers: { accept: "application/json", authorization: `Bearer ${TOKEN}` } });
    expect(r).toMatchObject({ ok: true, estado: 200, datos: { id: 2, nombre: "Capas de conciencia", descripcion: "Oracle y vecinos" } });
  });

  it("sondear: lo que la API no manda queda «sin dato» (null)", async () => {
    const r = await sondear(CRED, async () => resp(200, '{"id":"equipo-7"}'));
    expect(r).toMatchObject({ ok: true, datos: { id: "equipo-7", nombre: null, descripcion: null } });
    expect(elFallo(await sondear(CRED, async () => resp(200, '"un texto"')))).toBe("datos");
  });
});

describe("coolify · listarServidores (ruta verificada el 2026-10-20)", () => {
  it("GET /api/v1/servers: mapea solo lo que venga; lo ausente es «sin dato» y lo que no es objeto se descarta", async () => {
    const f = vi.fn<FetchCoolify>(async () => resp(200, JSON.stringify([
      { id: 5, uuid: "u-a1", name: "A1", ip: "10.0.0.7", description: "Oracle Always Free", is_proxy: false, is_localhost: true, team_id: 2, cosa: "ajena" },
      { id: "srv-local", name: "Casa" },
      "texto basura",
    ])));
    const r = await listarServidores(CRED, f);
    const [url] = f.mock.calls[0] as [string, PeticionCoolify];
    expect(url).toBe("https://panel.servidores.local/api/v1/servers");
    expect(r.ok ? r.datos : r.motivo).toEqual([
      { id: 5, uuid: "u-a1", nombre: "A1", ip: "10.0.0.7", descripcion: "Oracle Always Free", esProxy: false, esLocalhost: true, equipoId: 2 },
      { id: "srv-local", uuid: null, nombre: "Casa", ip: null, descripcion: null, esProxy: null, esLocalhost: null, equipoId: null },
    ]);
  });

  it("respete una ruta base bajo subruta y, si la respuesta no trae lista, error «datos» honesto", async () => {
    const f = vi.fn<FetchCoolify>(async () => resp(200, "[]"));
    await listarServidores({ url: "https://panel.servidores.local/coolify/", token: TOKEN }, f);
    expect(f.mock.calls[0]?.[0]).toBe("https://panel.servidores.local/coolify/api/v1/servers");
    expect(await listarServidores(CRED, async () => resp(200, '{"servers":[]}')))
      .toMatchObject({ ok: false, fallo: "datos", motivo: expect.stringContaining("lista de servidores") });
  });
});

describe("coolify · estados honestos y el token jamás fuera de su sitio", () => {
  it("401 token inválido · 403 IP no permitida · 404 API apagada, cada uno con su motivo", async () => {
    expect(await sondear(CRED, async () => resp(401, ""))).toMatchObject({ fallo: "http", motivo: expect.stringMatching(/Token inválido/i) });
    expect(await sondear(CRED, async () => resp(403, ""))).toMatchObject({ motivo: expect.stringMatching(/IP no está en la lista permitida/) });
    expect(await listarServidores(CRED, async () => resp(404, ""))).toMatchObject({ motivo: expect.stringMatching(/encender la API de Coolify/) });
    expect(await listarServidores(CRED, async () => { throw new TypeError("fetch failed"); }))
      .toMatchObject({ fallo: "red", motivo: expect.stringMatching(/no contesta/) });
  });

  it("otro estado de error: el cuerpo recortado entra en el motivo, con el token tapado", async () => {
    const lineas: string[] = [];
    const r = await listarServidores(CRED, async () => resp(500, "x".repeat(160) + TOKEN), { registrar: (l) => lineas.push(l) });
    expect(r).toMatchObject({ fallo: "http", motivo: expect.stringContaining("respondió 500") });
    expect(JSON.stringify(r)).not.toContain(TOKEN);
    for (const l of lineas) expect(l).not.toContain(TOKEN);
    expect(lineas).toHaveLength(1);
  });

  it("una respuesta correcta tampoco filtra el token en el registro; la firma encaja con el fetch real", async () => {
    const lineas: string[] = [];
    await listarServidores(CRED, async () => resp(200, "[{}]"), { registrar: (l) => lineas.push(l) });
    for (const l of lineas) expect(l).not.toContain(TOKEN);
    const compat: FetchCoolify = globalThis.fetch;
    expect(typeof compat).toBe("function");
  });

  it("tiempo agotado: corta la petición (aborta), con el reloj inyectado", async () => {
    const { reloj, avanzar } = relojFalso();
    let senal: AbortSignal | undefined;
    const colgado: FetchCoolify = (_u, i) => { senal = i.signal; return new Promise((_, rej) => i.signal.addEventListener("abort", () => rej(new Error("abortado")))); };
    const p = listarServidores(CRED, colgado, { reloj });
    avanzar(14_999); expect(senal?.aborted).toBe(false); avanzar(1);
    expect(await p).toMatchObject({ ok: false, fallo: "tiempo", ms: 15_000 });
    expect(senal?.aborted).toBe(true);
  });

  it("el tiempo también vence mientras se lee un cuerpo que nunca acaba", async () => {
    const { reloj, avanzar } = relojFalso();
    const p = sondear(CRED, async () => resp(200, "", { text: () => new Promise<string>(() => undefined) }), { reloj });
    await Promise.resolve(); avanzar(6_000);
    expect(await p).toMatchObject({ ok: false, fallo: "tiempo" });
  });
});
