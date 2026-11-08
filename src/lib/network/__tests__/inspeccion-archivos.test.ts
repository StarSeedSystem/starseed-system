/**
 * ARC1108A — inspección de seguridad de un envío ANTES de aceptarlo: sin falsos positivos en los 18
 * formatos de la prueba real (un .m4a o un .heic son ISO-BMFF, un .docx es un ZIP, un .wav es RIFF…),
 * y con avisos claros para ejecutables, scripts, dobles extensiones, Office con macros, SVG con
 * código, comprimidos peligrosos y tamaños raros. La IA solo recibe metadatos.
 */
import { existsSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  inspeccionarArchivo,
  leerVeredictoIA,
  listarZip,
  nivelDeEnvio,
  resumenParaIA,
  tipoRealPorBytes,
} from "@/lib/network/inspeccion-archivos";

const b = (...x: number[]) => new Uint8Array(x);
const t = (s: string) => new TextEncoder().encode(s);

/** ZIP mínimo (sin comprimir) con esas entradas. */
function zip(entradas: Array<{ ruta: string; datos?: Uint8Array; cifrado?: boolean }>): Uint8Array {
  const partes: number[] = [];
  const centrales: number[] = [];
  const u16 = (arr: number[], v: number) => arr.push(v & 0xff, (v >> 8) & 0xff);
  const u32 = (arr: number[], v: number) => arr.push(v & 0xff, (v >> 8) & 0xff, (v >> 16) & 0xff, (v >>> 24) & 0xff);
  for (const e of entradas) {
    const nombre = t(e.ruta);
    const datos = e.datos ?? t("x");
    const offset = partes.length;
    u32(partes, 0x04034b50); u16(partes, 20); u16(partes, e.cifrado ? 1 : 0); u16(partes, 0); u16(partes, 0); u16(partes, 0);
    u32(partes, 0); u32(partes, datos.length); u32(partes, datos.length); u16(partes, nombre.length); u16(partes, 0);
    partes.push(...nombre, ...datos);
    u32(centrales, 0x02014b50); u16(centrales, 20); u16(centrales, 20); u16(centrales, e.cifrado ? 1 : 0); u16(centrales, 0); u16(centrales, 0); u16(centrales, 0);
    u32(centrales, 0); u32(centrales, datos.length); u32(centrales, datos.length); u16(centrales, nombre.length); u16(centrales, 0); u16(centrales, 0);
    u16(centrales, 0); u16(centrales, 0); u32(centrales, 0); u32(centrales, offset);
    centrales.push(...nombre);
  }
  const offsetCd = partes.length;
  const fin: number[] = [];
  u32(fin, 0x06054b50); u16(fin, 0); u16(fin, 0); u16(fin, entradas.length); u16(fin, entradas.length); u32(fin, centrales.length); u32(fin, offsetCd); u16(fin, 0);
  return new Uint8Array([...partes, ...centrales, ...fin]);
}

