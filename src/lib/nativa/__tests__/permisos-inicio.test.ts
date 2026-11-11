import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  ASISTENTE_OCULTO,
  GUARDADO_VACIO,
  VERSION_ASISTENTE,
  abrirAsistente,
  accionEn,
  catalogoDe,
  colaDe,
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
  type GuardadoPermisos,
  type IdPermiso,
} from "../permisos-inicio";

const aplicar = (e: EstadoAsistente, ...evs: EventoAsistente[]) => evs.reduce(reducirAsistente, e);
const ids = (xs: { id: string }[]) => xs.map((d) => d.id);

/** Lo que vio una persona con la versión 2 (PER1108A + LLA1108D) antes de esta actualización. */
const VISTO_V2_MACOS: GuardadoPermisos = {
  version: 2,
  vistos: ["bluetooth", "red-local", "notificaciones", "microfono", "camara", "ubicacion-wifi"],
  resultados: { bluetooth: "concedido", "red-local": "concedido", notificaciones: "concedido", microfono: "concedido", camara: "concedido", "ubicacion-wifi": "omitido" },
};
const VISTO_V2_ANDROID: GuardadoPermisos = {
  version: 2,
  vistos: ["cercanos", "notificaciones", "microfono", "camara", "llamadas", "instalar", "bateria"],
  resultados: { cercanos: "concedido", bateria: "omitido" },
};

describe("qué se pide en cada sistema (PER1111S)", () => {
  it("macOS: lo de siempre y, desde PER1111S, Grabación de pantalla, Accesibilidad y abrir al iniciar sesión", () => {
    expect(ids(permisosPendientes("macos", GUARDADO_VACIO))).toEqual([
      "bluetooth",
      "red-local",
      "ubicacion-wifi",
      "notificaciones",
      "microfono",
      "camara",
      "pantalla",
      "accesibilidad",
      "arranque",
    ]);
  });
  it("Android: lo de siempre (lo de fases posteriores se enseña pero no se pide)", () => {
    expect(ids(permisosPendientes("android", GUARDADO_VACIO))).toEqual(["cercanos", "notificaciones", "microfono", "camara", "llamadas", "bateria", "instalar"]);
    const lista = ids(catalogoDe("android"));
    for (const id of ["pantalla", "accesibilidad", "superposicion", "todos-archivos", "no-molestar", "escribir-ajustes"]) expect(lista).toContain(id);
  });
  it("Windows y Linux: solo «abrir al iniciar sesión»; lo demás o no se pide o lo pregunta el sistema al usarlo", () => {
    for (const s of ["windows", "linux-x11", "linux-wayland"] as const) expect(ids(permisosPendientes(s, GUARDADO_VACIO))).toEqual(["arranque"]);
  });
  it("hay lista en los cuatro sistemas; Linux distingue X11 de Wayland", () => {
    expect(sistemaDeAsistente("macos")).toBe("macos");
    expect(sistemaDeAsistente("Android")).toBe("android");
    expect(sistemaDeAsistente("windows")).toBe("windows");
    expect(sistemaDeAsistente("linux")).toBe("linux-x11");
    expect(sistemaDeAsistente("linux", "wayland")).toBe("linux-wayland");
    expect(sistemaDeAsistente("ios")).toBeNull();
    expect(abrirAsistente("ios", GUARDADO_VACIO)).toBe(ASISTENTE_OCULTO);
  });
  it("cada permiso explica el porqué en una línea y entró en una versión válida", () => {
    for (const s of ["macos", "android", "windows", "linux-x11", "linux-wayland"] as const) {
      for (const d of catalogoDe(s)) {
        expect(d.porQue.length, d.id).toBeGreaterThan(20);
        expect(d.porQue).not.toContain("\n");
        expect(d.desde).toBeLessThanOrEqual(VERSION_ASISTENTE);
      }
    }
  });
});

