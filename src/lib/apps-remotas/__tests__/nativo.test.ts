// (SEG1111T) El anfitrión con la sesión NATIVA de préstamo. El doble de Rust de abajo responde con los
// mismos códigos `prestamo:…` que `prestamo_ventana_logica.rs` (cuyas pruebas en Rust demuestran los
// rechazos de verdad); aquí se prueba que la web empieza por el diálogo nativo, manda el token y la
// ventana justos y PARA ante cada rechazo que cierra la sesión.
import { describe, it, expect } from "vitest";
import { crearSesion, type Sesion } from "../../recursos/sesion-prestamo";
import { crearAnfitrion, type DepsAnfitrion } from "../anfitrion";
import {
  codigoPrestamo, crearCapturaNativa, dejarDePrestar, esRechazoQueCierra, pedirPrestamo, RechazoPrestamo,
  type Invocar, type SesionNativa,
} from "../nativo";

const WEB = "https://starseed-os.vercel.app";

/** Doble mínimo del lado nativo: una sesión, su token, su origen, sus ventanas y cómo terminó. */
function rustFalso(opciones: { respuestaDialogo?: boolean } = {}) {
  let sesion: { token: string; origen: string; ventanas: number[] } | null = null;
  let ultima: { token: string; motivo: "parada" | "caducada" } | null = null;
  let origen = WEB;
  const llamadas: { comando: string; args?: Record<string, unknown> }[] = [];
  let n = 0;
  const invocar: Invocar = async (comando, args) => {
    llamadas.push({ comando, args });
    if (comando === "prestamo_ventana_iniciar") {
      if (origen !== WEB) throw "prestamo:origen-no-permitido · esta página no puede pedir prestar ventanas";
      if (opciones.respuestaDialogo === false) throw "prestamo:espera · se dijo que no hace poco; se podrá volver a pedir en 30 s";
      sesion = { token: `tok-${++n}`, origen, ventanas: [7] };
      return { token: sesion.token, ventanas: [{ id: 7, app_name: "Editor", title: "doc" }], inactividad_ms: 120_000, duracion_max_ms: 3_600_000 } satisfies SesionNativa;
    }
    if (comando === "prestamo_ventana_parar") {
      if (sesion) ultima = { token: sesion.token, motivo: "parada" };
      sesion = null;
      return undefined;
    }
    const token = String(args?.token ?? "");
    if (!sesion) {
      if (ultima && ultima.token === token) throw `prestamo:${ultima.motivo} · terminó`;
      throw "prestamo:sin-sesion · no hay ninguna ventana prestada en este aparato";
    }
    if (token !== sesion.token) throw "prestamo:token · esta sesión de préstamo no es la abierta";
    if (origen !== sesion.origen) throw "prestamo:origen · la sesión se abrió desde otra página";
    if (!sesion.ventanas.includes(Number(args?.id))) throw "prestamo:ventana-ajena · esa ventana no está prestada";
    if (comando === "capturar_ventana") return "iVBORw0KGgo=";
    if (comando === "entrada_ventana") return undefined;
    throw new Error(`comando desconocido ${comando}`);
  };
  return {
    invocar, llamadas,
    caducar: () => { if (sesion) ultima = { token: sesion.token, motivo: "caducada" }; sesion = null; },
    navegarA: (o: string) => { origen = o; },
  };
}

function montar(rust: ReturnType<typeof rustFalso>, nativa: SesionNativa | null, ventana = "7") {
  const ahora = 1_000;
  const web: Sesion = crearSesion({ anfitrion: "ana", invitado: "bea", alcance: { tipo: "app", id: "editor" }, duracionMs: 60_000, ahora }, () => "s1");
  const pistas: { parada: boolean }[] = [];
  const deps: DepsAnfitrion = {
    ventana,
    capturar: nativa ? crearCapturaNativa(rust.invocar, nativa) : async () => { throw "prestamo:sin-sesion · no hay ninguna ventana prestada en este aparato"; },
    dibujar: () => {},
    crearPista: () => { const p = { parada: false, stop() { p.parada = true; } }; pistas.push(p); return p; },
    sesion: () => web, fps: 30, anchoMax: 1280, reloj: () => ahora,
    sesionNativa: () => nativa !== null,
  };
  return { anfitrion: crearAnfitrion(deps), pistas, ahora };
}

