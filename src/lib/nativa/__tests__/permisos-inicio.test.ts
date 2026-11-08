import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  ASISTENTE_OCULTO,
  GUARDADO_VACIO,
  VERSION_ASISTENTE,
  abrirAsistente,
  catalogoDe,
  debeAbrirseSolo,
  guardadoTras,
  leerGuardadoPermisos,
  permisoActual,
  permisosPendientes,
  reducirAsistente,
  serializarGuardadoPermisos,
  sistemaDeAsistente,
  textoResultado,
  type EstadoAsistente,
  type EventoAsistente,
} from "../permisos-inicio";

const aplicar = (e: EstadoAsistente, ...evs: EventoAsistente[]) => evs.reduce(reducirAsistente, e);

describe("catálogo por sistema (PER1108A)", () => {
  it("macOS: Bluetooth, red local, notificaciones, micrófono, cámara y ubicación de Wi-Fi", () => {
    expect(catalogoDe("macos").map((d) => d.id)).toEqual(["bluetooth", "red-local", "notificaciones", "microfono", "camara", "ubicacion-wifi"]);
  });
  it("Android: Dispositivos cercanos, notificaciones, micrófono, cámara, llamadas sobre el bloqueo, instalar y batería", () => {
    expect(catalogoDe("android").map((d) => d.id)).toEqual(["cercanos", "notificaciones", "microfono", "camara", "llamadas", "instalar", "bateria"]);
  });
  it("cada permiso explica el porqué en una línea y la batería/instalar/ubicación son opcionales", () => {
    for (const s of ["macos", "android"] as const) {
      for (const d of catalogoDe(s)) {
        expect(d.porQue.length).toBeGreaterThan(20);
        expect(d.porQue).not.toContain("\n");
        expect(d.desde).toBeLessThanOrEqual(VERSION_ASISTENTE);
      }
    }
    expect(catalogoDe("android").filter((d) => d.opcional).map((d) => d.id)).toEqual(["llamadas", "instalar", "bateria"]);
    expect(catalogoDe("macos").filter((d) => d.opcional).map((d) => d.id)).toEqual(["ubicacion-wifi"]);
  });
  it("solo macOS y Android tienen asistente", () => {
    expect(sistemaDeAsistente("macos")).toBe("macos");
    expect(sistemaDeAsistente("Android")).toBe("android");
    expect(sistemaDeAsistente("windows")).toBeNull();
    expect(sistemaDeAsistente("linux")).toBeNull();
    expect(abrirAsistente("windows", GUARDADO_VACIO)).toBe(ASISTENTE_OCULTO);
  });
});

describe("versión: solo se vuelve a abrir por permisos nuevos", () => {
  it("instalación nueva: se abre solo con todos", () => {
    expect(debeAbrirseSolo("macos", GUARDADO_VACIO)).toBe(true);
    expect(permisosPendientes("macos", GUARDADO_VACIO)).toHaveLength(6);
  });
  it("tras verlos todos no se abre solo", () => {
    const e = aplicar(abrirAsistente("android", GUARDADO_VACIO), { t: "empezar" }, { t: "omitir-todo" });
    const g = guardadoTras(GUARDADO_VACIO, e);
    expect(g.version).toBe(VERSION_ASISTENTE);
    expect(debeAbrirseSolo("android", g)).toBe(false);
    expect(abrirAsistente("android", g)).toBe(ASISTENTE_OCULTO);
  });
  it("un permiso nuevo en una actualización se pregunta solo a quien no lo vio", () => {
    // Quien solo vio cuatro de los seis (el catálogo de entonces) ve los dos que faltan, no los otros.
    const g = { ...GUARDADO_VACIO, vistos: ["bluetooth", "red-local", "notificaciones", "microfono"] as const };
    const p = permisosPendientes("macos", { ...g, vistos: [...g.vistos] });
    expect(p.map((d) => d.id)).toEqual(["camara", "ubicacion-wifi"]);
  });
  it("desde Ajustes se repasan todos aunque ya estén vistos", () => {
    const e = aplicar(abrirAsistente("android", GUARDADO_VACIO), { t: "omitir-todo" });
    const g = guardadoTras(GUARDADO_VACIO, e);
    expect(abrirAsistente("android", g, true).cola).toHaveLength(7);
  });
});

