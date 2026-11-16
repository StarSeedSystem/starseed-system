import type { Estacion } from "@/lib/estaciones/tipos";
import type { SenalEspectro, CapaRed } from "../tipos";

export interface EstacionEntrada extends Estacion {}

function esPropia(estacion: EstacionEntrada, usuarioId: string | null): boolean {
  if (!usuarioId) return false;
  return estacion.owner_id === usuarioId;
}

function determinarCapa(estacion: EstacionEntrada, usuarioId: string | null): CapaRed {
  if (estacion.visibilidad === "publica") return "publica";
  if (esPropia(estacion, usuarioId)) return "privada";
  return "privada";
}

function extraerBanda(tipo: EstacionEntrada["tipo"]): string {
  return tipo;
}

function extraerMedidoEn(estacion: EstacionEntrada): number | null {
  if (estacion.ultimo_latido) {
    const t = new Date(estacion.ultimo_latido).getTime();
    if (Number.isFinite(t)) return t;
  }
  if (estacion.created_at) {
    const t = new Date(estacion.created_at).getTime();
    if (Number.isFinite(t)) return t;
  }
  return null;
}

export function adaptarEstacionesASenales(
  estaciones: EstacionEntrada[],
  usuarioId: string | null
): SenalEspectro[] {
  const senales: SenalEspectro[] = [];

  for (const est of estaciones) {
    const capa = determinarCapa(est, usuarioId);

    if (capa === "privada" && !esPropia(est, usuarioId)) {
      continue;
    }

    const senal: SenalEspectro = {
      id: est.id,
      medio: "estacion",
      banda: extraerBanda(est.tipo),
      frecuenciaKhz: null,
      anchoKhz: null,
      fuerzaDbm: null,
      calidad: null,
      origen: "declarada",
      capa,
      fuente: "estación publicada por su dueño",
      medidoEn: extraerMedidoEn(est),
      zona: null,
      vinculo: { tipo: "estacion", id: est.id },
      compatibles: [],
    };

    senales.push(senal);
  }

  return senales;
}