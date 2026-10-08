import { describe, it, expect } from "vitest";
import {
  nueva, anotar, cerrar, leer, exportar, recortar,
} from "../experiencias";
import type { Almacen, Experiencia, CierreExperiencia } from "../experiencias";
import { paraNeedle, calibracion, registrarValoracion, servidorDe, puedeCompartirse, pendientesDeSubir, subirPendientes } from "../experiencias-aprendizaje";
import type { AjustesAprendizaje } from "../experiencias-aprendizaje";

function almacenMemoria(): Almacen {
  const datos: (Experiencia | CierreExperiencia)[] = [];
  return {
    poner: async (l) => { datos.push(l); },
    lineas: async () => [...datos],
  };
}

const intencionBase = {
  capa: "needle" as const,
  tipo: "intencion" as const,
  entrada: "pon la alarma",
  salida: { herramientas: ["reloj"], llamadas: [{ nombre: "crear_alarma", argumentos: { h: 7 } }], razonamiento: "hora" },
};

describe("experiencias", () => {
  it("nueva recorta entrada a 400 y da id de 12 hex", async () => {
    const e = await nueva({ ...intencionBase, entrada: "x".repeat(500), confianza: 0.812345 });
    expect(e.entrada.length).toBe(401); // 400 + "…"
    expect(e.id).toMatch(/^[0-9a-f]{12}$/);
    expect(e.confianza).toBe(0.8123);
    expect(e.resultado).toBeNull();
  });

  it("anotar + cerrar aplican el resultado al leer", async () => {
    const al = almacenMemoria();
    const e = await nueva(intencionBase);
    await anotar(e, al);
    await cerrar(e.id, true, "funcionó", al);
    const leidas = await leer(10, al);
    expect(leidas).toHaveLength(1);
    expect(leidas[0].resultado).toBe(true);
    expect(leidas[0].nota_resultado).toBe("funcionó");
  });

  it("un cierre huérfano se ignora", async () => {
    const al = almacenMemoria();
    const e = await nueva(intencionBase);
    await anotar(e, al);
    await cerrar("idquenoexiste", false, "huérfano", al);
    const leidas = await leer(10, al);
    expect(leidas).toHaveLength(1);
    expect(leidas[0].resultado).toBeNull();
  });

  it("paraNeedle solo exporta intenciones acertadas", async () => {
    const ok = await nueva(intencionBase);
    ok.resultado = true;
    const mal = await nueva({ ...intencionBase, entrada: "fallida" });
    mal.resultado = false;
    const juicio = await nueva({ capa: "jev", tipo: "si_no", entrada: "¿sí?", salida: true });
    juicio.resultado = true;
    const lineas = paraNeedle([ok, mal, juicio]);
    expect(lineas).toHaveLength(1);
    expect(lineas[0]).toEqual({
      query: "pon la alarma",
      tools: ["reloj"],
      answers: [{ name: "crear_alarma", arguments: { h: 7 } }],
      reasoning: "hora",
    });
  });

  it("calibracion agrupa por décimas de confianza", async () => {
    const a = await nueva({ capa: "jev", tipo: "si_no", entrada: "a", salida: true, confianza: 0.83 });
    a.resultado = true;
    const b = await nueva({ capa: "jev", tipo: "si_no", entrada: "b", salida: false, confianza: 0.87 });
    b.resultado = false;
    const c = await nueva({ ...intencionBase });
    c.resultado = true; // capa needle: se ignora
    const tramos = calibracion([a, b, c], "jev");
    expect(tramos["0.8"]).toEqual({ n: 2, aciertos: 1 });
  });

  it("exportar genera JSONL una línea por registro", async () => {
    const al = almacenMemoria();
    const e = await nueva(intencionBase);
    await anotar(e, al);
    await cerrar(e.id, true, "", al);
    const jsonl = await exportar(al);
    const lineas = jsonl.trimEnd().split("\n");
    expect(lineas).toHaveLength(2);
    expect(JSON.parse(lineas[0]).id).toBe(e.id);
    expect(JSON.parse(lineas[1]).ref).toBe(e.id);
  });

  it("recortar serializa objetos", () => {
    expect(recortar({ a: 1 })).toBe('{"a":1}');
    expect(recortar("hola")).toBe("hola");
  });
});

