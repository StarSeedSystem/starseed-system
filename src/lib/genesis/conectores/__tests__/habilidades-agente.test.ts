import { describe, expect, it } from "vitest";
import type { SkillCapability } from "@/ai/astraura/skills";
import { habilidadesPara } from "../habilidades-agente";

/** Fábrica de capacidades de prueba (sin depender del manifiesto real). */
function cap(
  id: string,
  label: string,
  systemPrompt: string,
  routing: SkillCapability["routing"] = {}
): SkillCapability {
  return { id, label, systemPrompt, routing };
}

const CAPS: SkillCapability[] = [
  cap("base", "Kokoro y OmniVoice", "Conocimiento de base sin routing.", {}),
  cap("fuerte", "Taste · calidad de UI", "Pide un modelo fuerte.", { preferStrong: true }),
  cap("red", "Sentidos web", "Usa la web.", { web: true }),
  cap("ojos", "Visión", "Interpreta imágenes.", { vision: true }),
  cap("plan", "PM · producto y proyecto", "Planifica el trabajo.", { planning: true }),
];

const ids = (xs: SkillCapability[]) => xs.map((h) => h.id);
const palabras = (t: string) => t.split(/\s+/).filter(Boolean).length;

describe("habilidadesPorPapel", () => {
  it("elige por routing según el papel", () => {
    const de = (papel: string) => habilidadesPara(papel, "cuenta", { capacidades: CAPS, desactivadas: [] });
    // El escritor sirve con modelo fuerte, web y planificación; no lo de solo visión.
    expect(ids(de("escritor"))).toEqual(["base", "fuerte", "red", "plan"]);
    // El de visión solo lleva las de visión (y las sin routing).
    expect(ids(de("visión"))).toEqual(["base", "ojos"]);
    // El revisor exige calidad fuerte.
    expect(ids(de("revisor"))).toEqual(["base", "fuerte"]);
    // Un papel desconocido recibe solo el conocimiento de base.
    expect(ids(de("curioso"))).toEqual(["base"]);
  });

  it("excluye las desactivadas del ámbito", () => {
    const salida = habilidadesPara("escritor", "cuenta", {
      capacidades: CAPS,
      desactivadas: ["fuerte", "ojos"],
    });
    expect(ids(salida)).toEqual(["base", "red", "plan"]);
  });

  it("entra por etiqueta aunque el routing no encaje", () => {
    const vozWeb = cap("pipecat", "Voz en tiempo real (Pipecat)", "Habla en vivo.", { web: true });
    // Para el papel de voz basta la etiqueta «voz», aunque su routing sea web.
    expect(ids(habilidadesPara("voz", "cuenta", { capacidades: [vozWeb], desactivadas: [] }))).toContain("pipecat");
    // Para el revisor ni la etiqueta ni el encajan: se queda fuera.
    expect(habilidadesPara("revisor", "cuenta", { capacidades: [vozWeb], desactivadas: [] })).toHaveLength(0);
  });

  it("los directores también eligen, por routing o por etiqueta", () => {
    const pizarra = cap("tldraw", "Pizarra profesional (tldraw)", "Dibuja a mano.", { vision: true });
    // «diseno» (y su alias «diseño») la toma por la etiqueta «pizarra»…
    const conDiseno = { capacidades: [pizarra, CAPS[2]], desactivadas: [] };
    // …y descarta la de solo web.
    expect(ids(habilidadesPara("diseno", "cuenta", conDiseno))).toEqual(["tldraw"]);
    expect(ids(habilidadesPara("diseño", "cuenta", conDiseno))).toEqual(["tldraw"]);
  });

  it("en grupo o página, la deliberación colectiva sirve a cualquier papel", () => {
    const consejo = cap("council", "Consejo de Aurora · deliberación política", "Deliberación.", { preferStrong: true });
    // En una cuenta personal, el papel de voz no la recibe.
    expect(habilidadesPara("voz", "cuenta", { capacidades: [consejo], desactivadas: [] })).toHaveLength(0);
    // En un grupo o página (PoliGenesis) sí: deliberar es de todos.
    expect(ids(habilidadesPara("voz", "página", { capacidades: [consejo], desactivadas: [] }))).toContain("council");
    expect(ids(habilidadesPara("voz", "grupo", { capacidades: [consejo], desactivadas: [] }))).toContain("council");
  });
});

describe("tamañoDeTarjeta", () => {
  it("recorta el prompt por capa: tarjeta ≤ 60, resumen ≤ 250, completa intacta", () => {
    const largo = "palabra ".repeat(300).trim();
    const opciones = { capacidades: [cap("largo", "Largo", largo, {})], desactivadas: [] };
    const tarjeta = habilidadesPara("chat", "cuenta", opciones, "tarjeta");
    expect(palabras(tarjeta[0].systemPrompt)).toBe(60);
    expect(tarjeta[0].systemPrompt.endsWith("…")).toBe(true);
    const resumen = habilidadesPara("chat", "cuenta", opciones, "resumen");
    expect(palabras(resumen[0].systemPrompt)).toBe(250);
    const completa = habilidadesPara("chat", "cuenta", opciones, "completa");
    expect(completa[0].systemPrompt).toBe(largo);
  });

  it("no toca un prompt que ya cabe en la capa", () => {
    const corto = "texto breve";
    const opciones = { capacidades: [cap("corto", "Corto", corto, {})], desactivadas: [] };
    const salida = habilidadesPara("chat", "cuenta", opciones, "tarjeta");
    expect(salida[0].systemPrompt).toBe(corto);
  });
});
