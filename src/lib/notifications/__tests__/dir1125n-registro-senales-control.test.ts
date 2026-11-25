/** DIR1125N · el registro de señales y control: qué deja en el Centro de notificaciones y con qué topes. */
import { describe, expect, it } from "vitest";
import {
  APP_SENALES,
  RUTA_CONTROL,
  VENTANA_FALLOS_MS,
  VENTANA_LLEGADAS_MS,
  crearRegistroSenalesControl,
  type DepsRegistro,
} from "@/lib/notifications/registro-senales-control";

function fuente<T>(inicial: T[] = []) {
  let datos = inicial;
  const oyentes = new Set<() => void>();
  return {
    leer: () => datos,
    suscribir: (cb: () => void) => {
      oyentes.add(cb);
      return () => oyentes.delete(cb);
    },
    poner(nuevos: T[]) {
      datos = nuevos;
      for (const o of oyentes) o();
    },
    oyentes,
  };
}

function montar(inicial: { bandeja?: unknown[] } = {}) {
  let t = 1_000_000;
  const avisos: Array<Record<string, unknown>> = [];
  const bandeja = fuente<any>((inicial.bandeja as any[]) ?? []);
  const sesiones = fuente<any>();
  const peticiones = fuente<any>();
  const fallos = fuente<any>();
  const deps: DepsRegistro = {
    notificar: (n) => void avisos.push(n as unknown as Record<string, unknown>),
    ahora: () => t,
    bandeja,
    sesiones,
    peticiones,
    fallos,
    fraseFallo: (nombre, f) => `${f.lana} con ${nombre}: falló (${f.motivo})`,
  };
  const desmontar = crearRegistroSenalesControl(deps);
  return { avisos, bandeja, sesiones, peticiones, fallos, desmontar, pasar: (ms: number) => void (t += ms) };
}

const llegada = (id: string, type = "message", body: unknown = { text: "hola" }) => ({ id, type, cls: "P2", body, at: 1, verified: true });

describe("DIR1125N · registro de señales y control", () => {
  it("lo que ya estaba en la bandeja al montar no se repite; lo nuevo sí, como «Señales» y sin ventana emergente", () => {
    const m = montar({ bandeja: [llegada("viejo")] });
    m.bandeja.poner([llegada("a1"), llegada("viejo")]);
    expect(m.avisos).toHaveLength(1);
    expect(m.avisos[0]).toMatchObject({ appId: APP_SENALES, title: "Mensaje de otra neurona", popup: false });
    expect(String(m.avisos[0].body)).toContain("hola");
  });

  it("por tipo, una entrada cada 10 min que dice cuántas llegaron; la presencia no se apunta", () => {
    const m = montar();
    m.bandeja.poner([llegada("a1")]);
    m.bandeja.poner([llegada("p1", "presence"), llegada("a3"), llegada("a2"), llegada("a1")]);
    expect(m.avisos).toHaveLength(1);
    m.pasar(VENTANA_LLEGADAS_MS);
    m.bandeja.poner([llegada("a4"), llegada("p1", "presence"), llegada("a3"), llegada("a2"), llegada("a1")]);
    expect(m.avisos).toHaveLength(2);
    expect(m.avisos[1].title).toBe("3 mensajes de otras neuronas");
    m.bandeja.poner([llegada("b1", "alert"), llegada("a4")]);
    expect(m.avisos).toHaveLength(3);
    expect(m.avisos[2]).toMatchObject({ title: "Alerta de otra neurona", level: "warning" });
  });

  it("sesiones de control: avisa al abrirse y al terminar", () => {
    const m = montar();
    m.sesiones.poner([{ para: "abcdef1234567", token: "tok12345678", nivel: "controlar", ultima: 1, fuertes: 0 }]);
    m.sesiones.poner([]);
    expect(m.avisos.map((a) => a.title)).toEqual(["Sesión de control abierta", "Sesión de control terminada"]);
    expect(m.avisos[0]).toMatchObject({ popup: false, actions: [{ href: RUTA_CONTROL }] });
    expect(String(m.avisos[0].body)).toContain("abcdef12");
  });

  it("peticiones de control: una entrada por petición y estado, con su texto y su botón", () => {
    const m = montar();
    const p = { id: "p1", titulo: "Maggabook pide controlar esta neurona", cuerpo: "Código 1234", estado: "pendiente", boton: "Abrir el ajuste", ruta: RUTA_CONTROL };
    m.peticiones.poner([p]);
    m.peticiones.poner([p]);
    m.peticiones.poner([{ ...p, estado: "abierta", titulo: "Maggabook controla esta neurona" }]);
    expect(m.avisos.map((a) => a.title)).toEqual(["Maggabook pide controlar esta neurona", "Maggabook controla esta neurona"]);
    expect(m.avisos[0]).toMatchObject({ level: "warning", popup: false, actions: [{ label: "Abrir el ajuste", href: RUTA_CONTROL }] });
  });

  it("fallos de enlace: uno por pareja y carril cada hora", () => {
    const m = montar();
    const f = { otra: "neurona-b-123456", lana: "wifi-direct", motivo: "sin permiso", veces: 1, at: 5, hasta: 9 };
    m.fallos.poner([f]);
    m.fallos.poner([{ ...f, veces: 2, at: 6 }]);
    expect(m.avisos).toHaveLength(1);
    expect(String(m.avisos[0].body)).toBe("wifi-direct con neurona-: falló (sin permiso). Se reintenta solo.");
    m.pasar(VENTANA_FALLOS_MS);
    m.fallos.poner([{ ...f, veces: 3, at: 7 }]);
    expect(m.avisos).toHaveLength(2);
  });

  it("al desmontar quita todas las suscripciones", () => {
    const m = montar();
    for (const x of [m.bandeja, m.sesiones, m.peticiones, m.fallos]) expect(x.oyentes.size).toBe(1);
    m.desmontar();
    for (const x of [m.bandeja, m.sesiones, m.peticiones, m.fallos]) expect(x.oyentes.size).toBe(0);
  });

  it("un aviso que falla no para el registro", () => {
    let n = 0;
    const b = fuente<any>();
    crearRegistroSenalesControl({
      notificar: () => {
        n++;
        throw new Error("roto");
      },
      ahora: () => 0,
      bandeja: b,
      sesiones: fuente<any>(),
      peticiones: fuente<any>(),
      fallos: fuente<any>(),
      fraseFallo: () => "",
    });
    b.poner([llegada("x1", "post")]);
    b.poner([llegada("x2", "alert"), llegada("x1", "post")]);
    expect(n).toBe(2);
  });
});
