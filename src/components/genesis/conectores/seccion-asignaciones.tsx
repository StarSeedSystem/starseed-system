"use client";

/* Conexión del panel de asignaciones a Genesis y PoliGenesis (Ola 1019G · GCA1019N).
 * Una fila por papel y por director; el panel pinta el peldaño, el motivo y la cadena.
 * El catálogo se fusiona en el cliente (local primero) y el almacenamiento se inyecta con
 * `almacenNavegador`; no hay red ni valores de claves. El padre decide si aplica o propone.
 * Debajo del panel va el asistente «Conectar Genesis» (GCA1019M) con las sugerencias de la escalera
 * derivadas del mismo catálogo; Cloudroom (CRM1024B) solo cuando la página declara relevancia e
 * instalación, con su estado honesto y el cupo de `cupo-cloudroom.ts`. */

import { useMemo, useState } from "react";
import {
  AsignacionesPanel,
  filasSugeridas,
  type FilaPanel,
  type ModoPanel,
} from "./asignaciones-panel";
import { fusionarCatalogos, type OpcionCatalogo } from "@/lib/genesis/conectores/catalogo-opciones";
import { CONTENEDORES_OPCIONES, type ContenedorOpcion } from "@/lib/genesis/conectores/contenedores";
import { PROVEEDORES_CATALOGO } from "@/lib/mando/proveedores-catalogo";
import { FREE_CATALOG } from "@/ai/astraura/free-catalog";
import { almacenNavegador } from "@/lib/protogenesis/almacen-encargos";
import { asignacionesDesdeFilas } from "@/lib/genesis/conectores/opciones-ambito";
import { sugerirParaAmbito } from "@/lib/genesis/conectores/sugerir";
import type { OfertaContexto } from "@/lib/genesis/conectores/escalera";
import { ClaudeConector } from "./claude-conector";
import { AsistenteConectarGenesis, type DatosCloudroomContexto } from "./asistente-conectores";

export type { FilaPanel };

/** URL pública del MCP de Genesis del ámbito; el token va aparte, nunca en la URL. */
function urlMcpDelGenesis(): string {
  const base = process.env.NEXT_PUBLIC_SITE_URL || "https://starseed-os.vercel.app";
  return `${base.replace(/\/+$/, "")}/api/mcp/genesis`;
}

function contenedorAOpcion(c: ContenedorOpcion): OpcionCatalogo {
  const gratis = c.requierePago
    ? null
    : c.cupo
      ? { rpm: null, porDia: null, horasMes: null, almacenamientoGb: null, nota: c.cupo }
      : null;
  return {
    id: c.id,
    nombre: c.nombre,
    tipo: "contenedor",
    papeles: [],
    gratis,
    requiereCuenta: c.requiereCuenta,
    enlaceAlta: c.enlaceAlta,
    enlaceClave: null,
    variables: [],
    privacidad: c.aptoPrivado ? "local" : "nube-con-retencion",
    licencia: null,
    verificado: null,
    fuente: "contenedores",
  };
}

/** Catálogo del panel: la fusión de los dos catálogos más los contenedores del ámbito. */
export const CATALOGO_GENESIS: OpcionCatalogo[] = [
  ...fusionarCatalogos(PROVEEDORES_CATALOGO, FREE_CATALOG),
  ...CONTENEDORES_OPCIONES.map(contenedorAOpcion),
];

const CLAVE = "starseed.genesis.asignaciones.v2:";

/** Estado honesto de Cloudroom que las páginas pueden aportar: relevancia de la tarea (larga de
 * código o que sigue con el aparato apagado) y datos reales de la neurona y del cupo. Sin
 * relevancia declarada no se sugiere, aunque la app esté instalada (CRM1024B del enunciado). */
export type CloudroomDePanel = DatosCloudroomContexto & { relevante?: boolean };

function esFilaPanel(valor: unknown): valor is FilaPanel {
  if (!valor || typeof valor !== "object") return false;
  const fila = valor as Record<string, unknown>;
  return (
    (fila.tipo === "papel" || fila.tipo === "director") &&
    typeof fila.clave === "string" &&
    Array.isArray(fila.cadena) &&
    fila.cadena.every((id) => typeof id === "string")
  );
}

/** Aplica (persistencia local del ámbito). Lo llaman las páginas cuando procede aplicar. */
export function guardarAsignaciones(ambito: string, filas: FilaPanel[]): void {
  almacenNavegador()?.setItem(CLAVE + ambito, JSON.stringify(filas));
}

/** Lee lo aplicado del ámbito; null si no hay nada guardado o el formato ya no vale. */
export function cargarAsignaciones(ambito: string): FilaPanel[] | null {
  const crudo = almacenNavegador()?.getItem(CLAVE + ambito);
  if (crudo == null) return null;
  try {
    const parsed: unknown = JSON.parse(crudo);
    return Array.isArray(parsed) && parsed.every(esFilaPanel) ? parsed : null;
  } catch {
    return null;
  }
}

export function SeccionAsignacionesGenesis({
  ambito,
  titulo,
  modo = "aplicar",
  onGuardar,
  cloudroom,
}: {
  ambito: string;
  titulo: string;
  modo?: ModoPanel;
  onGuardar: (filas: FilaPanel[]) => void | Promise<void>;
  cloudroom?: CloudroomDePanel;
}) {
  const [iniciales] = useState<FilaPanel[]>(() => cargarAsignaciones(ambito) ?? filasSugeridas(CATALOGO_GENESIS));
  /** Sugerencias de la escalera derivadas del mismo catálogo que pinta el panel. La oferta
   * «esta-neurona» solo si la app de Cloudroom está instalada y declarada; sin datos, vacía. */
  const sugerencias = useMemo(() => sugerirParaAmbito({
    asignaciones: asignacionesDesdeFilas(filasSugeridas(CATALOGO_GENESIS).filter((f) => f.tipo === "papel")),
    catalogo: CATALOGO_GENESIS,
    ofertas: (cloudroom?.instalacion === "instalada"
      ? [{ id: "esta-neurona", nombre: "Esta neurona", tipo: "contenedor", papel: ["código"], escritorioCompatible: true }]
      : []) as OfertaContexto[],
    vinculadas: new Set<string>(),
    contenedores: CONTENEDORES_OPCIONES,
    relevanteCloudroom: cloudroom?.relevante === true,
  }), [cloudroom?.instalacion, cloudroom?.relevante]);
  return (
    <section aria-label="Asignaciones por papel y director">
      <h2 className="text-base font-semibold">{titulo}</h2>
      <p className="mb-2 text-[11px] text-white/50">
        {modo === "proponer"
          ? "En democracia, guardar convierte tus cadenas en una propuesta que la entidad vota; nada se aplica hasta que se apruebe."
          : "Guarda la cadena por defecto de cada papel y director de este ámbito; lo local va primero y de pago solo con permiso."}
      </p>
      <AsignacionesPanel catalogo={CATALOGO_GENESIS} modo={modo} filasIniciales={iniciales} onGuardar={onGuardar} />
      <div className="mt-4">
        <AsistenteConectarGenesis ambito={ambito}
          opciones={{ sugerencias, asignaciones: asignacionesDesdeFilas(filasSugeridas(CATALOGO_GENESIS).filter((f) => f.tipo === "papel")) }}
          cloudroom={cloudroom} />
      </div>
      <div className="mt-4">
        <ClaudeConector urlMcp={urlMcpDelGenesis()} />
      </div>
    </section>
  );
}
