import type { EstadoRecursosIa } from "./tipos";
import { OfertaNeurona } from "../recursos/oferta";

/**
 * Construye una OfertaNeurona a partir de un estado de recursos IA.
 * La implementación es sencilla y solo usa la información contenida en el
 * estado: se acumula el espacio reservado por cada asignación y se determina
 * la visibilidad a partir de la topología.  Este algoritmo es pura/definible.
 */
export function ofertaDesdeAsignaciones(e: EstadoRecursosIa): OfertaNeurona {
  const nodoId = "neurona";
  const cuentaId = "cuenta";
  // Accumula storage
  let totalStorage = 0;
  const volumes: string[] = [];
  for (const a of Object.values(e.asignaciones)) {
    const tam = typeof a.elemento.tamanoGb === "number" ? a.elemento.tamanoGb : 0;
    totalStorage += tam;
    if (tam > 0 && !volumes.includes(a.almacenEn)) volumes.push(a.almacenEn);
  }

  // Visibilidad
  let cuenta = false;
  const grupos: string[] = [];
  let publico = false;
  for (const t of Object.values(e.topologias)) {
    if (t.topologia === "servidor-propio") {
      cuenta = true;
    }
    if (t.acceso?.tipo === "grupo" && t.acceso.id) grupos.push(t.acceso.id);
    if (t.acceso?.tipo === "comunidad" && t.acceso.id) grupos.push(t.acceso.id);
    if (t.acceso?.tipo === "publica") publico = true;
  }

  const oferta: OfertaNeurona = {
    nodoId,
    cuentaId,
    medio: "nucleo-local",
    computo: {
      nucleos: 1,
      ramLibreMb: 0,
      gpu: false,
      vramMb: undefined,
      motores: [],
    },
    almacen: { prestaMb: totalStorage, volumenes: volumes },
    apps: [],
    enlaces: { subidaKbps: undefined, bajadaKbps: undefined, latenciaMs: undefined },
    energia: { bateriaPct: undefined, cargando: false, enUso: false },
    presta: {
      cuenta,
      grupos,
      publico,
      topes: { cpuPct: 0, ramMb: 0, discoMb: 0, horas: undefined, soloCargando: false },
    },
    t: Date.now(),
  };
  return oferta;
}
