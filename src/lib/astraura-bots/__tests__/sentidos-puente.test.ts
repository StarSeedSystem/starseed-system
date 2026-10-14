/**
 * Pruebas del puente de sentidos (BOT1011F): las fuentes se inyectan (sin navegador, sin red)
 * y se comprueba que la puerta `decidirSentido` manda antes que cualquier fuente.
 */
import { describe, it, expect } from "vitest";
import {
  crearPuenteSentidos, recortar, MAX_TEXTO_SENTIDO,
  type ContextoPercepcion, type FuentesSentidos,
} from "../adaptadores/sentidos-puente";
import { botPredeterminado } from "../predeterminado";
import type { Bot, ConsentimientoSentido } from "../tipos";
import type { FragmentoMemoria } from "@/lib/nucleo/alcance-memoria";

const AHORA = 1_000_000;

function consentimiento(bot: Bot, sentido: ConsentimientoSentido["sentido"], cuentaId: string): ConsentimientoSentido {
  return { botId: bot.id, sentido, cuentaId, vence: null, expreso: true };
}

function ctx(bot: Bot, extra: Partial<ContextoPercepcion> = {}): ContextoPercepcion {
  return {
    cuentaId: bot.dueno.cuentaId,
    sesion: "privada",
    medio: "web",
    consentimientos: [],
    ahora: AHORA,
    ...extra,
  };
}

/** Bot de grupo con el sentido dado habilitado. */
function botDeGrupo(sentido: ConsentimientoSentido["sentido"]): Bot {
  return { ...botPredeterminado("p1", "c1"), id: "bot-grupo", dueno: { tipo: "grupo", id: "g1", cuentaId: "c1" }, gobierno: "democratico", sentidosHabilitados: [sentido] };
}

/** Bot invitado (externo, p. ej. Grok). */
function botInvitado(sentido: ConsentimientoSentido["sentido"]): Bot {
  return { ...botPredeterminado("p1", "c1"), id: "bot-invitado", origen: "externo", sentidosHabilitados: [sentido] };
}

function fuentesEspia() {
  const llamadas: string[] = [];
  const fuentes: FuentesSentidos = {
    pantalla: () => { llamadas.push("pantalla"); return "Título · 3 botones"; },
    ver: async (f) => { llamadas.push(`ver:${f}`); return "Se ve una mesa con un cuaderno."; },
    archivos: async () => { llamadas.push("archivos"); return { resumen: "«cerebro» conectada: AGENTS.md · 12 .md." }; },
    red: async () => { llamadas.push("red"); return "3 notificaciones nuevas."; },
  };
  return { fuentes, llamadas };
}

