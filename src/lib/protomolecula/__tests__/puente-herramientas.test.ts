import { runInNewContext } from "node:vm";
import { describe, it, expect } from "vitest";
import {
  crearToken, procesarMensaje, mensajeParaMarco, destinoDe, esUrlEmbebible, sanearParametro,
  MENSAJES_POR_SEGUNDO,
  type Marco, type EstadoLimite,
} from "../puente-herramientas";
import { registrarAtomo, sanearDefinicion, limpiarRegistro, MAX_OPCIONES, MAX_PARAMETROS, MAX_TEXTO_GENERAL, MAX_TEXTO_OPCION } from "../registro-atomos";
import { PALABRAS_UNIDAD, type Parametro } from "../tipos";

const TOKEN = "a".repeat(32);
const ORIGEN = "https://herramienta.example.com";

function marcoDe(origen: string | null = ORIGEN, parametros?: Parametro[]): Marco {
  return { ventana: { soyLaVentana: true }, token: TOKEN, origenEsperado: origen, parametros };
}
const limite = (): EstadoLimite => ({ fichas: MENSAJES_POR_SEGUNDO, proximaRecarga: 0 });
function ev(marco: Marco, data: unknown, origin: string | null = ORIGEN) {
  return { origin: origin ?? "null", source: marco.ventana, data };
}
const hola = { protomolecula: 1, tipo: "hola", canal: TOKEN };

describe("crearToken", () => {
  it("16 bytes → 32 caracteres hex", () => {
    const token = crearToken((n) => Uint8Array.from({ length: n }, (_, i) => i * 16 + i % 16));
    expect(token).toMatch(/^[0-9a-f]{32}$/);
  });
});

describe("mensajeParaMarco y destinoDe", () => {
  it("mensaje lleva versión, tipo y canal", () => {
    expect(mensajeParaMarco("establecer", { parametroId: "v", valor: 1 }, TOKEN)).toEqual({
      protomolecula: 1, tipo: "establecer", canal: TOKEN, parametroId: "v", valor: 1,
    });
  });
  it("origen opaco → '*' (solo se entrega a ese contentWindow, §8.1.1)", () => {
    expect(destinoDe(marcoDe(null))).toBe("*");
  });
  it("origen real → el origen exacto", () => {
    expect(destinoDe(marcoDe(ORIGEN))).toBe(ORIGEN);
  });
});

describe("esUrlEmbebible", () => {
  const os = "https://starseed-os.vercel.app";
  it("acepta https ajena y devuelve su origen", () => {
    expect(esUrlEmbebible("https://tool.example.com/app?x=1", os)).toEqual({ ok: true, origen: "https://tool.example.com" });
  });
  it.each([
    ["http://tool.example.com", "https"],
    ["https://u:pw@tool.example.com", "credenciales"],
    ["https://starseed-os.vercel.app/app", "mismo origen"],
    ["javascript:alert(1)", "https"],
    ["data:text/html,<b>x</b>", "https"],
    ["blob:https://x.example/abc", "https"],
    ["no-es-url", "inválida"],
  ])("rechaza %s", (url, motivo) => {
    const r = esUrlEmbebible(url, os);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo.toLowerCase()).toContain(motivo.toLowerCase());
  });
});

describe("sanearParametro", () => {
  it("filtra basura y respeta tipos conocidos", () => {
    expect(sanearParametro({ id: "v", nombre: "Volumen", tipo: "numero", min: 0, max: 1 })).toEqual({
      id: "v", nombre: "Volumen", tipo: "numero", min: 0, max: 1,
    });
    expect(sanearParametro({ id: "v", nombre: "V", tipo: "raro" })).toBeNull();
    expect(sanearParametro("nada")).toBeNull();
    expect(sanearParametro({ nombre: "sin id", tipo: "numero" })).toBeNull();
  });
});

