/**
 * Capturas inertes para la portada del README (RDM1113D).
 *
 * Esta prueba vigila lo que ya falló una vez: leer los bytes de un WebP como
 * texto UTF-8 revienta con «'utf-8' codec can't decode byte 0xd4 in position 4».
 * Las funciones puras de `scripts/readme/capturas.mjs` miran el binario byte a
 * byte y nunca lo decodifican como texto.
 *
 * Ejecutar con:
 *   npx vitest run src/lib/__tests__/capturas-portada.test.ts
 */
import { describe, it, expect } from "vitest";
import {
  MAX_KB_POR_DEFECTO,
  PANTALLAS,
  construirEntrada,
  construirManifiesto,
  leerOpciones,
  leerWebp,
  motivoOmision,
  nombreDeArchivo,
  validarTamano,
} from "../../../scripts/readme/capturas.mjs";

/** Cabecera WebP con el tamaño RIFF en los bytes 4-7. */
function cabeceraWebp(tamanoRiff = 0x0000_01d4, largo = 16): Uint8Array {
  const bytes = new Uint8Array(largo);
  bytes.set([0x52, 0x49, 0x46, 0x46], 0); // "RIFF"
  new DataView(bytes.buffer).setUint32(4, tamanoRiff, true);
  if (largo >= 12) bytes.set([0x57, 0x45, 0x42, 0x50], 8); // "WEBP"
  if (largo >= 16) bytes.set([0x56, 0x50, 0x38, 0x20], 12); // "VP8 "
  return bytes;
}

const CAPTURA_OK = {
  pantalla: "inicio",
  tema: "noche",
  bytes: 204_800,
  ancho: 2880,
  alto: 1800,
  capturadaEn: "2026-11-14T00:00:00.000Z",
};

describe("leerWebp · el 0xd4 de la reparación", () => {
  it("lee la cabecera con 0xd4 en la posición 4 sin decodificar UTF-8", () => {
    const webp = cabeceraWebp();
    expect(webp[4]).toBe(0xd4);

    // Ésta es exactamente la excepción que tumbó la tarea anterior.
    expect(() => new TextDecoder("utf-8", { fatal: true }).decode(webp)).toThrow();

    const info = leerWebp(webp);
    expect(info.valido).toBe(true);
    expect(info.bytes).toBe(16);
  });

  it("rechaza lo que no es WebP sin lanzar", () => {
    const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(leerWebp(png).valido).toBe(false);
    expect(leerWebp(new Uint8Array(0)).valido).toBe(false);
    expect(leerWebp(cabeceraWebp(0x1d4, 8)).valido).toBe(false);
  });
});

describe("validarTamano · el límite de 300 KB", () => {
  it("acepta el límite exacto y rechaza un byte más", () => {
    const limite = MAX_KB_POR_DEFECTO * 1024;
    expect(validarTamano(limite, MAX_KB_POR_DEFECTO).ok).toBe(true);
    expect(validarTamano(limite + 1, MAX_KB_POR_DEFECTO).ok).toBe(false);
    expect(validarTamano(0, MAX_KB_POR_DEFECTO).ok).toBe(true);
  });

  it("informa el peso en KB con un decimal", () => {
    expect(validarTamano(1536, 300).kb).toBe(1.5);
    expect(validarTamano(204_800, 300).kb).toBe(200);
  });
});

describe("nombreDeArchivo · nombres seguros para la web", () => {
  it("compone pantalla y tema en minúsculas", () => {
    expect(nombreDeArchivo("gobernanza", "noche")).toBe("gobernanza-noche.webp");
    expect(nombreDeArchivo("Astraura · IA", "nieve")).toBe("astraura-ia-nieve.webp");
  });

  it("nunca devuelve un nombre vacío", () => {
    expect(nombreDeArchivo("   ", "noche")).toBe("captura-noche.webp");
  });
});

describe("motivoOmision · qué pantallas no se capturan", () => {
  const base = "https://starseed-os.vercel.app";
  const texto = "Decisiones · Ontocracia, motor de comandos democráticos de StarSeed";

  it("omite las que piden sesión", () => {
    expect(motivoOmision({ url: `${base}/login`, status: 200, texto })).toBe(
      "requiere sesión",
    );
    expect(motivoOmision({ url: `${base}/bienvenida`, status: 200, texto })).toBe(
      "requiere sesión",
    );
  });

  it("omite errores HTTP y pantallas vacías o rotas", () => {
    expect(motivoOmision({ url: `${base}/dashboard`, status: 404, texto })).toBe(
      "HTTP 404",
    );
    expect(motivoOmision({ url: `${base}/dashboard`, status: 200, texto: "  " })).toBe(
      "sin contenido visible",
    );
    expect(
      motivoOmision({
        url: `${base}/dashboard`,
        status: 200,
        texto: "Application error: a client-side exception has occurred",
      }),
    ).toBe("error en pantalla");
  });

  it("deja pasar una pantalla pública con contenido", () => {
    expect(motivoOmision({ url: `${base}/dashboard`, status: 200, texto })).toBeNull();
  });
});