describe("estado real: lo concedido no se pide nunca", () => {
  it("si Alex ya activó a mano Accesibilidad y Grabación de pantalla, la actualización no se las pide", () => {
    const estados = { accesibilidad: "concedido", pantalla: "concedido" } as const;
    expect(ids(permisosPendientes("macos", VISTO_V2_MACOS, estados))).toEqual(["arranque"]);
  });
  it("instalación nueva con todo concedido: no se abre sola", () => {
    const todo = Object.fromEntries(catalogoDe("android").map((d) => [d.id, "concedido"]));
    expect(debeAbrirseSolo("android", GUARDADO_VACIO, todo)).toBe(false);
  });
  it("un permiso que se concede mientras la lista está abierta se salta solo", () => {
    let e = aplicar(abrirAsistente("macos", GUARDADO_VACIO), { t: "empezar" });
    expect(permisoActual(e)?.id).toBe("bluetooth");
    e = aplicar(e, { t: "estados", estados: { bluetooth: "concedido", "red-local": "concedido" } });
    expect(permisoActual(e)?.id).toBe("ubicacion-wifi");
    expect(e.resultados.bluetooth).toBe("concedido");
  });
  it("macOS: la primera vez se enseña el aviso del sistema; después, solo se abre Ajustes", () => {
    let e = aplicar(abrirAsistente("macos", GUARDADO_VACIO, false, { pantalla: "no-concedido" }), { t: "empezar" });
    const pantalla = e.lista.find((d) => d.id === "pantalla")!;
    expect(accionEn(e, pantalla)).toBe("pedir");
    e = aplicar(e, { t: "pedir", id: "pantalla" });
    expect(e.avisos).toContain("pantalla");
    expect(accionEn(e, pantalla)).toBe("abrir-ajustes");
    e = aplicar(e, { t: "resultado", id: "pantalla", r: "omitido" });
    const g = guardadoTras(GUARDADO_VACIO, e);
    expect(g.avisos).toEqual(["pantalla"]);
    const otra = abrirAsistente("macos", g, true, { pantalla: "no-concedido" });
    expect(accionEn(otra, otra.lista.find((d) => d.id === "pantalla")!)).toBe("abrir-ajustes");
  });
  it("negado una vez: se ofrece abrir Ajustes, no volver a preguntar", () => {
    const e = abrirAsistente("macos", GUARDADO_VACIO, true, { microfono: "denegado" });
    expect(accionEn(e, e.lista.find((d) => d.id === "microfono")!)).toBe("abrir-ajustes");
  });
});

describe("versión: solo se vuelve a abrir por permisos nuevos", () => {
  it("instalación nueva: se abre sola con todos los que hay que pedir", () => {
    expect(debeAbrirseSolo("macos", GUARDADO_VACIO)).toBe(true);
    expect(abrirAsistente("macos", GUARDADO_VACIO).cola).toHaveLength(9);
  });
  it("tras una actualización que añade permisos, se pregunta SOLO lo nuevo a quien vio la versión anterior", () => {
    expect(ids(permisosPendientes("macos", VISTO_V2_MACOS))).toEqual(["pantalla", "accesibilidad", "arranque"]);
    // En Android esta actualización no añade nada que pedir hoy (lo nuevo es de fases posteriores).
    expect(permisosPendientes("android", VISTO_V2_ANDROID)).toHaveLength(0);
    expect(debeAbrirseSolo("android", VISTO_V2_ANDROID)).toBe(false);
  });
  it("tras verlos todos no se abre sola", () => {
    const e = aplicar(abrirAsistente("android", GUARDADO_VACIO), { t: "empezar" }, { t: "omitir-todo" });
    const g = guardadoTras(GUARDADO_VACIO, e);
    expect(g.version).toBe(VERSION_ASISTENTE);
    expect(debeAbrirseSolo("android", g)).toBe(false);
    expect(abrirAsistente("android", g)).toBe(ASISTENTE_OCULTO);
  });
  it("desde los ajustes de la neurona se repasa todo lo pedible aún sin conceder, también lo omitido", () => {
    const e = aplicar(abrirAsistente("android", GUARDADO_VACIO), { t: "omitir-todo" });
    const g = guardadoTras(GUARDADO_VACIO, e);
    expect(abrirAsistente("android", g, true).cola).toHaveLength(7);
    expect(abrirAsistente("android", g, true, { cercanos: "concedido" }).cola).toHaveLength(6);
  });
  it("desde Ajustes con todo concedido: la lista se enseña igual (resumen), no se oculta", () => {
    const e = abrirAsistente("linux", GUARDADO_VACIO, true, { arranque: "concedido" });
    expect(e.fase).toBe("resumen");
    expect(e.lista.length).toBeGreaterThan(5);
  });
});

