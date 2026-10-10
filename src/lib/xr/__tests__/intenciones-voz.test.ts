import { describe, expect, it } from "vitest";
import { elegirCandidato, entenderVoz, tarjetaDe, type ContextoVoz, type Intencion, type ResultadoVoz } from "../intenciones-voz";

const CTX: ContextoVoz = {
  grupos: [
    { id: "g1", nombre: "Banda de Rock", miembros: 5 },
    { id: "g2", nombre: "Amigos del barrio", miembros: 9 },
    { id: "g3", nombre: "Amigos del trabajo", miembros: 4 },
    { id: "g4", nombre: "Arte y Ciencia", miembros: 12 },
  ],
  contactos: [{ id: "p1", nombre: "Ana López" }, { id: "p2", nombre: "Luis" }, { id: "p3", nombre: "Ana Ruiz" }],
  estaciones: [{ id: "e1", nombre: "Cumbre" }, { id: "e2", nombre: "Radio Aurora" }],
  servidores: [{ id: "s1", nombre: "Cumbre" }, { id: "s2", nombre: "Plaza pública" }],
  enfoque: null,
  mundoActual: null,
};
const ok = (r: ResultadoVoz) => {
  if (!r.ok) throw new Error(`Se esperaba ok y fue: ${r.razon} · ${r.pregunta}`);
  return r;
};
const pasos = (r: ResultadoVoz): Intencion[] => ok(r).pasos.map((p) => p.intencion);

describe("la orden de Alex, tal cual", () => {
  const FRASE = "Astraura, crea un mundo virtual con cielo de aurora y gravedad cero e invita al grupo Banda de Rock";
  it("se parte en crear + invitar, y el invitar es sobre lo recién creado", () => {
    const [crear, inv] = pasos(entenderVoz(FRASE, CTX));
    expect(crear).toMatchObject({ tipo: "crear-mundo", modo: "vr", libre: true });
    expect((crear as Extract<Intencion, { tipo: "crear-mundo" }>).caracteristicas).toEqual(expect.arrayContaining(["cielo de aurora", "gravedad cero"]));
    expect(inv).toMatchObject({ tipo: "invitar", sobre: "lo-creado", a: [{ tipo: "grupo", id: "g1", nombre: "Banda de Rock" }] });
  });
  it("crear a partir de texto libre pide la capa razón; invitar se resuelve en reflejo", () => {
    const r = ok(entenderVoz(FRASE, CTX));
    expect(r.pasos.map((p) => p.capa)).toEqual(["razon", "reflejo"]);
  });
  it("invitar siempre pasa por la tarjeta de confirmación y la tarjeta lo dice con palabras", () => {
    const r = ok(entenderVoz(FRASE, CTX));
    expect(r.confirmar).toBe(true);
    expect(r.tarjeta?.acciones).toEqual(["confirmar", "cambiar", "cancelar"]);
    expect(r.tarjeta?.lineas.join(" ")).toMatch(/Invitar a «Banda de Rock» \(5 personas\)/);
  });
  it("«subirlo a la librería» se entiende como la Biblioteca y no necesita confirmar", () => {
    const r = ok(entenderVoz("crea un mundo con una isla y súbelo a la librería", CTX));
    expect(r.pasos[1].intencion).toMatchObject({ tipo: "subir", destino: { donde: "biblioteca" }, sobre: "lo-creado" });
    expect(r.confirmar).toBe(false);
    expect(r.tarjeta).toBeNull();
  });
});