describe("procesarMensaje · identidad", () => {
  it("rechaza una ventana ajena", () => {
    const m = marcoDe();
    const r = procesarMensaje({ origin: ORIGEN, source: {}, data: hola }, m, 0, limite());
    expect(r.entrada).toBeNull();
    expect(r.motivo).toContain("ventana");
  });
  it("rechaza token que no es del marco", () => {
    const m = marcoDe();
    const r = procesarMensaje(ev(m, { ...hola, canal: "otro" }), m, 0, limite());
    expect(r.entrada).toBeNull();
    expect(r.motivo).toContain("token");
  });
  it("envoltorio propio exige origin 'null'", () => {
    const m = marcoDe(null);
    expect(procesarMensaje(ev(m, hola, ORIGEN), m, 0, limite()).entrada).toBeNull();
    expect(procesarMensaje(ev(m, hola, null), m, 0, limite()).entrada?.tipo).toBe("hola");
  });
  it("app ajena exige su origen exacto", () => {
    const m = marcoDe("https://buena.example.com");
    expect(procesarMensaje(ev(m, hola, "https://mala.example.com"), m, 0, limite()).entrada).toBeNull();
    expect(procesarMensaje(ev(m, hola, "https://buena.example.com"), m, 0, limite()).entrada?.tipo).toBe("hola");
  });
  it("rechaza data que no es objeto", () => {
    const m = marcoDe();
    for (const data of [null, "texto", 42, [1]]) {
      expect(procesarMensaje(ev(m, data), m, 0, limite()).entrada).toBeNull();
    }
  });
  it("exige la cabecera del protocolo", () => {
    const m = marcoDe();
    expect(procesarMensaje(ev(m, { tipo: "hola", canal: TOKEN }), m, 0, limite()).entrada).toBeNull();
  });
  it("ignora tipos desconocidos", () => {
    const m = marcoDe();
    const r = procesarMensaje(ev(m, { ...hola, tipo: "ovnis" }), m, 0, limite());
    expect(r.entrada).toBeNull();
    expect(r.motivo).toContain("ignorado");
  });
});

describe("procesarMensaje · mensajes", () => {
  it("hola: sanea los parámetros declarados y descarta los inválidos", () => {
    const m = marcoDe();
    const r = procesarMensaje(ev(m, {
      ...hola, nombre: "Amplitud",
      parametros: [
        { id: "vol", nombre: "Volumen", tipo: "numero" },
        { id: "x", nombre: "<script>", tipo: "trampa" },
      ],
    }), m, 0, limite());
    expect(r.entrada?.tipo).toBe("hola");
    const params = r.entrada?.parametros as Parametro[];
    expect(params).toHaveLength(1);
    expect(params[0].id).toBe("vol");
  });
  it("cambio válido contra el tipo declarado (número finito)", () => {
    const m = marcoDe(ORIGEN, [{ id: "vol", nombre: "V", tipo: "numero" }]);
    const ok = procesarMensaje(ev(m, { ...hola, tipo: "cambio", parametroId: "vol", valor: 0.5 }), m, 0, limite());
    expect(ok.entrada?.valor).toBe(0.5);
    const infinito = procesarMensaje(ev(m, { ...hola, tipo: "cambio", parametroId: "vol", valor: Infinity }), m, 0, limite());
    expect(infinito.entrada).toBeNull();
  });
  it("cambio booleano y opción de la lista", () => {
    const m = marcoDe(ORIGEN, [
      { id: "on", nombre: "On", tipo: "booleano" },
      { id: "modo", nombre: "Modo", tipo: "opcion", opciones: ["a", "b"] },
    ]);
    expect(procesarMensaje(ev(m, { ...hola, tipo: "cambio", parametroId: "on", valor: true }), m, 0, limite()).entrada).not.toBeNull();
    expect(procesarMensaje(ev(m, { ...hola, tipo: "cambio", parametroId: "on", valor: "sí" }), m, 0, limite()).entrada).toBeNull();
    expect(procesarMensaje(ev(m, { ...hola, tipo: "cambio", parametroId: "modo", valor: "b" }), m, 0, limite()).entrada).not.toBeNull();
    expect(procesarMensaje(ev(m, { ...hola, tipo: "cambio", parametroId: "modo", valor: "z" }), m, 0, limite()).entrada).toBeNull();
  });
  it("cambio a un parámetro no declarado se rechaza", () => {
    const m = marcoDe(ORIGEN, [{ id: "vol", nombre: "V", tipo: "numero" }]);
    const r = procesarMensaje(ev(m, { ...hola, tipo: "cambio", parametroId: "otro", valor: 1 }), m, 0, limite());
    expect(r.entrada).toBeNull();
    expect(r.motivo).toContain("no declarado");
  });
  it("sin parámetros declarados aún, cambio pasa (hola no recibido)", () => {
    const m = marcoDe();
    expect(procesarMensaje(ev(m, { ...hola, tipo: "cambio", parametroId: "x", valor: 1 }), m, 0, limite()).entrada).not.toBeNull();
  });
  it("exportar, listo y error válidos", () => {
    const m = marcoDe();
    expect(procesarMensaje(ev(m, { ...hola, tipo: "exportar", formato: "png", datos: { b: 1 } }), m, 0, limite()).entrada?.tipo).toBe("exportar");
    expect(procesarMensaje(ev(m, { ...hola, tipo: "listo" }), m, 0, limite()).entrada?.tipo).toBe("listo");
    expect(procesarMensaje(ev(m, { ...hola, tipo: "error", mensaje: "falló" }), m, 0, limite()).entrada?.mensaje).toBe("falló");
    expect(procesarMensaje(ev(m, { ...hola, tipo: "error", mensaje: "" }), m, 0, limite()).entrada).toBeNull();
  });
});