describe("préstamo nativo · flujo legítimo", () => {
  it("empieza por el diálogo nativo y después captura y teclea con el token y la ventana de la sesión", async () => {
    const rust = rustFalso();
    const sesion = await pedirPrestamo(rust.invocar, { apps: ["Editor"], destino: "Maggaboard" });
    expect(rust.llamadas[0]).toEqual({ comando: "prestamo_ventana_iniciar", args: { apps: ["Editor"], ventanas: null, destino: "Maggaboard" } });
    const { anfitrion, ahora } = montar(rust, sesion);
    expect(anfitrion.arrancar(ahora).transmitiendo).toBe(true);
    expect(await anfitrion.paso(ahora)).toBe(true);
    expect(rust.llamadas.at(-1)).toEqual({ comando: "capturar_ventana", args: { token: "tok-1", id: 7, anchoMax: 1280 } });
    expect(await anfitrion.entrada({ tipo: "raton", accion: "pulsar", x: 10.4, y: 20.6, boton: 0 }, ahora)).toBe(true);
    expect(rust.llamadas.at(-1)?.args).toEqual({ token: "tok-1", id: 7, tipo: "click", x: 10, y: 21, texto: null });
    expect(await anfitrion.entrada({ tipo: "teclado", accion: "pulsar", tecla: "a" }, ahora)).toBe(true);
    expect(rust.llamadas.at(-1)?.args).toMatchObject({ tipo: "texto", texto: "a" });
  });

  it("sin sesión nativa el anfitrión ni arranca", () => {
    const { anfitrion, ahora, pistas } = montar(rustFalso(), null);
    expect(anfitrion.arrancar(ahora).transmitiendo).toBe(false);
    expect(pistas).toHaveLength(0);
  });

  it("si la persona dice que no, no hay sesión y el error lleva su código", async () => {
    const rust = rustFalso({ respuestaDialogo: false });
    const e = await pedirPrestamo(rust.invocar, { apps: ["Editor"], destino: "x" }).catch((x) => x);
    expect(e).toBeInstanceOf(RechazoPrestamo);
    expect(codigoPrestamo(e)).toBe("espera");
    expect(esRechazoQueCierra(e)).toBe(false);
  });
});