describe("nunca adivina", () => {
  it("dos grupos que encajan: pregunta cuál y ofrece los candidatos", () => {
    const r = entenderVoz("crea un mundo e invita a los amigos", CTX);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.razon).toBe("ambiguo");
      expect(r.candidatos?.map((c) => c.id).sort()).toEqual(["g2", "g3"]);
      expect(r.pregunta).toMatch(/¿Cuál\?/);
    }
  });
  it("«Ana» encaja con dos personas: ambiguo", () => {
    const r = entenderVoz("crea un mundo e invita a Ana", CTX);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.candidatos).toHaveLength(2);
  });
  it("un nombre completo sí se resuelve", () => {
    const [, inv] = pasos(entenderVoz("crea un mundo e invita a Ana López y a Luis", CTX));
    expect(inv).toMatchObject({ tipo: "invitar", a: [{ id: "p1" }, { id: "p2" }] });
  });
  it("un parcial único se confirma preguntando, no se acepta solo", () => {
    const r = entenderVoz("crea un mundo e invita al grupo banda", CTX);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.candidatos?.[0].id).toBe("g1");
  });
  it("un nombre que no existe lo dice y no inventa", () => {
    const r = entenderVoz("crea un mundo e invita al grupo Los Alienígenas", CTX);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.razon).toBe("falta-dato");
      expect(r.pregunta).toMatch(/No encuentro/);
    }
  });
  it("«invita a todos» no se acepta: hay que nombrar un grupo o una persona", () => {
    const r = entenderVoz("crea un mundo e invita a todos", CTX);
    expect(r.ok).toBe(false);
  });
  it("un nombre con «y» dentro se respeta entero", () => {
    const [, inv] = pasos(entenderVoz("crea un mundo e invita al grupo Arte y Ciencia", CTX));
    expect(inv).toMatchObject({ a: [{ id: "g4" }] });
  });
  it("«este grupo» usa lo que se señala; si no hay nada señalado, lo pide", () => {
    const con = entenderVoz("crea un mundo e invita a este grupo", { ...CTX, enfoque: { tipo: "grupo", id: "g2" } });
    expect(pasos(con)[1]).toMatchObject({ a: [{ id: "g2" }] });
    const sin = entenderVoz("crea un mundo e invita a este grupo", CTX);
    expect(sin.ok).toBe(false);
  });
  it("ir a «Cumbre» es ambiguo si hay una estación y un servidor con ese nombre, y se resuelve diciendo cuál", () => {
    expect(entenderVoz("llévame a Cumbre", CTX).ok).toBe(false);
    expect(pasos(entenderVoz("llévame a la estación Cumbre", CTX))[0]).toMatchObject({ tipo: "ir-a", destino: { tipo: "estacion", id: "e1" } });
    expect(pasos(entenderVoz("llévame al servidor Cumbre", CTX))[0]).toMatchObject({ destino: { tipo: "servidor", id: "s1" } });
    expect(pasos(entenderVoz("ve a la Plaza pública", CTX))[0]).toMatchObject({ destino: { id: "s2" } });
  });
});

describe("publicar y mandar: lo que sale de la cuenta", () => {
  const MUNDO = { ...CTX, mundoActual: { id: "m1", nombre: "Mi mundo" } };
  it("publicar sin decir quién lo ve pregunta; nunca se publica en abierto por defecto", () => {
    const r = entenderVoz("publícalo", MUNDO);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.pregunta).toMatch(/Quién puede verlo/);
  });
  it("publícalo públicamente exige confirmar", () => {
    const r = ok(entenderVoz("publícalo públicamente", MUNDO));
    expect(r.pasos[0].intencion).toMatchObject({ tipo: "subir", destino: { donde: "publicacion", visibilidad: "publica" }, sobre: "mundo-actual" });
    expect(r.confirmar).toBe(true);
    expect(r.tarjeta?.lineas[0]).toMatch(/todo el mundo/);
  });
  it("mándaselo a Ana López es un mensaje con confirmación", () => {
    const r = ok(entenderVoz("mándaselo a Ana López", MUNDO));
    expect(r.pasos[0].intencion).toMatchObject({ destino: { donde: "mensaje", para: [{ id: "p1" }] } });
    expect(r.confirmar).toBe(true);
  });
  it("súbelo a una estación concreta, a una nueva, o pide el destino si no se dice", () => {
    expect(pasos(entenderVoz("súbelo a la estación Radio Aurora", MUNDO))[0]).toMatchObject({ destino: { donde: "estacion", ref: { id: "e2" }, nueva: false } });
    expect(pasos(entenderVoz("súbelo a una estación nueva", MUNDO))[0]).toMatchObject({ destino: { donde: "estacion", nueva: true } });
    const r = entenderVoz("súbelo", MUNDO);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.sugerencias.length).toBeGreaterThan(0);
  });
  it("sin ningún mundo creado ni abierto, no hay nada que subir ni invitar", () => {
    for (const f of ["súbelo a la biblioteca", "invita al grupo Banda de Rock", "ponle cielo de noche"]) {
      const r = entenderVoz(f, CTX);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.razon).toBe("sin-contexto");
    }
  });
});