describe("procesarMensaje · topes", () => {
  it("JSON por encima de 64 KB se rechaza", () => {
    const m = marcoDe();
    const r = procesarMensaje(ev(m, { ...hola, nombre: "x".repeat(70 * 1024) }), m, 0, limite());
    expect(r.entrada).toBeNull();
    expect(r.motivo).toContain("64 KB");
  });
  it("la clave de una entrada undefined cuenta: postMessage la clona aunque JSON la omita", () => {
    const m = marcoDe();
    const datos: Record<string, unknown> = { ...hola };
    datos["k".repeat(70 * 1024)] = undefined; // 70 KB de clave que JSON.stringify no escribiría
    const r = procesarMensaje(ev(m, datos), m, 0, limite());
    expect(r.entrada).toBeNull();
    expect(r.motivo).toContain("64 KB");
  });
  it("exportar por encima de 2 MB se rechaza", () => {
    const m = marcoDe();
    const r = procesarMensaje(ev(m, { ...hola, tipo: "exportar", formato: "wav", datos: "x".repeat(2 * 1024 * 1024 + 10) }), m, 0, limite());
    expect(r.entrada).toBeNull();
    expect(r.motivo).toContain("2 MB");
  });
});

describe("procesarMensaje · frecuencia (reloj simulado)", () => {
  it("cubo de 120 mensajes/s y recuperación al segundo siguiente", () => {
    const m = marcoDe();
    let estado = limite();
    let aceptados = 0;
    for (let i = 0; i < 200; i++) {
      const r = procesarMensaje(ev(m, hola), m, 5_000, estado);
      estado = r.estado;
      if (r.entrada) aceptados++;
    }
    expect(aceptados).toBe(120);
    const r2 = procesarMensaje(ev(m, hola), m, 5_999, estado);
    expect(r2.entrada).toBeNull();
    expect(r2.motivo).toContain("frecuencia");
    const r3 = procesarMensaje(ev(m, hola), m, 6_000, r2.estado);
    expect(r3.entrada).not.toBeNull();
  });
});

