"use client";
/**
 * GENESIS · Conexión del panel de asignaciones por papel y director (Ola 1019G · §6 de
 * genesis-conectores-abiertos.md). Sugerencias por defecto: para cada papel, las opciones del
 * catálogo que lo sirven (lo local más potente primero, después malla, contenedor, gratis y pago);
 * los directores se proponen sin cadena: se añade del catálogo. Aplicar guarda en el navegador
 * del ámbito; el padre decide (en PoliGenesis democrático, proponer a votación en vez de aplicar).
 * PURO aquí: sin red, sin Supabase y sin valores de claves; el almacenamiento real lo inyectan las páginas.
 */
import { useState, useMemo } from "react";
import {
    PanelAsignaciones,
    candidatoDe,
    peldanoDe,
    type CandidatoAsignacion,
    type EntradaCatalogo,
    type FilaAsignacion,
    type Peldano,
} from "./asignaciones-panel";
import { fusionarCatalogos, type OpcionCatalogo, type Papel } from "@/lib/genesis/conectores/catalogo-opciones";
import type { Director } from "@/lib/genesis/conectores/asignaciones";
import { CONTENEDORES_OPCIONES, type ContenedorOpcion } from "@/lib/genesis/conectores/contenedores";
import { PROVEEDORES_CATALOGO } from "@/lib/mando/proveedores-catalogo";
import { FREE_CATALOG } from "@/ai/astraura/free-catalog";
import { almacenNavegador } from "@/lib/protogenesis/almacen-encargos";

const PAPELES: readonly Papel[] = ["escritor", "revisor", "chat", "visión", "voz", "imagen", "código"];
const DIRECTORES: readonly Director[] = ["chat", "optimizador", "diseno", "produccion", "nube", "medidores", "aprendizaje"];

const ORDEN: Record<Peldano, number> = { local: 0, malla: 1, contenedor: 2, gratis: 3, pago: 4 };

/** Los contenedores entran al panel con su cupo verificado tal cual (o null si no consta). */
function contenedorAEntrada(c: ContenedorOpcion): EntradaCatalogo {
    return { id: c.id, nombre: c.nombre, tipo: "contenedor", gratis: c.requierePago ? null : { nota: c.cupo ?? "" }, privacidad: c.aptoPrivado ? "local" : "nube-con-retencion" };
}

export type { FilaAsignacion };

/** Catálogo del panel: fusión de catálogos más los contenedores del ámbito (construido una vez). */
export const CATALOGO_GENESIS: EntradaCatalogo[] = [
    ...fusionarCatalogos(PROVEEDORES_CATALOGO, FREE_CATALOG),
    ...CONTENEDORES_OPCIONES.map(contenedorAEntrada),
];

/** Cadena sugerida de un papel: las opciones del catálogo que lo sirven, local más potente primero. */
function cadenaDePapel(catalogo: EntradaCatalogo[], papel: Papel): CandidatoAsignacion[] {
    return catalogo
        .filter((o): o is EntradaCatalogo & Pick<OpcionCatalogo, "papeles"> => "papeles" in o && (o as OpcionCatalogo).papeles.includes(papel))
        .sort((a, b) => ORDEN[peldanoDe(a)] - ORDEN[peldanoDe(b)] || a.id.localeCompare(b.id))
        .map(candidatoDe);
}

/** Una fila por papel y por director, con las sugeridas por defecto. */
export function sugeridasDeCatalogo(catalogo: EntradaCatalogo[]): FilaAsignacion[] {
    return [
        ...PAPELES.map((p) => ({ clave: `papel:${p}`, etiqueta: `Papel · ${p}`, cadena: cadenaDePapel(catalogo, p) })),
        ...DIRECTORES.map((d) => ({ clave: `director:${d}`, etiqueta: `Director · ${d}`, cadena: [] as CandidatoAsignacion[] })),
    ];
}

const CLAVE = "starseed.genesis.asignaciones.v1:";

/** Aplica (persistencia local del ámbito). Lo llaman las páginas cuando procede aplicar. */
export function guardarAsignaciones(ambito: string, filas: FilaAsignacion[]): void {
    const almacen = almacenNavegador();
    almacen?.setItem(CLAVE + ambito, JSON.stringify(filas));
}

/** Lee lo aplicado del ámbito; null si no hay nada guardado. */
export function cargarAsignaciones(ambito: string): FilaAsignacion[] | null {
    const crudo = almacenNavegador()?.getItem(CLAVE + ambito);
    if (crudo == null) return null;
    try { return JSON.parse(crudo) as FilaAsignacion[]; } catch { return null; }
}

export function SeccionAsignacionesGenesis({ ambito, titulo, democrata = false, onGuardar }: {
    ambito: string; titulo: string; democrata?: boolean; onGuardar: (filas: FilaAsignacion[]) => void;
}) {
    const sugeridas = useMemo(() => sugeridasDeCatalogo(CATALOGO_GENESIS), []);
    const [iniciales] = useState(() => cargarAsignaciones(ambito) ?? sugeridas);
    return (
        <section aria-label="Asignaciones por papel y director">
            <h2 className="text-base font-semibold">{titulo}</h2>
            <p className="mb-2 text-[11px] text-white/50">
                {democrata
                    ? "En democracia, proponer convierte tus cadenas en una propuesta que la entidad vota; nada se aplica hasta que se apruebe."
                    : "Guarda la cadena por defecto de cada papel y director de este ámbito; aplica al guardar."}
            </p>
            <PanelAsignaciones filas={iniciales} sugeridas={sugeridas} catalogo={CATALOGO_GENESIS} democrata={democrata} onGuardar={onGuardar} />
        </section>
    );
}