describe("editar, abrir y sistema", () => {
  const MUNDO = { ...CTX, mundoActual: { id: "m1", nombre: "Mi mundo" } };
  it("cielo y gravedad conocidos se resuelven en el reflejo; lo que el vocabulario no cubre pasa a la razón", () => {
    expect(ok(entenderVoz("ponle cielo de noche", MUNDO)).pasos[0]).toMatchObject({ capa: "reflejo", intencion: { campo: "cielo", valor: "noche" } });
    expect(ok(entenderVoz("pon gravedad cero", MUNDO)).pasos[0].intencion).toMatchObject({ campo: "gravedad", valor: "cero" });
    expect(ok(entenderVoz("cambia el cielo a aurora boreal", MUNDO)).pasos[0]).toMatchObject({ capa: "razon", intencion: { campo: "otro" } });
  });
  it("pizarras y llamadas, con y sin gente", () => {
    expect(pasos(entenderVoz("abre una pizarra", CTX))[0]).toMatchObject({ tipo: "abrir", que: "pizarra", con: [] });
    expect(pasos(entenderVoz("abre una pizarra con Luis", CTX))[0]).toMatchObject({ que: "pizarra", con: [{ id: "p2" }] });
    expect(pasos(entenderVoz("llama a Luis", CTX))[0]).toMatchObject({ que: "llamada", con: [{ id: "p2" }] });
    expect(pasos(entenderVoz("haz una llamada con el grupo Banda de Rock", CTX))[0]).toMatchObject({ que: "llamada", con: [{ tipo: "grupo", id: "g1" }] });
  });
  it("órdenes del sistema", () => {
    expect(pasos(entenderVoz("recentra", CTX))[0]).toMatchObject({ orden: "recentrar" });
    expect(pasos(entenderVoz("salir", CTX))[0]).toMatchObject({ orden: "salir" });
    expect(pasos(entenderVoz("qué puedo decir", CTX))[0]).toMatchObject({ orden: "ayuda" });
    expect(pasos(entenderVoz("silencio", CTX))[0]).toMatchObject({ orden: "silenciar" });
  });
  it("«en ar» y «en mi habitación» fijan el modo del mundo", () => {
    expect(pasos(entenderVoz("crea un mundo en AR con un cubo", CTX))[0]).toMatchObject({ modo: "ar" });
    expect(pasos(entenderVoz("crea un mundo en vr y en ar con un cubo", CTX))[0]).toMatchObject({ modo: "ambos" });
  });
});