describe("procesarMensaje · validación de cada tipo (rescate de RTPM1010F1A)", () => {
  it.each([
    ["hola", { nombre: 42 }, "nombre"],
    ["hola", { parametros: "vol" }, "parametros"],
    ["cambio", { parametroId: 42, valor: 1 }, "parametroId"],
    ["cambio", { parametroId: "", valor: 1 }, "parametroId"],
    ["exportar", { formato: 42, datos: {} }, "formato"],
    ["exportar", { formato: "", datos: {} }, "formato"],
    ["error", { mensaje: 42 }, "mensaje"],
  ])("rechaza %s con %j", (tipo, extra, campo) => {
    const m = marcoDe();
    const r = procesarMensaje(ev(m, { ...hola, tipo, ...extra }), m, 0, limite());
    expect(r.entrada).toBeNull();
    expect(r.motivo).toContain(`«${campo}»`); // el motivo señala ESE campo, no otro rechazo cualquiera
  });
  it("un tipo desconocido gigante no infla el motivo", () => {
    const m = marcoDe();
    const r = procesarMensaje(ev(m, { ...hola, tipo: "x".repeat(1_000_000) }), m, 0, limite());
    expect(r.entrada).toBeNull();
    expect(r.motivo?.length).toBeLessThan(100);
  });
  it("la herramienta no puede hablar como el OS: establecer, estado y disparar se ignoran", () => {
    const m = marcoDe();
    for (const tipo of ["establecer", "estado", "disparar"]) {
      const r = procesarMensaje(ev(m, { ...hola, tipo, parametroId: "x", valor: 1, valores: {} }), m, 0, limite());
      expect(r.entrada).toBeNull();
      expect(r.motivo).toContain("ignorado");
    }
  });
});

describe("procesarMensaje · solo JSON puro (el tope mide el mensaje, no lo que postMessage sabe clonar)", () => {
  const exportar = (datos: unknown) => ({ ...hola, tipo: "exportar", formato: "wav", datos });
  const cambio = (valor: unknown) => ({ ...hola, tipo: "cambio", parametroId: "x", valor });
  const circular = (): Record<string, unknown> => {
    const c: Record<string, unknown> = {};
    c.yo = c;
    return c;
  };
  class Instancia { x = 1; }
  /** Lo que de verdad llega por `postMessage`: la lista CLONADA, con su propiedad que no es un índice (JSON.stringify no la ve). */
  const conOculto = (bytes: number): unknown => {
    const lista: unknown[] & { oculto?: string } = ["ok"];
    lista.oculto = "x".repeat(bytes);
    return structuredClone(lista);
  };
  const profundo = (n: number): unknown => {
    let a: unknown[] = [];
    for (let i = 0; i < n; i++) a = [a];
    return a;
  };

  it.each([
    ["BigInt", () => BigInt(10)],
    ["referencia circular", circular],
    ["ArrayBuffer de 10 MB (pesaba «{}»)", () => new ArrayBuffer(10 * 1024 * 1024)],
    ["Uint8Array (pesaba seis veces su tamaño)", () => new Uint8Array(1024)],
    ["DataView", () => new DataView(new ArrayBuffer(8))],
    ["Map", () => new Map([["a", 1]])],
    ["Set", () => new Set([1, 2, 3])],
    ["Date", () => new Date(0)],
    ["RegExp", () => /a+/g],
    ["Blob", () => new Blob(["hola"])],
    ["instancia de clase", () => new Instancia()],
    ["función", () => () => 1],
    ["símbolo", () => Symbol("s")],
    ["NaN", () => NaN],
    ["Infinity", () => Infinity],
    ["undefined dentro de una lista", () => [1, undefined]],
    ["lista con 3 MB en una propiedad que no es índice (JSON la pesaría en 6 bytes)", () => conOculto(3 * 1024 * 1024)],
    ["lista con una propiedad pequeña que no es índice", () => conOculto(2)],
    ["lista con un hueco", () => { const l = [1, 2, 3]; delete l[1]; return l; }],
    ["anidado a 20.000 niveles", () => profundo(20_000)],
  ])("rechaza %s sin lanzar, venga como datos de un exportar o como valor de un cambio", (nombre, fabricar) => {
    const m = marcoDe();
    for (const data of [exportar(fabricar()), exportar({ dentro: [{ mas: fabricar() }] }), cambio(fabricar())]) {
      const r = procesarMensaje(ev(m, data), m, 0, limite());
      // Comparación compacta: si falla, vitest no intenta imprimir la entrada (un ArrayBuffer de 10 MB o 20.000 niveles tumbaban el worker).
      expect(r.entrada === null, `${nombre} se aceptó`).toBe(true);
      expect(r.motivo).toContain("JSON puro");
    }
  });
  it("la premisa de esas pruebas: el clon de postMessage conserva la propiedad que JSON.stringify ignora", () => {
    const clon = conOculto(1000) as string[] & { oculto?: string };
    expect(clon.oculto).toHaveLength(1000);
    expect(JSON.stringify(clon)).toBe('["ok"]');
  });
  it("acepta lo que sí es JSON: objetos y listas planas, objetos sin prototipo y los de otro marco", () => {
    const m = marcoDe();
    const sinPrototipo = Object.assign(Object.create(null) as Record<string, unknown>, { a: 1 });
    const deOtroMarco = runInNewContext("({ nota: 'la4', hz: [440, 880], dentro: { ok: true, nada: null } })");
    for (const datos of [{ a: [1, "dos", null, true, { b: -0.5 }] }, structuredClone({ lista: [1, [2, [3]]], vacia: [] }), sinPrototipo, deOtroMarco, { omitido: undefined }, "texto", 7, null]) {
      const r = procesarMensaje(ev(m, exportar(datos)), m, 0, limite());
      expect(r.motivo).toBeUndefined();
      expect(r.entrada?.tipo).toBe("exportar");
    }
  });
});

