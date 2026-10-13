import { describe, expect, it } from "vitest";
import { META_ACCION, TIPOS_ACCION, deshacer, tieneSecreto, tocaNucleo, validarAccion } from "../acciones";

// Claves de EJEMPLO montadas en tiempo de ejecución (trampa nº 12 de CLAUDE.md: la protección de secretos).
const CLAVE = ["s", "k-"].join("") + "ejemploNoReal123";
const BEARER = ["Bea", "rer "].join("") + "abcdef123456";

describe("vocabulario", () => {
  it("cada acción declara meta completa y obligatorios que existen en sus campos", () => {
    for (const t of TIPOS_ACCION) {
      const m = META_ACCION[t];
      expect(m, t).toBeDefined();
      for (const o of m.obligatorios) expect(Object.keys(m.campos), `${t}.${o}`).toContain(o);
    }
  });
  it("solo dos acciones admiten código, y ninguna lo ejecuta en el OS", () => {
    const conCodigo = TIPOS_ACCION.filter((t) => Object.values(META_ACCION[t].campos).includes("codigo"));
    expect(conCodigo.sort()).toEqual(["codigo.proponer", "computadora.ejecutar"]);
    expect(META_ACCION["computadora.ejecutar"].invitado).toBe(false);
    expect(META_ACCION["codigo.proponer"].deshacer).toBe("nada");
  });
  it("lo que envía en tu nombre es de riesgo alto", () => {
    expect(META_ACCION["mensaje.enviar"].riesgo).toBe("alto");
    expect(META_ACCION["pagina.editar"].riesgo).toBe("alto");
  });
});

describe("validarAccion", () => {
  it("acepta una acción bien formada", () => {
    const r = validarAccion({ tipo: "navegar", args: { ruta: "/genesis?pestana=bots" } });
    expect(r.accion).toEqual({ tipo: "navegar", args: { ruta: "/genesis?pestana=bots" } });
    expect(r.problemas).toEqual([]);
  });
  it("rechaza lo desconocido y lo que no es objeto", () => {
    expect(validarAccion({ tipo: "formatear-disco", args: {} }).accion).toBeNull();
    expect(validarAccion("navegar").accion).toBeNull();
    expect(validarAccion(null).accion).toBeNull();
  });
  it("descarta campos que no son de la acción sin tirarla", () => {
    const r = validarAccion({ tipo: "navegar", args: { ruta: "/hub", extra: "x" } });
    expect(r.accion?.args).toEqual({ ruta: "/hub" });
    expect(r.problemas[0]).toContain("descartado");
  });
  it("las rutas son internas: ni URLs externas, ni //, ni ..", () => {
    for (const ruta of ["https://malo.example", "//malo.example", "/a/../b", "javascript:alert(1)"]) {
      expect(validarAccion({ tipo: "navegar", args: { ruta } }).accion, ruta).toBeNull();
    }
  });
  it("el texto que parece código se rechaza fuera de un candidato", () => {
    expect(validarAccion({ tipo: "notificar", args: { texto: "<script>x()</script>" } }).accion).toBeNull();
    const cand = validarAccion({ tipo: "codigo.proponer", args: { destino: "widgets/reloj.tsx", codigo: "export const x = 1;", motivo: "reloj" } });
    expect(cand.accion?.tipo).toBe("codigo.proponer");
  });
  it("un candidato nunca apunta al núcleo intocable", () => {
    const r = validarAccion({ tipo: "codigo.proponer", args: { destino: "src/lib/nucleo/invariantes.ts", codigo: "export {}" } });
    expect(r.accion).toBeNull();
    expect(tocaNucleo("./src/lib/astraura-bots/permisos.ts")).toBe(true);
    expect(tocaNucleo("src/components/widgets/mio.tsx")).toBe(false);
  });
  it("falta un obligatorio → no hay acción", () => {
    expect(validarAccion({ tipo: "mensaje.enviar", args: { canal: "c1" } }).accion).toBeNull();
  });
  it("nada con forma de clave ni rutas del disco", () => {
    expect(tieneSecreto(`hola ${CLAVE}`)).toBe(true);
    expect(tieneSecreto(BEARER)).toBe(true);
    expect(tieneSecreto("mi token de transporte y la api key de la que hablamos")).toBe(false);
    expect(validarAccion({ tipo: "notificar", args: { texto: `toma ${CLAVE}` } }).accion).toBeNull();
    expect(validarAccion({ tipo: "notificar", args: { texto: "mira /Users/alex/x" } }).accion).toBeNull();
  });
   it("los JSON grandes o con código incrustado se rechazan", () => {
     expect(validarAccion({ tipo: "ui.proponer", args: { uiSpec: { t: "x".repeat(25_000) } } }).accion).toBeNull();
     expect(validarAccion({ tipo: "ui.proponer", args: { uiSpec: { onclick: "javascript:alert(1)" } } }).accion).toBeNull();
   });

   it("valida la acción de generación de imagen", () => {
     // Acción bien formada
     const r = validarAccion({
       tipo: "imagen.generar",
       args: {
         prompt: "Un gato astronauta",
         opciones: 4,
         necesita: "texto legible",
         referencia: "gato.jpg",
         comercial: true,
       },
     });
     expect(r.accion).toEqual({
       tipo: "imagen.generar",
       args: {
         prompt: "Un gato astronauta",
         opciones: 4,
         necesita: "texto legible",
         referencia: "gato.jpg",
         comercial: true,
       },
     });
     expect(r.problemas).toEqual([]);

     // Falta el obligatorio prompt
     const r2 = validarAccion({
       tipo: "imagen.generar",
       args: {
         opciones: 4,
         necesita: "texto legible",
         referencia: "gato.jpg",
         comercial: true,
       },
     });
     expect(r2.accion).toBeNull();
     expect(r2.problemas).toContain("Falta «prompt».");

     // Campos no numéricos para opciones
     const r3 = validarAccion({
       tipo: "imagen.generar",
       args: {
         prompt: "test",
         opciones: "cuatro",
         necesita: "texto legible",
         referencia: "gato.jpg",
         comercial: true,
       },
     });
     expect(r3.accion).toBeNull();
     expect(r3.problemas).toContain("Campo «opciones» no es un número.");

     // Descartar campos desconocidos
     const r4 = validarAccion({
       tipo: "imagen.generar",
       args: {
         prompt: "test",
         opciones: 4,
         necesita: "texto legible",
         referencia: "gato.jpg",
         comercial: true,
         extra: "should be discarded",
       },
     });
     expect(r4.accion?.args).toEqual({
       prompt: "test",
       opciones: 4,
       necesita: "texto legible",
       referencia: "gato.jpg",
       comercial: true,
     });
     expect(r4.problemas[0]).toContain("descartado");
   });
});

