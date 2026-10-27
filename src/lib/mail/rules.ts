export const AHORA = new Date("2026-01-20T12:00:00Z");

export const BASE = {
  etiqueta: "t",
  tieneAdjunto: false,
  antiguedadHorasMin: 0,
  asunto: "",
  asuntoContiene: "",
  de: "",
};

export function R(tipo: string, parametro?: string | Record<string, unknown>, cuándo?: string) {
  const rule: Record<string, unknown> = { tipo };
  if (parametro !== undefined) {
    if (typeof parametro === "string") {
      rule.parametro = parametro;
    } else {
      Object.assign(rule, parametro);
    }
  }
  if (cuándo !== undefined) rule.cuándo = cuándo;
  return rule as Record<string, unknown>;
}

export function R0(tipo: string) {
  return { tipo };
}

export function validarRegla(rule: Record<string, unknown>): boolean {
  if (!rule || typeof rule !== "object") return false;
  if (!rule.tipo) return false;

  const tipo = rule.tipo as string;

  if (tipo === "etiquetar") {
    if (rule.cuándo === undefined || typeof rule.cuándo !== "string") return false;
    if (rule.cuándo.length === 0) return false;
    if (rule.parametro !== undefined && typeof rule.parametro !== "string") return false;
    if (rule.parametro !== undefined && rule.parametro.length > 100) return false;
    if (rule.etiqueta && typeof rule.etiqueta !== "string") return false;
    return true;
  }

  if (tipo === "destacar") {
    if (!rule.de || typeof rule.de !== "string" || rule.de.length === 0) return false;
    return true;
  }

  if (tipo === "mover") {
    if (rule.parametro !== undefined && typeof rule.parametro !== "string") return false;
    if (rule.tieneAdjunto !== undefined && typeof rule.tieneAdjunto !== "boolean") return false;
    return true;
  }

  if (tipo === "sugerir-borrador") {
    if (rule.dominio && typeof rule.dominio !== "string") return false;
    return true;
  }

  if (tipo === "esperar-respuesta") {
    if (rule.antiguedadHorasMin !== undefined) {
      const ah = rule.antiguedadHorasMin;
      if (typeof ah !== "number" || ah < 0) return false;
    }
    return true;
  }

  return false;
}

export function aplicarReglas(
  reglas: Record<string, unknown>[],
  base: Record<string, unknown>,
  ahora: Date,
): { tipo: string; parametro?: string }[] {
  const resultado: { tipo: string; parametro?: string }[] = [];

  for (const regla of reglas) {
    if (!validarRegla(regla)) continue;

    const tipo = regla.tipo as string;

    if (tipo === "etiquetar") {
      const parametro = regla.parametro as string;
      const baseTieneAdjunto = base.tieneAdjunto === true;

      if (regla.cuándo && "tieneAdjunto" in regla.cuándo) {
        const condTieneAdjunto = (regla.cuándo as Record<string, unknown>).tieneAdjunto;
        if (condTieneAdjunto !== undefined && condTieneAdjunto !== baseTieneAdjunto) continue;
      }

      if (regla.tieneAdjunto !== undefined && regla.tieneAdjunto !== baseTieneAdjunto) continue;

      if (regla.cuándo && "asuntoContiene" in regla.cuándo) {
        const asuntoContiene = (regla.cuándo as Record<string, unknown>).asuntoContiene;
        const asunto = base.asunto || "";
        if (!asunto.toUpperCase().includes(asuntoContiene.toUpperCase())) continue;
      }

      resultado.push({ tipo, parametro });
    }

    if (tipo === "mover") {
      if (regla.tieneAdjunto !== undefined && regla.tieneAdjunto !== base.tieneAdjunto) continue;
      resultado.push({ tipo });
    }

    if (tipo === "destacar") {
      const de = regla.de as string;
      const baseDe = base.de || "";

      if (de && typeof de === "string") {
        const dest = de.toLowerCase();
        const baseL = baseDe.toLowerCase();
        if (!baseL.includes(dest)) continue;
      }

      resultado.push({ tipo });
    }

    if (tipo === "sugerir-borrador") {
      const dominio = regla.dominio as string;
      const baseAsunto = base.asunto || "";

      if (dominio && typeof dominio === "string") {
        if (!baseAsunto.toUpperCase().includes(dominio.toUpperCase())) continue;
      }

      resultado.push({ tipo });
    }

    if (tipo === "esperar-respuesta") {
      const antiguedadHorasMin = regla.antiguedadHorasMin;
      const ultimoMensaje = base.ultimoMensaje
        ? new Date(base.ultimoMensaje)
        : ahora;
      const diffHoras = (ahora.getTime() - ultimoMensaje.getTime()) / 36e5;

      if (antiguedadHorasMin !== undefined && typeof antiguedadHorasMin === "number") {
        if (diffHoras < antiguedadHorasMin) continue;
      }

      resultado.push({ tipo });
    }
  }

  return resultado;
}

export function clasificarHilo(
  hilo: readonly { id: string; esPropio: boolean; creadoAt: string }[],
  rol: string,
  ahora: Date,
  umbrales?: { horasPorResponder?: number; horasPorResuelto?: number },
): string {
  if (!hilo || hilo.length === 0) return "resuelto";

  const ultimo = hilo[hilo.length - 1];
  const esUltimoPropio = ultimo.esPropio;
  const fechaUltimo = new Date(ultimo.creadoAt).getTime();
  const ahoraMs = ahora.getTime();
  const diffHoras = (ahoraMs - fechaUltimo) / 36e5;

  if (rol !== "yo") return "resuelto";

  if (umbrales && umbrales.horasPorResponder !== undefined) {
    if (diffHoras > umbrales.horasPorResponder) return "resuelto";
  } else {
    if (diffHoras > 48) return "por-responder";
  }

  if (esUltimoPropio) {
    if (diffHoras > 24) return "resuelto";
  } else {
    if (diffHoras > 24) return "por-responder";
  }

  return esUltimoPropio ? "resuelto" : "por-responder";
}

export function resumenSeguimiento(
  hilos: readonly readonly { id: string; esPropio: boolean; creadoAt: string }[],
  rol: string,
  ahora: Date,
): { porResponder: number; esperando: number; resuelto: number; total: number } {
  const porResponder = hilos.filter((h) => clasificarHilo(h, rol, ahora) === "por-responder").length;
  const esperando = hilos.filter((h) => clasificarHilo(h, rol, ahora) === "esperando").length;
  const resuelto = hilos.filter((h) => clasificarHilo(h, rol, ahora) === "resuelto").length;

  return { porResponder, esperando, resuelto, total: hilos.length };
}

export function hilo(mensajes: readonly { id: string; esPropio: boolean; creadoAt: string }[]) {
  return mensajes;
}

export function mio(id: string) {
  return { id, esPropio: true };
}

export function deOtro(id: string) {
  return { id, esPropio: false };
}