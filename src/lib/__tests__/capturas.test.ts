import { describe, expect, it } from "vitest";
import sharp from "sharp";
import {
  PESO_MAXIMO_BYTES,
  PANTALLAS,
  TEMAS,
  CALIDADES_WEBP,
  capturarConReintentos,
  capturarUna,
  capturasJson,
  aWebp,
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

describe("reparación: la captura produce un WebP real, no una omisión silenciosa", () => {
  // La escalada se agotó porque page.screenshot no admite type:"webp": todas las
  // entradas acababan «omitida: error» y el guion no entregaba nada. Ahora captura
  // PNG y convierte con sharp; estas pruebas fijan que la conversión existe y funciona.
  const pngDePrueba = () =>
    sharp({
      create: { width: 320, height: 200, channels: 3, background: "#2e1065" },
    })
      .png()
      .toBuffer();

  it("aWebp convierte el PNG en un WebP válido (cabecera RIFF/WEBP)", async () => {
    const webp = await aWebp(await pngDePrueba(), CALIDADES_WEBP[0]);
    const cabecera = webp.subarray(0, 12).toString("latin1");
    expect(cabecera.startsWith("RIFF")).toBe(true);
    expect(cabecera.includes("WEBP")).toBe(true);
  });

  it("el WebP de la captura cabe por debajo del límite de 300 KB", async () => {
    const png = await sharp({
      create: { width: 1440, height: 900, channels: 3, background: "#0d0518" },
    })
      .png()
      .toBuffer();
    const webp = await aWebp(png, CALIDADES_WEBP[0]);
    expect(webp.length).toBeLessThanOrEqual(PESO_MAXIMO_BYTES);
  });

  it("la navegación no espera «networkidle»: las páginas vivas mantienen tráfico y colgaban la escalada", async () => {
    const esperasGoto: Array<Record<string, unknown>> = [];
    const page = {
      goto: async (_ruta: string, opciones: Record<string, unknown>) => {
        esperasGoto.push(opciones);
        return { status: () => 200 };
      },
      url: () => "https://starseed-os.vercel.app/",
      waitForTimeout: async () => {},
      screenshot: async () => pngDePrueba(),
    } as unknown as Parameters<typeof capturarUna>[0];
    const resultado = await capturarUna(page, planDeCapturas()[0], PESO_MAXIMO_BYTES);
    expect(resultado.ok).toBe(true);
    expect(esperasGoto).toHaveLength(1);
    expect(esperasGoto[0].waitUntil).toBe("load");
  });

  it("capturarUna captura y devuelve ok con el peso real, pidiendo a la página solo PNG", async () => {
    const formatosPedidos: string[] = [];
    const page = {
      goto: async () => ({ status: () => 200 }),
      url: () => "https://starseed-os.vercel.app/",
      waitForTimeout: async () => {},
      screenshot: async (opciones: { type: string }) => {
        formatosPedidos.push(opciones.type);
        return pngDePrueba();
      },
    } as unknown as Parameters<typeof capturarUna>[0];
    const resultado = await capturarUna(page, planDeCapturas()[0], PESO_MAXIMO_BYTES);
    expect(formatosPedidos).toEqual(["png"]);
    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    expect(resultado.bytes).toBeLessThanOrEqual(PESO_MAXIMO_BYTES);
    expect(resultado.archivo).toBe(planDeCapturas()[0].archivo);
  });

  it("si la página muere, capturarUna declara la omisión y termina, sin lanzar ni reintentar a ciegas", async () => {
    const page = {
      goto: async () => {
        throw new Error("net::ERR_CONNECTION_REFUSED");
      },
    } as unknown as Parameters<typeof capturarUna>[0];
    const resultado = await capturarUna(page, planDeCapturas()[1], PESO_MAXIMO_BYTES);
    expect(resultado.ok).toBe(false);
    if (resultado.ok) return;
    expect(resultado.motivo).toContain("error");
    expect(resultado.motivo).toContain("CONNECTION_REFUSED");
  });

  it("si la página redirige a /login, se omite sola con su motivo, sin persona", async () => {
    const page = {
      goto: async () => ({ status: () => 200 }),
      url: () => "https://starseed-os.vercel.app/login",
      waitForTimeout: async () => {},
      screenshot: async () => {
        throw new Error("no debía capturar una pantalla de sesión");
      },
    } as unknown as Parameters<typeof capturarUna>[0];
    const resultado = await capturarUna(page, planDeCapturas()[0], PESO_MAXIMO_BYTES);
    expect(resultado.ok).toBe(false);
    if (resultado.ok) return;
    expect(resultado.motivo).toContain("sesión");
  });
});
