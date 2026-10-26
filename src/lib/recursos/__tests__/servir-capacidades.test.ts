import { describe, expect, it } from "vitest";
import { bytesUtf8, type Msg, type MsgFin, type MsgPedir, type TipoCapacidad } from "../../network/capacidad-por-malla";
import { crearServidor, prestablePara, type ManejadorCapacidad, type OpcionesServidor } from "../servir-capacidades";
import { crearSesion, revocar, type Sesion } from "../sesion-prestamo";
import type { OfertaNeurona } from "../oferta";

/** Vuelca los «then» de las promesas: dos pasos cubren la cadena manejador → fin. */
const vuelco = async (): Promise<void> => { await new Promise((r) => setTimeout(r, 0)); };

const relojT = { v: 1740000000000 };
const ahora = (): number => relojT.v;

const OFERTA: OfertaNeurona = {
  nodoId: "n1", cuentaId: "c1", medio: "mac",
  computo: { nucleos: 4, ramLibreMb: 4096, gpu: true, vramMb: 8192, motores: ["imagen", "voz", "oido", "palabra", "transcodificar"] },
  almacen: { prestaMb: 1024, volumenes: [] }, apps: [], enlaces: {},
  energia: { bateriaPct: 90, cargando: true, enUso: false },
  presta: { cuenta: true, grupos: [], publico: false, topes: { cpuPct: 50, ramMb: 2048, discoMb: 1024, soloCargando: false } },
  t: relojT.v,
};

/** Sesión de capacidad viva (~1 min) de `invitado`. */
const sesionDe = (invitado: string, alcanceTipo: "capacidad" | "app" = "capacidad"): Sesion =>
  crearSesion({ anfitrion: "n1", invitado, alcance: { tipo: alcanceTipo, id: "capacidad" }, duracionMs: 60_000, ahora: relojT.v });

const servidorDe = (manejadores: OpcionesServidor["manejadores"], sesiones: Sesion[] = [], extras: Partial<OpcionesServidor> = {}):
  { servidor: ReturnType<typeof crearServidor>; enviados: Array<{ msg: Msg; a: string }> } => {
  const enviados: Array<{ msg: Msg; a: string }> = [];
  const servidor = crearServidor({
    manejadores, oferta: OFERTA, sesiones, ahora, enviar: (msg, a) => { enviados.push({ msg, a }); return true; }, ...extras,
  });
  return { servidor, enviados };
};

/** `capacidad.pedir` listo para atender; id por defecto único por tipo e invitado. */
const pedir = (tipo: TipoCapacidad, de: string, sesionId?: string, id?: string): MsgPedir =>
  ({ t: "capacidad.pedir", id: id ?? "p" + tipo + "-" + de, tipo, cuerpo: { dato: 1 }, sesionId });

/** Lee el i-ésimo `capacidad.error` salido (rompe si no lo es). */
const errorDe = (enviados: Array<{ msg: Msg; a: string }>, i = 0): { estado: number; mensaje: string } => {
  const msg = enviados[i].msg;
  if (msg.t !== "capacidad.error") throw new Error("Se esperaba un `capacidad.error`.");
  return msg;
};

const colgados: Array<{ salir: () => void }> = [];
/** Manejador que corre y se queda esperando; despiértalo con `colgados[k].salir()`. */
const manejadorEspera: ManejadorCapacidad = () => new Promise<void>((salir) => colgados.push({ salir: () => salir() }));
/** Manejador que se queda esperando pero honra la señal de aborto rechazando. */
const manejadorAbortable: ManejadorCapacidad = (_cuerpo, { signal }) =>
  new Promise((_salir, rechazar) => { signal.addEventListener("abort", () => rechazar(new Error("AbortError")), { once: true }); });

