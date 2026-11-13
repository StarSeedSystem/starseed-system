"use client";

/**
 * Chats de Genesis · la columna de chats (GEN1113D · 2026-11-13, contrato §2.3)
 * ─────────────────────────────────────────────────────────────────────────────
 * Tres grupos: MetaGenesis (solo miembros: Dirección y los Puentes de Telegram), Genesis (mi
 * cuenta) y PoliGenesis (mis grupos y páginas con rango ≥ 2). En pantalla ancha es una columna;
 * por debajo de `lg` es UN botón con el chat actual que abre la lista completa (MenuListaMovil),
 * nunca una tira que se corte. Esconder una entrada es comodidad: quien decide es la puerta.
 */

import { useSyncExternalStore, type ComponentType } from "react";
import { BellRing, Bot, Building2, ListTodo, MessageSquare, MessagesSquare, Send, Users } from "lucide-react";

import { MenuListaMovil } from "@/components/ui/menu-lista-movil";
import type { VinculoChat } from "@/lib/chats-genesis/tipos";
import { cn } from "@/lib/utils";

// ── Ancho de pantalla (las pruebas lo simulan con matchMedia) ────────────────

/** ¿La ventana mide al menos `minPx`? En el servidor y sin matchMedia se toma «estrecha». */
export function usePantallaAncha(minPx: number): boolean {
    const consulta = `(min-width: ${minPx}px)`;
    return useSyncExternalStore(
        (avisar) => {
            if (typeof window === "undefined" || typeof window.matchMedia !== "function") return () => {};
            const mq = window.matchMedia(consulta);
            mq.addEventListener?.("change", avisar);
            return () => mq.removeEventListener?.("change", avisar);
        },
        () => typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia(consulta).matches,
        () => false,
    );
}

export const ANCHO_LG = 1024;
export const ANCHO_SM = 640;

// ── Entradas ─────────────────────────────────────────────────────────────────

export type GrupoChats = "metagenesis" | "genesis" | "poligenesis";

export interface EntradaChat {
    id: string;
    grupo: GrupoChats;
    etiqueta: string;
    ayuda: string;
    icono: ComponentType<{ className?: string }>;
    acento: string;
    /** Subtítulo dentro del grupo («Puentes de Telegram»). */
    seccion?: string;
}

export interface EntidadLista {
    id: string;
    nombre: string;
    tipo: "pagina" | "grupo";
    rango: number;
}

export interface AccesoMeta {
    miembro: boolean;
    dueno: boolean;
}

export const NOMBRE_GRUPO: Record<GrupoChats, string> = {
    metagenesis: "MetaGenesis",
    genesis: "Genesis (mi cuenta)",
    poligenesis: "PoliGenesis",
};

export const ID_DIRECCION = "direccion";
export const ID_AGENTE_GENESIS = "genesis:agente";

/** Los tres puentes, con el nombre que fija el contrato (§2.3 y §8). */
export const PUENTES = [
    { puente: "hermes-avisos", etiqueta: "Hermes y avisos", ayuda: "Órdenes y conversación con Hermes en la Mac", icono: Send, soloDueno: true },
    { puente: "peticiones", etiqueta: "Peticiones y encargos", ayuda: "Peticiones y encargos largos que atiende el A1", icono: ListTodo, soloDueno: true },
    { puente: "avisos-directores", etiqueta: "Avisos de los directores", ayuda: "Solo lectura: los avisos de los directores", icono: BellRing, soloDueno: false },
] as const;

export const TEXTO_SIN_META = "MetaGenesis es para cuentas con acceso; lo da un dueño en Ajustes › Accesos.";
export const TEXTO_GENESIS_VACIO = "Aún no has llevado ningún chat a Genesis. Desde Chats: menú del chat › Llevar a Genesis.";
export const TEXTO_FASE_2 = "Los bots con personalidad llegan en la fase 2.";
export const TEXTO_POLI_VACIO = "Ningún grupo ni página tiene chats de Genesis todavía.";

function enGenesis(v: VinculoChat, nivel: VinculoChat["nivel"], entidad?: string): boolean {
    return v.en.includes("genesis") && v.nivel === nivel && (entidad === undefined || v.entidad === entidad);
}

function tituloDe(v: VinculoChat): string {
    if (v.titulo && v.titulo.trim() !== "") return v.titulo;
    if (v.fuente.tipo === "telegram-sincronizado") return "Chat de Telegram";
    return "Chat de Astraura";
}

/** Id de la entrada de un vínculo: el propio id del vínculo («astraura:…», «tg:…»). */
export function idDeEntradaVinculo(v: VinculoChat): string {
    return `v:${v.id}`;
}

