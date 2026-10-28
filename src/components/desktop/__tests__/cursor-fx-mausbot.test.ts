import { describe, expect, it } from "vitest";
import {
  CURSOR_PREVIEW_URI,
  cursorPreviewUri,
  type CursorOption,
} from "../cursor-fx";
import { IDS_CUERPO_MAUSBOT } from "@/lib/mausbot/cuerpos";
import { DISENO_POR_DEFECTO } from "@/lib/mausbot/disenos";
import { MAX_SVG_CARACTERES } from "@/lib/dock/iconos/sanear-svg";

const PREFIJO_DATA = "data:image/svg+xml,";

const decodificar = (uri: string): string =>
  decodeURIComponent(uri.slice(PREFIJO_DATA.length));

describe("Cursor FX · cursores del Mausbot (rescate de la rama nube/40676438291)", () => {
  it("los clásicos mantienen su URI fija y el puntero del sistema no pinta nada", () => {
    expect(cursorPreviewUri("system")).toBeNull();
    expect(cursorPreviewUri("starseed-triangle")).toBe(CURSOR_PREVIEW_URI["starseed-triangle"]);
    expect(cursorPreviewUri("orb")).toBe(CURSOR_PREVIEW_URI["orb"]);
  });

  it("pinta una uri svg local, sin charset, por cada cuerpo de fábrica", () => {
    for (const cuerpo of IDS_CUERPO_MAUSBOT) {
      const uri = cursorPreviewUri(`mausbot-${cuerpo}`);
      expect(uri?.startsWith(PREFIJO_DATA), cuerpo).toBe(true);
      const svg = decodificar(uri!);
      expect(svg, cuerpo).toContain(`width="32" height="32"`);
    }
  });

  it("cae al puntero del sistema con lo desconocido", () => {
    const raros: unknown[] = [
      "cursor", "mausbotx", "mausbot-", "mausbot-diseno-", "", "orbe", "starseed", 42,
      null, undefined, true, {}, ["orb"], { cursor: "orb" },
    ];
    for (const raro of raros) {
      expect(cursorPreviewUri(raro as CursorOption), String(raro)).toBeNull();
    }
  });

  it("un diseño propio sin guardar señala el diseño de fábrica, no un fallo", () => {
    expect(cursorPreviewUri("mausbot-diseno-mi-diseno")).toBe(cursorPreviewUri("mausbot-cursor"));
  });

  it("el puntero de fábrica trae cuerpo y degradado, sin cara, y cabe en los topes", () => {
    const uri = cursorPreviewUri("mausbot-cursor");
    expect(uri).not.toBeNull();
    const svg = decodificar(uri!);
    expect(svg).toContain(`<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"`);
    expect(svg).toContain(`stop-color="${DISENO_POR_DEFECTO.gradiente[1]}"`); // base del degradado
    expect(svg).toContain("url(#g)");
    // Sin cara: los diseños de fábrica son trazos únicos, sin ojos ni boca en el puntero.
    expect(svg.split("<path").length - 1).toBe(1);
    expect(svg).not.toMatch(/\son[a-z]+\s*=/i);
    expect(svg.length).toBeLessThanOrEqual(MAX_SVG_CARACTERES);
  });
});