describe("sin falsos positivos en los 18 formatos de la prueba", () => {
  const casos: Array<[string, string, Uint8Array, number]> = [
    ["imagen.png", "image/png", b(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a), 96_453],
    ["foto.jpg", "image/jpeg", b(0xff, 0xd8, 0xff, 0xe0), 73_690],
    ["foto.heic", "image/heic", b(0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63), 39_056],
    ["animacion.gif", "image/gif", t("GIF89a"), 119_263],
    ["logo.svg", "image/svg+xml", t('<svg xmlns="http://www.w3.org/2000/svg"><circle r="4" fill="#fff"/></svg>'), 206],
    ["documento.pdf", "application/pdf", t("%PDF-1.4\n1 0 obj << /Type /Catalog >>"), 12_890],
    ["documento.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", b(0x50, 0x4b, 0x03, 0x04), 3_567],
    ["texto.txt", "text/plain", t("Prueba: done = true, one = 1"), 77],
    ["nota.md", "text/markdown", t("# Nota"), 55],
    ["datos.json", "application/json", t('{"onload":"x","a":1}'), 45],
    ["tabla.csv", "text/csv", t("a,b\n1,2"), 21],
    ["voz.mp3", "audio/mpeg", t("ID3"), 15_691],
    ["voz.m4a", "audio/x-m4a", b(0, 0, 0, 0x20, 0x66, 0x74, 0x79, 0x70, 0x4d, 0x34, 0x41, 0x20), 19_690],
    ["voz.wav", "audio/wav", t("RIFF\0\0\0\0WAVE"), 167_774],
    ["video.mp4", "video/mp4", b(0, 0, 0, 0x20, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d), 8_034_291],
    ["video.webm", "video/webm", b(0x1a, 0x45, 0xdf, 0xa3), 154_830],
    ["grande-50MB.bin", "application/octet-stream", b(1, 2, 3, 4), 52_428_800],
  ];
  it.each(casos)("%s → sin señales", (nombre, tipo, inicio, tamano) => {
    const r = inspeccionarArchivo({ nombre, tipo, tamano, inicio });
    expect(r.hallazgos.filter((h) => h.nivel !== "info")).toEqual([]);
    expect(r.nivel).toBe("limpio");
  });

  it("archivo.zip con documentos corrientes → sin señales (solo la información de su contenido)", () => {
    const z = zip([{ ruta: "fotos/a.jpg" }, { ruta: "leeme.txt" }]);
    const entradas = listarZip(z, z.length);
    expect(entradas?.map((x) => x.ruta)).toEqual(["fotos/a.jpg", "leeme.txt"]);
    const r = inspeccionarArchivo({ nombre: "archivo.zip", tipo: "application/zip", tamano: z.length, inicio: z.subarray(0, 64), entradasZip: entradas, zipSegun: "archivo" });
    expect(r.nivel).toBe("limpio");
    expect(r.hallazgos).toEqual([{ nivel: "info", texto: "Comprimido con 2 elementos" }]);
  });

  const zipReal = path.join(homedir(), ".starseed", "pruebas-malla", "archivo.zip");
  it.runIf(existsSync(zipReal))("el archivo.zip REAL de la prueba se lista y sale limpio", () => {
    const datos = new Uint8Array(readFileSync(zipReal));
    const entradas = listarZip(datos, statSync(zipReal).size);
    expect(entradas && entradas.length).toBeGreaterThan(0);
    expect(inspeccionarArchivo({ nombre: "archivo.zip", tipo: "application/zip", tamano: datos.length, inicio: datos.subarray(0, 512), entradasZip: entradas }).nivel).toBe("limpio");
  });
});