describe("leerOpciones · la línea de órdenes", () => {
  it("trae los valores de §3.4 por defecto", () => {
    const opciones = leerOpciones([]);
    expect(opciones.base).toBe("https://starseed-os.vercel.app");
    expect(opciones.ancho).toBe(1440);
    expect(opciones.alto).toBe(900);
    expect(opciones.escala).toBe(2);
    expect(opciones.maxKb).toBe(300);
    expect(opciones.temas).toEqual(["noche", "nieve"]);
    expect(opciones.pantallas.map((p: { id: string }) => p.id)).toEqual([
      "inicio",
      "gobernanza",
      "astraura",
      "biblioteca",
    ]);
    expect(opciones.salidaImagenes).toContain("assets/readme/capturas");
    expect(opciones.salidaJson).toContain("assets/readme/capturas.json");
  });

  it("acepta banderas con espacio o con igual", () => {
    const opciones = leerOpciones([
      "--base=https://ejemplo.test",
      "--tema",
      "nieve",
      "--pantalla",
      "inicio,gobernanza",
      "--ancho",
      "1280",
      "--alto=720",
      "--escala",
      "1",
      "--max-kb",
      "150",
      "--salida",
      "tmp/capturas",
      "--json",
      "tmp/capturas.json",
    ]);
    expect(opciones.base).toBe("https://ejemplo.test");
    expect(opciones.temas).toEqual(["nieve"]);
    expect(opciones.pantallas.map((p: { id: string }) => p.id)).toEqual([
      "inicio",
      "gobernanza",
    ]);
    expect(opciones.ancho).toBe(1280);
    expect(opciones.alto).toBe(720);
    expect(opciones.escala).toBe(1);
    expect(opciones.maxKb).toBe(150);
    expect(opciones.salidaImagenes).toContain("tmp/capturas");
    expect(opciones.salidaJson).toContain("tmp/capturas.json");
  });

  it("corrige una pantalla o un tema que no existe", () => {
    expect(() => leerOpciones(["--pantalla", "no-existe"])).toThrow(/pantalla/i);
    expect(() => leerOpciones(["--tema", "mediodía"])).toThrow(/tema/i);
    expect(() => leerOpciones(["--ancho", "0"])).toThrow(/ancho/i);
  });
});

describe("construirEntrada · lo que va a capturas.json", () => {
  it("deriva archivo, peso y texto alternativo de una captura", () => {
    const entrada = construirEntrada(CAPTURA_OK);
    expect(entrada.pantalla).toBe("inicio");
    expect(entrada.tema).toBe("noche");
    expect(entrada.archivo).toBe("inicio-noche.webp");
    expect(entrada.bytes).toBe(204_800);
    expect(entrada.kb).toBe(200);
    expect(entrada.ancho).toBe(2880);
    expect(entrada.alto).toBe(1800);
    expect(entrada.texto_alternativo).toContain("tema noche");
    expect(entrada.texto_alternativo).toContain(PANTALLAS[0].alt);
    expect(entrada.descripcion).toBe(PANTALLAS[0].descripcion);
  });

  it("no arrastra ningún búfer binario al JSON", () => {
    const entrada = construirEntrada(CAPTURA_OK);
    expect(JSON.stringify(entrada)).not.toContain("buffer");
  });
});

describe("construirManifiesto · orden y omisiones", () => {
  it("ordena por pantalla y por tema y conserva acentos", () => {
    const manifiesto = construirManifiesto({
      base: "https://starseed-os.vercel.app",
      opciones: { ancho: 1440, alto: 900, escala: 2, maxKb: 300 },
      generado: "2026-11-14T00:00:00.000Z",
      capturas: [
        construirEntrada({ ...CAPTURA_OK, pantalla: "astraura", tema: "nieve" }),
        construirEntrada({ ...CAPTURA_OK, pantalla: "inicio", tema: "nieve" }),
        construirEntrada({ ...CAPTURA_OK, pantalla: "inicio", tema: "noche" }),
      ],
      omitidas: [{ pantalla: "biblioteca", tema: "noche", motivo: "requiere sesión" }],
    });

    expect(manifiesto.capturas.map((c: { archivo: string }) => c.archivo)).toEqual([
      "inicio-noche.webp",
      "inicio-nieve.webp",
      "astraura-nieve.webp",
    ]);
    expect(manifiesto.omitidas).toHaveLength(1);
    expect(manifiesto.max_kb).toBe(300);
    const json = JSON.stringify(manifiesto);
    expect(() => new TextDecoder("utf-8", { fatal: true }).decode(
      new TextEncoder().encode(json),
    )).not.toThrow();
    expect(JSON.parse(json).capturas[0].descripcion).toContain("ó");
  });
});
