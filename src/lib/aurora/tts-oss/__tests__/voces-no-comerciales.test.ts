/**
 * VZR1011C — Filtro comercial de las voces no comerciales y ficha de ChatTTS.
 * Puro: sin red, sin GPU, sin disco.
 */
import { describe, it, expect } from "vitest";
import type { ContextoUsoVoz } from "@/lib/aurora/tts-oss/voces-no-comerciales";
import { VOCES_NO_COMERCIALES, fichaNoComercial, esContextoComercial, sePermiteEnContexto, textoCasillaLicencia, habilitarVozNoComercial } from "@/lib/aurora/tts-oss/voces-no-comerciales";
import { AUTO_ENDPOINT_ORDER, VOICE_ENGINE_REGISTRY } from "@/lib/aurora/tts-oss/engine-registry";
import { isNeuralEngine, isVoiceEngineId } from "@/lib/aurora/tts-oss/voice-config";
import { STARSEED_LABS_REPO } from "@/lib/library/packages";

/** Petición limpia, con lo que el test quiere forzar. */
const COMERCIALES: readonly ContextoUsoVoz[] = ["paginas-comerciales", "grupos-comerciales", "producto"];
function habilita(
  id: string,
  cambios: { instalado?: boolean; casilla?: boolean; contexto?: ContextoUsoVoz } = {},
) {
  return habilitarVozNoComercial({
    id,
    instaladoPorPersona: cambios.instalado ?? true,
    casillaAceptada: cambios.casilla ?? true,
    context: cambios.contexto ?? "personal",
  });
}

describe("voces-no-comerciales · fichas (contrato §1, 2026-10-11)", () => {
  it("las tres fichas existen con sus licencias EXACTAS", () => {
    const f5 = fichaNoComercial("f5-tts");
    expect(f5).toMatchObject({ licenciaCodigo: "MIT", licenciaPesos: "CC-BY-NC-4.0", espanol: false });
    const xtts = fichaNoComercial("xtts-v2");
    expect(xtts).toMatchObject({ licenciaCodigo: "MPL-2.0", espanol: true });
    expect(xtts?.licenciaPesos).toMatch(/Coqui Public Model License/);
    expect(xtts?.licenciaPesos).toMatch(/no comercial/);
    const cht = fichaNoComercial("chattts");
    expect(cht).toMatchObject({ licenciaCodigo: "AGPLv3+", espanol: false, integrado: false, soloFicha: true });
    expect(cht?.licenciaPesos).toMatch(/CC BY-NC 4.0/);
  });

  it("todo apagado por defecto, nada en producto y nada automático", () => {
    for (const f of VOCES_NO_COMERCIALES) {
      expect(f.porDefecto, f.id).toBe(false);
      expect(f.enProducto, f.id).toBe(false);
      expect([AUTO_ENDPOINT_ORDER.includes(f.id as never), isNeuralEngine(f.id as never), isVoiceEngineId(f.id as never), f.id in VOICE_ENGINE_REGISTRY], f.id).toEqual([false, false, false, false]);
    }
  });

  it("Chatterbox y OpenVoice V2 siguen siendo libres y fuera de esta lista", () => {
    expect(VOICE_ENGINE_REGISTRY.chatterbox.license).toBe("MIT");
    expect(VOICE_ENGINE_REGISTRY.openvoice2.license).toMatch(/^MIT/);
    expect(fichaNoComercial("chatterbox")).toBeNull();
    expect(fichaNoComercial("openvoice2")).toBeNull();
  });
});

describe("voces-no-comerciales · filtro comercial", () => {
  it("solo en personal: F5-TTS y XTTS-v2; ChatTTS nunca", () => {
    expect(esContextoComercial("personal")).toBe(false);
    for (const ctx of COMERCIALES) {
      expect(esContextoComercial(ctx), ctx).toBe(true);
      for (const id of ["f5-tts", "xtts-v2", "chattts"]) {
        expect(sePermiteEnContexto(id, ctx), `${id} en ${ctx}`).toBe(false);
      }
    }
    expect(sePermiteEnContexto("f5-tts", "personal")).toBe(true);
    expect(sePermiteEnContexto("xtts-v2", "personal")).toBe(true);
    expect(sePermiteEnContexto("chattts", "personal")).toBe(false);
  });

  it("sin casilla o sin instalación de la persona no se habilita nada", () => {
    expect(habilita("f5-tts")).toEqual({ habilitada: true, faltan: [] });
    const sinInstalar = habilita("f5-tts", { instalado: false });
    expect(sinInstalar.habilitada).toBe(false);
    expect(sinInstalar.faltan.join(" ")).toMatch(/instalar/);
    const sinCasilla = habilita("f5-tts", { casilla: false });
    expect(sinCasilla.habilitada).toBe(false);
    expect(sinCasilla.faltan.join(" ")).toMatch(/licencia/);
  });
});

describe("voces-no-comerciales · casillas y contextos", () => {
  it("las casillas explican la licencia; ChatTTS no tiene casilla", () => {
    expect(textoCasillaLicencia("f5-tts") ?? "").toMatch(/CC-BY-NC-4\.0/);
    expect(textoCasillaLicencia("f5-tts") ?? "").toMatch(/forja §4/);
    expect(textoCasillaLicencia("xtts-v2") ?? "").toMatch(/Coqui Public Model License/);
    expect([textoCasillaLicencia("chattts"), textoCasillaLicencia("automovil")]).toEqual([null, null]);
  });

  it("ChatTTS nunca se habilita y el filtro comercial dice por qué", () => {
    const cht = habilita("chattts");
    expect(cht.habilitada).toBe(false);
    expect(cht.faltan.join(" ")).toMatch(/ficha/);
    const r = habilita("xtts-v2", { contexto: "grupos-comerciales" });
    expect(r.habilitada).toBe(false);
    expect(r.faltan.join(" ")).toMatch(/comercial/);
  });
});

describe("voces-no-comerciales · fichas en la Biblioteca (packages.ts)", () => {
  const fichasDe = (ids: string[]) =>
    ids
      .map((id) => STARSEED_LABS_REPO.packages.find((p) => p.id === id))
      .filter((p): p is NonNullable<typeof p> => p !== undefined);

  it("hay ficha de Biblioteca para F5-TTS, XTTS-v2 y ChatTTS, sin duplicar las libres", () => {
    const fichas = fichasDe(["voz-f5-tts", "voz-xtts-v2", "voz-chattts"]);
    expect(fichas).toHaveLength(3);
    for (const p of fichas) {
      expect(p.kind, p.id).toBe("repo");
      const payload = p.payload as Record<string, unknown>;
      expect(typeof payload.upstream, p.id).toBe("string");
      expect(typeof payload.licencia, p.id).toBe("string");
      const clase = payload.claseLicencia as string;
      expect(clase === "personal" || clase === "condicionada", p.id).toBe(true);
    }
    const chattts = fichas.find((p) => p.id === "voz-chattts");
    expect(chattts?.payload as Record<string, unknown>).toMatchObject({ soloFicha: true });
    expect(fichasDe(["voz-chatterbox"])).toHaveLength(1); // la libre ya estaba
  });
});