/** Las entradas de la lista, en orden (puro). `acceso` null = no se pudo comprobar. */
export function entradasDeLista(acceso: AccesoMeta | null, entidades: readonly EntidadLista[], vinculos: readonly VinculoChat[]): EntradaChat[] {
    const salida: EntradaChat[] = [];
    if (acceso?.miembro) {
        salida.push({ id: ID_DIRECCION, grupo: "metagenesis", etiqueta: "Dirección", ayuda: "Todo · Dirección · Conversación · Informes · Enjambre · Usos", icono: MessagesSquare, acento: "text-violet-300" });
        for (const p of PUENTES) {
            if (p.soloDueno && !acceso.dueno) continue;
            salida.push({ id: `puente:${p.puente}`, grupo: "metagenesis", seccion: "Puentes de Telegram", etiqueta: p.etiqueta, ayuda: p.ayuda, icono: p.icono, acento: p.soloDueno ? "text-sky-300" : "text-amber-300" });
        }
        for (const v of vinculos.filter((x) => enGenesis(x, "metagenesis"))) {
            salida.push({ id: idDeEntradaVinculo(v), grupo: "metagenesis", seccion: "Chats vinculados", etiqueta: tituloDe(v), ayuda: "Chat de Astraura vinculado a MetaGenesis", icono: MessageSquare, acento: "text-violet-200" });
        }
    }
    salida.push({ id: ID_AGENTE_GENESIS, grupo: "genesis", etiqueta: "Agente de Mi Genesis", ayuda: "Propone cambios de tu cuenta con vista previa", icono: Bot, acento: "text-emerald-300" });
    for (const v of vinculos.filter((x) => enGenesis(x, "genesis"))) {
        salida.push({ id: idDeEntradaVinculo(v), grupo: "genesis", etiqueta: tituloDe(v), ayuda: v.en.includes("chats") ? "También en Chats" : "Solo en Genesis", icono: MessageSquare, acento: "text-emerald-200" });
    }
    for (const e of entidades.filter((x) => x.rango >= 2)) {
        const n = vinculos.filter((x) => enGenesis(x, "poligenesis", e.id)).length;
        salida.push({
            id: `poli:${e.id}`,
            grupo: "poligenesis",
            etiqueta: e.nombre,
            ayuda: `${e.tipo === "grupo" ? "Grupo" : "Página"} · ${n === 0 ? "sin chats todavía" : n === 1 ? "1 chat" : `${n} chats`}`,
            icono: e.tipo === "grupo" ? Users : Building2,
            acento: "text-fuchsia-300",
        });
        for (const v of vinculos.filter((x) => enGenesis(x, "poligenesis", e.id))) {
            salida.push({ id: idDeEntradaVinculo(v), grupo: "poligenesis", etiqueta: tituloDe(v), ayuda: `Chat de ${e.nombre}`, icono: MessageSquare, acento: "text-fuchsia-200" });
        }
    }
    return salida;
}

// ── Componente ───────────────────────────────────────────────────────────────

export interface ListaChatsGenesisProps {
    acceso: AccesoMeta | null;
    /** Mientras se pregunta por el acceso (no se dice «sin acceso» antes de saberlo). */
    comprobandoAcceso: boolean;
    entidades: readonly EntidadLista[];
    vinculos: readonly VinculoChat[];
    valor: string;
    onElegir: (id: string) => void;
    onReintentarAcceso?: () => void;
}

/** Líneas que explican lo que falta en cada grupo (puro). */
export function avisosDeLista(p: Pick<ListaChatsGenesisProps, "acceso" | "comprobandoAcceso" | "entidades" | "vinculos">): Record<GrupoChats, string[]> {
    const meta: string[] = [];
    if (p.comprobandoAcceso) meta.push("Comprobando tu acceso a MetaGenesis…");
    else if (p.acceso === null) meta.push("No se pudo comprobar tu acceso a MetaGenesis (sin sesión o sin red).");
    else if (!p.acceso.miembro) meta.push(TEXTO_SIN_META);
    const gen = p.vinculos.some((v) => enGenesis(v, "genesis")) ? [TEXTO_FASE_2] : [TEXTO_GENESIS_VACIO, TEXTO_FASE_2];
    const poli = p.vinculos.some((v) => enGenesis(v, "poligenesis")) ? [] : [TEXTO_POLI_VACIO];
    if (p.entidades.filter((e) => e.rango >= 2).length === 0) poli.push("No colaboras ni gestionas ningún grupo o página.");
    return { metagenesis: meta, genesis: gen, poligenesis: poli };
}

const GRUPOS: GrupoChats[] = ["metagenesis", "genesis", "poligenesis"];

