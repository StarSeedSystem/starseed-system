import { describe, expect, it } from "vitest";
import type { ContextoProto, OperacionPedida } from "../contrato";
import { deducirTipoCambio, describirOperacion, extraerJson, hayMarcasDeCodigo, MAX_JSON_BYTES, MAX_PASOS, MAX_TEXTO, modoEfectivo, textoSeguro, validarPaso, validarPlan } from "../esquema";

const CTX: ContextoProto = {
  ruta: "/grupo/semilla",
  entidad: { tipo: "grupo", id: "semilla", nombre: "Semilla" },
  seleccion: { tipo: "archivo", id: "f1" },
  gobernadaPor: { tipo: "comunidad", id: "verde" },
  ambito: "grupo",
};

const ok = (b: unknown, o?: Parameters<typeof validarPaso>[2]) => {
  const r = validarPaso(b, CTX, o);
  if (!r.ok) throw new Error(`debía valer: ${r.motivo}`);
  return r.paso;
};
const mal = (b: unknown, o?: Parameters<typeof validarPaso>[2]) => {
  const r = validarPaso(b, CTX, o);
  if (r.ok) throw new Error("debía rechazarse");
  return r.motivo;
};

describe("extraerJson · lo que devuelve una IA", () => {
  it("saca el primer objeto con o sin cercos y con texto alrededor", () => {
    expect(extraerJson('{"a":1}')).toEqual({ a: 1 });
    expect(extraerJson('Claro:\n```json\n{"a":{"b":"}"}}\n```\nlisto')).toEqual({ a: { b: "}" } });
    expect(extraerJson('{"a":"con \\" comilla y { llave"}')).toEqual({ a: 'con " comilla y { llave' });
  });
  it("no devuelve nada si no hay objeto, no parsea o no es texto", () => {
    for (const x of ["", "sin json", '{"a":', "{a:1}", 42, null, undefined, {}]) expect(extraerJson(x)).toBeUndefined();
  });
  it("corta por tamaño ANTES de parsear", () => {
    const grande = `{"x":"${"a".repeat(MAX_JSON_BYTES)}"}`;
    expect(extraerJson(grande)).toBeUndefined();
    expect(extraerJson(`relleno ${"z".repeat(MAX_JSON_BYTES * 2)} {"a":1}`)).toBeUndefined();
  });
});

describe("textoSeguro", () => {
  it("limpia control y espacios, y acota", () => {
    expect(textoSeguro("  hola\u0000\n  mundo  ")).toBe("hola mundo");
    expect(textoSeguro("a".repeat(MAX_TEXTO))).toHaveLength(MAX_TEXTO);
    expect(textoSeguro("a".repeat(MAX_TEXTO + 1))).toBeNull();
    for (const v of ["", "   ", 5, null, {}, []]) expect(textoSeguro(v)).toBeNull();
  });
  it.each([
    "<script>alert(1)</script>", "x <iframe src=a>", "<svg onload=a>", "<style>*{}</style>", "javascript:alert(1)", "JaVaScRiPt :x",
    "data:text/html;base64,AAA", "onerror=alert(1)", "${process.env.X}", "{{constructor}}", "```js\nrm\n```", "__proto__", "eval(1)", "function(){}",
  ])("rechaza marcas de código: %s", (t) => {
    expect(textoSeguro(t)).toBeNull();
    expect(hayMarcasDeCodigo(t)).toBe(true);
  });
  it("deja pasar lenguaje natural normal", () => {
    expect(textoSeguro("Cambia el título a «Plan de otoño» y pon el fondo más cálido")).not.toBeNull();
    expect(hayMarcasDeCodigo("un texto con saltos\ny comas, sin código")).toBe(false);
  });
});

