import { describe, expect, it } from "vitest";
import type { ManifiestoVersion } from "../manifiesto";
import { MOMENTO_LIBRE, UMBRAL_DESCARGA_GRANDE_BYTES, puedeAplicarAhora } from "../momento";
import {
  elegirCanaria, evaluarHumo, planificar, siguienteEstado, versionDeVueltaAtras, type NeuronaPlan,
} from "../planificador";
import { politicaPorDefecto } from "../politica";

const M: ManifiestoVersion = {
  sistema: "starseed-os", nivel: "meta", duenoId: "starseed-os", version: "2026.10.10", anterior: "2026.10.09",
  rama: "estable", capas: ["datos", "interfaz", "modelos"], requiere: { reinicio: [], recarga: true, reinstalar: false },
  tamanoBytes: 200 * 1024 * 1024, sha256: "b".repeat(64), notas: "", publicadoEn: "2026-10-10T00:00:00Z",
};

describe("momento", () => {
  it("prioridad: llamada antes que batería; datos se aplica en caliente igualmente", () => {
    const ctx = { ...MOMENTO_LIBRE, enLlamada: true, bateriaPct: 5 };
    expect(puedeAplicarAhora(ctx, 0, "interfaz")).toMatchObject({ ok: false, motivo: "llamada" });
    expect(puedeAplicarAhora(ctx, 0, "datos")).toEqual({ ok: true });
  });
  it("batería: < 20 % sin cargar espera; cargando o desconocida, no", () => {
    expect(puedeAplicarAhora({ ...MOMENTO_LIBRE, bateriaPct: 19 }, 0, "sw")).toMatchObject({ motivo: "bateria-baja" });
    expect(puedeAplicarAhora({ ...MOMENTO_LIBRE, bateriaPct: 20 }, 0, "sw")).toEqual({ ok: true });
    expect(puedeAplicarAhora({ ...MOMENTO_LIBRE, bateriaPct: 5, cargando: true }, 0, "sw")).toEqual({ ok: true });
  });
  it("descarga grande sin Wi-Fi espera salvo que se permitan datos; el límite exacto pasa", () => {
    const sinWifi = { ...MOMENTO_LIBRE, wifi: false };
    expect(puedeAplicarAhora(sinWifi, UMBRAL_DESCARGA_GRANDE_BYTES + 1, "modelos")).toMatchObject({ motivo: "espera-wifi" });
    expect(puedeAplicarAhora(sinWifi, UMBRAL_DESCARGA_GRANDE_BYTES, "modelos")).toEqual({ ok: true });
    expect(puedeAplicarAhora({ ...sinWifi, datosPermitidos: true }, 1e9, "modelos")).toEqual({ ok: true });
    expect(puedeAplicarAhora({ ...MOMENTO_LIBRE, wifi: null }, 1e9, "modelos")).toMatchObject({ motivo: "espera-wifi" });
  });
});

describe("canaria y humo", () => {
  it("la marcada si está en línea; si no, la más usada; empate por id", () => {
    expect(elegirCanaria([{ id: "b", online: true, usoReciente: 1, elegida: true }, { id: "a", online: true, usoReciente: 9 }])).toBe("b");
    expect(elegirCanaria([{ id: "b", online: false, usoReciente: 1, elegida: true }, { id: "a", online: true, usoReciente: 9 }])).toBe("a");
    expect(elegirCanaria([{ id: "z", online: true, usoReciente: 3 }, { id: "c", online: true, usoReciente: 3 }])).toBe("c");
    expect(elegirCanaria([{ id: "x", online: false, usoReciente: 3 }])).toBeNull();
  });
  it("el humo lista cada fallo", () => {
    expect(evaluarHumo({ paginaCarga: true, servicios: { voz: true } })).toEqual({ ok: true, fallos: [] });
    const r = evaluarHumo({ paginaCarga: false, servicios: { astraura: false, voz: true } });
    expect(r.ok).toBe(false);
    expect(r.fallos).toHaveLength(2);
  });
});

