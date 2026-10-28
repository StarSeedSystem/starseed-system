import { describe, it, expect } from "vitest";
import { esCursorMausbotGeneral, esCursorMausbot, cursorPreviewUri, mausbotSvg, cursorCssValue } from "../cursor-fx";
import { DISENO_POR_DEFECTO } from "@/lib/mausbot/disenos";
import { CUERPOS_MAUSBOT } from "@/lib/mausbot/cuerpos";

describe("CursorFx · opción Mausbot", () => {
  it("esCursorMausbotGeneral reconoce 'mausbot'", () => {
    expect(esCursorMausbotGeneral("mausbot")).toBe(true);
  });

  it("esCursorMausbotGeneral rechaza opciones conocidas que no son 'mausbot'", () => {
    expect(esCursorMausbotGeneral("system")).toBe(false);
    expect(esCursorMausbotGeneral("starseed-triangle")).toBe(false);
    expect(esCursorMausbotGeneral("orb")).toBe(false);
    expect(esCursorMausbotGeneral("mausbot-cursor")).toBe(false);
  });

  it("esCursorMausbot reconoce patrones 'mausbot-<cuerpo>'", () => {
    expect(esCursorMausbot("mausbot-cursor")).toBe(true);
    expect(esCursorMausbot("mausbot-circle")).toBe(true);
  });

  it("mausbotSvg genera SVG del diseño por defecto (cuerpo + degradado, sin cara)", () => {
    const svg = mausbotSvg("mausbot");
    expect(svg).not.toBeNull();
    expect(svg).toContain("xmlns=");
    expect(svg).toContain(DISENO_POR_DEFECTO.gradiente[1]);
    expect(svg).not.toContain("ojos");
    expect(svg).not.toContain("boca");
  });

  it("cursorPreviewUri devuelve data URI para 'mausbot'", () => {
    const uri = cursorPreviewUri("mausbot");
    expect(uri).not.toBeNull();
    expect(uri).toContain("data:image/svg+xml");
  });

  it("cursorCssValue usa anchor del cuerpo por defecto para 'mausbot'", () => {
    const css = cursorCssValue("mausbot");
    expect(css).not.toBeNull();
    // Para "mausbot" se usa el anchor del diseño por defecto (cuerpo cursor)
    const cuerpo = CUERPOS_MAUSBOT.cursor;
    const anchorX = Math.round(cuerpo.anchor.x);
    const anchorY = Math.round(cuerpo.anchor.y);
    expect(css).toContain(`${anchorX} ${anchorY}`);
  });

  it("cursorCssValue usa hot-spot fijo para 'mausbot-<cuerpo>'", () => {
    const cursorOption = "mausbot-circle" as const;
    const css = cursorCssValue(cursorOption);
    expect(css).not.toBeNull();
    // Para patrones mausbot-<cuerpo> se usa hot-spot fijo: 8 1 para cursor, 16 16 para el resto
    expect(css).toContain("16 16");
  });
});