describe("aprendizaje en el cliente (§8)", () => {
  const ajustes = (mut?: (a: AjustesAprendizaje) => void): AjustesAprendizaje => {
    const a: AjustesAprendizaje = {
      aprendizajeColectivo: true,
      porAmbito: {
        comunidad: { permite: true, privacidad: "ambito" },
        propio: { permite: true, privacidad: "publica", servidorUrl: "https://propio.example/corpus" },
        intimo: { permite: true, privacidad: "privada", servidorUrl: "https://propio.example/corpus" },
        cerrado: { permite: false, privacidad: "publica" },
      },
      servidorStarSeed: "https://starseed.example/corpus",
    };
    mut?.(a);
    return a;
  };

  it("registrarValoracion guarda ámbito, capa, modelo y herramientas con su resultado", async () => {
    const al = almacenMemoria();
    const id = await registrarValoracion(
      {
        ambito: "comunidad",
        capa: "needle",
        modelo: "needle3-20",
        entrada: "¿qué hora es?",
        respuesta: "Las siete.",
        valoracion: "positiva",
        herramientas: [{ nombre: "reloj", ok: true }],
      },
      al,
    );
    const leidas = await leer(10, al);
    expect(leidas).toHaveLength(1);
    expect(leidas[0].id).toBe(id);
    expect(leidas[0].tipo).toBe("valoracion");
    expect(leidas[0].ambito).toBe("comunidad");
    expect(leidas[0].modelo).toBe("needle3-20");
    expect(leidas[0].herramientas).toEqual([{ nombre: "reloj", ok: true }]);
    expect(leidas[0].resultado).toBe(true);
  });

  it("una corrección se guarda como tipo correccion con el texto corregido", async () => {
    const al = almacenMemoria();
    await registrarValoracion(
      {
        ambito: "comunidad",
        capa: "llm",
        modelo: "bonsai-4b",
        entrada: "suma 2+2",
        respuesta: "5",
        valoracion: "negativa",
        correccion: "Es 4.",
      },
      al,
    );
    const leidas = await leer(10, al);
    expect(leidas[0].tipo).toBe("correccion");
    expect(leidas[0].valoracion).toBe("negativa");
    expect(leidas[0].correccion).toBe("Es 4.");
    expect(leidas[0].resultado).toBe(false);
  });

  it("servidorDe usa el servidor propio del ámbito y lo privado devuelve null", () => {
    const a = ajustes();
    expect(servidorDe("propio", a)).toBe("https://propio.example/corpus");
    expect(servidorDe("comunidad", a)).toBe("https://starseed.example/corpus");
    expect(servidorDe("intimo", a)).toBeNull();
    expect(servidorDe("cerrado", a)).toBeNull();
    expect(servidorDe("desconocido", a)).toBeNull();
  });

  it("con aprendizaje_colectivo apagado no sube nada", async () => {
    const al = almacenMemoria();
    await registrarValoracion(
      {
        ambito: "comunidad",
        capa: "llm",
        modelo: "m",
        entrada: "hola",
        respuesta: "hola",
        valoracion: "positiva",
      },
      al,
    );
    const enviadas: string[] = [];
    const r = await subirPendientes(
      al,
      ajustes((a) => {
        a.aprendizajeColectivo = false;
      }),
      async (url) => {
        enviadas.push(url);
        return true;
      },
    );
    expect(enviadas).toHaveLength(0);
    expect(r).toEqual({ subidas: 0, omitidas: 1, fallidas: 0 });
  });

  it("subirPendientes sube lo consentido, nunca lo privado, y lo marca", async () => {
    const al = almacenMemoria();
    const datos = (ambito: string, entrada: string) =>
      registrarValoracion(
        { ambito, capa: "llm", modelo: "m", entrada, respuesta: "r", valoracion: "positiva" as const },
        al,
      );
    await datos("comunidad", "a");
    await datos("propio", "b");
    await datos("intimo", "c"); // privada: jamás sale
    const envios: { url: string; entradas: string[] }[] = [];
    const r1 = await subirPendientes(al, ajustes(), async (url, exps) => {
      envios.push({ url, entradas: exps.map((e) => e.entrada) });
      return true;
    });
    expect(r1).toEqual({ subidas: 2, omitidas: 1, fallidas: 0 });
    expect(envios).toHaveLength(2);
    const plano = envios.flatMap((e) => e.entradas).sort();
    expect(plano).toEqual(["a", "b"]);
    expect(envios.find((e) => e.entradas.includes("b"))?.url).toBe("https://propio.example/corpus");
    // Segunda pasada: ya estaban marcadas, no se repiten.
    const r2 = await subirPendientes(al, ajustes(), async () => true);
    expect(r2).toEqual({ subidas: 0, omitidas: 1, fallidas: 0 });
  });

  it("si el envío falla, la experiencia queda pendiente para el reintento", async () => {
    const al = almacenMemoria();
    await registrarValoracion(
      { ambito: "comunidad", capa: "llm", modelo: "m", entrada: "a", respuesta: "r", valoracion: "positiva" },
      al,
    );
    const r1 = await subirPendientes(al, ajustes(), async () => false);
    expect(r1).toEqual({ subidas: 0, omitidas: 0, fallidas: 1 });
    const r2 = await subirPendientes(al, ajustes(), async () => true);
    expect(r2).toEqual({ subidas: 1, omitidas: 0, fallidas: 0 });
  });

  it("puedeCompartirse exige valoración, ámbito y consentimiento", async () => {
    const al = almacenMemoria();
    const id = await registrarValoracion(
      { ambito: "comunidad", capa: "llm", modelo: "m", entrada: "a", respuesta: "r", valoracion: "positiva" },
      al,
    );
    const leidas = await leer(10, al);
    expect(puedeCompartirse(leidas[0], ajustes())).toBe(true);
    expect(puedeCompartirse(leidas[0], ajustes((a) => { a.aprendizajeColectivo = false; }))).toBe(false);
    const intima = { ...leidas[0], id: id + "x", ambito: "intimo" };
    expect(puedeCompartirse(intima, ajustes())).toBe(false);
    // Las intenciones normales no son material de valoración.
    const intencion = await nueva(intencionBase);
    expect(puedeCompartirse(intencion, ajustes())).toBe(false);
  });

  it("pendientesDeSubir distingue las marcas de los cierres", async () => {
    const al = almacenMemoria();
    await registrarValoracion(
      { ambito: "comunidad", capa: "llm", modelo: "m", entrada: "a", respuesta: "r", valoracion: "positiva" },
      al,
    );
    expect(pendientesDeSubir(await al.lineas())).toHaveLength(1);
    await subirPendientes(al, ajustes(), async () => true);
    expect(pendientesDeSubir(await al.lineas())).toHaveLength(0);
    // Y `leer` sigue funcionando tras las marcas (no las confunde con cierres).
    const leidas = await leer(10, al);
    expect(leidas[0].resultado).toBe(true);
  });
});