describe("máquina de estados: de uno en uno", () => {
  const inicio = () => aplicar(abrirAsistente("macos", GUARDADO_VACIO), { t: "empezar" });

  it("empieza en la presentación y pasa a pedir", () => {
    expect(abrirAsistente("macos", GUARDADO_VACIO).fase).toBe("presentacion");
    const e = inicio();
    expect(e.fase).toBe("pidiendo");
    expect(permisoActual(e)?.id).toBe("bluetooth");
  });
  it("no pide un segundo permiso mientras el sistema espera el primero", () => {
    const e = aplicar(inicio(), { t: "pedir" });
    expect(e.esperando).toBe("bluetooth");
    const otra = aplicar(e, { t: "pedir" });
    expect(otra).toBe(e);
  });
  it("mientras espera no se puede omitir, ni cerrar, ni omitir todo", () => {
    const e = aplicar(inicio(), { t: "pedir" });
    expect(reducirAsistente(e, { t: "omitir" })).toBe(e);
    expect(reducirAsistente(e, { t: "omitir-todo" })).toBe(e);
    expect(reducirAsistente(e, { t: "cerrar" })).toBe(e);
  });
  it("solo vale el resultado del permiso pedido", () => {
    const e = aplicar(inicio(), { t: "pedir" });
    expect(reducirAsistente(e, { t: "resultado", id: "camara", r: "concedido" })).toBe(e);
    const ok = reducirAsistente(e, { t: "resultado", id: "bluetooth", r: "concedido" });
    expect(ok.resultados.bluetooth).toBe("concedido");
    expect(ok.esperando).toBeNull();
    expect(permisoActual(ok)?.id).toBe("red-local");
  });
  it("sin pedir antes, un resultado suelto no cuenta", () => {
    const e = inicio();
    expect(reducirAsistente(e, { t: "resultado", id: "bluetooth", r: "concedido" })).toBe(e);
  });
  it("omitir el actual pasa al siguiente y queda anotado", () => {
    const e = aplicar(inicio(), { t: "omitir" });
    expect(e.resultados.bluetooth).toBe("omitido");
    expect(permisoActual(e)?.id).toBe("red-local");
  });
  it("recorrer todos termina en el resumen con cada resultado", () => {
    let e = inicio();
    for (const d of catalogoDe("macos")) {
      e = aplicar(e, { t: "pedir" }, { t: "resultado", id: d.id, r: d.id === "camara" ? "denegado" : "concedido" });
    }
    expect(e.fase).toBe("resumen");
    expect(e.indice).toBe(6);
    expect(e.resultados.camara).toBe("denegado");
    expect(aplicar(e, { t: "cerrar" }).fase).toBe("oculto");
  });
  it("omitir todo anota lo que quedaba y no pisa lo ya contestado", () => {
    const e = aplicar(inicio(), { t: "pedir" }, { t: "resultado", id: "bluetooth", r: "concedido" }, { t: "omitir-todo" });
    expect(e.fase).toBe("resumen");
    expect(e.resultados.bluetooth).toBe("concedido");
    expect(e.resultados["red-local"]).toBe("omitido");
    expect(e.resultados["ubicacion-wifi"]).toBe("omitido");
  });
  it("lo omitido cuenta como visto: no se vuelve a preguntar solo", () => {
    const e = aplicar(inicio(), { t: "omitir" }, { t: "omitir-todo" });
    const g = guardadoTras(GUARDADO_VACIO, e);
    expect(g.vistos).toHaveLength(6);
    expect(g.resultados.bluetooth).toBe("omitido");
  });
  it("cerrar a medias solo guarda lo contestado (el resto se vuelve a ofrecer)", () => {
    const e = aplicar(inicio(), { t: "pedir" }, { t: "resultado", id: "bluetooth", r: "concedido" }, { t: "cerrar" });
    const g = guardadoTras(GUARDADO_VACIO, e);
    expect(g.vistos).toEqual(["bluetooth"]);
    expect(permisosPendientes("macos", g).map((d) => d.id)[0]).toBe("red-local");
  });
});

describe("lo guardado", () => {
  it("ida y vuelta", () => {
    const g = { version: 1, vistos: ["bluetooth" as const], resultados: { bluetooth: "concedido" as const } };
    expect(leerGuardadoPermisos(serializarGuardadoPermisos(g))).toEqual(g);
  });
  it("lo ilegible o ajeno cuenta como nunca visto", () => {
    expect(leerGuardadoPermisos(null)).toBe(GUARDADO_VACIO);
    expect(leerGuardadoPermisos("{no json")).toBe(GUARDADO_VACIO);
    expect(leerGuardadoPermisos('"x"')).toBe(GUARDADO_VACIO);
    const g = leerGuardadoPermisos(JSON.stringify({ version: -3, vistos: ["bluetooth", "hack", 4], resultados: { bluetooth: "concedido", camara: "raro", x: "concedido" } }));
    expect(g.vistos).toEqual(["bluetooth"]);
    expect(g.resultados).toEqual({ bluetooth: "concedido" });
    expect(g.version).toBe(0);
  });
  it("textos del resultado", () => {
    expect(textoResultado("concedido")).toBe("Listo");
    expect(textoResultado(undefined)).toBe("Pendiente");
    expect(textoResultado("denegado")).toContain("Ajustes del sistema");
  });
});

describe("contrato Rust ↔ web", () => {
  const rs = readFileSync(join(process.cwd(), "native/src-tauri/src/permisos_inicio.rs"), "utf8");
  const kt = readFileSync(join(process.cwd(), "native/src-tauri/android/ArranqueStarSeed.kt"), "utf8");
  it("Rust y Kotlin saben los mismos permisos de Android", () => {
    const lista = rs.match(/PERMISOS_ANDROID: \[&str; \d+\] = \[([^\]]*)\]/)![1].match(/"([a-z]+)"/g)!.map((x) => x.replace(/"/g, ""));
    // «cercanos» y «llamadas» tienen su propio camino (ble/enlace_wifi y llamada_nativa_*), no `permisos_inicio_pedir`.
    const web = catalogoDe("android").map((d) => d.id).filter((id) => id !== "cercanos" && id !== "llamadas");
    expect([...lista].sort()).toEqual([...web].sort());
    for (const id of lista.filter((x) => x !== "bateria")) expect(kt, id).toContain(`"${id}"`);
    expect(kt).toContain('removePrefix("permiso:")');
  });
});
