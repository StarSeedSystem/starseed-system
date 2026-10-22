/**
 * Medios efectivos de un cerebro: su servidor vivo (neuronas, servidores, almacenes y vecinos).
 *
 * Contrato: architecture/apps-en-la-malla.md §2 y §12. Módulo PURO: sin red, disco, procesos ni reloj.
 * Lo privado nunca sale de la cuenta ni va a vecinos públicos ni a la nube compartida.
 */
import type { LinkedServer } from "../brains/servers";
import { linkedServerToOfertaNeurona } from "../recursos/adaptadores";
import { capacidadPrestable, ofertaVisiblePara, type OfertaNeurona } from "../recursos/oferta";

export type Oferta = OfertaNeurona;

/** Almacén declarado (carpeta vinculada, servicio, Drive…). `tipo` es el kind del backend. */
export interface AlmacenDeclarado { id: string; tipo: string; libreMb?: number }

export interface EntradaAlmacenamiento { id: string; tipo: string; libreMb?: number; real: boolean }

export interface EntradaMedios {
  cerebro: { id: string; cuentaId: string; grupos: string[]; almacenamiento: string[] };
  servidoresEnlazados: LinkedServer[];
  ofertas: Oferta[];
  almacenes: AlmacenDeclarado[];
  vecinos: Oferta[];
  privado: boolean;
  /** Kinds con driver de escritura real (espejo de REAL_DRIVER_KINDS de storage/backends). */
  driversReales?: string[];
}

export interface MediosEfectivos {
  computo: Oferta[];
  almacenamiento: EntradaAlmacenamiento[];
  motivoPorFuente: Record<string, string>;
}

const DRIVERS_REALES = ["starseed", "gcs", "gdrive"];

/** Une todo lo que el cerebro puede usar ahora, aplicando privacidad y marcando qué es real. */
export function mediosEfectivos(e: EntradaMedios): MediosEfectivos {
  const reales = e.driversReales ?? DRIVERS_REALES;
  const motivo: Record<string, string> = {};
  const computo: Oferta[] = [];
  const almacenamiento: EntradaAlmacenamiento[] = [];
  const quien = { cuentaId: e.cerebro.cuentaId, grupos: e.cerebro.grupos };
  const elegidos = e.cerebro.almacenamiento;
  const soloElegidos = elegidos.length > 0 && !elegidos.includes("auto");

  const sumarAlmacen = (id: string, tipo: string, libreMb?: number) => {
    if (almacenamiento.some((a) => a.id === id)) return;
    if (soloElegidos && !elegidos.includes(id)) { motivo[id] = "No está entre los almacenes elegidos para este cerebro."; return; }
    const real = reales.includes(tipo);
    almacenamiento.push({ id, tipo, libreMb, real });
    motivo[id] = real ? "Almacén con escritura real." : "Solo declarado: aún no tiene driver de escritura.";
  };

  const sumarNeurona = (o: Oferta, esVecino: boolean) => {
    const propia = o.cuentaId === e.cerebro.cuentaId;
    if (e.privado && (esVecino || !propia)) { motivo[o.nodoId] = "Cerebro privado: solo neuronas de la misma cuenta."; return; }
    const visible = ofertaVisiblePara(o, quien);
    if (!visible) { motivo[o.nodoId] = "No presta a esta cuenta ni a sus grupos."; return; }
    const p = capacidadPrestable(visible);
    if (p.computo.nucleos > 0 && p.computo.ramLibreMb > 0) {
      if (!computo.some((c) => c.nodoId === p.nodoId)) computo.push(p);
      motivo[o.nodoId] = esVecino ? "Vecino de la malla que presta cómputo." : "Neurona con cómputo prestable ahora.";
    } else motivo[o.nodoId] = "Sin cómputo prestable ahora (topes, batería, uso u horario).";
    if (p.almacen.prestaMb > 0) sumarAlmacen(`neurona:${o.nodoId}`, "neurona", p.almacen.prestaMb);
  };

  for (const s of e.servidoresEnlazados) {
    const rol = s.link.role;
    if (e.privado && s.shared) { motivo[s.id] = "Cerebro privado: no usa servidores compartidos."; continue; }
    if (s.status === "error" || s.status === "pausado") { motivo[s.id] = `Servidor ${s.status}: no se usa.`; continue; }
    if (rol === "compute" || rol === "primary") {
      const o = linkedServerToOfertaNeurona(s);
      const ya = computo.some((c) => c.nodoId === o.nodoId);
      if (!ya && o.computo.nucleos > 0) computo.push(o);
    }
    if (["storage", "primary", "replica", "sync"].includes(String(rol))) sumarAlmacen(s.id, s.kind);
    motivo[s.id] = `Servidor enlazado con papel ${rol}.`;
  }
  for (const o of e.ofertas) sumarNeurona(o, false);
  for (const o of e.vecinos) sumarNeurona(o, true);
  for (const a of e.almacenes) sumarAlmacen(a.id, a.tipo, a.libreMb);
  return { computo, almacenamiento, motivoPorFuente: motivo };
}