describe("validarPaso · vocabulario cerrado", () => {
  it("acepta cada operación con su forma exacta", () => {
    expect(ok({ tipo: "crear-objeto-3d", descripcion: "cubo", animado: true })).toEqual({ tipo: "crear-objeto-3d", descripcion: "cubo", animado: true });
    expect(ok({ tipo: "crear-objeto-3d", descripcion: "cubo" })).toEqual({ tipo: "crear-objeto-3d", descripcion: "cubo", animado: false });
    expect(ok({ tipo: "generar-imagen", descripcion: "mar", formato: "16:9" })).toEqual({ tipo: "generar-imagen", descripcion: "mar", formato: "16:9" });
    expect(ok({ tipo: "generar-imagen", descripcion: "mar" })).toEqual({ tipo: "generar-imagen", descripcion: "mar" });
    expect(ok({ tipo: "abrir-en", donde: "xr" })).toEqual({ tipo: "abrir-en", donde: "xr" });
    expect(ok({ tipo: "abrir-en", donde: "pizarra", que: "plan" })).toEqual({ tipo: "abrir-en", donde: "pizarra", que: "plan" });
    expect(ok({ tipo: "fondo", descripcion: "cálido" })).toEqual({ tipo: "fondo", descripcion: "cálido" });
    expect(ok({ tipo: "dictar-molecula", orden: "sube el brillo" })).toEqual({ tipo: "dictar-molecula", orden: "sube el brillo" });
    expect(ok({ tipo: "proponer-metagenesis", que: "un átomo nuevo" })).toEqual({ tipo: "proponer-metagenesis", que: "un átomo nuevo" });
    expect(ok({ tipo: "insertar-en", destino: { tipo: "grupo", id: "semilla" }, que: "texto" })).toMatchObject({ tipo: "insertar-en", destino: { tipo: "grupo", id: "semilla" } });
  });

  it("un tipo desconocido, ausente o malicioso se rechaza sin repetirlo", () => {
    for (const t of ["ejecutar-codigo", "rm -rf /", "<script>", "", 7, null, undefined, ["fondo"]]) {
      const motivo = mal({ tipo: t, descripcion: "x", orden: "x" });
      expect(motivo).toContain("vocabulario");
      expect(motivo).not.toMatch(/script|rm -rf/);
    }
  });

  it("lo que no es un objeto plano se rechaza", () => {
    for (const b of ["fondo", 3, null, undefined, [], [{ tipo: "fondo" }], new Date(), new Map(), () => 1]) expect(mal(b)).toBe("no es un objeto");
  });

  it("solo copia campos conocidos: lo demás (comandos, urls, __proto__) no sobrevive", () => {
    const bruto = JSON.parse('{"tipo":"fondo","descripcion":"cálido","comando":"rm -rf /","url":"https://evil.example","__proto__":{"admin":true},"constructor":{"x":1}}');
    const paso = ok(bruto) as unknown as Record<string, unknown>;
    expect(Object.keys(paso).sort()).toEqual(["descripcion", "tipo"]);
    expect(({} as Record<string, unknown>).admin).toBeUndefined();
    expect(Object.getPrototypeOf(paso)).toBe(Object.prototype);
  });

  it("campos con el tipo equivocado se rechazan", () => {
    expect(mal({ tipo: "crear-objeto-3d", descripcion: "cubo", animado: "true" })).toContain("verdadero o falso");
    expect(mal({ tipo: "crear-objeto-3d", descripcion: "cubo", animado: 1 })).toContain("verdadero o falso");
    expect(mal({ tipo: "crear-objeto-3d", descripcion: 5 })).toContain("descripción");
    expect(mal({ tipo: "generar-imagen", descripcion: "x", formato: "3:2" })).toContain("formato");
    expect(mal({ tipo: "generar-imagen", descripcion: "x", formato: 169 })).toContain("formato");
    expect(mal({ tipo: "abrir-en", donde: "terminal" })).toContain("apertura");
    expect(mal({ tipo: "abrir-en", donde: "pizarra", que: 5 })).toContain("«que»");
    expect(mal({ tipo: "dictar-molecula", orden: "x".repeat(301) })).toContain("orden");
  });

  it("los textos con marcas de código o desmedidos se rechazan en cualquier campo", () => {
    expect(mal({ tipo: "fondo", descripcion: "<script>alert(1)</script>" })).toContain("descripción");
    expect(mal({ tipo: "fondo", descripcion: "x".repeat(MAX_TEXTO + 1) })).toContain("descripción");
    expect(mal({ tipo: "proponer-metagenesis", que: "```sh\nrm -rf\n```" })).toContain("qué proponer");
    expect(mal({ tipo: "abrir-en", donde: "pizarra", que: "javascript:alert(1)" })).toContain("«que»");
  });

  it("solo se actúa sobre lo que la persona tiene delante", () => {
    const base = { tipo: "editar-entidad", cambio: "traduce" };
    expect(mal({ ...base, objetivo: { tipo: "archivo", id: "otro-archivo" } })).toContain("no está en tu pantalla");
    expect(mal({ ...base, objetivo: { tipo: "grupo", id: "secreto" } })).toContain("no está en tu pantalla");
    expect(mal({ ...base, objetivo: { tipo: "<script>", id: "x" } })).toContain("entidad válida");
    expect(mal({ ...base, objetivo: "semilla" })).toContain("entidad válida");
    expect(mal({ tipo: "insertar-en", destino: { tipo: "mensaje", id: "ajeno" }, que: "x" })).toContain("destino");
    for (const objetivo of [CTX.entidad, CTX.seleccion, CTX.gobernadaPor]) expect(validarPaso({ ...base, objetivo }, CTX).ok).toBe(true);
  });

  it("el nombre de la entidad lo pone la pantalla, no la IA", () => {
    const p = ok({ tipo: "editar-entidad", objetivo: { tipo: "grupo", id: "semilla", nombre: "Nombre inventado" }, cambio: "x" });
    expect(p.tipo === "editar-entidad" && p.objetivo.id).toBe("semilla");
  });
});

