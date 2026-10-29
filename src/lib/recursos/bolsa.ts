// Bolsa pura (§4 apps-en-la-malla.md): empareja peticiones y ofertas.
import { OfertaNeurona, capacidadPrestable, ofertaVisiblePara } from "./oferta";
import { armarArbol } from "./arbol-relevo";

export type ClaseParte = "computo" | "bytes" | "ventana" | "relevo";

export interface NecesidadesParte {
  ramMb?: number; gpu?: boolean; motor?: string; appId?: string; volumen?: number; kbps?: number;
}
export interface PartePeticion { clase: ClaseParte; necesita: NecesidadesParte; latenciaMaxMs?: number; }
export interface ContextoPeticion { tipo: "cuenta" | "grupo" | "comunidad" | "publicacion" | "estacion"; id: string; privado: boolean; }
export interface PeticionBolsa { id: string; contexto: ContextoPeticion; partes: PartePeticion[]; }
export interface ResultadoParte { destino: string; fuentes?: string[]; enlace?: string; respaldo?: string; motivo: string; }
export interface SueloPlan { destino: "local" | "nube"; motivo: string; falta: string[]; }
export interface ResultadoPlanificacion { porParte: Record<string, ResultadoParte[]>; suelo?: SueloPlan; }
export interface ReglasBolsa { latenciaMaxMs?: number; permitirNubePublico?: boolean; umbralBateria?: number; }

export function planificar(peticion: PeticionBolsa, ofertas: OfertaNeurona[], reglas: ReglasBolsa = {}): ResultadoPlanificacion {
  const porParte: Record<string, ResultadoParte[]> = {};
  const sueloFaltas: string[] = [];
  for (const parte of peticion.partes) {
    const resultados: ResultadoParte[] = [];
    const grupos = peticion.contexto.tipo === "grupo" ? [peticion.contexto.id] : [];
    const visibles = ofertas.map(o => ({ o, v: ofertaVisiblePara(o, { cuentaId: peticion.contexto.id, grupos }) }))
      .filter((x): x is { o: OfertaNeurona; v: OfertaNeurona } => x.v !== null);
    const conCap = visibles.map(({ v }) => ({ oferta: v, prestable: capacidadPrestable(v) }));
    const latMax = parte.latenciaMaxMs ?? reglas.latenciaMaxMs;
    const conLat = latMax !== undefined
      ? conCap.filter(({ prestable }) => prestable.enlaces.latenciaMs !== undefined && Object.values(prestable.enlaces.latenciaMs).some(l => l <= latMax))
      : conCap;
    const conEnergia = conLat.filter(({ prestable }) => prestable.computo.nucleos > 0 || prestable.almacen.prestaMb > 0);
    const conCapParte = conEnergia.filter(({ prestable }) => {
      switch (parte.clase) {
        case "computo": return prestable.computo.ramLibreMb >= (parte.necesita.ramMb ?? 0) && (parte.necesita.gpu ? prestable.computo.gpu === true : true) && prestable.computo.nucleos >= Math.ceil((parte.necesita.ramMb ?? 0) / 1024);
        case "bytes": return prestable.almacen.prestaMb >= (parte.necesita.volumen ?? 0);
        case "ventana": return prestable.computo.ramLibreMb >= (parte.necesita.ramMb ?? 512);
        case "relevo": return prestable.enlaces.subidaKbps !== undefined && prestable.enlaces.subidaKbps >= (parte.necesita.kbps ?? 1);
        default: return true;
      }
    });
    const conPriv = peticion.contexto.privado
      ? conCapParte.filter(({ oferta }) => (oferta.cuentaId === peticion.contexto.id && oferta.presta.cuenta === true) || (oferta.medio === "nube" && oferta.presta.cuenta === true && oferta.cuentaId === peticion.contexto.id))
      : conCapParte;
    // §10: para el reparto, la bolsa arma el árbol de relevo. Los que más subida
    // tienen quedan más cerca del origen y se eligen primero.
    const arbolRelevo = parte.clase === "relevo" && conPriv.length > 0
      ? armarArbol(
          peticion.contexto.id,
          conPriv.map(({ oferta, prestable }) => ({
            nodoId: oferta.nodoId,
            subidaKbps: prestable.enlaces.subidaKbps,
            latenciaMs: Math.min(...Object.values(prestable.enlaces.latenciaMs ?? {})),
          })),
          parte.necesita.kbps ?? 1,
        )
      : null;
    const nivelRelevo = (id: string) =>
      arbolRelevo?.nodos.get(id)?.profundidad ?? Number.POSITIVE_INFINITY;
    const orden = conPriv.sort((a, b) => {
      const nivelA = nivelRelevo(a.oferta.nodoId), nivelB = nivelRelevo(b.oferta.nodoId);
      if (nivelA !== nivelB) return nivelA - nivelB;
      const propioA = a.oferta.cuentaId === peticion.contexto.id ? 0 : 1;
      const propioB = b.oferta.cuentaId === peticion.contexto.id ? 0 : 1;
      if (propioA !== propioB) return propioA - propioB;
      const gratisA = !peticion.contexto.privado && a.oferta.presta.publico ? 0 : 1;
      const gratisB = !peticion.contexto.privado && b.oferta.presta.publico ? 0 : 1;
      if (gratisA !== gratisB) return gratisA - gratisB;
      return a.oferta.nodoId.localeCompare(b.oferta.nodoId);
    });
    const repartidas = orden.slice(0, Math.min(orden.length, 3)).map(({ oferta }) => ({ destino: oferta.nodoId, fuentes: [oferta.nodoId], motivo: `Oferta ${oferta.nodoId} (${oferta.medio}) cubre ${parte.clase}` }));
    if (repartidas.length > 0) resultados.push(...repartidas); else sueloFaltas.push(`parte ${parte.clase}: ${parte.necesita.ramMb ? `RAM ${parte.necesita.ramMb}MB` : parte.necesita.volumen ? `volumen ${parte.necesita.volumen}` : "recurso"}`);
    porParte[parte.clase] = resultados;
  }
  const resultado: ResultadoPlanificacion = { porParte };
  if (sueloFaltas.length > 0) {
    resultado.suelo = { destino: "local", motivo: "No hay recursos suficientes en la red; se abre en local o web.", falta: sueloFaltas };
  }
  return resultado;
}
