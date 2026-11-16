import type { AjustesBanco, VentanaBanco } from "./tipos";

export interface ResultadoCupoBanco {
  aplica: boolean;
  permitido: boolean;
  restanteMb: number;
  motivo: string;
}

const MES = 1000 * 60 * 60 * 24;

function parsearFecha(fechaStr: string): Date | null {
  if (!fechaStr || typeof fechaStr !== "string") return null;
  const d = new Date(fechaStr);
  return isNaN(d.getTime()) ? null : d;
}

function fechaLocalHoy(ahora: Date, desfaseMin: number): Date {
  const fechaUTC = new Date(ahora.getTime() + desfaseMin * 60 * 1000);
  return new Date(Date.UTC(fechaUTC.getUTCFullYear(), fechaUTC.getUTCMonth(), fechaUTC.getUTCDate()));
}

function horaLocal(ahora: Date, desfaseMin: number): number {
  const fechaAjustada = new Date(ahora.getTime() + desfaseMin * 60 * 1000);
  return fechaAjustada.getUTCHours() * 60 + fechaAjustada.getUTCMinutes();
}

function esHoraEnRango(hora: number, desde: string, hasta: string): boolean {
  const h = (hh: string) => parseInt(hh.split(":")[0], 10) * 60 + parseInt(hh.split(":")[1], 10);
  const horaDesde = h(desde);
  const horaHasta = h(hasta);

  if (horaDesde <= horaHasta) {
    return hora >= horaDesde && hora <= horaHasta;
  }

  return hora >= horaDesde || hora <= horaHasta;
}

function ventanaVigente(ajustes: AjustesBanco, ahora: Date, desfaseMin: number): VentanaBanco | null {
  if (!ajustes.ventanas || ajustes.ventanas.length === 0) return null;

  const hoy = fechaLocalHoy(ahora, desfaseMin);
  const hoyStr = hoy.toISOString().split("T")[0];
  const hora = horaLocal(ahora, desfaseMin);

  for (const v of ajustes.ventanas) {
    const desde = parsearFecha(v.desde);
    const hasta = parsearFecha(v.hasta);
    if (!desde || !hasta) continue;

    const desdeFecha = desde.getTime();
    const hastaFecha = hasta.getTime() + MES - 1;

    if (hoy.getTime() >= desdeFecha && hoy.getTime() <= hastaFecha) {
      if (esHoraEnRango(hora, v.horaDesde, v.horaHasta)) {
        if (typeof v.limiteMb === "number" && Number.isFinite(v.limiteMb) && v.limiteMb > 0) {
          return v;
        }
      }
    }
  }

  return null;
}

function esFechaValida(d: Date | undefined): boolean {
  return d instanceof Date && !isNaN(d.getTime());
}

export function cupoBanco(
  ajustes: AjustesBanco,
  usadoHoyMb: number,
  ahora: Date,
  desfaseMin: number = 0
): ResultadoCupoBanco {
  if (!esFechaValida(ahora)) {
    return {
      aplica: true,
      permitido: false,
      restanteMb: 0,
      motivo: "ahora inválido (debe ser una fecha válida)",
    };
  }

  if (!ajustes.activo) {
    return {
      aplica: false,
      permitido: true,
      restanteMb: Infinity,
      motivo: "modo banco apagado",
    };
  }

  if (ajustes.modo === "diario") {
    if (!Number.isFinite(usadoHoyMb) || usadoHoyMb < 0) {
      return {
        aplica: true,
        permitido: false,
        restanteMb: 0,
        motivo: "usadoHoyMb inválido (debe ser número finito y no negativo)",
      };
    }

    if (typeof ajustes.diarioMb !== "number" || !Number.isFinite(ajustes.diarioMb) || ajustes.diarioMb < 0) {
      return {
        aplica: true,
        permitido: false,
        restanteMb: 0,
        motivo: "diarioMb inválido (debe ser número finito y no negativo)",
      };
    }

    const restanteMb = Math.max(0, ajustes.diarioMb - usadoHoyMb);
    const permitido = restanteMb > 0;
    const motivo = permitido
      ? "dentro de la ración diaria"
      : "ración diaria agotada";

    return {
      aplica: true,
      permitido,
      restanteMb,
      motivo,
    };
  }

  if (ajustes.modo === "programado") {
    const ventana = ventanaVigente(ajustes, ahora, desfaseMin);

    if (!ventana) {
      return {
        aplica: true,
        permitido: false,
        restanteMb: 0,
        motivo: "fuera de las franjas del modo banco",
      };
    }

    if (!Number.isFinite(usadoHoyMb) || usadoHoyMb < 0) {
      return {
        aplica: true,
        permitido: false,
        restanteMb: 0,
        motivo: "usadoHoyMb inválido (debe ser número finito y no negativo)",
      };
    }

    const restanteMb = Math.max(0, ventana.limiteMb - usadoHoyMb);
    const permitido = restanteMb > 0;

    return {
      aplica: true,
      permitido,
      restanteMb,
      motivo: permitido ? "dentro de la franja programada" : "límite de franja agotado",
    };
  }

  return {
    aplica: false,
    permitido: true,
    restanteMb: Infinity,
    motivo: "modo banco apagado",
  };
}