describe("préstamo nativo · rechazos", () => {
  it("sin sesión: Rust dice sin-sesion y el anfitrión para", async () => {
    const rust = rustFalso();
    const falsa: SesionNativa = { token: "inventado", ventanas: [{ id: 7, app_name: "Editor", title: "" }], inactividad_ms: 0, duracion_max_ms: 0 };
    const { anfitrion, ahora, pistas } = montar(rust, falsa);
    anfitrion.arrancar(ahora);
    expect(await anfitrion.paso(ahora)).toBe(false);
    expect(pistas[0].parada).toBe(true);
    expect(anfitrion.estado(ahora).transmitiendo).toBe(false);
  });

  it("ventana ajena: ni se llama a Rust, y Rust también la rechazaría", async () => {
    const rust = rustFalso();
    const sesion = await pedirPrestamo(rust.invocar, { apps: ["Editor"], destino: "x" });
    const capturar = crearCapturaNativa(rust.invocar, sesion);
    const antes = rust.llamadas.length;
    const e = await capturar({ comando: "capturar_ventana", ventana: "8", ancho: 10, alto: 10, fps: 1 }).catch((x) => x);
    expect(codigoPrestamo(e)).toBe("ventana-ajena");
    expect(rust.llamadas.length).toBe(antes);
    const directo = await rust.invocar("capturar_ventana", { token: sesion.token, id: 8, anchoMax: 10 }).catch((x) => x);
    expect(codigoPrestamo(directo)).toBe("ventana-ajena");
  });

  it("sesión caducada en Rust (inactividad, hora, reposo, bloqueo): el anfitrión para", async () => {
    const rust = rustFalso();
    const sesion = await pedirPrestamo(rust.invocar, { apps: ["Editor"], destino: "x" });
    const { anfitrion, ahora, pistas } = montar(rust, sesion);
    anfitrion.arrancar(ahora);
    rust.caducar();
    expect(await anfitrion.paso(ahora)).toBe(false);
    expect(pistas[0].parada).toBe(true);
    expect(await anfitrion.entrada({ tipo: "teclado", accion: "pulsar", tecla: "a" }, ahora)).toBe(false);
  });

  it("sesión parada (desde la barra de menús o con dejarDePrestar): el anfitrión para", async () => {
    const rust = rustFalso();
    const sesion = await pedirPrestamo(rust.invocar, { apps: ["Editor"], destino: "x" });
    const { anfitrion, ahora, pistas } = montar(rust, sesion);
    anfitrion.arrancar(ahora);
    await dejarDePrestar(rust.invocar);
    expect(await anfitrion.entrada({ tipo: "raton", accion: "pulsar", x: 1, y: 1 }, ahora)).toBe(false);
    expect(pistas[0].parada).toBe(true);
    const e = await rust.invocar("capturar_ventana", { token: sesion.token, id: 7, anchoMax: 10 }).catch((x) => x);
    expect(codigoPrestamo(e)).toBe("parada");
  });

  it("segundo origen: la página navegó a otra web y Rust rechaza el token bueno", async () => {
    const rust = rustFalso();
    const sesion = await pedirPrestamo(rust.invocar, { apps: ["Editor"], destino: "x" });
    const { anfitrion, ahora, pistas } = montar(rust, sesion);
    anfitrion.arrancar(ahora);
    rust.navegarA("https://starseed-nexus.vercel.app");
    expect(await anfitrion.paso(ahora)).toBe(false);
    expect(pistas[0].parada).toBe(true);
    const e = await pedirPrestamo(rust.invocar, { apps: ["Editor"], destino: "x" }).catch((x) => x);
    expect(codigoPrestamo(e)).toBe("origen-no-permitido");
  });

  it("un error que no es de préstamo no se traga: sube", async () => {
    const sesion: SesionNativa = { token: "t", ventanas: [{ id: 7, app_name: "E", title: "" }], inactividad_ms: 0, duracion_max_ms: 0 };
    const rota: Invocar = async () => { throw new Error("No se pudo capturar la ventana: fallo del sistema"); };
    const { anfitrion, ahora } = montar({ ...rustFalso(), invocar: rota }, sesion);
    const deps = crearCapturaNativa(rota, sesion);
    await expect(deps({ comando: "capturar_ventana", ventana: "7", ancho: 1, alto: 1, fps: 1 })).rejects.toThrow("fallo del sistema");
    anfitrion.arrancar(ahora);
    await expect(anfitrion.paso(ahora)).rejects.toThrow("fallo del sistema");
  });

  it("entradas que Rust no admite no se mandan", async () => {
    const rust = rustFalso();
    const sesion = await pedirPrestamo(rust.invocar, { apps: ["Editor"], destino: "x" });
    const capturar = crearCapturaNativa(rust.invocar, sesion);
    const antes = rust.llamadas.length;
    expect(await capturar({ comando: "entrada_ventana", ventana: "7", entrada: { tipo: "raton", accion: "mover", x: 1, y: 1 } })).toEqual({ aceptada: false });
    expect(await capturar({ comando: "entrada_ventana", ventana: "7", entrada: { tipo: "teclado", accion: "pulsar", tecla: "Enter" } })).toEqual({ aceptada: false });
    expect(rust.llamadas.length).toBe(antes);
  });
});
