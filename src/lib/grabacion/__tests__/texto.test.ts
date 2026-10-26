import { describe, expect, it } from "vitest";
import { explicarFalloMedios, formatearDuracion, formatearTamano, nombreArchivo, rotuloDeFase } from "../texto";

describe("grabación · textos", () => {
  it("duración mm:ss y h:mm:ss, nunca negativa", () => {
    expect(formatearDuracion(0)).toBe("00:00");
    expect(formatearDuracion(999)).toBe("00:00");
    expect(formatearDuracion(75_000)).toBe("01:15");
    expect(formatearDuracion(3_725_000)).toBe("1:02:05");
    expect(formatearDuracion(-5)).toBe("00:00");
    expect(formatearDuracion(Number.NaN)).toBe("00:00");
  });

  it("tamaño con coma decimal", () => {
    expect(formatearTamano(0)).toBe("0 B");
    expect(formatearTamano(900)).toBe("900 B");
    expect(formatearTamano(1536)).toBe("1,5 KB");
    expect(formatearTamano(1_572_864)).toBe("1,5 MB");
    expect(formatearTamano(50 * 1024 * 1024)).toBe("50 MB");
    expect(formatearTamano(250 * 1024 * 1024)).toBe("250 MB");
    expect(formatearTamano(3 * 1024 ** 3)).toBe("3 GB");
    expect(formatearTamano(Number.NaN)).toBe("0 B");
  });

  it("nombre de archivo con fecha y hora local", () => {
    const f = new Date(2026, 9, 26, 7, 5);
    expect(nombreArchivo("video", f, "webm")).toBe("starseed-grabacion-2026-10-26-0705.webm");
    expect(nombreArchivo("imagen", f, ".png")).toBe("starseed-captura-2026-10-26-0705.png");
  });

  it("cerrar el selector de pantalla es una decisión, no un fallo", () => {
    const f = explicarFalloMedios({ name: "NotAllowedError" }, "pantalla");
    expect(f.cancelado).toBe(true);
    expect(f.mensaje).toMatch(/No elegiste qué compartir/);
  });

  it("negar la cámara o el micrófono sí es un fallo, con qué hacer", () => {
    const c = explicarFalloMedios({ name: "NotAllowedError" }, "camara");
    expect(c.cancelado).toBe(false);
    expect(c.mensaje).toMatch(/cámara/);
    expect(c.mensaje).toMatch(/candado/);
    expect(explicarFalloMedios({ name: "NotFoundError" }, "microfono").mensaje).toMatch(/ningún micrófono/);
    expect(explicarFalloMedios({ name: "NotReadableError" }, "camara").mensaje).toMatch(/Otra aplicación/);
    expect(explicarFalloMedios({ name: "TypeError" }, "pantalla").mensaje).toMatch(/https/);
    expect(explicarFalloMedios("raro", "pantalla").mensaje).toMatch(/Vuelve a probar/);
  });

  it("la frase corta de cada fase (null en reposo, con resultado o con error)", () => {
    expect(rotuloDeFase({ fase: "preparando", cuenta: 0 })).toBe("Eligiendo qué grabar…");
    expect(rotuloDeFase({ fase: "cuenta-atras", cuenta: 3 })).toBe("Empieza en 3");
    expect(rotuloDeFase({ fase: "grabando", cuenta: 0 })).toBe("Grabando");
    expect(rotuloDeFase({ fase: "pausada", cuenta: 0 })).toBe("En pausa");
    expect(rotuloDeFase({ fase: "procesando", cuenta: 0 })).toBe("Preparando el archivo…");
    for (const fase of ["inactiva", "lista", "error"] as const) expect(rotuloDeFase({ fase, cuenta: 0 })).toBeNull();
  });
});
