// Cursor FX × Mausbot (src/components/desktop/cursor-fx.tsx): las pruebas de la
// rama nube/40676438291 adaptadas a la API de hoy. La API de la rama
// (`opcionCursorDe`, `uriPunteroMausbot`, `puntaMausbot`) no existe en main: aquí
// se prueba el contrato actual a través de `cursorPreviewUri`, que es la salida
// pura y pública de toda la pieza (opciones válidas → data-uri SVG; lo
// desconocido → null; SVG propios → sanearSvg antes de pintarse). Pruebas en
// entorno node: sin `vi.mock` de módulos Node; el almacen de diseños propios se
// doblea con un objeto sobre `globalThis.localStorage`, que `disenos.ts` lee en
// caliente. Comentarios y nombres en español con acentos.
import { describe, it, expect, afterEach } from "vitest";
import { cursorPreviewUri } from "../cursor-fx";
import { IDS_CUERPO_MAUSBOT } from "@/lib/mausbot/cuerpos";
import { DISENOS_FABRICA, DISENO_POR_DEFECTO, type DisenoMausbot } from "@/lib/mausbot/disenos";
import { MAX_SVG_CARACTERES } from "@/lib/dock/iconos/sanear-svg";

/** Firma de `cursorPreviewUri`: así un `unknown` de prueba entra sin `any`. */
type OpcionCursor = Parameters<typeof cursorPreviewUri>[0];
const uriDe = (v: unknown): string | null => cursorPreviewUri(v as OpcionCursor);

const SVG_FABRICA = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"`;
const PREFIJO_DATA = "data:image/svg+xml,";

/** Decodifica un data-uri de cursor (el formato de `svgUri` no lleva charset). */
const decodificar = (uri: string): string => decodeURIComponent(uri.slice(PREFIJO_DATA.length));

/** Un diseño propio válido (los de fábrica no se guardan: ya viven en código). */
const disenoPropio = (id: string, svgCuerpo: string): DisenoMausbot => ({
  id, nombre: "Propio de prueba", cuerpo: "svg", svgCuerpo,
  gradiente: ["#66A3FF", "#007FFF", "#0052B3"],
  cara: { ojos: false, boca: false, mirada: false },
  tamano: 1, origen: "variacion",
});

/** Dobla el almacen del navegador con diseños propios guardados (entorno node). */
function ponerDiseños(propios: DisenoMausbot[]): void {
  const contenido = JSON.stringify(propios);
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (clave: string) => (clave === "starseed.mausbot.disenos.v1" ? contenido : null),
    setItem: () => undefined,
    removeItem: () => undefined,
  };
}

describe("cursor-fx · cursores del Mausbot", () => {
  afterEach(() => {
    delete (globalThis as { localStorage?: unknown }).localStorage;
  });

  it("las opciones por cuerpo del Mausbot pintan y las desconocidas caen al sistema", () => {
    // No APLICA de la rama: «mausbot» a secas ya no es opción válida en main
    // (el contrato actual es `mausbot-<cuerpo>`); sus clásicas system/orb/starseed
    // no cambiaron y las cubre CURSOR_PREVIEW_URI.
    expect(uriDe("mausbot")).toBeNull();
    expect(uriDe("system")).toBeNull();
    for (const cuerpo of IDS_CUERPO_MAUSBOT) {
      const uri = uriDe(`mausbot-${cuerpo}`);
      expect(uri?.startsWith(PREFIJO_DATA), `mausbot-${cuerpo}`).toBe(true);
      expect(uriDe(`mausbot-${cuerpo}`), "determinista").toBe(uri);
    }
  });

  it("cae al sistema con opciones desconocidas o basura", () => {
    const raros: unknown[] = [
      "cursor", "mausbotx", "mausbot-", "mausbot-diseno-", "", "orbe", "starseed", 42,
      null, undefined, true, {}, ["orb"], { cursor: "orb" },
    ];
    for (const raro of raros) {
      expect(uriDe(raro)).toBeNull();
    }
  });

  it("trae cuerpo con degradado, un solo trazo y sin manejadores", () => {
    const uri = uriDe("mausbot-cursor");
    expect(uri).not.toBeNull();
    const svg = decodificar(uri!);
    expect(svg.startsWith(SVG_FABRICA)).toBe(true);
    // El degradado Trinity del diseño por defecto (fabrica-cursor, paleta clara→oscuro).
    expect(svg).toContain(`stop-color="${DISENO_POR_DEFECTO.gradiente[1]}"`);
    expect(svg).toContain("url(#g)");
    // El cuerpo de fábrica es un único trazo y el degradado no añade paths.
    expect(svg.split("<path").length - 1).toBe(1);
    expect(svg).not.toMatch(/\son[a-z]+\s*=/i);
  });

  it("cada diseño de fábrica pinta un svg pequeño y determinista", () => {
    for (const diseno of DISENOS_FABRICA) {
      const uri = uriDe(`mausbot-${diseno.cuerpo}`);
      expect(uri, diseno.id).not.toBeNull();
      // Pequeño como el tope del saneador: el puntero no debe pesar más que un glifo.
      expect(decodificar(uri!).length, diseno.id).toBeLessThanOrEqual(MAX_SVG_CARACTERES);
      expect(uriDe(`mausbot-${diseno.cuerpo}`), diseno.id).toBe(uri);
    }
  });

  it("un diseño propio desconocido pinta el diseño por defecto", () => {
    expect(uriDe("mausbot-diseno-mi-diseno")).toBe(uriDe("mausbot-cursor"));
    expect(uriDe("mausbot-diseno-mi-diseno")).not.toBeNull();
  });

  it("sanea el svg de un diseño propio antes de pintarlo", () => {
    const sucio =
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10">` +
      `<script>alert(1)</script><circle cx="5" cy="5" r="4" fill="#FF0033"/></svg>`;
    ponerDiseños([disenoPropio("propio-sucio", sucio)]);
    const uri = uriDe("mausbot-diseno-propio-sucio");
    expect(uri).not.toBeNull();
    const svg = decodificar(uri!);
    expect(svg).not.toContain("script");
    expect(svg).not.toContain("alert");
    expect(svg).toContain("<circle");
    // El saneador añade el tamaño del cursor sobre el svg reconstruido.
    expect(svg.startsWith(`<svg width="32" height="32"`)).toBe(true);
    expect(uriDe("mausbot-diseno-propio-sucio")).toBe(uri);
  });

  it("devuelve null si el svg del diseño propio no se puede sanear", () => {
    ponerDiseños([disenoPropio("propio-vacio", "")]);
    expect(uriDe("mausbot-diseno-propio-vacio")).toBeNull();
  });
});
