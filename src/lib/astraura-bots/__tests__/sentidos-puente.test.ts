import { describe, expect, it, vi } from "vitest";
import type { FragmentoMemoria } from "@/lib/nucleo/alcance-memoria";
import { crearAlmacenConsentimientos } from "../adaptadores/consentimientos";
import { MAX_TEXTO_SENTIDO, crearPuenteSentidos, type ContextoPercibir, type DepsPuenteSentidos } from "../adaptadores/sentidos-puente";
import type { EventoBucle } from "../bucle";
import { SENTIDOS, type Bot, type ConsentimientoSentido, type Sentido } from "../tipos";
const AHORA = 1_000_000;
const bot = (extra: Partial<Bot> = {}): Bot => ({
  id: "b1", nombre: "Astraura", dueno: { tipo: "perfil", id: "p1", cuentaId: "c1" }, origen: "astraura",
  gobierno: "jerarquico", personalidad: { calidez: 0.5, energia: 0.5, formalidad: 0.5, curiosidad: 0.5, humor: 0.5, concision: 0.5 },
  cuerpo: { forma: "orbe", tono: 200, escala: 1 }, sentidosHabilitados: SENTIDOS, activo: true, ...extra,
});
const deGrupo = bot({ dueno: { tipo: "grupo", id: "g1", cuentaId: "c9" } });
const invitado = bot({ origen: "ag-ui" });
const ctx: ContextoPercibir = { cuentaId: "c1", sesion: "privada", medio: "web" };
const permiso = (sentido: Sentido, vence: number | null = null): ConsentimientoSentido => ({ botId: "b1", sentido, cuentaId: "c1", vence });

