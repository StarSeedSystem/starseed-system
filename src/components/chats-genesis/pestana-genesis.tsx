"use client";

/**
 * Astraura › Chat › Genesis (GEN1113D · 2026-11-13, contrato architecture/astraura-chats-genesis.md §2.3)
 * ─────────────────────────────────────────────────────────────────────────────
 * La pestaña donde se leen y escriben, desde cualquier aparato de la cuenta, el chat de dirección de
 * MetaGenesis y los tres Puentes de Telegram, y donde aparecen los chats llevados a Genesis y a
 * PoliGenesis. A la izquierda la lista (en móvil, un botón que abre la lista completa); a la
 * derecha el hilo elegido con su cabecera y su cuadro de texto.
 *
 * Quién ve qué sale de `miAccesoMetaGenesis()` (comodidad: la puerta vuelve a decidirlo todo).
 * Los mensajes van por la puerta del A1 (`cliente`), nunca por Supabase.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { Bot, ExternalLink, MessageSquare, Users } from "lucide-react";

import { miAccesoMetaGenesis } from "@/lib/metagenesis/accesos";
import { misEntidades } from "@/lib/genesis/entidades";
import { crearClienteChatsGenesis, type ClienteChatsGenesis } from "@/lib/chats-genesis/puerta-chats";
import type { PrefsChatsGenesis, PuenteTelegram, VinculoChat } from "@/lib/chats-genesis/tipos";
import { conMetaGenesisInicial, guardarPrefsChatsGenesis, leerCopiaLocalChatsGenesis, leerPrefsChatsGenesis } from "@/lib/chats-genesis/vinculos";
import { cn } from "@/lib/utils";

import { HiloDireccion } from "./hilo-direccion";
import { HiloPuente } from "./hilo-puente";
import {
    ID_AGENTE_GENESIS,
    ID_DIRECCION,
    ListaChatsGenesis,
    TEXTO_FASE_2,
    entradasDeLista,
    idDeEntradaVinculo,
    type AccesoMeta,
    type EntidadLista,
} from "./lista-chats-genesis";

const CLAVE_SELECCION = "starseed.genesis.chats.seleccion.v1";

function leerSeleccion(): string | null {
    try { return typeof window === "undefined" ? null : window.localStorage.getItem(CLAVE_SELECCION); } catch { return null; }
}

function guardarSeleccion(id: string): void {
    try { window.localStorage.setItem(CLAVE_SELECCION, id); } catch { /* solo en memoria */ }
}

export interface PestanaGenesisProps {
    /** Cliente de la puerta del A1; sin él se crea el de la app. Las pruebas pasan uno falso. */
    cliente?: ClienteChatsGenesis;
}

