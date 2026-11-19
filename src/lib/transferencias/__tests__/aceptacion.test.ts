/**
 * FMT1119 — recibir archivos y carpetas libre y seguro.
 * Pruebas de las reglas de aceptación (siempre a mano salvo neurona reconocida elegida, nunca sola
 * desde una desconocida) y del análisis de seguridad previo a abrir (sin ejecutar ni borrar nada).
 * Todo son funciones puras: entrada → salida, sin red, sin disco y sin procesos.
 */
import { describe, expect, it } from "vitest";
import {
  PREFERENCIAS_RECEPCION_POR_DEFECTO,
  aceptarRecepcion,
  ajustarAceptarSinPreguntar,
  decidirAceptacion,
  fichaDeOferta,
  formatearTamano,
  marcarAnalisisHecho,
  puedeAbrir,
  recibirOferta,
  rechazarRecepcion,
  solicitarAnalisis,
  type OfertaRecepcion,
} from "@/lib/transferencias/aceptacion";
import {
  ORDEN_ANTIVIRUS,
  analizarSeguridad,
  elegirAntivirus,
  type EntradaAnalisis,
} from "@/lib/transferencias/analisis-seguridad";

function oferta(p: Partial<OfertaRecepcion> = {}): OfertaRecepcion {
  return {
    id: "of-1",
    clase: "archivo",
    nombre: "foto.png",
    tamano: 1536,
    tipoReal: "PNG",
    origen: { id: "neurona-ana", nombre: "Ana · portátil", reconocida: false },
    medio: "malla",
    ...p,
  };
}