describe("modo de edición: la rama es lo seguro", () => {
  const edicion = (modo?: unknown) => ({ tipo: "editar-entidad", objetivo: CTX.entidad, cambio: "c", ...(modo === undefined ? {} : { modo }) });
  const modoDe = (b: unknown, o?: Parameters<typeof validarPaso>[2]) => (ok(b, o) as Extract<OperacionPedida, { tipo: "editar-entidad" }>).modo;

  it("por defecto rama, aunque la IA diga directo", () => {
    expect(modoDe(edicion())).toBe("rama");
    expect(modoDe(edicion("directo"))).toBe("rama");
    expect(modoDe(edicion("rama"))).toBe("rama");
  });
  it("directo solo si la persona lo pidió (modo de la interfaz o su frase), y rama manda siempre", () => {
    expect(modoDe(edicion("directo"), { modo: "directo" })).toBe("directo");
    expect(modoDe(edicion("directo"), { pideDirecto: true })).toBe("directo");
    expect(modoDe(edicion("rama"), { modo: "directo" })).toBe("rama");
    expect(modoDe(edicion("directo"), { modo: "rama", pideDirecto: true })).toBe("rama");
  });
  it("un modo inventado se rechaza", () => {
    expect(mal(edicion("borrar"))).toContain("modo");
    expect(mal(edicion(5))).toContain("modo");
  });
  it("conservarModo (revalidar un plan ya hecho) nunca sube ni baja el modo", () => {
    expect(modoEfectivo({ conservarModo: true }, "directo")).toBe("directo");
    expect(modoEfectivo({ conservarModo: true }, "rama")).toBe("rama");
    expect(modoEfectivo({ conservarModo: true }, undefined)).toBe("rama");
    expect(modoEfectivo({ conservarModo: true, modo: "rama" }, "directo")).toBe("directo");
  });
});