export function PestanaGenesis({ cliente }: PestanaGenesisProps) {
    const puerta = useMemo(() => cliente ?? crearClienteChatsGenesis(), [cliente]);
    const [acceso, setAcceso] = useState<AccesoMeta | null>(null);
    const [comprobando, setComprobando] = useState(true);
    const [vueltaAcceso, setVueltaAcceso] = useState(0);
    const [entidades, setEntidades] = useState<EntidadLista[]>([]);
    const [prefs, setPrefs] = useState<PrefsChatsGenesis>(() => leerCopiaLocalChatsGenesis());
    const [prefsLeidas, setPrefsLeidas] = useState(false);
    const [elegida, setElegida] = useState<string | null>(leerSeleccion);
    const primeraEscritura = useRef(false);

    useEffect(() => {
        let vivo = true;
        setComprobando(true);
        void miAccesoMetaGenesis().then((a) => {
            if (!vivo) return;
            setAcceso(a);
            setComprobando(false);
        });
        return () => { vivo = false; };
    }, [vueltaAcceso]);

    useEffect(() => {
        let vivo = true;
        void misEntidades().then((r) => {
            if (vivo && r.ok) setEntidades(r.lista.map((e) => ({ id: e.id, nombre: e.nombre, tipo: e.tipo === "grupo" ? "grupo" : "pagina", rango: e.rango })));
        }).catch(() => { /* sin entidades: el grupo PoliGenesis lo dice */ });
        void leerPrefsChatsGenesis().then((p) => {
            if (!vivo) return;
            setPrefs(p);
            setPrefsLeidas(true);
        });
        return () => { vivo = false; };
    }, []);

    // §3.3: la primera vez que un miembro abre la pestaña se activa su conexión a MetaGenesis (una escritura).
    useEffect(() => {
        if (!prefsLeidas || !acceso?.miembro || prefs.conexiones.metagenesis || primeraEscritura.current) return;
        primeraEscritura.current = true;
        const nuevas = conMetaGenesisInicial(prefs);
        setPrefs(nuevas);
        void guardarPrefsChatsGenesis(nuevas).catch(() => { /* queda en la copia local; se reintenta al volver a abrir */ });
    }, [prefsLeidas, acceso, prefs]);

    const entradas = useMemo(() => entradasDeLista(acceso, entidades, prefs.vinculos), [acceso, entidades, prefs.vinculos]);
    const porDefecto = acceso?.miembro ? ID_DIRECCION : ID_AGENTE_GENESIS;
    const valor = elegida && entradas.some((e) => e.id === elegida) ? elegida : porDefecto;
    const elegir = useCallback((id: string) => {
        setElegida(id);
        guardarSeleccion(id);
    }, []);

    return (
        <div data-testid="pestana-genesis" className="flex min-h-0 w-full min-w-0 max-w-full flex-1 flex-col gap-3 box-border lg:flex-row">
            <ListaChatsGenesis
                acceso={acceso}
                comprobandoAcceso={comprobando}
                entidades={entidades}
                vinculos={prefs.vinculos}
                valor={valor}
                onElegir={elegir}
                onReintentarAcceso={() => setVueltaAcceso((v) => v + 1)}
            />
            <div className="flex min-h-0 min-w-0 flex-1 flex-col rounded-xl border border-white/10 bg-background/50 p-2 shadow-sm sm:p-3">
                <Panel valor={valor} cliente={puerta} acceso={acceso} comprobando={comprobando} prefs={prefs} entidades={entidades} onElegir={elegir} />
            </div>
        </div>
    );
}

function Panel({ valor, cliente, acceso, comprobando, prefs, entidades, onElegir }: {
    valor: string;
    cliente: ClienteChatsGenesis;
    acceso: AccesoMeta | null;
    comprobando: boolean;
    prefs: PrefsChatsGenesis;
    entidades: EntidadLista[];
    onElegir: (id: string) => void;
}) {
    if (comprobando && !valor.startsWith("v:") && !valor.startsWith("poli:")) {
        return <p role="status" className="p-3 text-[12px] text-white/50">Comprobando tu acceso a MetaGenesis…</p>;
    }
    if (valor === ID_DIRECCION && acceso?.miembro) return <HiloDireccion key="direccion" cliente={cliente} esDueno={acceso.dueno} />;
    if (valor.startsWith("puente:") && acceso?.miembro) {
        const puente = valor.slice(7) as PuenteTelegram;
        return <HiloPuente key={valor} cliente={cliente} puente={puente} esDueno={acceso.dueno} />;
    }
    if (valor.startsWith("v:")) {
        const v = prefs.vinculos.find((x) => idDeEntradaVinculo(x) === valor);
        if (v) return <PanelVinculo vinculo={v} />;
    }
    if (valor.startsWith("poli:")) {
        const e = entidades.find((x) => `poli:${x.id}` === valor);
        if (e) return <PanelEntidad entidad={e} vinculos={prefs.vinculos.filter((x) => x.nivel === "poligenesis" && x.entidad === e.id && x.en.includes("genesis"))} onElegir={onElegir} />;
    }
    return <PanelAgente conectado={prefs.conexiones.genesis?.activo === true} comprobando={comprobando} />;
}

// ── Paneles sin hilo propio en la fase 1 ─────────────────────────────────────

function Tarjeta({ icono: Icono, acento, titulo, children }: { icono: typeof Bot; acento: string; titulo: string; children: ReactNode }) {
    return (
        <section aria-label={titulo} className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-1 sm:p-2">
            <header className="flex items-center gap-2.5">
                <span className="grid size-9 shrink-0 place-items-center rounded-lg border border-white/10 bg-white/[0.03]">
                    <Icono className={cn("size-4", acento)} />
                </span>
                <h2 className="min-w-0 break-words text-sm font-semibold text-white">{titulo}</h2>
            </header>
            {children}
        </section>
    );
}