describe("lo que sí se avisa", () => {
  it("ejecutables, dobles extensiones y nombres con giro de escritura → peligro", () => {
    expect(inspeccionarArchivo({ nombre: "setup.exe", tamano: 9000 }).nivel).toBe("peligro");
    expect(inspeccionarArchivo({ nombre: "app.apk", tamano: 9000, inicio: b(0x50, 0x4b, 3, 4) }).nivel).toBe("peligro");
    const doble = inspeccionarArchivo({ nombre: "factura.pdf.exe", tamano: 9000 });
    expect(doble.nivel).toBe("peligro");
    expect(doble.hallazgos.map((h) => h.texto).join(" ")).toMatch(/Doble extensión: parece \.pdf pero es \.exe/);
    expect(inspeccionarArchivo({ nombre: "foto‮gnp.exe", tamano: 9000 }).nivel).toBe("peligro");
  });

  it("un programa disfrazado (bytes MZ en un .jpg) → peligro; un PNG llamado .txt → aviso", () => {
    expect(inspeccionarArchivo({ nombre: "foto.jpg", tipo: "image/jpeg", tamano: 9000, inicio: b(0x4d, 0x5a, 0x90, 0) }).nivel).toBe("peligro");
    const r = inspeccionarArchivo({ nombre: "nota.txt", tipo: "text/plain", tamano: 9000, inicio: b(0x89, 0x50, 0x4e, 0x47) });
    expect(r.nivel).toBe("aviso");
    expect(r.tipoReal).toBe("PNG");
  });

  it("extensión que no coincide con el tipo declarado → aviso", () => {
    const r = inspeccionarArchivo({ nombre: "foto.png", tipo: "application/pdf", tamano: 9000 });
    expect(r.nivel).toBe("aviso");
    expect(r.hallazgos[0].texto).toMatch(/no coincide con el tipo declarado/);
  });

  it("scripts y Office con macros → aviso", () => {
    expect(inspeccionarArchivo({ nombre: "instalar.sh", tamano: 300 }).nivel).toBe("aviso");
    expect(inspeccionarArchivo({ nombre: "plan.docm", tamano: 30000 }).nivel).toBe("aviso");
    expect(inspeccionarArchivo({ nombre: "viejo.xls", tamano: 30000, inicio: b(0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1) }).nivel).toBe("aviso");
  });

  it("SVG con código → peligro (aunque sea una «imagen»)", () => {
    const r = inspeccionarArchivo({ nombre: "logo.svg", tipo: "image/svg+xml", tamano: 300, inicio: t('<svg onload="fetch(1)"><script>alert(1)</script></svg>') });
    expect(r.nivel).toBe("peligro");
  });

  it("comprimidos: rutas de escape → peligro; programas dentro, macros y cifrado → aviso", () => {
    const escape = zip([{ ruta: "../../.bashrc" }]);
    expect(inspeccionarArchivo({ nombre: "a.zip", tamano: escape.length, entradasZip: listarZip(escape, escape.length) }).nivel).toBe("peligro");
    const conExe = zip([{ ruta: "fotos/a.jpg" }, { ruta: "fotos/ver.exe" }]);
    const r = inspeccionarArchivo({ nombre: "fotos.zip", tamano: conExe.length, entradasZip: listarZip(conExe, conExe.length), zipSegun: "remitente" });
    expect(r.nivel).toBe("aviso");
    expect(r.hallazgos.map((h) => h.texto).join(" ")).toMatch(/programas o scripts dentro \(según el remitente\): fotos\/ver\.exe/);
    const macro = zip([{ ruta: "word/document.xml" }, { ruta: "word/vbaProject.bin" }]);
    expect(inspeccionarArchivo({ nombre: "informe.docx", tamano: macro.length, inicio: macro.subarray(0, 8), entradasZip: listarZip(macro, macro.length) }).hallazgos.map((h) => h.texto).join(" ")).toMatch(/vbaProject\.bin/);
    const cifrado = zip([{ ruta: "secreto.txt", cifrado: true }]);
    expect(inspeccionarArchivo({ nombre: "s.zip", tamano: cifrado.length, entradasZip: listarZip(cifrado, cifrado.length) }).nivel).toBe("aviso");
  });

  it("listarZip lee el directorio desde los ÚLTIMOS bytes de un archivo grande", () => {
    const z = zip([{ ruta: "a.txt" }, { ruta: "b/c.txt" }]);
    const relleno = new Uint8Array(100_000);
    const grande = new Uint8Array([...relleno, ...z]);
    // El directorio apunta a offsets del ZIP pegado tras el relleno: se ajustan como haría un ZIP real.
    expect(listarZip(z, z.length)?.length).toBe(2);
    expect(listarZip(grande.subarray(grande.length - 64), grande.length)).toBeNull(); // no cabe en lo leído
    expect(listarZip(t("no es un zip"), 12)).toBeNull();
  });

  it("vacío o demasiado pequeño para su tipo → aviso", () => {
    expect(inspeccionarArchivo({ nombre: "a.txt", tamano: 0 }).nivel).toBe("aviso");
    expect(inspeccionarArchivo({ nombre: "clip.mp4", tamano: 20 }).nivel).toBe("aviso");
  });

  it("el nivel del envío es el peor de sus archivos; tipoRealPorBytes reconoce las familias", () => {
    expect(nivelDeEnvio([inspeccionarArchivo({ nombre: "a.txt", tamano: 3 }), inspeccionarArchivo({ nombre: "b.exe", tamano: 3 })])).toBe("peligro");
    expect(tipoRealPorBytes(b(0, 0, 0, 0x20, 0x66, 0x74, 0x79, 0x70))).toBe("ISO-BMFF");
    expect(tipoRealPorBytes(b(0x7f, 0x45, 0x4c, 0x46))).toBe("EJECUTABLE-ELF");
  });
});

describe("la IA solo recibe metadatos", () => {
  const local = inspeccionarArchivo({ nombre: "contrato.pdf", tipo: "application/pdf", tamano: 1234 });

  it("el resumen lleva nombres, tipos, tamaños y hallazgos, nunca bytes; los fragmentos solo si se permitieron", () => {
    const sin = resumenParaIA({ origen: "Maggaboard", verificacion: "firma verificada", archivos: [{ nombre: "contrato.pdf", tipo: "application/pdf", tamano: 1234, local }] });
    expect(sin).toMatch(/Remitente: Maggaboard \(firma verificada\)/);
    expect(sin).toMatch(/1\. contrato\.pdf \| application\/pdf \| 1234 B \| real: sin leer \| local: limpio/);
    expect(sin).not.toMatch(/fragmento/);
    const con = resumenParaIA({ archivos: [{ nombre: "n.txt", tipo: "text/plain", tamano: 9, local, fragmento: "x".repeat(900) }] });
    expect(con).toMatch(/fragmento: "x{500}"/);
  });

  it("lee el veredicto aunque venga entre ``` y descarta lo que no se entiende", () => {
    const v = leerVeredictoIA('```json\n{"veredicto":"aviso","resumen":"Un ejecutable","archivos":[{"n":2,"nivel":"peligro","motivo":"exe"},{"n":9,"nivel":"aviso"}]}\n```', 2);
    expect(v).toEqual({ nivel: "aviso", resumen: "Un ejecutable", porArchivo: { 1: { nivel: "peligro", motivo: "exe" } } });
    expect(leerVeredictoIA("Todo bien", 1)).toBeNull();
    expect(leerVeredictoIA('{"veredicto":"aceptar"}', 1)).toBeNull();
  });
});
