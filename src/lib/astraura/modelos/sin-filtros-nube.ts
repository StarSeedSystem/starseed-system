import { CASOS_SIN_FILTROS, type ContextoUso } from "./recomendar";
import type { CasoUso } from "./tipos";

export const PROVEEDORES_SIN_FILTROS_NUBE = ["abliteration"] as const;

export type ProveedorSinFiltrosNube = typeof PROVEEDORES_SIN_FILTROS_NUBE[number];

export function proveedorEsSinFiltros(id: string): boolean {
  return PROVEEDORES_SIN_FILTROS_NUBE.includes(id as ProveedorSinFiltrosNube);
}

export interface EstadoSinFiltrosNube {
  activado: boolean;
  disponible: boolean;
}

export interface EntradaProveedorSinFiltros {
  activado: boolean;
  disponible: boolean;
  contexto?: ContextoUso;
  caso: CasoUso;
  claveDeLaCuenta: string | null;
  claveDeOtraCuenta?: string | null;
  proveedor: string;
}

export function proveedorSinFiltrosPermitido(entrada: EntradaProveedorSinFiltros): { permitido: boolean; aviso: string | null } {
  const { activado, disponible, contexto, caso, claveDeLaCuenta, claveDeOtraCuenta, proveedor } = entrada;

  if (!proveedorEsSinFiltros(proveedor)) {
    return { permitido: false, aviso: null };
  }

  if (!disponible) {
    return { permitido: false, aviso: "Las variantes sin filtros no están disponibles en este perfil." };
  }

  if (!activado) {
    return { permitido: false, aviso: "«Mostrar variantes sin filtros» está apagado." };
  }

  const contextoEfectivo = contexto ?? "compartido";

  if (contextoEfectivo !== "privado-propio") {
    const etiqueta = {
      "compartido": "bots, dots o asistentes de grupo, comunidad o página (hablan con otras personas)",
      "publico": "capas públicas",
      "segundo-plano": "segundo plano y aprendizaje colectivo",
      "malla-ajena": "servir a otra cuenta por la malla",
    }[contextoEfectivo];
    return { permitido: false, aviso: `solo se usan en tus conversaciones privadas en tu neurona, no en ${etiqueta}.` };
  }

  if (!CASOS_SIN_FILTROS.has(caso)) {
    return { permitido: false, aviso: "ese uso habla con otras personas o corre sin ti delante." };
  }

  if (!claveDeLaCuenta || claveDeLaCuenta.trim() === "") {
    return { permitido: false, aviso: "la cuenta no tiene su propia clave para proveedores sin filtros." };
  }

  if (claveDeOtraCuenta && claveDeOtraCuenta !== claveDeLaCuenta) {
    return { permitido: false, aviso: "nunca se sirve a otra cuenta con un proveedor sin filtros." };
  }

  return { permitido: true, aviso: null };
}