function montar(cs: ConsentimientoSentido[], extra: Partial<DepsPuenteSentidos> = {}) {
  const eventos: EventoBucle[] = [];
  const dep = {
    consentimientos: { vigentes: () => cs },
    leerPantalla: vi.fn(() => "1 Publicar · 2 Perfil"),
    ver: vi.fn(async (f: "screen" | "camera") => `Veo la ${f === "screen" ? "pantalla" : "cámara"}.`),
    carpeta: vi.fn(async () => ({ resumen: "«Cerebro» conectada.", backend: "Backend sin conexión." })),
    alEvento: (ev: EventoBucle) => { eventos.push(ev); }, ahora: () => AHORA, ...extra,
  };
  return { puente: crearPuenteSentidos(dep), dep, eventos };
}
describe("puente de sentidos: siempre tras decidirSentido", () => {
  it("sin consentimiento no se toca la fuente y se devuelve el motivo", async () => {
    const { puente, dep, eventos } = montar([]);
    const r = await puente.percibir(bot(), "pantalla", ctx);
    expect(r).toEqual({ ok: false, motivo: expect.stringContaining("TU permiso") });
    expect(dep.leerPantalla).not.toHaveBeenCalled();
    expect(eventos).toHaveLength(1);
    expect(eventos[0]).toMatchObject({ tipo: "observar", sentido: "pantalla", decision: { permitido: false } });
  });
  it("con consentimiento lee la fuente y enciende y apaga el indicador del bucle", async () => {
    const { puente, dep, eventos } = montar([permiso("pantalla")]);
    expect(await puente.percibir(bot(), "pantalla", ctx)).toEqual({ ok: true, texto: "1 Publicar · 2 Perfil" });
    expect(dep.leerPantalla).toHaveBeenCalledTimes(1);
    expect(eventos.map((e) => e.tipo)).toEqual(["observar", "soltar"]);
    expect(eventos[0]).toMatchObject({ decision: { permitido: true, indicador: true } });
  });
  it("usa los vigentes del almacén de BOT1011E1: un permiso caducado ya no vale", async () => {
    let guardados: ConsentimientoSentido[] = [permiso("captura-pantalla", AHORA - 1)];
    const almacen = crearAlmacenConsentimientos({ leer: () => guardados, escribir: (cs) => { guardados = cs; } });
    const { puente, dep } = montar([], { consentimientos: almacen });
    expect((await puente.percibir(bot(), "captura-pantalla", ctx)).ok).toBe(false);
    almacen.otorgar({ botId: "b1", sentido: "captura-pantalla", cuentaId: "c1", duracion: "hoy" }, AHORA);
    expect(await puente.percibir(bot(), "captura-pantalla", ctx)).toEqual({ ok: true, texto: "Veo la pantalla." });
    expect(dep.ver).toHaveBeenCalledWith("screen");
  });
  it("un invitado nunca recibe la cámara, ni con permiso", async () => {
    const { puente, dep } = montar([permiso("camara", AHORA + 60_000)]);
    const r = await puente.percibir(invitado, "camara", ctx);
    expect(r).toEqual({ ok: false, motivo: expect.stringContaining("invitado nunca") });
    expect(dep.ver).not.toHaveBeenCalled();
  });
  it("recorta a 4.000 caracteres y quita cualquier imagen incrustada", async () => {
    const largo = montar([permiso("pantalla")], { leerPantalla: () => "x".repeat(10_000) });
    const r = await largo.puente.percibir(bot(), "pantalla", ctx);
    expect(r.ok && r.texto.length).toBe(MAX_TEXTO_SENTIDO);
    expect(r.ok && r.texto.endsWith("…")).toBe(true);
    const img = montar([permiso("captura-pantalla")], { ver: async () => ["Mira: data:image/png;base64,", "iVBORw0KGgo="].join("") });
    expect(await img.puente.percibir(bot(), "captura-pantalla", ctx)).toEqual({ ok: true, texto: "Mira: [imagen omitida]" });
  });
  it("si un bot de grupo o invitado repetiría un recuerdo personal, se devuelve el motivo y no el texto", async () => {
    const secreto = "mi diagnóstico médico es confidencial y nadie del grupo debe saberlo";
    const personales: FragmentoMemoria[] = [{ id: "m1", alcance: "personal", texto: secreto, origen: "chat", at: 1 }];
    const cs = [permiso("pantalla"), { ...permiso("red", AHORA + 60_000) }];
    const { puente } = montar(cs, { leerPantalla: () => `Nota abierta: ${secreto}.`, red: async () => `Aviso: ${secreto}` });
    const r = await puente.percibir(deGrupo, "pantalla", { ...ctx, personales });
    expect(r).toEqual({ ok: false, motivo: expect.stringContaining("recuerdos personales") });
    expect(await puente.percibir(invitado, "red", { ...ctx, personales })).toEqual({ ok: false, motivo: expect.stringContaining("recuerdos personales") });
    expect((await puente.percibir(bot(), "pantalla", { ...ctx, personales })).ok).toBe(true);
  });
  it("lo que aún no tiene fuente se dice «próximamente», sin encender el indicador", async () => {
    const { puente, eventos } = montar([permiso("correo"), permiso("red"), permiso("aparatos")]);
    for (const s of ["correo", "red", "aparatos"] as const) {
      const r = await puente.percibir(bot(), s, ctx);
      expect(r.ok === false && r.motivo.startsWith("próximamente:")).toBe(true);
    }
    expect(eventos).toEqual([]);
  });
  it("los errores de la fuente no lanzan y el indicador se apaga igual", async () => {
    const { puente, eventos } = montar([permiso("camara"), permiso("pantalla")], {
      ver: async () => { throw new Error("La visión local necesita WebGPU."); },
      leerPantalla: () => { throw new Error("DOM roto"); },
    });
    expect(await puente.percibir(bot(), "camara", ctx)).toEqual({ ok: false, motivo: "No pude usar «camara»: La visión local necesita WebGPU." });
    expect((await puente.percibir(bot(), "pantalla", ctx)).ok).toBe(false);
    expect(eventos.map((e) => e.tipo)).toEqual(["observar", "soltar", "observar", "soltar"]);
    const roto = montar([], { consentimientos: { vigentes: () => { throw new Error("almacén ilegible"); } } });
    expect((await roto.puente.percibir(bot(), "pantalla", ctx)).ok).toBe(false);
  });
  it("dos lecturas a la vez del mismo bot: el indicador sigue hasta que acaba la última y dice de qué bot es", async () => {
    const pendientes: Array<(t: string) => void> = [], vistos: string[] = [];
    const { puente } = montar([permiso("camara")], { ver: () => new Promise<string>((r) => { pendientes.push(r); }), alEvento: (ev, botId) => { vistos.push(`${ev.tipo}:${botId}`); } });
    const a = puente.percibir(bot(), "camara", ctx), b = puente.percibir(bot(), "camara", ctx);
    pendientes[0]("uno"); await a;
    expect(vistos).toEqual(["observar:b1", "observar:b1"]);
    pendientes[1]("dos"); expect(await b).toEqual({ ok: true, texto: "dos" });
    expect(vistos).toEqual(["observar:b1", "observar:b1", "soltar:b1"]);
  });
  it("el micrófono solo queda marcado activo; archivos usa la carpeta elegida", async () => {
    const { puente, eventos } = montar([permiso("microfono"), permiso("archivos")]);
    const mic = await puente.percibir(bot(), "microfono", ctx);
    expect(mic.ok && mic.texto).toContain("motor de voz");
    expect(eventos.map((e) => e.tipo)).toEqual(["observar"]);
    expect(await puente.percibir(bot(), "archivos", ctx)).toEqual({ ok: true, texto: "«Cerebro» conectada. Backend sin conexión." });
    const sinCarpeta = montar([permiso("archivos")], { carpeta: async () => null });
    expect(await sinCarpeta.puente.percibir(bot(), "archivos", ctx)).toEqual({ ok: false, motivo: "No elegiste ninguna carpeta." });
  });
  it("sin inyectar la pantalla usa el escáner real (vacío fuera del navegador) y no lanza", async () => {
    const puente = crearPuenteSentidos({ consentimientos: { vigentes: () => [permiso("pantalla")] }, ahora: () => AHORA });
    expect(await puente.percibir(bot(), "pantalla", ctx)).toEqual({ ok: true, texto: "No veo elementos interactivos en la pantalla del OS." });
  });
});