describe("validarPlan", () => {
  const paso = { tipo: "fondo", descripcion: "cálido" };

  it("un plan válido sale con su resumen, su tipo deducido y lo que no cabe", () => {
    const r = validarPlan({ resumen: "Cambio el fondo", tipoCambio: "diseno", pasos: [paso], fuera: ["enviar un correo"] }, CTX);
    expect(r).toEqual({ ok: true, plan: { resumen: "Cambio el fondo", tipoCambio: "diseno", pasos: [paso], fuera: ["enviar un correo"] } });
  });

  it("lo que no es un plan se rechaza", () => {
    for (const b of [null, "plan", 5, [], [paso], { pasos: "fondo" }, {}]) expect(validarPlan(b, CTX).ok).toBe(false);
  });

  it("los pasos inválidos van a «fuera» y NO se ejecutan; si no queda ninguno, no hay plan", () => {
    const r = validarPlan({ pasos: [paso, { tipo: "ejecutar", cmd: "x" }, { tipo: "editar-entidad", objetivo: { tipo: "grupo", id: "ajeno" }, cambio: "x" }] }, CTX);
    expect(r.ok && r.plan.pasos).toEqual([paso]);
    expect(r.ok && r.plan.fuera).toHaveLength(2);
    const nada = validarPlan({ pasos: [{ tipo: "ejecutar" }, 7] }, CTX);
    expect(nada.ok).toBe(false);
    expect(!nada.ok && nada.fuera).toHaveLength(2);
  });

  it(`como mucho ${MAX_PASOS} pasos: el resto se descarta y se dice`, () => {
    const r = validarPlan({ pasos: Array.from({ length: 20 }, () => ({ ...paso })) }, CTX);
    expect(r.ok && r.plan.pasos).toHaveLength(MAX_PASOS);
    expect(r.ok && r.plan.fuera.join(" ")).toContain("14 pasos más");
  });

  it("la IA puede quedarse corta pero no bajar el rigor del tipo de cambio", () => {
    const permisos = { tipo: "editar-entidad", objetivo: CTX.entidad, cambio: "cambia quién puede ver el grupo (visibilidad)" };
    const a = validarPlan({ tipoCambio: "contenido", pasos: [permisos] }, CTX);
    expect(a.ok && a.plan.tipoCambio).toBe("permisos");
    const b = validarPlan({ tipoCambio: "reglas", pasos: [paso] }, CTX);
    expect(b.ok && b.plan.tipoCambio).toBe("reglas");
    const c = validarPlan({ tipoCambio: "inventado", pasos: [paso] }, CTX);
    expect(c.ok && c.plan.tipoCambio).toBe("diseno");
  });

  it("un resumen o un «fuera» con código se sustituye o se descarta", () => {
    const r = validarPlan({ resumen: "<script>x</script>", pasos: [paso], fuera: ["<iframe>", "algo normal", 5, "javascript:1"] }, CTX);
    expect(r.ok && r.plan.resumen).toBe(describirOperacion(paso as OperacionPedida));
    expect(r.ok && r.plan.fuera).toEqual(["algo normal"]);
  });
});

describe("deducirTipoCambio y describirOperacion", () => {
  const editar = (cambio: string): OperacionPedida => ({ tipo: "editar-entidad", objetivo: { tipo: "grupo", id: "g" }, cambio, modo: "rama" });
  it("el más restrictivo manda: permisos › reglas › funciones › diseño › contenido › creación", () => {
    expect(deducirTipoCambio([editar("cambia el rol de los miembros")])).toBe("permisos");
    expect(deducirTipoCambio([editar("cambia la regla de votación")])).toBe("reglas");
    expect(deducirTipoCambio([editar("activa la herramienta de calendario")])).toBe("funciones");
    expect(deducirTipoCambio([editar("cambia el color del tema")])).toBe("diseno");
    expect(deducirTipoCambio([editar("corrige la ortografía")])).toBe("contenido");
    expect(deducirTipoCambio([{ tipo: "crear-objeto-3d", descripcion: "x", animado: false }])).toBe("creacion");
    expect(deducirTipoCambio([{ tipo: "fondo", descripcion: "x" }, editar("corrige la ortografía")])).toBe("diseno");
    expect(deducirTipoCambio([{ tipo: "proponer-metagenesis", que: "x" }, { tipo: "fondo", descripcion: "x" }])).toBe("funciones");
    expect(deducirTipoCambio([{ tipo: "abrir-en", donde: "xr" }])).toBe("contenido");
  });
  it("cada operación tiene una frase corta en español", () => {
    const largo = "x".repeat(300);
    for (const op of [
      { tipo: "crear-objeto-3d", descripcion: largo, animado: true }, { tipo: "generar-imagen", descripcion: "x", formato: "1:1" }, editar(largo),
      { tipo: "insertar-en", destino: { tipo: "mensaje", id: "m", nombre: "Ana" }, que: "x" }, { tipo: "abrir-en", donde: "protomolecula", que: "m" },
      { tipo: "fondo", descripcion: "x" }, { tipo: "dictar-molecula", orden: "x" }, { tipo: "proponer-metagenesis", que: "x" },
    ] as OperacionPedida[]) {
      const f = describirOperacion(op);
      expect(f.length).toBeGreaterThan(5);
      expect(f.length).toBeLessThan(160);
    }
  });
});