function ascii(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

function bytes(...n: number[]): Uint8Array {
  return new Uint8Array(n);
}

function entrada(p: Partial<EntradaAnalisis> = {}): EntradaAnalisis {
  return {
    nombre: "nota.txt",
    tamano: 120,
    tipoDeclarado: "text/plain",
    sha256: "a".repeat(64),
    inicio: ascii("Hola, esto es una nota sin nada ejecutable."),
    ...p,
  };
}

describe("aceptación de envíos entrantes", () => {
  it("formatea el tamaño en español neutro", () => {
    expect(formatearTamano(0)).toBe("0 B");
    expect(formatearTamano(512)).toBe("512 B");
    expect(formatearTamano(1024)).toBe("1 KB");
    expect(formatearTamano(1536)).toBe("1,5 KB");
    expect(formatearTamano(2 * 1024 * 1024)).toBe("2 MB");
  });

  it("la ficha enseña nombre, tamaño, tipo real, neurona de origen y medio", () => {
    const ficha = fichaDeOferta(
      oferta({ nombre: "video.mp4", tamano: 2 * 1024 * 1024, tipoReal: "ISO-BMFF", origen: { id: "n-1", nombre: "MaggaBook", reconocida: true }, medio: "bluetooth" }),
    );
    expect(ficha.nombre).toBe("video.mp4");
    expect(ficha.tamanoTexto).toBe("2 MB");
    expect(ficha.tipoReal).toBe("ISO-BMFF");
    expect(ficha.origenTexto).toContain("MaggaBook");
    expect(ficha.origenTexto).toContain("reconocida");
    expect(ficha.medioTexto).toBe("Bluetooth");
    expect(ficha.resumen).toContain("video.mp4");
    expect(ficha.resumen).toContain("2 MB");
    expect(ficha.resumen).toContain("ISO-BMFF");
    expect(ficha.resumen).toContain("MaggaBook");
    expect(ficha.resumen).toContain("Bluetooth");
    expect(ficha.resumen).toContain("sin tu aceptación");
  });

  it("una carpeta y una sincronización de cerebro dicen cuántos archivos traen", () => {
    const carpeta = fichaDeOferta(oferta({ clase: "carpeta", nombre: "Viaje", archivos: 12, tipoReal: "Carpeta" }));
    expect(carpeta.claseTexto).toBe("Carpeta");
    expect(carpeta.resumen).toContain("12 archivos");
    const cerebro = fichaDeOferta(oferta({ clase: "cerebro", nombre: "Cerebro de Ana", archivos: 3, tipoReal: "Cerebro" }));
    expect(cerebro.claseTexto).toBe("Sincronización de cerebro");
    expect(cerebro.resumen).toContain("3 archivos");
  });

  it("una neurona desconocida siempre pide aceptación, aunque su id esté en el ajuste", () => {
    const prefs = { aceptarSinPreguntar: { "neurona-ana": true }, analizarAlRecibir: "preguntar" as const };
    const ofertaDesconocida = oferta({ origen: { id: "neurona-ana", nombre: "Ana · portátil", reconocida: false } });
    expect(decidirAceptacion(ofertaDesconocida, prefs)).toMatchObject({ tipo: "preguntar" });
    const recepcion = recibirOferta(ofertaDesconocida, prefs);
    expect(recepcion.fase).toBe("en-cuarentena");
    expect(recepcion.autoaceptada).toBe(false);
    expect(recepcion.aceptadaPorLaPersona).toBe(false);
  });

  it("por defecto, incluso una neurona reconocida pide aceptación", () => {
    const reconocida = oferta({ origen: { id: "neurona-ana", nombre: "Ana · portátil", reconocida: true } });
    expect(PREFERENCIAS_RECEPCION_POR_DEFECTO.aceptarSinPreguntar).toEqual({});
    expect(decidirAceptacion(reconocida)).toMatchObject({ tipo: "preguntar" });
    expect(recibirOferta(reconocida).fase).toBe("en-cuarentena");
  });

  it("una neurona reconocida con el ajuste encendido se acepta sola (y solo esa)", () => {
    const prefs = ajustarAceptarSinPreguntar(PREFERENCIAS_RECEPCION_POR_DEFECTO, "neurona-ana", true);
    const ana = oferta({ origen: { id: "neurona-ana", nombre: "Ana · portátil", reconocida: true } });
    expect(decidirAceptacion(ana, prefs)).toMatchObject({ tipo: "aceptar-sin-preguntar" });
    const recepcion = recibirOferta(ana, prefs);
    expect(recepcion.fase).toBe("aceptada");
    expect(recepcion.autoaceptada).toBe(true);
    expect(puedeAbrir(recepcion)).toBe(true);
    const otra = oferta({ origen: { id: "neurona-luis", nombre: "Luis", reconocida: true } });
    expect(decidirAceptacion(otra, prefs)).toMatchObject({ tipo: "preguntar" });
  });

  it("el ajuste se enciende y se apaga neurona a neurona sin mutar el original", () => {
    const prefs = ajustarAceptarSinPreguntar(undefined, "n-1", true);
    const conDos = ajustarAceptarSinPreguntar(prefs, "n-2", true);
    expect(conDos.aceptarSinPreguntar).toEqual({ "n-1": true, "n-2": true });
    expect(PREFERENCIAS_RECEPCION_POR_DEFECTO.aceptarSinPreguntar).toEqual({});
    const soloUno = ajustarAceptarSinPreguntar(conDos, "n-1", false);
    expect(soloUno.aceptarSinPreguntar).toEqual({ "n-2": true });
  });
});

describe("cuarentena y decisión de la persona", () => {
  it("lo recibido queda en cuarentena hasta que la persona acepta", () => {
    const recepcion = recibirOferta(oferta());
    expect(recepcion.fase).toBe("en-cuarentena");
    expect(recepcion.analisis).toBe("ofrecido");
    expect(puedeAbrir(recepcion)).toBe(false);
    const aceptada = aceptarRecepcion(recepcion);
    expect(aceptada.fase).toBe("aceptada");
    expect(aceptada.aceptadaPorLaPersona).toBe(true);
    expect(aceptada.analisis).toBe("no-pedido");
    expect(puedeAbrir(aceptada)).toBe(true);
  });

  it("si la persona pide analizar, no se abre hasta que el análisis termina", () => {
    const aceptada = aceptarRecepcion(recibirOferta(oferta()), { analizar: true });
    expect(aceptada.analisis).toBe("pendiente");
    expect(puedeAbrir(aceptada)).toBe(false);
    const revisada = marcarAnalisisHecho(aceptada);
    expect(revisada.analisis).toBe("hecho");
    expect(puedeAbrir(revisada)).toBe(true);
  });

  it("también se puede pedir el análisis antes de aceptar; aceptar después no lo pierde", () => {
    const pedida = solicitarAnalisis(recibirOferta(oferta()));
    expect(pedida.analisis).toBe("pendiente");
    expect(pedida.fase).toBe("en-cuarentena");
    const aceptada = aceptarRecepcion(pedida);
    expect(aceptada.fase).toBe("aceptada");
    expect(aceptada.analisis).toBe("pendiente");
    expect(puedeAbrir(aceptada)).toBe(false);
  });

  it("con «analizar siempre» el análisis queda pendiente al recibir, aunque la neurona se acepte sola", () => {
    const prefs = {
      aceptarSinPreguntar: { "neurona-ana": true },
      analizarAlRecibir: "siempre" as const,
    };
    const recepcion = recibirOferta(oferta({ origen: { id: "neurona-ana", nombre: "Ana", reconocida: true } }), prefs);
    expect(recepcion.fase).toBe("aceptada");
    expect(recepcion.analisis).toBe("pendiente");
    expect(puedeAbrir(recepcion)).toBe(false);
    expect(puedeAbrir(marcarAnalisisHecho(recepcion))).toBe(true);
  });

  it("rechazar no borra: lo recibido se conserva en cuarentena y no se abre", () => {
    const rechazada = rechazarRecepcion(recibirOferta(oferta()));
    expect(rechazada.fase).toBe("rechazada");
    expect(rechazada.conservaOriginal).toBe(true);
    expect(rechazada.aceptadaPorLaPersona).toBe(false);
    expect(puedeAbrir(rechazada)).toBe(false);
    expect(aceptarRecepcion(rechazada).fase).toBe("rechazada");
  });

  it("acepta cualquier formato a mano: un ejecutable no se rechaza solo", () => {
    const exe = oferta({ nombre: "instalador.exe", tipoReal: "EJECUTABLE-WINDOWS", origen: { id: "n-1", nombre: "Luis", reconocida: false } });
    const recepcion = recibirOferta(exe);
    expect(recepcion.fase).toBe("en-cuarentena");
    const aceptada = aceptarRecepcion(recepcion, { analizar: true });
    expect(aceptada.fase).toBe("aceptada");
    expect(marcarAnalisisHecho(aceptada).fase).toBe("aceptada");
  });
});

describe("análisis de seguridad al recibir", () => {
  it("una foto PNG inofensiva queda limpia y muestra su tipo real y su huella", () => {
    const sha = "b".repeat(64);
    const r = analizarSeguridad(
      entrada({
        nombre: "foto.png",
        tipoDeclarado: "image/png",
        tamano: 4096,
        sha256: sha,
        inicio: bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13),
      }),
    );
    expect(r.nivel).toBe("limpio");
    expect(r.tipoReal).toBe("PNG");
    expect(r.huella).toBe(sha);
    expect(r.resumen).toContain("PNG");
    expect(r.resumen).toContain(sha);
    expect(r.antesDeAbrir).toContain("antes de abrir");
    expect(r.antesDeAbrir).toContain("sin tu aceptación");
  });

  it("un texto corriente también queda limpio; sin huella lo dice sin alarmar", () => {
    const r = analizarSeguridad(entrada({ sha256: null }));
    expect(r.nivel).toBe("limpio");
    expect(r.huella).toBeNull();
    expect(r.hallazgos.some((h) => h.codigo === "sin-huella")).toBe(true);
  });

  it("detecta bytes que no coinciden con la extensión", () => {
    const r = analizarSeguridad(entrada({ nombre: "nota.txt", inicio: bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a) }));
    expect(r.nivel).toBe("aviso");
    expect(r.tipoReal).toBe("PNG");
    expect(r.resumen).toMatch(/bytes dicen PNG/i);
  });

  it("un ejecutable escondido tras una foto es peligro y enseña su tipo real", () => {
    const r = analizarSeguridad(entrada({ nombre: "foto.jpg", tipoDeclarado: "image/jpeg", inicio: ascii("MZ...") }));
    expect(r.nivel).toBe("peligro");
    expect(r.tipoReal).toBe("EJECUTABLE-WINDOWS");
    expect(r.hallazgos.some((h) => h.codigo === "ejecutable")).toBe(true);
    expect(r.resumen).toContain("EJECUTABLE-WINDOWS");
  });

  it("un script y un documento con macros se avisan sin ejecutarse", () => {
    const script = analizarSeguridad(entrada({ nombre: "instalar.sh", tipoDeclarado: "text/x-shellscript", inicio: ascii("#!/bin/sh\necho hola") }));
    expect(script.nivel).toBe("aviso");
    expect(script.hallazgos.some((h) => h.codigo === "script")).toBe(true);
    const macro = analizarSeguridad(entrada({ nombre: "presupuesto.xlsm", tipoDeclarado: "application/vnd.ms-excel.sheet.macroEnabled.12" }));
    expect(macro.nivel).toBe("aviso");
    expect(macro.hallazgos.some((h) => h.codigo === "macro")).toBe(true);
  });

  it("un comprimido con rutas peligrosas o programas dentro no se abre a ciegas", () => {
    const escapes = analizarSeguridad(
      entrada({
        nombre: "paquete.zip",
        tipoDeclarado: "application/zip",
        inicio: bytes(0x50, 0x4b, 0x03, 0x04),
        entradasComprimido: [{ ruta: "../../etc/passwd" }],
      }),
    );
    expect(escapes.nivel).toBe("peligro");
    expect(escapes.hallazgos.some((h) => h.codigo === "ruta-peligrosa")).toBe(true);
    const programa = analizarSeguridad(
      entrada({
        nombre: "paquete.zip",
        tipoDeclarado: "application/zip",
        inicio: bytes(0x50, 0x4b, 0x03, 0x04),
        entradasComprimido: [{ ruta: "carpeta/setup.exe" }],
      }),
    );
    expect(programa.nivel).toBe("aviso");
    expect(programa.hallazgos.some((h) => h.codigo === "ejecutable")).toBe(true);
  });

  it("detecta comprimidos dentro de comprimidos", () => {
    const r = analizarSeguridad(
      entrada({
        nombre: "paquete.zip",
        tipoDeclarado: "application/zip",
        inicio: bytes(0x50, 0x4b, 0x03, 0x04),
        entradasComprimido: [{ ruta: "copia.zip" }, { ruta: "fotos/otra.7z" }],
      }),
    );
    expect(r.hallazgos.some((h) => h.codigo === "comprimido-anidado")).toBe(true);
    expect(r.resumen).toContain("2 comprimidos");
  });

  it("la firma del ejecutable: inválida es peligro, ausente es aviso y válida se muestra", () => {
    const invalida = analizarSeguridad(entrada({ nombre: "programa.exe", inicio: ascii("MZ"), firma: "invalida" }));
    expect(invalida.firma).toBe("invalida");
    expect(invalida.nivel).toBe("peligro");
    const ausente = analizarSeguridad(entrada({ nombre: "programa.exe", inicio: ascii("MZ"), firma: "ausente" }));
    expect(ausente.nivel).toBe("peligro");
    expect(ausente.hallazgos.some((h) => h.codigo === "firma" && h.nivel === "aviso")).toBe(true);
    const valida = analizarSeguridad(entrada({ nombre: "programa.exe", inicio: ascii("MZ"), firma: "notarizada" }));
    expect(valida.firma).toBe("notarizada");
    expect(valida.hallazgos.some((h) => h.codigo === "firma" && h.nivel === "info")).toBe(true);
  });

  it("el antivirus del sistema se ofrece en su orden: ClamAV, XProtect y Defender", () => {
    expect(ORDEN_ANTIVIRUS).toEqual(["ClamAV", "XProtect", "Defender"]);
    expect(elegirAntivirus([])).toMatchObject({ orden: [], hay: false });
    expect(elegirAntivirus(["Defender", "ClamAV", "XProtect", "ClamAV"])).toMatchObject({
      orden: ["ClamAV", "XProtect", "Defender"],
      hay: true,
    });
    const r = analizarSeguridad(entrada(), { antivirusDisponibles: ["Defender", "ClamAV"] });
    expect(r.antivirus.orden).toEqual(["ClamAV", "Defender"]);
    expect(r.resumen).toContain("ClamAV");
  });
});
