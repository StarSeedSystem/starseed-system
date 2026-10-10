import { describe, expect, it, vi } from "vitest";
import type { EstadoAntena, EstadoAntenas, EstadoFondo } from "../tipos";
import { ejecutarAccion, fondoFunciona, vistaAntenas } from "../vista-antenas";
import { crearPuente } from "../puente";

const antena = (id: string, nombre: string, estado: EstadoAntena["estado"], motivo = "m", detalle: string[] = []): EstadoAntena => ({
  id,
  nombre,
  estado,
  motivo,
  segundo_plano: id !== "bluetooth",
  detalle,
});

function estado(parcial: Partial<EstadoAntenas> = {}): EstadoAntenas {
  return {
    medido_ms: 1,
    plataforma: "android",
    guardian_activo: true,
    app_en_segundo_plano: false,
    antenas: [
      antena("wifi-local", "Wi-Fi local", "viva", "Anunciando y escuchando"),
      antena("lora", "LoRa · Meshtastic", "detectada", "Radio USB enchufada", ["/dev/ttyACM0"]),
      antena("bluetooth", "Bluetooth", "no-disponible", "Llega con el plugin Kotlin"),
      antena("reticulum", "Reticulum", "no-disponible", "No está instalado"),
      antena("internet", "Internet", "viva", "Hay salida"),
    ],
    vecinos: [],
    otras_cerca: 0,
    ...parcial,
  };
}

const fondoAndroid = (servicio: Partial<NonNullable<EstadoFondo["servicio"]>> | null, activo = true): EstadoFondo => ({
  plataforma: "android",
  disponible: true,
  activo,
  al_cerrar: "texto del aparato",
  oculta: false,
  arranque_con_sistema: true,
  servicio: servicio && { vivo: false, motivo: "", desde_ms: 0, sdk: 34, bateria_exenta: false, notificaciones: false, ...servicio },
});

describe("vista de antenas", () => {
  it("sin guardián no hay ni un verde: todo sin medir", () => {
    const v = vistaAntenas(null, null);
    expect(v.sinMedir).toBe(true);
    expect(v.titular).toBe("Antenas sin medir");
    expect(v.filas.every((f) => f.tono !== "vivo")).toBe(true);
    expect(v.filas[0].accion?.id).toBe("medir");
  });

  it("cuenta solo lo vivo y dice si sigue con la app cerrada", () => {
    const conServicio = vistaAntenas(estado(), fondoAndroid({ vivo: true, notificaciones: true, bateria_exenta: true }));
    expect(conServicio.titular).toBe("2 antenas vivas · siguen con la app cerrada");
    expect(conServicio.tono).toBe("vivo");
    const sinServicio = vistaAntenas(estado(), fondoAndroid({ vivo: false }));
    expect(sinServicio.titular).toBe("2 antenas vivas · se apagan al cerrar la app");
    expect(sinServicio.tono).toBe("atento");
  });

  it("cada antena que no está viva dice su motivo y su acción concreta", () => {
    const v = vistaAntenas(estado(), null);
    const lora = v.filas.find((f) => f.id === "lora");
    expect(lora?.estadoTexto).toBe("Detectada");
    expect(lora?.accion).toMatchObject({ id: "abrir-radio", dato: "/dev/ttyACM0" });
    expect(v.filas.find((f) => f.id === "bluetooth")?.conAppCerrada).toBe("Solo con la app abierta");
    expect(v.filas.find((f) => f.id === "reticulum")?.accion?.id).toBe("como-reticulum");
    expect(v.filas.map((f) => f.icono)).toEqual(["Wifi", "RadioTower", "Bluetooth", "Network", "Globe"]);
  });

  it("el faro anónimo ofrece reconocer mis neuronas", () => {
    const e = estado();
    e.antenas[0] = antena("wifi-local", "Wi-Fi local", "viva", "Anunciando (anónimo: falta la clave de faro de tu cuenta).");
    expect(vistaAntenas(e, null).filas[0].accion?.id).toBe("vincular-cuenta");
  });

  it("Android: pide notificaciones y batería solo si faltan, en ese orden", () => {
    const faltan = vistaAntenas(estado(), fondoAndroid({ vivo: true, notificaciones: false, bateria_exenta: false }));
    expect(faltan.fondo.acciones.map((a) => a.id)).toEqual(["conceder-notificaciones", "excluir-bateria"]);
    const todo = vistaAntenas(estado(), fondoAndroid({ vivo: true, notificaciones: true, bateria_exenta: true }));
    expect(todo.fondo.acciones).toEqual([]);
    const apagado = vistaAntenas(estado(), fondoAndroid({ vivo: false }, false));
    expect(apagado.fondo.acciones.map((a) => a.id)).toEqual(["encender-fondo"]);
  });

  it("vecinos: los de mi cuenta y los demás solo contados", () => {
    const e = estado({
      vecinos: [
        { ip: "192.168.1.5", tipo: "escritorio", propia: true, neurona: "mac", puerto_servicio: 0, nas: true, lora: false, segundo_plano: false, visto_hace_s: 4 },
      ],
      otras_cerca: 3,
    });
    expect(vistaAntenas(e, null).vecinos.texto).toBe("1 neurona tuya en esta red · 3 de otras cuentas cerca (solo se cuentan)");
  });

  it("fondoFunciona: escritorio basta con encendido; Android exige el servicio vivo", () => {
    expect(fondoFunciona({ ...fondoAndroid(null), plataforma: "macos" })).toBe(true);
    expect(fondoFunciona(fondoAndroid(null))).toBe(false);
    expect(fondoFunciona(null)).toBe(false);
  });

  it("las acciones llaman al comando que toca", async () => {
    const invoke = vi.fn(async (_cmd: string, _args?: Record<string, unknown>) => ({}));
    const p = crearPuente({ core: { invoke } });
    await ejecutarAccion({ id: "excluir-bateria", etiqueta: "", explicacion: "" }, p);
    await ejecutarAccion({ id: "conceder-notificaciones", etiqueta: "", explicacion: "" }, p);
    await ejecutarAccion({ id: "abrir-radio", etiqueta: "", explicacion: "", dato: "/dev/cu.usbmodem1" }, p);
    expect(invoke.mock.calls.map((c) => c[0])).toEqual(["fondo_pedir_bateria", "plugin:notification|request_permission", "serie_abrir"]);
    const sinSesion = await ejecutarAccion({ id: "vincular-cuenta", etiqueta: "", explicacion: "" }, p);
    expect(sinSesion.ok).toBe(false);
  });
});