describe("estado del despliegue", () => {
  it("camino feliz y vuelta atrás", () => {
    let e = siguienteEstado("pendiente", { tipo: "aplicada-en-canaria" });
    expect(e).toBe("canaria");
    expect(siguienteEstado(e, { tipo: "humo", ok: true })).toBe("propagando");
    expect(siguienteEstado("propagando", { tipo: "propagada" })).toBe("hecho");
    e = siguienteEstado("canaria", { tipo: "humo", ok: false });
    expect(e).toBe("revirtiendo");
    expect(siguienteEstado(e, { tipo: "revertida" })).toBe("revertido");
  });
  it("un evento fuera de lugar no cambia nada", () => {
    expect(siguienteEstado("pendiente", { tipo: "propagada" })).toBe("pendiente");
    expect(siguienteEstado("hecho", { tipo: "humo", ok: false })).toBe("hecho");
    expect(siguienteEstado("revertido", { tipo: "aplicada-en-canaria" })).toBe("revertido");
  });
  it("vuelta atrás solo a una anterior declarada y menor", () => {
    expect(versionDeVueltaAtras(M)).toBe("2026.10.09");
    expect(versionDeVueltaAtras({ ...M, anterior: undefined })).toBeNull();
    expect(versionDeVueltaAtras({ ...M, anterior: "2026.10.11" })).toBeNull();
  });
});

describe("planificar", () => {
  const n = (id: string, o: Partial<NeuronaPlan> = {}): NeuronaPlan => ({
    id, nombre: id, online: true, versiones: {}, momento: { ...MOMENTO_LIBRE }, horaLocal: 12, ...o,
  });
  const pol = politicaPorDefecto("perfil"); // datos/interfaz auto, modelos manual

  it("antes del humo solo la canaria aplica; las demás esperan a la canaria", () => {
    const plan = planificar(M, [n("mac"), n("tablet")], pol, "canaria", "mac");
    expect(plan[0].esCanaria).toBe(true);
    expect(plan[0].acciones.map((a) => a.tipo)).toEqual(["aplicar", "aplicar", "avisar"]);
    expect(plan[1].acciones.every((a) => a.tipo === "esperar" && a.motivo === "canaria")).toBe(true);
  });

  it("propagando: la que no tiene el paquete lo pide por la malla a la que ya lo tiene", () => {
    const plan = planificar(M, [n("mac", { versiones: { datos: "2026.10.10", interfaz: "2026.10.10" } }), n("tablet")], pol, "propagando", "mac");
    expect(plan[0].acciones.map((a) => a.pendiente.capa)).toEqual(["modelos"]);
    const t = plan[1].acciones.filter((a) => a.tipo === "aplicar");
    expect(t.map((a) => (a.tipo === "aplicar" ? a.fuente : ""))).toEqual(["malla", "malla"]);
  });

  it("propagando: el momento manda (llamada) y lo que está fuera de línea espera", () => {
    const plan = planificar(M, [n("mac", { momento: { ...MOMENTO_LIBRE, enLlamada: true } }), n("tablet", { online: false })], pol, "propagando", "mac");
    const mac = plan[0].acciones;
    expect(mac[0]).toMatchObject({ tipo: "aplicar" }); // datos en caliente
    expect(mac[1]).toMatchObject({ tipo: "esperar", motivo: "llamada" });
    expect(plan[1].acciones.every((a) => a.tipo === "esperar" && a.motivo === "sin-conexion")).toBe(true);
  });

  it("tras fallar el humo, nadie aplica", () => {
    const plan = planificar(M, [n("mac"), n("tablet")], pol, "revirtiendo", "mac");
    expect(plan.flatMap((p) => p.acciones).every((a) => a.tipo === "esperar")).toBe(true);
  });

  it("modelos programados: fuera de la ventana esperan", () => {
    const os = politicaPorDefecto("os");
    const plan = planificar(M, [n("mac")], os, "propagando", "mac");
    expect(plan[0].acciones[2]).toMatchObject({ tipo: "esperar", motivo: "ventana" });
    const noche = planificar(M, [n("mac", { horaLocal: 4 })], os, "propagando", "mac");
    expect(noche[0].acciones[2]).toMatchObject({ tipo: "aplicar", fuente: "servidor" });
  });
});