describe("procesarMensaje · entrada hostil", () => {
  it("un marco sin ventana no identifica a nadie, aunque el mensaje venga de source null", () => {
    const m: Marco = { ...marcoDe(), ventana: null };
    const r = procesarMensaje({ origin: ORIGEN, source: null, data: hola }, m, 0, limite());
    expect(r.entrada).toBeNull();
    expect(r.motivo).toContain("ventana");
  });
  it("un parametroId gigante no declarado no infla el motivo", () => {
    const m = marcoDe(ORIGEN, [{ id: "vol", nombre: "V", tipo: "numero" }]);
    const r = procesarMensaje(ev(m, { ...hola, tipo: "cambio", parametroId: "p".repeat(60 * 1024), valor: 1 }), m, 0, limite());
    expect(r.entrada).toBeNull();
    expect(r.motivo).toContain("no declarado");
    expect(r.motivo?.length).toBeLessThan(120);
  });
  it("el tope cuenta bytes UTF-8 (no caracteres) y es exacto: 64 KB pasa, uno más no", () => {
    const m = marcoDe();
    expect(procesarMensaje(ev(m, { ...hola, nombre: "ñ".repeat(40 * 1024) }), m, 0, limite()).motivo).toContain("64 KB");
    const vacio = new TextEncoder().encode(JSON.stringify({ ...hola, nombre: "" })).length;
    const justo = 64 * 1024 - vacio;
    expect(procesarMensaje(ev(m, { ...hola, nombre: "x".repeat(justo) }), m, 0, limite()).entrada).not.toBeNull();
    expect(procesarMensaje(ev(m, { ...hola, nombre: "x".repeat(justo + 1) }), m, 0, limite()).motivo).toContain("64 KB");
  });
  it("exportar admite entre 64 KB y 2 MB; cambio no", () => {
    const m = marcoDe(ORIGEN, [{ id: "t", nombre: "T", tipo: "opcion" }]);
    const grande = "x".repeat(1024 * 1024);
    expect(procesarMensaje(ev(m, { ...hola, tipo: "exportar", formato: "wav", datos: grande }), m, 0, limite()).entrada?.tipo).toBe("exportar");
    expect(procesarMensaje(ev(m, { ...hola, tipo: "cambio", parametroId: "t", valor: grande }), m, 0, limite()).motivo).toContain("64 KB");
  });
});

