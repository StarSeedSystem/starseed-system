import { describe, expect, it } from "vitest";
import {
  CALIDADES_WEBP,
  PANTALLAS,
  PESO_MAXIMO_BYTES,
  TEMAS,
  capturarConReintentos,
  capturasJson,
  esPublica,
  nombreArchivo,
  planDeCapturas,
  siguienteCalidad,
} from "../../../scripts/readme/capturas.mjs";

// RDM1113D · capturas reales del OS para la portada (architecture/readme-portada-1113.md §3.4).
// La escalada de la tarea se agotó tras 8 intentos libres y pidió a una persona: estas pruebas
// fijan el flujo automático que la repara — solo pantallas públicas, reintentos finitos de
// compresión y omisiones declaradas en el manifest, sin intervención humana.

describe("plan de capturas sin persona", () => {
  it("solo usa pantallas públicas, ninguna requiere sesión", () => {
    expect(PANTALLAS.length).toBeGreaterThanOrEqual(3);
    expect(PANTALLAS.every((p) => esPublica(p))).toBe(true);
    expect(planDeCapturas().length).toBe(PANTALLAS.length * TEMAS.length);
  });

  it("cubre los temas noche y nieve", () => {
    expect(TEMAS.map((t) => t.id)).toEqual(["noche", "nieve"]);
    const temasDelPlan = new Set(planDeCapturas().map((e) => e.tema));
    expect([...temasDelPlan]).toEqual(["noche", "nieve"]);
  });

  it("cada entrada lleva ruta, archivo webp, medidas 1440×900 ×2 y texto alternativo", () => {
    for (const e of planDeCapturas()) {
      expect(e.ruta.startsWith("/")).toBe(true);
      expect(e.archivo.endsWith(".webp")).toBe(true);
      expect(e.archivo).toContain(e.tema);
      expect(e.ancho).toBe(1440);
      expect(e.alto).toBe(900);
      expect(e.escala).toBe(2);
      expect(e.descripcion.length).toBeGreaterThan(0);
    }
  });
});

describe("reintentos finitos de compresión, nada de insistir a ciegas", () => {
  it("la secuencia de calidades es finita y termina", () => {
    expect(CALIDADES_WEBP.length).toBeGreaterThan(0);
    expect(siguienteCalidad(0)).not.toBeNull();
    expect(siguienteCalidad(CALIDADES_WEBP.length)).toBeNull();
  });

  it("acepta la primera captura que ya cabe por debajo del límite", async () => {
    const resultado = await capturarConReintentos(
      async () => PESO_MAXIMO_BYTES - 1,
      PESO_MAXIMO_BYTES,
    );
    expect(resultado).toEqual({ ok: true, calidad: CALIDADES_WEBP[0], intentos: 1 });
  });

  it("se detiene sola tras el último intento y declara el motivo, sin bucles ni personas", async () => {
    let llamadas = 0;
    const conversion = async () => {
      llamadas += 1;
      return PESO_MAXIMO_BYTES + 1;
    };
    const resultado = await capturarConReintentos(conversion, PESO_MAXIMO_BYTES);
    expect(resultado.ok).toBe(false);
    expect(resultado.motivo).toContain("peso");
    expect(llamadas).toBe(CALIDADES_WEBP.length);
  });
});

describe("manifest capturas.json, con omisiones declaradas y sin datos personales", () => {
  it("omite las capturas fallidas con su motivo y conserva las buenas", () => {
    const plan = planDeCapturas();
    const resultados = plan.map((e, i) =>
      i === 0
        ? { id: e.id, ok: false, motivo: "necesita sesión", archivo: e.archivo }
        : { id: e.id, ok: true, archivo: e.archivo, bytes: 100_000 },
    );
    const manifest = capturasJson(resultados);
    expect(manifest.omitidas.length).toBe(1);
    expect(manifest.omitidas[0].motivo).toContain("sesión");
    expect(manifest.pantallas.length).toBe(plan.length - 1);
  });

  it("las buenas llevan archivo, peso y el texto alternativo de su pantalla", () => {
    const plan = planDeCapturas();
    const buena = plan[2];
    const manifest = capturasJson([
      { id: buena.id, ok: true, archivo: buena.archivo, bytes: 250_000 },
    ]);
    expect(manifest.pantallas[0].archivo).toBe(buena.archivo);
    expect(manifest.pantallas[0].peso_bytes).toBe(250_000);
    expect(manifest.pantallas[0].texto_alternativo).toBe(buena.descripcion);
  });
});

describe("nombre de archivo, determinista y sin caracteres raros", () => {
  it("compone tema y pantalla normalizados", () => {
    expect(nombreArchivo("inicio", "noche")).toBe("inicio-noche.webp");
  });
});
