// BOT1011N · proxy de servidor para bots invitados AG-UI. Sin red, sin DNS real: resolver y fetch inyectados.
import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type { FragmentoMemoria } from "@/lib/nucleo/alcance-memoria";
import * as ruta from "@/app/api/bots/invitado/route";
import { TOPE_BYTES, cabeceraDelEntorno, reenviarTurno, validarEndpoint } from "../adaptadores/invitado-servidor";
import type { DepInvitado, EntradaTurno, Pedir, RegistroTurno, Resolver } from "../adaptadores/invitado-servidor";
vi.mock("@/utils/supabase/server", () => ({ createClient: vi.fn(async () => ({ auth: { getUser: async () => sesion } })) }));
let sesion: { data: { user: { id: string } | null }; error: null } = { data: { user: null }, error: null };
const PUBLICA = "203.0.113.10"; // TEST-NET-3: rango de documentación, nunca un host real
const resolver = (mapa: Record<string, string[]>): Resolver => async (h) => (mapa[h] ?? []).map((address) => ({ address, family: address.includes(":") ? 6 : 4 }));
const dns = resolver({ "bot.invitado.example": [PUBLICA], "otro.invitado.example": [PUBLICA], "lan.invitado.example": ["192.168.1.20"], "mixto.invitado.example": [PUBLICA, "169.254.169.254"] });
const enc = (s: string) => new TextEncoder().encode(s);
const sse = () => new Response('data: {"type":"RUN_FINISHED"}\n\n', { status: 200, headers: { "content-type": "text/event-stream" } });
const redirige = (status: number, location: string) => new Response(null, { status, headers: { location } });
const fragmento = (alcance: FragmentoMemoria["alcance"]): FragmentoMemoria => ({ id: alcance, alcance, texto: "Agenda pública del grupo", origen: "pagina", at: 1 });
const entrada = (extra: Partial<EntradaTurno> = {}): EntradaTurno => ({ endpoint: "https://bot.invitado.example/agente", mensajes: [{ id: "m1", role: "user", content: "Hola" }], contextoPermitido: [], ...extra });
const leer = async (s: ReadableStream<Uint8Array>) => new TextDecoder().decode(await new Response(s).arrayBuffer());
function preparar(respuestas: Array<Response | ((signal: AbortSignal) => Promise<Response>)>, extra: Partial<DepInvitado> = {}) {
  const llamadas: Array<{ url: string; metodo: string; headers: Record<string, string>; body: string }> = [], registros: RegistroTurno[] = [];
  const pedir: Pedir = async (url, init) => {
    const r = respuestas[llamadas.push({ url: url.toString(), metodo: init.method, headers: { ...init.headers }, body: init.body }) - 1];
    if (!r) throw new Error("sin respuesta simulada"); return typeof r === "function" ? r(init.signal) : r;
  };
  return { llamadas, registros, dep: { resolver: dns, pedir, registrar: (r: RegistroTurno) => registros.push(r), nuevoId: () => "id-fijo", ...extra } };
}
describe("validarEndpoint · guardia SSRF estricta", () => {
  it("http rechazado (también en reenviarTurno, con 400 y sin contactar a nadie); https público aceptado", async () => {
    expect((await validarEndpoint("http://bot.invitado.example/agente", dns)).ok).toBe(false);
    expect((await validarEndpoint("https://bot.invitado.example/agente", dns)).ok).toBe(true);
    const p = preparar([sse()]);
    expect(await reenviarTurno(entrada({ endpoint: "http://bot.invitado.example/a" }), p.dep)).toMatchObject({ ok: false, status: 400 });
    expect(p.llamadas).toHaveLength(0);
  });
  it("rechaza IP privada y loopback, literal o resuelta (aquí no hay self-host)", async () => {
    for (const u of ["https://10.0.0.5/a", "https://127.0.0.1/a", "https://[::1]/a", "https://lan.invitado.example/a"]) expect((await validarEndpoint(u, dns)).ok).toBe(false);
  });
  it("rechaza metadatos de la nube por nombre, por IP y escondidos en IPv6 o en un DNS mixto", async () => {
    for (const u of ["https://169.254.169.254/latest", "https://metadata.google.internal/", "https://[::ffff:169.254.169.254]/", "https://mixto.invitado.example/"]) expect((await validarEndpoint(u, dns)).ok).toBe(false);
  });
  it("una dirección sin esquema se rechaza antes de tocar el DNS", async () => {
    let resueltas = 0;
    const contando: Resolver = async (h) => { resueltas++; return dns(h); };
    expect((await validarEndpoint("example.com", contando)).ok).toBe(false);
    expect(resueltas).toBe(0);
  });
  it("un nombre que no resuelve (ni vacío ni con el DNS caído) se rechaza: no hay destino al que llamar", async () => {
    expect((await validarEndpoint("https://nada.invitado.example/agente", resolver({}))).ok).toBe(false);
    const caido: Resolver = async () => { throw new Error("getaddrinfo ENOTFOUND"); };
    expect((await validarEndpoint("https://bot.invitado.example/agente", caido)).ok).toBe(false);
  });
});
describe("reenviarTurno", () => {
  it("hace POST AG-UI (RunAgentInput) y devuelve el flujo tal cual", async () => {
    const p = preparar([sse()]);
    const r = await reenviarTurno(entrada({ contextoPermitido: [fragmento("publica")] }), p.dep);
    expect(r.ok && (await leer(r.flujo))).toBe('data: {"type":"RUN_FINISHED"}\n\n');
    expect(p.llamadas[0].metodo).toBe("POST");
    expect(p.llamadas[0].headers).toMatchObject({ "Content-Type": "application/json", Accept: "text/event-stream" });
    const cuerpo = JSON.parse(p.llamadas[0].body);
    expect(cuerpo).toMatchObject({ threadId: "id-fijo", runId: "id-fijo", tools: [], state: {}, context: [{ description: "pagina", value: "Agenda pública del grupo" }] });
    expect(cuerpo.messages).toEqual([{ id: "m1", role: "user", content: "Hola" }]);
  });
  it("contexto personal, del perfil, sin alcance claro o de más de 50 fragmentos: rechazado (falla cerrada)", async () => {
    for (const malo of [[fragmento("personal")], [fragmento("perfil")], [{ ...fragmento("publica"), alcance: "otro" }], Array.from({ length: 51 }, () => fragmento("publica"))] as FragmentoMemoria[][]) {
      const p = preparar([sse()]);
      expect(await reenviarTurno(entrada({ contextoPermitido: [fragmento("publica"), ...malo] }), p.dep)).toMatchObject({ ok: false, status: 400 });
      expect(p.llamadas).toHaveLength(0);
    }
  });
  it("un mensaje con forma de clave no sale hacia el invitado", async () => {
    const p = preparar([sse()]), clave = ["s", "k-"].join("") + "a".repeat(40);
    expect((await reenviarTurno(entrada({ mensajes: [{ id: "m1", role: "user", content: `mi clave ${clave}` }] }), p.dep)).ok).toBe(false);
    expect(p.llamadas).toHaveLength(0);
  });
  it("redirección a una IP privada: se corta ANTES de contactarla", async () => {
    const p = preparar([redirige(307, "https://10.1.2.3/interno"), sse()]);
    expect(await reenviarTurno(entrada(), p.dep)).toMatchObject({ ok: false, status: 502 });
    expect(p.llamadas.map((l) => l.url)).toEqual(["https://bot.invitado.example/agente"]);
  });
  it("redirección a otro origen: se revalida y se quita la cabecera; demasiados saltos se cortan", async () => {
    const valor = "Bearer " + ["to", "ken-de-prueba-"].join("") + "x".repeat(20);
    const p = preparar([redirige(308, "https://otro.invitado.example/b"), sse()], { leerCabecera: () => ({ valor, origen: "https://bot.invitado.example" }) });
    const r = await reenviarTurno(entrada({ cabecera: "STARSEED_BOT_INVITADO_DEMO" }), p.dep);
    expect(r.ok && (await leer(r.flujo))).toContain("RUN_FINISHED");
    expect(p.llamadas[0].headers.Authorization).toBe(valor);
    expect(p.llamadas[1].headers.Authorization).toBeUndefined();
    const bucle = preparar(Array.from({ length: 8 }, () => redirige(307, "/otra-vez")));
    expect(await reenviarTurno(entrada(), bucle.dep)).toMatchObject({ ok: false, status: 502 });
    expect(bucle.llamadas).toHaveLength(6);
  });
  it("sin cabecera pedida el turno sale sin Authorization; con cabecera pedida y ausente en la bóveda, ni se contacta", async () => {
    const p = preparar([sse()]);
    expect((await reenviarTurno(entrada(), p.dep)).ok).toBe(true);
    expect(p.llamadas[0].headers.Authorization).toBeUndefined();
    const ausente = preparar([sse()], { leerCabecera: () => null });
    expect(await reenviarTurno(entrada({ cabecera: "STARSEED_BOT_INVITADO_A" }), ausente.dep)).toMatchObject({ ok: false, status: 400 });
    expect(ausente.llamadas).toHaveLength(0);
  });
  it("si la red falla, 502 y el motivo del fallo no se filtra al que pregunta", async () => {
    const caida = preparar([() => Promise.reject(new Error("ECONNREFUSED 10.0.0.1:443"))]);
    const r = await reenviarTurno(entrada(), caida.dep);
    expect(r).toMatchObject({ ok: false, status: 502 });
    expect(caida.registros[0]).toMatchObject({ host: "bot.invitado.example", status: 502 });
    expect(JSON.stringify(r)).not.toContain("ECONNREFUSED");
  });
  it("tope de 1 MB: el flujo se corta con un RUN_ERROR legible", async () => {
    const grande = new ReadableStream<Uint8Array>({ start(c) { c.enqueue(new Uint8Array(700_000)); c.enqueue(new Uint8Array(700_000)); c.close(); } });
    const texto = await reenviarTurno(entrada(), preparar([new Response(grande, { status: 200 })]).dep).then((r) => (r.ok ? leer(r.flujo) : ""));
    expect(enc(texto).byteLength).toBeLessThan(TOPE_BYTES);
    expect(texto).toMatch(/RUN_ERROR.*1 MB/);
  });
  it("tiempo límite: sin respuesta da 504; a mitad del flujo, RUN_ERROR", async () => {
    const colgado = (s: AbortSignal) => new Promise<Response>((_, rechazar) => s.addEventListener("abort", () => rechazar(new Error("abortado"))));
    expect(await reenviarTurno(entrada(), preparar([colgado], { tiempoLimiteMs: 20 }).dep)).toMatchObject({ ok: false, status: 504 });
    const lento = async (s: AbortSignal) => new Response(new ReadableStream<Uint8Array>({ start(c) { c.enqueue(enc("data: {}\n\n")); s.addEventListener("abort", () => c.error(new Error("abortado"))); } }));
    const r = await reenviarTurno(entrada(), preparar([lento], { tiempoLimiteMs: 30 }).dep);
    expect(r.ok && (await leer(r.flujo))).toContain("tiempo límite de 60 s");
  });
  it("la cabecera no aparece en la respuesta ni en el registro (solo su longitud) y va ligada a su origen", async () => {
    const valor = "Bearer " + ["to", "ken-secreto-"].join("") + "y".repeat(24);
    const p = preparar([sse()], { leerCabecera: () => ({ valor, origen: "https://bot.invitado.example" }) });
    const r = await reenviarTurno(entrada({ cabecera: "STARSEED_BOT_INVITADO_DEMO" }), p.dep);
    expect(r.ok ? await leer(r.flujo) : "").not.toContain(valor);
    expect(JSON.stringify(p.registros)).not.toContain(valor);
    expect(p.registros[0].cabecera).toEqual({ nombre: "STARSEED_BOT_INVITADO_DEMO", longitud: valor.length });
    const ajeno = preparar([sse()], { leerCabecera: () => ({ valor, origen: "https://otro.invitado.example" }) });
    expect(JSON.stringify(await reenviarTurno(entrada({ cabecera: "STARSEED_BOT_INVITADO_DEMO" }), ajeno.dep))).not.toContain(valor);
    expect(ajeno.llamadas).toHaveLength(0);
  });
  it("la bóveda del entorno solo da variables STARSEED_BOT_INVITADO_* con su origen", () => {
    const entorno = { SUPABASE_SERVICE_ROLE_KEY: "x", STARSEED_BOT_INVITADO_A: "Bearer abc", STARSEED_BOT_INVITADO_A_ORIGEN: "https://bot.invitado.example/", STARSEED_BOT_INVITADO_B: "v" };
    for (const n of ["SUPABASE_SERVICE_ROLE_KEY", "STARSEED_BOT_INVITADO_B"]) expect(cabeceraDelEntorno(n, entorno)).toBeNull();
    expect(cabeceraDelEntorno("STARSEED_BOT_INVITADO_A", entorno)).toEqual({ valor: "Bearer abc", origen: "https://bot.invitado.example" });
  });
});
describe("POST /api/bots/invitado", () => {
  const pedir = (cuerpo: unknown) => new NextRequest("http://localhost/api/bots/invitado", { method: "POST", body: JSON.stringify(cuerpo) });
  it("401 sin sesión y 400 con endpoint inválido; solo exporta lo que Next permite", async () => {
    expect(Object.keys(ruta).sort()).toEqual(["POST", "dynamic", "maxDuration", "runtime"]);
    expect(ruta.maxDuration).toBe(60);
    expect((await ruta.POST(pedir(entrada()))).status).toBe(401);
    sesion = { data: { user: { id: "cuenta-1" } }, error: null };
    const r = await ruta.POST(pedir(entrada({ endpoint: "http://bot.invitado.example/a" })));
    expect(r.status).toBe(400);
    expect((await r.json()).error).toContain("https");
  });
});
