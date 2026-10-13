import { describe, it, expect } from "vitest";
import { examinar, CandidatoArchivo } from "../centinela";

function bytes(de: number[], relleno = 32): Uint8Array {
  const b = new Uint8Array(Math.max(de.length, relleno));
  b.set(de);
  return b;
}
const texto = (s: string): Uint8Array => new TextEncoder().encode(s);

describe("centinela: examinar", () => {
  it("acepta un PNG sano declarado como imagen", () => {
    const c: CandidatoArchivo = { nombre: "foto.png", tipoDeclarado: "image/png", bytes: bytes([0x89, 0x50, 0x4e, 0x47]), tamano: 1000 };
    expect(examinar(c)).toEqual({ peligroso: false, motivos: [] });
  });

  it("detecta ejecutable por firma MZ aunque diga ser PNG", () => {
    const v = examinar({ nombre: "foto.png", tipoDeclarado: "image/png", bytes: bytes([0x4d, 0x5a]), tamano: 500 });
    expect(v.peligroso).toBe(true);
    expect(v.motivos).toContain("ejecutable");
    expect(v.motivos).toContain("tipo-real-distinto");
  });

  it("detecta ELF y ole2 (macro de Office antiguo)", () => {
    expect(examinar({ nombre: "x.bin", bytes: bytes([0x7f, 0x45, 0x4c, 0x46]), tamano: 1 }).motivos).toContain("ejecutable");
    expect(examinar({ nombre: "doc.xls", bytes: bytes([0xd0, 0xcf, 0x11, 0xe0]), tamano: 1 }).motivos).toContain("macro-office");
  });

  it("detecta doble extensión y guiones por nombre", () => {
    expect(examinar({ nombre: "factura.pdf.exe", bytes: bytes([0x25]), tamano: 1 }).motivos).toContain("doble-extension");
    expect(examinar({ nombre: "script.js", bytes: texto("x"), tamano: 1 }).motivos).toContain("guion");
    expect(examinar({ nombre: "notas.txt", bytes: texto("hola"), tamano: 1 }).peligroso).toBe(false);
  });

  it("detecta HTML y SVG con código", () => {
    expect(examinar({ nombre: "a.html", bytes: texto("<html><script>alert(1)</script>"), tamano: 30 }).motivos).toContain("html-con-codigo");
    expect(examinar({ nombre: "a.svg", bytes: texto("<svg onload=alert(1)>"), tamano: 30 }).motivos).toContain("html-con-codigo");
    expect(examinar({ nombre: "a.html", bytes: texto("<html><p>hola</p>"), tamano: 30 }).peligroso).toBe(false);
  });

  it("detecta rutas de escape y bombas en el índice ZIP", () => {
    const contenedor = bytes([0x50, 0x4b, 0x03, 0x04]);
    const v1 = examinar({ nombre: "a.zip", tipoDeclarado: "application/zip", bytes: contenedor, tamano: 10, entradasZip: [{ nombre: "../../etc/passwd", tamanoComprimido: 5, tamanoDescomprimido: 10 }] });
    expect(v1.motivos).toContain("ruta-escape-zip");
    const v2 = examinar({ nombre: "a.zip", bytes: contenedor, tamano: 10, entradasZip: [{ nombre: "b", tamanoComprimido: 1, tamanoDescomprimido: 10000 }] });
    expect(v2.motivos).toContain("bomba-compresion");
  });

  it("avisa por tamaño excedido y no mancha un zip con macrorresumen razonable", () => {
    const grande = examinar({ nombre: "video.mp4", bytes: bytes([0x00]), tamano: 600 * 1024 * 1024 });
    expect(grande.motivos).toContain("tamano-excedido");
    const zipOk = examinar({ nombre: "a.zip", bytes: bytes([0x50, 0x4b, 0x03, 0x04]), tamano: 100, entradasZip: [{ nombre: "docs/a.txt", tamanoComprimido: 10, tamanoDescomprimido: 60 }] });
    expect(zipOk.peligroso).toBe(false);
  });
});