function Enlace({ href, children }: { href: string; children: ReactNode }) {
    return (
        <Link href={href} className="inline-flex min-h-10 w-fit cursor-pointer items-center gap-1.5 rounded-lg border border-white/12 bg-white/[0.04] px-3 py-2 text-xs font-medium text-white/85 transition-colors hover:bg-white/[0.08] hover:text-white">
            <ExternalLink className="size-3.5" aria-hidden /> {children}
        </Link>
    );
}

function PanelAgente({ conectado, comprobando }: { conectado: boolean; comprobando: boolean }) {
    return (
        <Tarjeta icono={Bot} acento="text-emerald-300" titulo="Agente de Mi Genesis">
            <p className="max-w-prose text-[13px] leading-relaxed text-white/70">
                Propone cambios de tu cuenta como operaciones tipadas: siempre con vista previa, se aplican con dos toques y se pueden deshacer. Nunca ejecuta órdenes ni toca código.
            </p>
            <p className="max-w-prose text-[12px] leading-relaxed text-white/50">
                Hoy se usa desde Mi Genesis. {TEXTO_FASE_2}
                {comprobando ? null : conectado ? " Su conexión está activa en Conexiones de chat." : " Su conexión aún no está activa en Conexiones de chat."}
            </p>
            <Enlace href="/genesis?nivel=mi">Abrir Mi Genesis</Enlace>
        </Tarjeta>
    );
}

function PanelVinculo({ vinculo: v }: { vinculo: VinculoChat }) {
    const titulo = v.titulo && v.titulo.trim() !== "" ? v.titulo : v.fuente.tipo === "telegram-sincronizado" ? "Chat de Telegram" : "Chat de Astraura";
    const nivel = v.nivel === "metagenesis" ? "MetaGenesis" : v.nivel === "poligenesis" ? "PoliGenesis" : "Genesis (tu cuenta)";
    const href = v.fuente.tipo === "astraura" ? `/agent/chat?id=${encodeURIComponent(v.fuente.convId)}` : "/agent?tab=conexiones-chat&foco=telegram";
    return (
        <Tarjeta icono={MessageSquare} acento="text-emerald-200" titulo={titulo}>
            <p className="max-w-prose text-[13px] leading-relaxed text-white/70">
                Vinculado a {nivel}. {v.en.includes("chats") ? "También está en Chats: es el mismo chat, no una copia." : "Solo está en Genesis; en Chats no aparece."}
            </p>
            <p className="text-[12px] text-white/45">Su conversación se lee y se escribe en el chat de origen.</p>
            <Enlace href={href}>{v.fuente.tipo === "astraura" ? "Abrir el chat" : "Ver la opción Telegram"}</Enlace>
        </Tarjeta>
    );
}

function PanelEntidad({ entidad: e, vinculos, onElegir }: { entidad: EntidadLista; vinculos: VinculoChat[]; onElegir: (id: string) => void }) {
    return (
        <Tarjeta icono={Users} acento="text-fuchsia-300" titulo={e.nombre}>
            {vinculos.length === 0 ? (
                <p className="max-w-prose text-[13px] leading-relaxed text-white/60">
                    {e.tipo === "grupo" ? "Este grupo" : "Esta página"} aún no tiene chats de Genesis. Desde Chats: menú del chat › Llevar a Genesis, eligiendo PoliGenesis.
                </p>
            ) : (
                <ul className="flex flex-col gap-1">
                    {vinculos.map((v) => (
                        <li key={v.id}>
                            <button type="button" onClick={() => onElegir(idDeEntradaVinculo(v))} className="flex w-full cursor-pointer items-center gap-2 rounded-lg px-2 py-2 text-left text-[13px] text-white/80 hover:bg-white/[0.05]">
                                <MessageSquare className="size-4 shrink-0 text-fuchsia-200" aria-hidden />
                                <span className="min-w-0 flex-1 break-words">{v.titulo || "Chat de Astraura"}</span>
                            </button>
                        </li>
                    ))}
                </ul>
            )}
            <Enlace href={`/poligenesis?entidad=${encodeURIComponent(e.id)}`}>Abrir en PoliGenesis</Enlace>
        </Tarjeta>
    );
}

export default PestanaGenesis;
