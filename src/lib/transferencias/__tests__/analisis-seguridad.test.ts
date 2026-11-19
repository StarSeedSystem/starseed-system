/**
 * FMT1119 — análisis de seguridad al recibir: Astraura lo OFRECE y lo hace si la persona lo elige,
 * sin abrir ni ejecutar nada. Mira el tipo real por bytes, la huella, la firma del ejecutable, las
 * señales de riesgo y el antivirus del sistema por su orden (ClamAV → XProtect → Defender).
 */
import { describe, expect, it } from "vitest";
import {
  analizarRecepcion,
  elegirAntivirus,
  ORDEN_ANTIVIRUS,
  textoOfertaAnalisis,
  type EntradaAnalisisSeguridad,
} from "@/lib/transferencias/analisis-seguridad";
const b = (...x: number[]) => new Uint8Array(x);
const t = (s: string) => new TextEncoder().encode(s);
function e(extra: Partial<EntradaAnalisisSeguridad> = {}): EntradaAnalisisSeguridad {
  return { nombre: "foto.png", tipo: "image/png", tamano: 96_453, inicio: b(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a), ...extra };
}
describe("archivos de ejemplo inofensivos", () => {
  it("una PNG corriente queda limpia y se reconoce por sus bytes", () => {
    const r = analizarRecepcion(e());
    expect(r.nivel).toBe("limpio");
    expect(r.tipoReal).toBe("PNG");
    expect(r.hallazgos.filter((h) => h.nivel !== "info")).toEqual([]);
    expect(r.resumen).toMatch(/limpio/i);
  });
  it("un ZIP con fotos y notas no es sospechoso (solo informa de su contenido)", () => {
    const r = analizarRecepcion(e({ nombre: "recuerdos.zip", tipo: "application/zip", inicio: b(0x50, 0x4b, 0x03, 0x04), entradasZip: [{ ruta: "fotos/a.jpg" }, { ruta: "leeme.txt" }] }));
    expect(r.nivel).toBe("limpio");
    expect(r.hallazgos.some((h) => /comprimido/i.test(h.texto) && h.nivel === "info")).toBe(true);
  });
  it("un PDF de texto sin acciones queda limpio", () => {
    const r = analizarRecepcion(e({ nombre: "carta.pdf", tipo: "application/pdf", inicio: t("%PDF-1.4\n1 0 obj << /Type /Catalog >>") }));
    expect(r.nivel).toBe("limpio");
    expect(r.tipoReal).toBe("PDF");
  });
});
describe("señales de riesgo antes de abrir", () => {
  it("un ejecutable por dentro se marca peligro, diga lo que diga la extensión", () => {
    const r = analizarRecepcion(e({ nombre: "foto.png", tipo: "image/png", inicio: b(0x4d, 0x5a, 0x90, 0x00) }));
    expect(r.nivel).toBe("peligro");
    expect(r.tipoReal).toBe("EJECUTABLE-WINDOWS");
    expect(r.hallazgos.some((h) => /ejecutable|programa/i.test(h.texto))).toBe(true);
  });
  it("un ejecutable sin firma comprobable se avisa; una firma inválida es peligro", () => {
    const sinFirma = analizarRecepcion(e({ nombre: "instalar.exe", tipo: "application/x-msdownload", inicio: b(0x4d, 0x5a) }));
    expect(sinFirma.nivel).toBe("peligro");
    expect(sinFirma.hallazgos.some((h) => /firma/i.test(h.texto))).toBe(true);
    const rota = analizarRecepcion(e({ nombre: "instalar.exe", tipo: "application/x-msdownload", inicio: b(0x4d, 0x5a), firma: { valida: false } }));
    expect(rota.nivel).toBe("peligro");
    expect(rota.firma).toEqual({ valida: false });
  });
  it("la huella anunciada que no coincide con la recibida es peligro", () => {
    const r = analizarRecepcion(e({ huella: "aaaa", huellaEsperada: "bbbb" }));
    expect(r.nivel).toBe("peligro");
    expect(r.hallazgos.some((h) => /huella/i.test(h.texto))).toBe(true);
    expect(analizarRecepcion(e({ huella: "cccc", huellaEsperada: "cccc" })).nivel).toBe("limpio");
  });
  it("un comprimido dentro de otro comprimido se avisa", () => {
    const r = analizarRecepcion(e({ nombre: "paquete.zip", tipo: "application/zip", inicio: b(0x50, 0x4b, 0x03, 0x04), entradasZip: [{ ruta: "fotos/a.jpg" }, { ruta: "copia.zip" }] }));
    expect(r.nivel).toBe("aviso");
    expect(r.hallazgos.some((h) => /dentro de otro|anidado/i.test(h.texto))).toBe(true);
  });
  it("rutas peligrosas dentro de un comprimido son peligro", () => {
    const r = analizarRecepcion(e({ nombre: "paquete.zip", tipo: "application/zip", inicio: b(0x50, 0x4b, 0x03, 0x04), entradasZip: [{ ruta: "../../etc/passwd" }] }));
    expect(r.nivel).toBe("peligro");
    expect(r.hallazgos.some((h) => /salen de la carpeta/i.test(h.texto))).toBe(true);
  });
});
describe("antivirus del sistema, por su orden", () => {
  it("prefiere ClamAV, luego XProtect, luego Defender; null si no hay ninguno", () => {
    expect(ORDEN_ANTIVIRUS).toEqual(["clamav", "xprotect", "defender"]);
    expect(elegirAntivirus(["defender", "clamav"])).toBe("clamav");
    expect(elegirAntivirus(["defender", "XProtect"])).toBe("xprotect");
    expect(elegirAntivirus(["defender"])).toBe("defender");
    expect(elegirAntivirus([])).toBeNull();
  });
  it("un antivirus que dice «infectado» es peligro; «sospechoso» es aviso", () => {
    const infectado = analizarRecepcion(e({ antivirusDisponibles: ["clamav"], antivirus: { motor: "clamav", veredicto: "infectado", detalle: "Eicar-Test" } }));
    expect(infectado.nivel).toBe("peligro");
    expect(infectado.antivirus).toMatchObject({ motor: "clamav", veredicto: "infectado" });
    const sospechoso = analizarRecepcion(e({ antivirusDisponibles: ["xprotect"], antivirus: { motor: "xprotect", veredicto: "sospechoso" } }));
    expect(sospechoso.nivel).toBe("aviso");
  });
  it("sin antivirus en el aparato, el análisis sigue siendo útil y no falla", () => {
    const r = analizarRecepcion(e({ antivirusDisponibles: [] }));
    expect(r.antivirus).toBeNull();
    expect(r.nivel).toBe("limpio");
  });
});
describe("la oferta de Astraura", () => {
  it("explica qué hará y garantiza que no abre ni ejecuta nada", () => {
    const texto = textoOfertaAnalisis({ nombre: "carta.pdf", origen: "MaggaBook", via: "red local" });
    expect(texto).toMatch(/Astraura/);
    expect(texto).toMatch(/analizar/i);
    expect(texto).toMatch(/sin abrirlo ni ejecutarlo/i);
    expect(texto).toContain("carta.pdf");
    expect(texto).toContain("MaggaBook");
    expect(texto).toMatch(/antes de abrirlo/i);
  });
  it("el resultado se puede enseñar antes de abrir, con su nivel y su tipo real", () => {
    const r = analizarRecepcion(e({ nombre: "nota.txt", tipo: "text/plain", inicio: t("hola") }));
    expect(r.resumen).toMatch(/limpio/i);
    expect(r.tipoReal).toBeNull();
    expect(r.resumen.length).toBeGreaterThan(0);
  });
});
