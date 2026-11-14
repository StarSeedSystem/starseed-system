import { describe, expect, it } from "vitest";
import {
  DOCUMENTO_VERSION,
  MARCAS_ARRANQUE,
  PAGINAS,
  pasosWebp,
  planCapturas,
  semillaTema,
  TEMAS,
  textoAlt,
  validarCaptura,
  documentoCapturas,
} from "../../../../scripts/readme/capturas.mjs";

describe("plan de capturas del README", () => {
  it("los temas son noche (oscuro) y nieve (claro)", () => {
    expect(TEMAS.map((t) => t.id)).toEqual(["noche", "nieve"]);
    expect(TEMAS.map((t) => t.tema)).toEqual(["dark", "light"]);
  });

  it("las páginas candidatas son públicas y sin datos personales", () => {
    for (const p of PAGINAS) {
      expect(p.ruta.startsWith("/")).toBe(true);
      expect(p.descripcion.length).toBeGreaterThan(10);
      expect(p.descripcion).not.toMatch(/alex|correo|@/i);
    }
    const ids = PAGINAS.map((p) => p.id);
    for (const id of ["inicio", "gobernanza", "biblioteca", "astraura"]) {
      expect(ids).toContain(id);
    }
  });
});

describe("semilla de tema y compresión WebP", () => {
  it("la semilla fija el tema de next-themes en localStorage", () => {
    expect(semillaTema(TEMAS[0])).toEqual({ clave: "theme", valor: "dark" });
    expect(semillaTema(TEMAS[1])).toEqual({ clave: "theme", valor: "light" });
  });

  it("las marcas de arranque cierran la bienvenida y la guía sin cuenta", () => {
    const claves = MARCAS_ARRANQUE.map((m) => m.clave);
    expect(claves).toContain("starseed.primer-arranque.saltado.v1");
    expect(claves).toContain("starseed.guide.seen.v1");
    for (const m of MARCAS_ARRANQUE) expect(m.valor).toBe("1");
  });

  it("los pasos de WebP bajan calidad hasta el mínimo y terminan en la última", () => {
    const pasos = pasosWebp();
    expect(pasos.length).toBeGreaterThan(1);
    const calidades = pasos.map((p) => p.calidad);
    for (let i = 1; i < calidades.length; i += 1) {
      expect(calidades[i]).toBeLessThan(calidades[i - 1]);
    }
    expect(pasos[pasos.length - 1].calidad).toBeGreaterThanOrEqual(30);
  });
});

describe("validación y documento de capturas", () => {
  it("una captura bajo el límite vale y una de 310 KB no", () => {
    expect(validarCaptura(250_000).ok).toBe(true);
    const exceso = validarCaptura(310_000);
    expect(exceso.ok).toBe(false);
    expect(exceso.motivo).toMatch(/300 KB/);
  });

  it("el texto alternativo describe pantalla y tema en español", () => {
    const alt = textoAlt({ titulo: "Gobernanza", temaId: "nieve", descripcion: "Democracia directa de la red." });
    expect(alt).toBe("StarSeed OS · Gobernanza en tema nieve — democracia directa de la red.");
  });

  it("el documento separa capturas de omitidas y lleva versión", () => {
    const plan = planCapturas({ ids: ["inicio"] });
    const resultados = [
      { paginaId: "inicio", temaId: "noche", estado: "ok", archivo: "inicio-noche.webp", bytes: 100_000, ancho: 2880, alto: 1800 },
      { paginaId: "inicio", temaId: "nieve", estado: "omitida", motivo: "requiere sesión" },
    ];
    const doc = documentoCapturas({ base: "https://starseed-os.vercel.app", plan, resultados, generado: "2026-11-14T00:00:00Z" });
    expect(doc.version).toBe(DOCUMENTO_VERSION);
    expect(doc.capturas).toHaveLength(1);
    expect(doc.capturas[0].archivo).toBe("inicio-noche.webp");
    expect(doc.capturas[0].alt).toMatch(/tema noche —/);
    expect(doc.omitidas).toEqual([{ paginaId: "inicio", temaId: "nieve", motivo: "requiere sesión" }]);
  });
});
