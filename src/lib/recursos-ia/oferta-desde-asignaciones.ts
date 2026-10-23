import type { OfertaNeurona } from "@/lib/recursos/oferta";
import type { EstadoRecursosIa, InventarioRecursos } from "./tipos";

export type OfertaDesdeAsignacionesCtx = {
  nodoId: string;
  cuentaId: string;
  t?: number;
  energia?: Partial<OfertaNeurona["energia"]>;
  enlaces?: Partial<OfertaNeurona["enlaces"]>;
  prestaTopes?: Partial<OfertaNeurona["presta"]["topes"]>;
};

export function ofertaDesdeAsignaciones(
  inventario: InventarioRecursos,
  estado: EstadoRecursosIa,
  ctx: OfertaDesdeAsignacionesCtx
): OfertaNeurona {
  // esqueleto
  const t = ctx.t ?? Date.now();
  return {
    nodoId: ctx.nodoId,
    cuentaId: ctx.cuentaId,
    medio: "local",
    computo: { nucleos: 0, ramLibreMb: 0, gpu: false, motores: [] },
    almacen: { prestaMb: 0, volumenes: [] },
    apps: [],
    enlaces: { ...(ctx.enlaces ?? {}) },
    energia: { enUso: false, ...(ctx.energia ?? {}) },
    presta: {
      cuenta: false,
      grupos: [],
      publico: false,
      topes: {
        cpuPct: 100,
        ramMb: 0,
        discoMb: 0,
        soloCargando: false,
        ...(ctx.prestaTopes ?? {}),
      },
    },
    t,
  };
}