describe("entradas raras", () => {
  it("vacío y no entendido devuelven ayuda, nunca una acción", () => {
    const v = entenderVoz("   ", CTX);
    expect(!v.ok && v.razon).toBe("vacio");
    const n = entenderVoz("cuéntame un chiste sobre pulpos", CTX);
    expect(!n.ok && n.razon).toBe("no-entendido");
    expect(!n.ok && n.sugerencias.length).toBeGreaterThan(0);
  });
  it("si una cláusula falla, no se ejecuta ninguna de las anteriores", () => {
    expect(entenderVoz("crea un mundo y luego cuéntame un chiste", CTX).ok).toBe(false);
  });
  it("ignora la palabra de activación, mayúsculas, acentos y la cortesía", () => {
    expect(pasos(entenderVoz("OYE ASTRAURA, Llévame a la ESTACIÓN Cumbre, por favor", CTX))[0]).toMatchObject({ tipo: "ir-a" });
  });
  it("tarjetaDe lista un renglón por paso", () => {
    const r = ok(entenderVoz("crea un mundo e invita a Luis", CTX));
    expect(tarjetaDe(r.pasos).lineas).toHaveLength(2);
  });
});

describe("responder a «¿Cuál?»", () => {
  const dos = [{ tipo: "grupo" as const, id: "g2", nombre: "Amigos del barrio" }, { tipo: "grupo" as const, id: "g3", nombre: "Amigos del trabajo" }];
  it("por orden, por «el último» o por el nombre", () => {
    expect(elegirCandidato("el segundo", dos)).toMatchObject({ tipo: "elegido", ref: { id: "g3" } });
    expect(elegirCandidato("la última", dos)).toMatchObject({ ref: { id: "g3" } });
    expect(elegirCandidato("el del barrio", dos)).toMatchObject({ ref: { id: "g2" } });
  });
  it("«sí» sólo vale si había un único candidato", () => {
    expect(elegirCandidato("sí", [dos[0]])).toMatchObject({ tipo: "elegido", ref: { id: "g2" } });
    expect(elegirCandidato("sí", dos).tipo).toBe("sigue");
  });
  it("«cancela» corta y lo que no se entiende vuelve a preguntar con la lista", () => {
    expect(elegirCandidato("cancela", dos).tipo).toBe("cancelado");
    const r = elegirCandidato("mmm no sé", dos);
    expect(r.tipo).toBe("sigue");
    expect(r.tipo === "sigue" && r.pregunta).toMatch(/1\. «Amigos del barrio»/);
  });
  it("un ordinal fuera de rango no elige nada", () => {
    expect(elegirCandidato("el cuarto", dos).tipo).toBe("sigue");
  });
});

describe("«este grupo de …» sin nada señalado: se ofrece, nunca se elige solo", () => {
  const CON_UNO: ContextoVoz = { ...CTX, grupos: [{ id: "g9", nombre: "Mis amigos", miembros: 6 }, ...CTX.grupos] };
  it("aunque UN nombre encaje exacto, sin puntero pregunta «¿Te refieres a…?» y deja candidatos", () => {
    const r = entenderVoz("crea un mundo virtual e invita a este grupo de amigos", CON_UNO);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.razon).toBe("ambiguo");
      expect(r.pregunta).toMatch(/No hay .* señalado\. ¿Te refieres a «Mis amigos»\?/);
      expect(r.candidatos?.map((c) => c.id)).toContain("g9");
    }
  });
  it("con un grupo señalado usa ese, y la tarjeta de confirmación lo nombra", () => {
    const r = entenderVoz("crea un mundo virtual e invita a este grupo de amigos", { ...CON_UNO, enfoque: { tipo: "grupo", id: "g1" } });
    expect(ok(r).confirmar).toBe(true);
    expect(r.ok && r.tarjeta?.lineas.join(" ")).toMatch(/«Banda de Rock»/);
  });
  it("la respuesta «sí» a la pregunta de un solo candidato lo elige", () => {
    const r = entenderVoz("invita a este grupo de amigos", { ...CON_UNO, mundoActual: { id: "m1", nombre: "Mi mundo" } });
    expect(r.ok).toBe(false);
    if (!r.ok && r.candidatos) {
      const solo = r.candidatos.filter((c) => c.id === "g9");
      expect(elegirCandidato("sí", solo)).toMatchObject({ tipo: "elegido", ref: { id: "g9" } });
    }
  });
});
