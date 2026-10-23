import { describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";
import { RUTA_EQUIPO, RUTA_SERVIDORES, listarServidores, mapearServidor, motivoPorEstado, sondear, validarDestino } from "../coolify";
import type { DestinoCoolify, FetchCoolify, PeticionCoolify, Reloj, RespuestaCoolify } from "../coolify";

// El valor se monta en tiempo de ejecución: ninguna cadena con forma de clave vive en el repositorio.
const TOKEN = ["idPrueba", "clave6636"].join("|");
const DEST: DestinoCoolify = { url: "https://coolify.mi-red.org", token: TOKEN };
const resp = (status: number, texto: string): RespuestaCoolify =>
  ({ ok: status >= 200 && status < 300, status, text: async () => texto });

/** Reloj manual: los plazos solo vencen cuando la prueba avanza el tiempo. */
function relojFalso() {
  let t = 1_000;
  const timers: { en: number; r: () => void }[] = [];
  const reloj: Reloj = { ahora: () => t, tras: (ms) => { const p = { en: t + ms, r: (): void => undefined }; timers.push(p);
    return { promesa: new Promise<void>((res) => { p.r = res; }), cancelar: () => { timers.splice(timers.indexOf(p) >>> 0, 1); } }; } };
  return { reloj, timers, avanzar: (ms: number) => { t += ms; for (const p of timers.filter((x) => x.en <= t)) { timers.splice(timers.indexOf(p), 1); p.r(); } } };
}

const primera = (f: Mock<FetchCoolify>): { url: string; init: PeticionCoolify } => {
  const [url, init] = f.mock.calls[0] as [string, PeticionCoolify];
  return { url, init };
};

describe("coolify · cliente puro en solo lectura", () => {
  it("sondear: GET a /api/v1/teams/current con Bearer del valor entero y redirect manual", async () => {
    const f = vi.fn<FetchCoolify>(async () => resp(200, JSON.stringify({ id: "eq1", name: "Servidores de la casa" })));
    const r = await sondear(DEST, f);
    expect(r).toMatchObject({ ok: true, equipoId: "eq1", nombreEquipo: "Servidores de la casa" });
    const { url, init } = primera(f);
    expect(url).toBe(`https://coolify.mi-red.org${RUTA_EQUIPO}`);
    expect(init).toMatchObject({ method: "GET", redirect: "manual", headers: { accept: "application/json", authorization: `Bearer ${TOKEN}` } });
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("listarServidores: mapea solo lo que venga; lo que falta es «sin dato» y lo que sobra se ignora", async () => {
    const cuerpo = JSON.stringify([
      { id: 7, name: "Nodo A", ip: "10.0.0.7", description: "capa de conciencia", resources: 3 },
      { uuid: "u-b", name: "Nodo B" },
      "ruido",
    ]);
    const f = vi.fn<FetchCoolify>(async () => resp(200, cuerpo));
    const r = await listarServidores(DEST, f);
    expect(primera(f).url).toBe(`https://coolify.mi-red.org${RUTA_SERVIDORES}`);
    expect(r).toMatchObject({ ok: true, servidores: [
      { id: "7", nombre: "Nodo A", ip: "10.0.0.7", descripcion: "capa de conciencia" },
      { id: "u-b", nombre: "Nodo B", ip: "sin dato", descripcion: "sin dato" },
    ] });
    if (r.ok) expect(r.servidores).toHaveLength(2); // lo que no es un objeto de servidor («ruido») se ignora
  });

  it("listarServidores acepta también {data:[…]} y una respuesta sin lista es error honesto", async () => {
    const conData = await listarServidores(DEST, vi.fn(async () => resp(200, JSON.stringify({ data: [{ id: "s1" }] }))))
    expect(conData).toMatchObject({ ok: true, servidores: [{ id: "s1", nombre: "sin dato", ip: "sin dato", descripcion: "sin dato" }] });
    const sinLista = await listarServidores(DEST, vi.fn(async () => resp(200, '{"estado":1}')));
    expect(sinLista).toMatchObject({ ok: false, fallo: "respuesta", motivo: expect.stringContaining("no traía una lista") });
  });

  it("401, 403 y 404 dan cada uno su motivo honesto y jamás revelan el token", async () => {
    const casos: [number, string][] = [
      [401, "El token de Coolify no es válido"],
      [403, "sin permiso o tu IP no está en la lista permitida"],
      [404, "un administrador debe encender la API de Coolify"],
    ];
    for (const [status, trozo] of casos) {
      const r = await sondear(DEST, vi.fn(async () => resp(status, status === 404 ? "Not Found" : TOKEN)));
      expect(r).toMatchObject({ ok: false, fallo: "http", status, motivo: expect.stringContaining(trozo) });
      expect(JSON.stringify(r)).not.toContain(TOKEN.slice(0, 6));
    }
  });

  it("si el servidor repite el token en el cuerpo del error, queda tapado («•••»)", async () => {
    const r = await listarServidores(DEST, vi.fn(async () => resp(500, `boom: ${TOKEN}`)));
    expect(r).toMatchObject({ ok: false, fallo: "http", status: 500 });
    expect(JSON.stringify(r)).not.toContain("clave6636");
    expect(JSON.stringify(r)).toContain("•••");
  });

  it("destino mal formado: no llama y dice qué falta", async () => {
    const f = vi.fn<FetchCoolify>();
    const sinToken = await sondear({ url: "https://coolify.mi-red.org", token: "  " }, f);
    expect(sinToken).toMatchObject({ ok: false, fallo: "config", motivo: expect.stringContaining("Falta el token") });
    const malaUrl = await listarServidores({ ...DEST, url: "ftp://no" }, f);
    expect(malaUrl).toMatchObject({ ok: false, fallo: "config", motivo: expect.stringContaining("https://") });
    expect(f).not.toHaveBeenCalled();
    expect(validarDestino(DEST)).toBeNull();
  });

  it("la barra final de la URL se normaliza (sin doble barra) y localhost http vale", async () => {
    const f = vi.fn<FetchCoolify>(async () => resp(200, "[]"));
    await listarServidores({ url: "http://127.0.0.1:8000/", token: TOKEN }, f);
    expect(primera(f).url).toBe("http://127.0.0.1:8000/api/v1/servers");
  });

  it("sin respuesta (fallo de red) y cuerpo que no es JSON: errores honestos, sin el token", async () => {
    const caido = await sondear(DEST, vi.fn(async () => { throw new TypeError("fetch failed"); }));
    expect(caido).toMatchObject({ ok: false, fallo: "red", motivo: expect.stringContaining("no contesta") });
    expect(JSON.stringify(caido)).not.toContain(TOKEN.slice(0, 6));
    const noJson = await sondear(DEST, vi.fn(async () => resp(200, "<html>vale</html>")));
    expect(noJson).toMatchObject({ ok: false, fallo: "respuesta", motivo: expect.stringContaining("no es JSON") });
  });

  it("tiempo agotado: corta la petición (aborta la señal) con el reloj inyectado", async () => {
    const { reloj, avanzar, timers } = relojFalso();
    let senal: AbortSignal | undefined;
    const colgado: FetchCoolify = (_u, i) => { senal = i.signal; return new Promise((_, rej) => i.signal.addEventListener("abort", () => rej(new Error("abortado")))); };
    const p = sondear(DEST, colgado, { reloj, tiempoMs: 5_000 });
    avanzar(4_999); expect(senal?.aborted).toBe(false);
    avanzar(1);
    expect(await p).toMatchObject({ ok: false, fallo: "tiempo", motivo: expect.stringContaining("5 s") });
    expect(senal?.aborted).toBe(true); expect(timers).toHaveLength(0);
  });

  it("mapearServidor y motivoPorEstado son puros y honestos", () => {
    expect(mapearServidor({})).toEqual({ id: "sin dato", nombre: "sin dato", ip: "sin dato", descripcion: "sin dato" });
    expect(motivoPorEstado(302, "")).toContain("redirect: manual");
    expect(motivoPorEstado(500, "")).toContain("respondió 500");
  });
});