describe("sentidos-puente", () => {
  it("sin consentimiento NO llama a la fuente y devuelve el motivo de la puerta", async () => {
    const bot = botPredeterminado("p1", "c1");
    const { fuentes, llamadas } = fuentesEspia();
    const puente = crearPuenteSentidos(fuentes);
    const r = await puente.percibir(bot, "pantalla", ctx(bot));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toContain("permiso");
    expect(llamadas).toEqual([]);
  });

  it("con consentimiento sí percibe la pantalla (texto del escáner, nunca píxeles)", async () => {
    const bot = botPredeterminado("p1", "c1");
    const { fuentes, llamadas } = fuentesEspia();
    const puente = crearPuenteSentidos(fuentes);
    const r = await puente.percibir(bot, "pantalla", ctx(bot, { consentimientos: [consentimiento(bot, "pantalla", "c1")] }));
    expect(r).toEqual({ ok: true, texto: "Título · 3 botones" });
    expect(llamadas).toEqual(["pantalla"]);
  });

  it("un invitado y la cámara: nunca, aunque haya consentimiento", async () => {
    const bot = botInvitado("camara");
    const { fuentes, llamadas } = fuentesEspia();
    const puente = crearPuenteSentidos(fuentes);
    const r = await puente.percibir(bot, "camara", ctx(bot, { consentimientos: [consentimiento(bot, "camara", "c1")] }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toContain("invitado");
    expect(llamadas).toEqual([]);
  });

  it("recorta el texto a 4.000 caracteres", async () => {
    const bot = botPredeterminado("p1", "c1");
    const { fuentes } = fuentesEspia();
    fuentes.pantalla = () => "x".repeat(MAX_TEXTO_SENTIDO + 500);
    const puente = crearPuenteSentidos(fuentes);
    const r = await puente.percibir(bot, "pantalla", ctx(bot, { consentimientos: [consentimiento(bot, "pantalla", "c1")] }));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.texto.length).toBe(MAX_TEXTO_SENTIDO);
  });

  it("un bot de grupo no recibe texto con fuga de memoria personal", async () => {
    const bot = botDeGrupo("pantalla");
    const personal = "la dirección secreta de la casa de Alex es calle olmo número doce";
    const fragmentos: FragmentoMemoria[] = [
      { id: "f1", alcance: "personal", texto: personal, origen: "documento", at: 0 },
    ];
    const { fuentes } = fuentesEspia();
    fuentes.pantalla = () => `En pantalla está abierto un documento que dice ${personal} y más cosas.`;
    const puente = crearPuenteSentidos(fuentes);
    const r = await puente.percibir(bot, "pantalla", ctx(bot, {
      consentimientos: [consentimiento(bot, "pantalla", "c1")],
      fragmentosPersonales: fragmentos,
    }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toContain("memoria personal");
  });

  it("un bot personal SÍ recibe su propia memoria (no hay guarda anti-fuga)", async () => {
    const bot = botPredeterminado("p1", "c1");
    const personal = "la dirección secreta de la casa de Alex es calle olmo número doce";
    const { fuentes } = fuentesEspia();
    fuentes.pantalla = () => `Documento: ${personal}.`;
    const puente = crearPuenteSentidos(fuentes);
    const r = await puente.percibir(bot, "pantalla", ctx(bot, {
      consentimientos: [consentimiento(bot, "pantalla", "c1")],
      fragmentosPersonales: [{ id: "f1", alcance: "personal", texto: personal, origen: "documento", at: 0 }],
    }));
    expect(r.ok).toBe(true);
  });

  it("los sentidos sin fuente responden «próximamente» honesto", async () => {
    const bot = { ...botPredeterminado("p1", "c1"), sentidosHabilitados: ["ubicacion" as const] };
    const { fuentes } = fuentesEspia();
    const puente = crearPuenteSentidos(fuentes);
    const r = await puente.percibir(bot, "ubicacion", ctx(bot, { consentimientos: [consentimiento(bot, "ubicacion", "c1")] }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toContain("próximamente");
  });

  it("un error de la fuente no lanza: se vuelve un motivo honesto", async () => {
    const bot = botPredeterminado("p1", "c1");
    const { fuentes } = fuentesEspia();
    fuentes.pantalla = () => { throw new Error("sin DOM"); };
    const puente = crearPuenteSentidos(fuentes);
    const r = await puente.percibir(bot, "pantalla", ctx(bot, { consentimientos: [consentimiento(bot, "pantalla", "c1")] }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toContain("sin DOM");
  });

  it("el micrófono solo marca el sentido activo (la escucha es del motor de voz)", async () => {
    const bot = { ...botPredeterminado("p1", "c1"), sentidosHabilitados: ["microfono" as const] };
    const puente = crearPuenteSentidos(fuentesEspia().fuentes);
    const r = await puente.percibir(bot, "microfono", ctx(bot, { consentimientos: [consentimiento(bot, "microfono", "c1")] }));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.texto).toContain("motor de voz");
  });

  it("recortar deja intacto lo que cabe", () => {
    expect(recortar("corto")).toBe("corto");
    expect(recortar("y".repeat(MAX_TEXTO_SENTIDO + 1)).length).toBe(MAX_TEXTO_SENTIDO);
  });
});