describe("deshacer", () => {
  it("navegar vuelve a la ruta anterior; widget añadido se quita", () => {
    expect(deshacer({ tipo: "navegar", args: { ruta: "/b" } }, { ruta: "/a" })).toEqual({ accion: { tipo: "navegar", args: { ruta: "/a" } } });
    expect(deshacer({ tipo: "widget.añadir", args: { tablero: "t", tipo: "reloj" } }, { idCreado: "w9" }))
      .toEqual({ accion: { tipo: "widget.quitar", args: { id: "w9" } } });
  });
  it("lo enviado se retira; lo de la computadora del bot es irreversible; el candidato no deja huella", () => {
    expect(deshacer({ tipo: "mensaje.enviar", args: {} }, { idEnviado: "m1" })).toEqual({ retirar: "m1" });
    expect("irreversible" in deshacer({ tipo: "computadora.ejecutar", args: {} }, {})).toBe(true);
    expect(deshacer({ tipo: "codigo.proponer", args: {} }, {})).toEqual({ nada: true });
  });
   it("sin el estado anterior lo dice en vez de inventar", () => {
     expect("irreversible" in deshacer({ tipo: "dashboard.editar", args: { tablero: "t", cambios: {} } }, {})).toBe(true);
     expect(deshacer({ tipo: "dashboard.editar", args: { tablero: "t", cambios: { a: 1 } } }, { valor: { cambios: { a: 0 } } }))
       .toEqual({ accion: { tipo: "dashboard.editar", args: { tablero: "t", cambios: { a: 0 } } } });
   });

   it("la acción de generación de imagen no deja huella para deshacer", () => {
     expect(deshacer({ tipo: "imagen.generar", args: { prompt: "test" } }, {})).toEqual({ nada: true });
     // Incluso con previo, sigue siendo nada porque su deshacer es "nada"
     expect(deshacer({ tipo: "imagen.generar", args: { prompt: "test" }, any: "previo" }, { any: "previo" })).toEqual({ nada: true });
   });
});