describe("procesarMensaje · lo que declara el hola se acota como en el registro", () => {
  const declarar = (extra: Record<string, unknown>) => {
    const m = marcoDe();
    return procesarMensaje(ev(m, { ...hola, ...extra }), m, 0, limite()).entrada;
  };
  it("recorta el nombre a 80 caracteres", () => {
    expect((declarar({ nombre: "n".repeat(60 * 1024) })?.nombre as string).length).toBe(80);
  });
  it("máximo 64 parámetros y ids únicos", () => {
    const muchos = Array.from({ length: 400 }, (_, i) => ({ id: `p${i}`, nombre: "P", tipo: "numero" }));
    expect(declarar({ parametros: muchos })?.parametros).toHaveLength(64);
    const repetidos = [{ id: "a", nombre: "A", tipo: "numero" }, { id: "a", nombre: "Otra", tipo: "booleano" }];
    expect(declarar({ parametros: repetidos })?.parametros).toEqual([{ id: "a", nombre: "A", tipo: "numero" }]);
  });
  it("como mucho 32 opciones, y los nombres, ids y sinónimos de 80", () => {
    const opciones = Array.from({ length: 200 }, (_, i) => `o${i}`);
    const p = sanearParametro({ id: "i".repeat(500), nombre: "n".repeat(500), tipo: "opcion", opciones, sinonimos: ["s".repeat(500)] });
    expect(p?.id).toHaveLength(MAX_TEXTO_GENERAL);
    expect(p?.nombre).toHaveLength(MAX_TEXTO_GENERAL);
    expect(p?.opciones).toEqual(opciones.slice(0, MAX_OPCIONES));
    expect(p?.sinonimos?.[0]).toHaveLength(MAX_TEXTO_GENERAL);
  });
  it("una opción de más de 40 caracteres se descarta, no se recorta: dos largas casi iguales no se vuelven una", () => {
    const larga = (fin: string) => "o".repeat(MAX_TEXTO_OPCION + 5) + fin;
    const exacta = "x".repeat(MAX_TEXTO_OPCION);
    const p = sanearParametro({ id: "m", nombre: "M", tipo: "opcion", opciones: [larga("a"), larga("b"), exacta, "x".repeat(MAX_TEXTO_OPCION + 1), "corta"] });
    expect(p?.opciones).toEqual([exacta, "corta"]);
    // Y las 32 son las primeras que valen: las descartadas no gastan plaza.
    const mezcla = [...Array.from({ length: 10 }, (_, i) => larga(`${i}`)), ...Array.from({ length: 50 }, (_, i) => `o${i}`)];
    expect(sanearParametro({ id: "m", nombre: "M", tipo: "opcion", opciones: mezcla })?.opciones).toEqual(Array.from({ length: MAX_OPCIONES }, (_, i) => `o${i}`));
  });
  it("las opciones repetidas cuentan una vez, también las que solo se distinguían por < o >", () => {
    expect(sanearParametro({ id: "m", nombre: "M", tipo: "opcion", opciones: ["a", "a", "a<b>", "ab", "c"] })?.opciones).toEqual(["a", "ab", "c"]);
  });
  it("quita < y > de todo lo que declara un tercero, con el mismo saneo del registro", () => {
    const bruto = {
      id: "<b>vol</b>", nombre: "<script>Volumen</script>", tipo: "opcion", opciones: ["<svg>a", "b"], sinonimos: ["<i>nivel</i>"], unidad: "Hz",
    };
    const entrada = declarar({ nombre: "<img src=x onerror=alert(1)>Sinte", parametros: [bruto] });
    expect(JSON.stringify(entrada)).not.toMatch(/[<>]/);
    expect(entrada?.nombre).toBe("img src=x onerror=alert(1)Sinte");
    const delRegistro = sanearDefinicion({ herramientaId: "x", nombre: "N", categoria: "audio", integracion: "iframe-aislado", control: "total", parametros: [bruto] })?.parametros[0];
    expect(delRegistro).toBeDefined();
    const [p] = entrada?.parametros as Parametro[];
    expect(p).toMatchObject({ id: delRegistro?.id, nombre: delRegistro?.nombre, opciones: delRegistro?.opciones, sinonimos: delRegistro?.sinonimos });
    expect(p.id).toBe("bvol/b");
    expect(sanearParametro({ id: "x", nombre: "<>", tipo: "numero" })).toBeNull(); // sin nombre tras el saneo no hay parámetro
    expect(sanearParametro({ id: "<>", nombre: "X", tipo: "numero" })).toBeNull();
  });
  it("un hola aceptado SIEMPRE lo admite el registro, aunque declare más de lo permitido (dentro de los 64 KB del mensaje)", () => {
    const parametro = (i: number, texto: number, opciones: number, largoOpcion: number) => ({
      id: `${i}-`.padEnd(texto, "i"), nombre: "n".repeat(texto), tipo: "opcion", min: 0, max: 1, unidad: "Hz", sinonimos: ["s".repeat(texto)],
      opciones: Array.from({ length: opciones }, (_, j) => `${j}-`.padEnd(largoOpcion, "o")),
    });
    const casos = [
      { nombre: "muchos parámetros", parametros: Array.from({ length: MAX_PARAMETROS + 2 }, (_, i) => parametro(i, 60, 34, 12)), esperados: MAX_PARAMETROS },
      { nombre: "textos y opciones larguísimos", parametros: Array.from({ length: 4 }, (_, i) => parametro(i, 400, 100, 100)), esperados: 4 },
    ];
    for (const caso of casos) {
      const entrada = declarar({ nombre: "N".repeat(300), parametros: caso.parametros });
      expect(entrada?.parametros, caso.nombre).toHaveLength(caso.esperados);
      limpiarRegistro();
      const r = registrarAtomo({
        herramientaId: "prueba-puente", nombre: entrada?.nombre as string, categoria: "audio", integracion: "iframe-aislado",
        control: "total", parametros: entrada?.parametros as Parametro[], entradas: [], salidas: [],
      });
      limpiarRegistro();
      expect(r, caso.nombre).toEqual({ ok: true });
    }
  });
  it("acepta toda unidad que el núcleo sabe dictar y descarta el resto", () => {
    for (const unidad of Object.keys(PALABRAS_UNIDAD)) {
      expect(sanearParametro({ id: "f", nombre: "F", tipo: "numero", unidad })?.unidad).toBe(unidad);
    }
    expect(sanearParametro({ id: "f", nombre: "F", tipo: "numero", unidad: "" })?.unidad).toBe("");
    for (const unidad of ["<img src=x>", "hz", "parsecs", 7]) {
      const p = sanearParametro({ id: "f", nombre: "F", tipo: "numero", unidad });
      expect(p).not.toBeNull(); // la unidad inventada no tira el parámetro: solo se pierde la unidad
      expect(p?.unidad).toBeUndefined();
    }
  });
  it("rechaza rangos al revés o vacíos, como el registro", () => {
    expect(sanearParametro({ id: "f", nombre: "F", tipo: "numero", min: 5, max: 1 })).toBeNull();
    expect(sanearParametro({ id: "f", nombre: "F", tipo: "numero", min: 5, max: 5 })).toBeNull();
    expect(sanearParametro({ id: "f", nombre: "F", tipo: "numero", min: 0, max: 5 })).toMatchObject({ min: 0, max: 5 });
    expect(sanearParametro({ id: "f", nombre: "F", tipo: "numero", min: 3 })).toMatchObject({ min: 3 }); // un solo extremo vale
  });
});