export function ListaChatsGenesis(props: ListaChatsGenesisProps) {
    const ancha = usePantallaAncha(ANCHO_LG);
    const entradas = entradasDeLista(props.acceso, props.entidades, props.vinculos);
    const avisos = avisosDeLista(props);
    const reintentar = !props.comprobandoAcceso && props.acceso === null && props.onReintentarAcceso;

    if (!ancha) {
        return (
            <div data-testid="lista-chats-genesis" data-modo="menu" className="flex min-w-0 shrink-0 flex-col gap-1.5">
                <MenuListaMovil
                    titulo="Chats de Genesis"
                    opciones={entradas.map((e) => ({ id: e.id, label: e.etiqueta, hint: `${NOMBRE_GRUPO[e.grupo]}${e.seccion ? ` · ${e.seccion}` : ""} · ${e.ayuda}`, icon: e.icono, accent: e.acento }))}
                    valor={props.valor}
                    onCambiar={props.onElegir}
                />
                {avisos.metagenesis.length > 0 ? (
                    <p className="flex flex-wrap items-center gap-2 px-1 text-[11.5px] leading-snug text-white/50">
                        {avisos.metagenesis.join(" ")}
                        {reintentar ? <BotonReintentar onClick={props.onReintentarAcceso!} /> : null}
                    </p>
                ) : null}
            </div>
        );
    }

    return (
        <nav
            data-testid="lista-chats-genesis"
            data-modo="columna"
            aria-label="Chats de Genesis"
            className="flex w-72 shrink-0 flex-col gap-3 overflow-y-auto rounded-xl border border-white/10 bg-background/40 p-2 min-h-0"
        >
            {GRUPOS.map((g) => {
                const propias = entradas.filter((e) => e.grupo === g);
                // Sin acceso, el grupo MetaGenesis no se pinta: solo su línea.
                if (g === "metagenesis" && propias.length === 0) {
                    return (
                        <p key={g} className="flex flex-wrap items-center gap-2 px-2 text-[11.5px] leading-snug text-white/45">
                            {avisos.metagenesis.join(" ")}
                            {reintentar ? <BotonReintentar onClick={props.onReintentarAcceso!} /> : null}
                        </p>
                    );
                }
                let seccionPrevia: string | undefined;
                return (
                    <section key={g} role="group" aria-label={NOMBRE_GRUPO[g]} className="flex flex-col gap-0.5">
                        <h3 className="px-2 pb-1 text-xs font-semibold text-cyan-100">{NOMBRE_GRUPO[g]}</h3>
                        {propias.map((e) => {
                            const cabecera = e.seccion && e.seccion !== seccionPrevia ? e.seccion : null;
                            seccionPrevia = e.seccion;
                            return (
                                <div key={e.id} className="flex flex-col">
                                    {cabecera ? <h4 className="px-2 pb-0.5 pt-1.5 text-[10.5px] font-medium uppercase tracking-wide text-white/35">{cabecera}</h4> : null}
                                    <BotonEntrada entrada={e} activa={e.id === props.valor} onElegir={props.onElegir} />
                                </div>
                            );
                        })}
                        {g !== "metagenesis" && avisos[g].map((t) => (
                            <p key={t} className="px-2 pt-1 text-[11px] leading-snug text-white/40">{t}</p>
                        ))}
                    </section>
                );
            })}
        </nav>
    );
}

function BotonEntrada({ entrada, activa, onElegir }: { entrada: EntradaChat; activa: boolean; onElegir: (id: string) => void }) {
    const Icono = entrada.icono;
    return (
        <button
            type="button"
            aria-current={activa ? "true" : undefined}
            onClick={() => onElegir(entrada.id)}
            className={cn(
                "flex w-full min-w-0 cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/40",
                activa ? "bg-white/[0.08] text-white" : "text-white/70 hover:bg-white/[0.05] hover:text-white",
            )}
        >
            <span className="grid size-8 shrink-0 place-items-center rounded-lg border border-white/10 bg-white/[0.03]">
                <Icono className={cn("size-4", entrada.acento)} />
            </span>
            <span className="min-w-0 flex-1">
                <span className="block break-words text-[13px] font-medium leading-snug [overflow-wrap:anywhere]">{entrada.etiqueta}</span>
                <span className="block break-words text-[11px] leading-snug text-white/40">{entrada.ayuda}</span>
            </span>
        </button>
    );
}

function BotonReintentar({ onClick }: { onClick: () => void }) {
    return (
        <button type="button" onClick={onClick} className="cursor-pointer rounded-md border border-white/15 px-2 py-0.5 text-[11px] text-white/70 hover:bg-white/10 hover:text-white">
            Reintentar
        </button>
    );
}