describe("servir-capacidades", () => {
  it("`prestablePara` exige GPU para render, cómputo para buscar/construir y motor para lo demás", () => {
    expect(prestablePara("palabra", OFERTA)).toBe(true);
    expect(prestablePara("render", OFERTA)).toBe(true);
    expect(prestablePara("buscar", OFERTA)).toBe(true);
    const sinGpu: OfertaNeurona = { ...OFERTA, computo: { ...OFERTA.computo, gpu: false } };
    const sinComputo: OfertaNeurona = { ...OFERTA, computo: { ...OFERTA.computo, nucleos: 0, ramLibreMb: 0 } };
    expect(prestablePara("render", sinGpu)).toBe(false);
    expect(prestablePara("buscar", sinComputo)).toBe(false);
    expect(prestablePara("construir", sinComputo)).toBe(false);
    expect(prestablePara("imagen", { ...OFERTA, computo: { ...OFERTA.computo, motores: ["palabra"] } })).toBe(false);
  });

  it("exige sesión viva de capacidad del propio invitado; la muerta o revocada no entra al registro", () => {
    colgados.length = 0;
    const deApp = sesionDe("p1", "app"), deOtro = sesionDe("p2");
    const { servidor, enviados } = servidorDe({ palabra: manejadorEspera }, [deApp, deOtro]);
    servidor.atender(pedir("palabra", "p1"), "p1"); // falta id de sesión
    servidor.atender(pedir("palabra", "p1", "sx"), "p1"); // desconocida
    servidor.atender(pedir("palabra", "p1", deApp.id), "p1"); // alcance que no es de capacidad
    servidor.atender(pedir("palabra", "p1", deOtro.id), "p1"); // otro invitado
    expect(errorDe(enviados, 0).estado).toBe(403);
    expect(errorDe(enviados, 1).estado).toBe(404);
    expect(errorDe(enviados, 2).estado).toBe(403);
    expect(errorDe(enviados, 3).estado).toBe(403);
    expect(servidor.prestamos()).toEqual([]);
    const revocada = revocar(sesionDe("p1"));
    const { servidor: mudo, enviados: env2 } = servidorDe({ palabra: manejadorEspera }, [revocada]);
    mudo.atender(pedir("palabra", "p1", revocada.id), "p1");
    expect(errorDe(env2).estado).toBe(403);
    const vencida = sesionDe("p1"); relojT.v += 60_001; // ya venció al atender
    const { servidor: viejo, enviados: env3 } = servidorDe({ palabra: manejadorEspera }, [vencida]);
    viejo.atender(pedir("palabra", "p1", vencida.id), "p1");
    expect(errorDe(env3).estado).toBe(403);
  });

  it("aplica los topes de `capacidadPrestable` (503) y exige manejador local (501)", () => {
    const s = sesionDe("p1");
    const enUso: OfertaNeurona = { ...OFERTA, energia: { ...OFERTA.energia, enUso: true } };
    const { servidor, enviados } = servidorDe({ palabra: manejadorEspera }, [s], { oferta: enUso });
    servidor.atender(pedir("palabra", "p1", s.id), "p1");
    expect(errorDe(enviados).estado).toBe(503);
    const { servidor: normal, enviados: env2 } = servidorDe({ palabra: manejadorEspera }, [s]);
    normal.atender(pedir("render", "p1", s.id), "p1"); // prestable (gpu) pero sin manejador
    expect(errorDe(env2).estado).toBe(501);
  });

  it("corre el manejador, trocea su respuesta y la cierra en `fin`; cuenta los bytes", async () => {
    colgados.length = 0;
    const s1 = sesionDe("p1"), s2 = sesionDe("p2");
    const { servidor, enviados } = servidorDe({ palabra: async () => "abcde", imagen: async () => ({ ancho: 2 }) }, [s1, s2], { maxEnCurso: 2, trozoBytes: 2 });
    servidor.atender(pedir("palabra", "p1", s1.id), "p1");
    servidor.atender(pedir("imagen", "p2", s2.id), "p2"); // sin troceo: `fin` con la respuesta entera
    relojT.v += 5; await vuelco();
    expect(enviados.slice(0, 3).map((e) => (e.msg.t === "capacidad.trozo" ? e.msg.texto : ""))).toEqual(["ab", "cd", "e"]);
    const fin1 = enviados[3].msg as MsgFin, fin2 = enviados[4].msg as MsgFin;
    expect(fin1.resultado).toBe("abcde");
    expect(fin2.resultado).toEqual({ ancho: 2 });
    const [p1, p2] = servidor.prestamos();
    expect(p1).toMatchObject({ id: "ppalabra-p1", tipo: "palabra", invitado: "p1", estado: "hecho", bytes: 5, duracionMs: 5 });
    expect(p2).toMatchObject({ estado: "hecho", bytes: bytesUtf8(JSON.stringify({ ancho: 2 })) });
  });

  it("encola lo que desborda (429 con la cola llena) y arranca en orden al liberar", async () => {
    colgados.length = 0;
    const sesiones = ["p1", "p2", "p3", "p4", "p5"].map((n) => sesionDe(n));
    const { servidor, enviados } = servidorDe({ palabra: manejadorEspera }, sesiones, { maxEnCola: 2 });
    servidor.atender(pedir("palabra", "p1", sesiones[0].id), "p1"); await vuelco(); // p1 corre
    servidor.atender(pedir("palabra", "p2", sesiones[1].id), "p2"); servidor.atender(pedir("palabra", "p3", sesiones[2].id), "p3");
    servidor.atender(pedir("palabra", "p4", sesiones[3].id), "p4"); // cola llena (máx. 2)
    relojT.v += 7;
    expect(errorDe(enviados).estado).toBe(429);
    expect(servidor.prestamos().map((p) => p.estado)).toEqual(["en curso", "en cola", "en cola"]);
    expect(servidor.prestamos().map((p) => p.duracionMs)).toEqual([7, 7, 7]);
    colgados[0].salir(); await vuelco(); await vuelco();
    expect(servidor.prestamos().map((p) => p.estado)).toEqual(["hecho", "en curso", "en cola"]);
  });

  it("recomprueba la admisión al salir de la cola: si la sesión murió, va a `error`", async () => {
    colgados.length = 0;
    const s1 = sesionDe("p1"); const s2 = sesionDe("p2");
    const { servidor, enviados } = servidorDe({ palabra: manejadorEspera }, [s1, s2]);
    servidor.atender(pedir("palabra", "p1", s1.id, "q1"), "p1"); await vuelco();
    servidor.atender(pedir("palabra", "p2", s2.id, "q2"), "p2"); // en cola
    relojT.v += 120_000; // la sesión de p2 vence mientras espera
    colgados[0].salir(); await vuelco(); await vuelco();
    expect(errorDe(enviados, 1).estado).toBe(403); // [0] fue el `fin` de p1; [1] es el rechazo de p2
    expect(servidor.prestamos().map((p) => p.estado)).toEqual(["hecho", "error"]);
  });

  it("cancelar aborta lo corriendo (499) y expulsa lo de la cola", async () => {
    colgados.length = 0;
    const s1 = sesionDe("p1"); const s2 = sesionDe("p2");
    const { servidor, enviados } = servidorDe({ imagen: manejadorAbortable, palabra: manejadorEspera }, [s1, s2]);
    servidor.atender(pedir("imagen", "p1", s1.id, "q1"), "p1"); await vuelco();
    servidor.atender(pedir("palabra", "p2", s2.id, "q2"), "p2"); // queda en cola
    servidor.atender({ t: "capacidad.cancelar", id: "q2" }, "p2"); // expulsa de la cola
    expect(servidor.prestamos().map((p) => p.estado)).toEqual(["en curso", "cancelado"]);
    servidor.atender({ t: "capacidad.cancelar", id: "q1" }, "p1"); // aborta el corriendo
    await vuelco(); await vuelco();
    expect(errorDe(enviados).estado).toBe(499);
    expect(errorDe(enviados).mensaje).toBe("AbortError");
    expect(servidor.prestamos().map((p) => p.estado)).toEqual(["cancelado", "cancelado"]);
  });
});