describe("lo negado o la omisión no se vuelven a preguntar solos", () => {
  it("lo omitido cuenta como visto", () => {
    const e = aplicar(abrirAsistente("macos", GUARDADO_VACIO), { t: "empezar" }, { t: "omitir" }, { t: "omitir-todo" });
    const g = guardadoTras(GUARDADO_VACIO, e);
    expect(g.vistos).toHaveLength(9);
    expect(g.resultados.bluetooth).toBe("omitido");
    expect(debeAbrirseSolo("macos", g)).toBe(false);
  });
  it("lo negado tampoco, aunque siga sin concederse", () => {
    const e = aplicar(abrirAsistente("macos", GUARDADO_VACIO), { t: "empezar" }, { t: "pedir" }, { t: "resultado", id: "bluetooth", r: "denegado" }, { t: "omitir-todo" });
    const g = guardadoTras(GUARDADO_VACIO, e);
    expect(debeAbrirseSolo("macos", g, { bluetooth: "denegado" })).toBe(false);
  });
  it("cerrar a medias solo guarda lo contestado (el resto se vuelve a ofrecer)", () => {
    const e = aplicar(abrirAsistente("macos", GUARDADO_VACIO), { t: "empezar" }, { t: "pedir" }, { t: "resultado", id: "bluetooth", r: "concedido" }, { t: "cerrar" });
    const g = guardadoTras(GUARDADO_VACIO, e);
    expect(g.vistos).toEqual(["bluetooth"]);
    expect(ids(permisosPendientes("macos", g))[0]).toBe("red-local");
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
  it("no pide un segundo permiso mientras el sistema espera el primero (ni uno suelto de la lista)", () => {
    const e = aplicar(inicio(), { t: "pedir" });
    expect(e.esperando).toBe("bluetooth");
    expect(aplicar(e, { t: "pedir" })).toBe(e);
    expect(aplicar(e, { t: "pedir", id: "camara" })).toBe(e);
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
  it("lo que no se puede pedir (más adelante, por uso) no se pide aunque se toque", () => {
    const e = aplicar(abrirAsistente("android", GUARDADO_VACIO, true), { t: "empezar" }, { t: "omitir-todo" });
    expect(aplicar(e, { t: "pedir", id: "accesibilidad" })).toBe(e);
    expect(aplicar(e, { t: "pedir", id: "pantalla" })).toBe(e);
  });
  it("desde el resumen se puede pedir uno concreto y el resultado no mueve la cola", () => {
    const e = aplicar(abrirAsistente("macos", GUARDADO_VACIO), { t: "empezar" }, { t: "omitir-todo" });
    const p = aplicar(e, { t: "pedir", id: "camara" }, { t: "resultado", id: "camara", r: "concedido" });
    expect(p.fase).toBe("resumen");
    expect(p.resultados.camara).toBe("concedido");
  });
  it("recorrer todos termina en el resumen con cada resultado", () => {
    let e = inicio();
    for (const d of e.cola) e = aplicar(e, { t: "pedir" }, { t: "resultado", id: d.id, r: d.id === "camara" ? "denegado" : "concedido" });
    expect(e.fase).toBe("resumen");
    expect(e.indice).toBe(9);
    expect(e.resultados.camara).toBe("denegado");
    expect(aplicar(e, { t: "cerrar" }).fase).toBe("oculto");
  });
  it("omitir todo anota lo que quedaba y no pisa lo ya contestado", () => {
    const e = aplicar(inicio(), { t: "pedir" }, { t: "resultado", id: "bluetooth", r: "concedido" }, { t: "omitir-todo" });
    expect(e.fase).toBe("resumen");
    expect(e.resultados.bluetooth).toBe("concedido");
    expect(e.resultados["red-local"]).toBe("omitido");
    expect(e.resultados.arranque).toBe("omitido");
  });
});

describe("lo guardado", () => {
  it("ida y vuelta", () => {
    const g = { version: 3, vistos: ["bluetooth" as const], resultados: { bluetooth: "concedido" as const }, avisos: ["pantalla" as IdPermiso] };
    expect(leerGuardadoPermisos(serializarGuardadoPermisos(g))).toEqual(g);
  });
  it("lo guardado por la versión anterior se sigue leyendo", () => {
    expect(leerGuardadoPermisos(serializarGuardadoPermisos(VISTO_V2_MACOS))).toEqual(VISTO_V2_MACOS);
  });
  it("lo ilegible o ajeno cuenta como nunca visto", () => {
    expect(leerGuardadoPermisos(null)).toBe(GUARDADO_VACIO);
    expect(leerGuardadoPermisos("{no json")).toBe(GUARDADO_VACIO);
    expect(leerGuardadoPermisos('"x"')).toBe(GUARDADO_VACIO);
    const g = leerGuardadoPermisos(JSON.stringify({ version: -3, vistos: ["bluetooth", "hack", 4], resultados: { bluetooth: "concedido", camara: "raro", x: "concedido" }, avisos: ["x"] }));
    expect(g.vistos).toEqual(["bluetooth"]);
    expect(g.resultados).toEqual({ bluetooth: "concedido" });
    expect(g.version).toBe(0);
    expect(g.avisos).toBeUndefined();
  });
  it("textos del resultado", () => {
    expect(textoResultado("concedido")).toBe("Listo");
    expect(textoResultado(undefined)).toBe("Pendiente");
    expect(textoResultado("denegado")).toContain("Ajustes del sistema");
  });
});

describe("contrato Rust ↔ web", () => {
  const rs = readFileSync(join(process.cwd(), "native/src-tauri/src/permisos_inicio.rs"), "utf8");
  const sis = readFileSync(join(process.cwd(), "native/src-tauri/src/permisos_sistema.rs"), "utf8");
  const kt = readFileSync(join(process.cwd(), "native/src-tauri/android/ArranqueStarSeed.kt"), "utf8");
  const ktPuente = readFileSync(join(process.cwd(), "native/src-tauri/android/PuenteNativo.kt"), "utf8");
  it("Rust y Kotlin saben los mismos permisos de Android que se piden por `permiso:`", () => {
    const lista = rs.match(/PERMISOS_ANDROID: \[&str; \d+\] = \[([^\]]*)\]/)![1].match(/"([a-z]+)"/g)!.map((x) => x.replace(/"/g, ""));
    // «cercanos» y «llamadas» tienen su propio camino (ble/enlace_wifi y llamada_nativa_*), no `permisos_inicio_pedir`.
    const web = colaDe("android", GUARDADO_VACIO).map((d) => d.id).filter((id) => id !== "cercanos" && id !== "llamadas");
    expect([...lista].sort()).toEqual([...web].sort());
    for (const id of lista.filter((x) => x !== "bateria")) expect(kt, id).toContain(`"${id}"`);
    expect(kt).toContain('removePrefix("permiso:")');
  });
  it("las pantallas `panel:<id>` de Android son las mismas en Rust y en Kotlin, y Kotlin mide lo que Rust lee", () => {
    const paneles = sis.match(/PANELES_ANDROID: \[&str; \d+\] =\s*\[([^\]]*)\]/)![1].match(/"([a-z-]+)"/g)!.map((x) => x.replace(/"/g, ""));
    expect(kt).toContain('removePrefix("panel:")');
    for (const p of paneles.filter((x) => x !== "app")) expect(kt, p).toContain(`"${p}" ->`);
    for (const campo of ["superposicion", "no_molestar", "escribir_ajustes", "todos_archivos", "ubicacion"]) expect(ktPuente, campo).toContain(`"${campo}"`);
  });
});
