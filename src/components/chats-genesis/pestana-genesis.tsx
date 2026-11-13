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
 *
 * GEN1114F: aquí se leen, una vez para toda la pestaña, el catálogo de nombres de la Mac (`canon`) y la
 * clave de este aparato, y se pasan a los hilos: de ahí salen el nombre que se ve y se firma, y si se
 * puede escribir. Sin catálogo se dice desde cuándo falta; los nombres quedan como provisionales.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { Bot, ExternalLink, MessageSquare, Users } from "lucide-react";

import { miAccesoMetaGenesis } from "@/lib/metagenesis/accesos";
import { misEntidades } from "@/lib/genesis/entidades";
import { crearClienteChatsGenesis, type ClienteChatsGenesis } from "@/lib/chats-genesis/puerta-chats";
import { crearClienteCanon, leerCopiaCanon, type CatalogoCanon } from "@/lib/chats-genesis/canon";
import { consultarEmparejamiento, crearClienteAparatos, type ClienteAparatos } from "@/lib/chats-genesis/emparejar";
import { aparatoLocal, type AparatoLocal } from "@/lib/chats-genesis/firma-aparato";
import type { PrefsChatsGenesis, PuenteTelegram, VinculoChat } from "@/lib/chats-genesis/tipos";
import { conMetaGenesisInicial, guardarPrefsChatsGenesis, leerCopiaLocalChatsGenesis, leerPrefsChatsGenesis } from "@/lib/chats-genesis/vinculos";
import { estadoAgenteGenesis } from "@/components/messaging/conexiones-genesis";
import { cn } from "@/lib/utils";

import { momentoTexto } from "./cabecera-espejo";
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
    /** GEN1114F · pruebas: el cliente del catálogo y el de emparejar (por defecto, los de la app). */
    clienteCanon?: ReturnType<typeof crearClienteCanon>;
    clienteAparatos?: ClienteAparatos;
}

/** Cada cuánto se vuelve a pedir el catálogo mientras la pestaña está abierta. */
const CATALOGO_CADA_MS = 10 * 60_000;

/** Lee el catálogo de la Mac (por la puerta) y dice, si falta, por qué y desde cuándo (§10). */
function useCatalogo(miembro: boolean, clienteCanon?: ReturnType<typeof crearClienteCanon>) {
    const [catalogo, setCatalogo] = useState<CatalogoCanon | null>(() => leerCopiaCanon()?.catalogo ?? null);
    const [aviso, setAviso] = useState<string | null>(null);
    const fallaDesde = useRef<number | null>(null);
    useEffect(() => {
        if (!miembro) return;
        const cli = clienteCanon ?? crearClienteCanon();
        const ctl = new AbortController();
        const leer = async () => {
            const r = await cli.leer(ctl.signal).catch(() => ({ ok: false as const, estado: 0, error: "La puerta de datos del A1 no responde", copia: null }));
            if (ctl.signal.aborted) return;
            if (r.ok) {
                fallaDesde.current = null;
                setCatalogo(r.catalogo);
                setAviso(r.catalogo ? null : "La Mac aún no ha publicado el catálogo de nombres: los nombres son provisionales.");
                return;
            }
            if (fallaDesde.current === null) fallaDesde.current = Date.now();
            const desde = momentoTexto(fallaDesde.current, Date.now());
            setCatalogo(r.copia);
            setAviso(r.copia
                ? `Nombres de la copia guardada en este aparato: no se pudo leer el catálogo de la Mac desde ${desde} (${r.error}).`
                : `Sin catálogo de la Mac desde ${desde} (${r.error}): los nombres son provisionales.`);
        };
        void leer();
        const id = window.setInterval(() => void leer(), CATALOGO_CADA_MS);
        return () => { ctl.abort(); window.clearInterval(id); };
    }, [miembro, clienteCanon]);
    return { catalogo, aviso };
}

/** La clave de este aparato: undefined mientras se lee; después, la que haya (o null). */
function useAparato(miembro: boolean, clienteAparatos?: ClienteAparatos) {
    const [aparato, setAparato] = useState<AparatoLocal | null | undefined>(undefined);
    useEffect(() => {
        if (!miembro) return;
        let vivo = true;
        void (async () => {
            const a = await aparatoLocal().catch(() => null);
            if (!vivo) return;
            setAparato(a);
            // La puerta dice si la Mac lo emparejó, con qué nivel o si lo retiró (solo informa).
            if (a && a.estado !== "sin-emparejar") {
                const nuevo = await consultarEmparejamiento(clienteAparatos ?? crearClienteAparatos()).catch(() => null);
                if (vivo && nuevo) setAparato(nuevo);
            }
        })();
        return () => { vivo = false; };
    }, [miembro, clienteAparatos]);
    return [aparato, setAparato] as const;
}

export function PestanaGenesis({ cliente, clienteCanon, clienteAparatos }: PestanaGenesisProps) {
    const puerta = useMemo(() => cliente ?? crearClienteChatsGenesis(), [cliente]);
    const [acceso, setAcceso] = useState<AccesoMeta | null>(null);
    const [comprobando, setComprobando] = useState(true);
    const [vueltaAcceso, setVueltaAcceso] = useState(0);
    const [entidades, setEntidades] = useState<EntidadLista[]>([]);
    const [prefs, setPrefs] = useState<PrefsChatsGenesis>(() => leerCopiaLocalChatsGenesis());
    const [prefsLeidas, setPrefsLeidas] = useState(false);
    const [elegida, setElegida] = useState<string | null>(leerSeleccion);
    const primeraEscritura = useRef(false);
    const [avisoPrefs, setAvisoPrefs] = useState<string | null>(null);

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
        // GEN1113INT: `guardarPrefsChatsGenesis` lanza si la cuenta no guardó: se dice (queda en la copia
        // local de este aparato y se vuelve a intentar la próxima vez que se abra la pestaña).
        void guardarPrefsChatsGenesis(nuevas).then(
            () => setAvisoPrefs(null),
            () => setAvisoPrefs("No se pudo guardar en tu cuenta la conexión a MetaGenesis; queda en este aparato y se reintenta al volver a abrir Genesis."),
        );
    }, [prefsLeidas, acceso, prefs]);

    const miembro = acceso?.miembro === true;
    const { catalogo, aviso: avisoCatalogo } = useCatalogo(miembro, clienteCanon);
    const [aparato, setAparato] = useAparato(miembro, clienteAparatos);
    const entradas = useMemo(() => entradasDeLista(acceso, entidades, prefs.vinculos, catalogo), [acceso, entidades, prefs.vinculos, catalogo]);
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
                catalogo={catalogo}
                avisoCatalogo={avisoCatalogo}
            />
            <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2 rounded-xl border border-white/10 bg-background/50 p-2 shadow-sm sm:p-3">
                {avisoPrefs ? (
                    <p role="status" data-testid="aviso-prefs" className="shrink-0 rounded-lg border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-[12px] leading-snug text-amber-100">{avisoPrefs}</p>
                ) : null}
                <Panel valor={valor} cliente={puerta} acceso={acceso} comprobando={comprobando} prefs={prefs} prefsLeidas={prefsLeidas} entidades={entidades} onElegir={elegir} catalogo={catalogo} aparato={aparato} onAparato={setAparato} />
            </div>
        </div>
    );
}

function Panel({ valor, cliente, acceso, comprobando, prefs, prefsLeidas, entidades, onElegir, catalogo, aparato, onAparato }: {
    valor: string;
    cliente: ClienteChatsGenesis;
    acceso: AccesoMeta | null;
    comprobando: boolean;
    prefs: PrefsChatsGenesis;
    prefsLeidas: boolean;
    entidades: EntidadLista[];
    onElegir: (id: string) => void;
    catalogo: CatalogoCanon | null;
    aparato: AparatoLocal | null | undefined;
    onAparato: (a: AparatoLocal | null) => void;
}) {
    if (comprobando && !valor.startsWith("v:") && !valor.startsWith("poli:")) {
        return <p role="status" className="p-3 text-[12px] text-white/50">Comprobando tu acceso a MetaGenesis…</p>;
    }
    if (valor === ID_DIRECCION && acceso?.miembro) {
        return <HiloDireccion key="direccion" cliente={cliente} esDueno={acceso.dueno} aparato={aparato} catalogo={catalogo} onAparato={onAparato} />;
    }
    if (valor.startsWith("puente:") && acceso?.miembro) {
        const puente = valor.slice(7) as PuenteTelegram;
        return <HiloPuente key={valor} cliente={cliente} puente={puente} esDueno={acceso.dueno} aparato={aparato} catalogo={catalogo} onAparato={onAparato} />;
    }
    if (valor.startsWith("v:")) {
        const v = prefs.vinculos.find((x) => idDeEntradaVinculo(x) === valor);
        if (v) return <PanelVinculo vinculo={v} />;
    }
    if (valor.startsWith("poli:")) {
        const e = entidades.find((x) => `poli:${x.id}` === valor);
        if (e) return <PanelEntidad entidad={e} vinculos={prefs.vinculos.filter((x) => x.nivel === "poligenesis" && x.entidad === e.id && x.en.includes("genesis"))} onElegir={onElegir} />;
    }
    return <PanelAgente conexion={prefs.conexiones.genesis} leida={prefsLeidas} />;
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

/**
 * GEN1114F: lo que se dice de la conexión es EXACTAMENTE lo de Conexiones de chat (`estadoAgenteGenesis`,
 * la misma función y las mismas preferencias), con un enlace a la tarjeta donde se cambia.
 */
function PanelAgente({ conexion, leida }: { conexion: { activo: boolean; memoria: boolean } | undefined; leida: boolean }) {
    const historia = estadoAgenteGenesis(conexion);
    return (
        <Tarjeta icono={Bot} acento="text-emerald-300" titulo="Agente de Mi Genesis">
            <p className="max-w-prose text-[13px] leading-relaxed text-white/70">
                Propone cambios de tu cuenta como operaciones tipadas: siempre con vista previa, se aplican con dos toques y se pueden deshacer. Nunca ejecuta órdenes ni toca código.
            </p>
            <p className="max-w-prose text-[12px] leading-relaxed text-white/50">Hoy se usa desde Mi Genesis. {TEXTO_FASE_2}</p>
            {leida ? (
                <p data-testid="estado-agente-genesis" className={cn("max-w-prose rounded-lg border px-3 py-2 text-[12px] leading-relaxed", historia.activo ? "border-emerald-400/25 bg-emerald-500/[0.07] text-emerald-100" : "border-white/10 bg-white/[0.03] text-white/70")}>
                    {historia.texto}
                </p>
            ) : (
                <p role="status" className="text-[12px] text-white/45">Leyendo tu conexión en Conexiones de chat…</p>
            )}
            <div className="flex flex-wrap gap-2">
                <Enlace href="/genesis?nivel=mi">Abrir Mi Genesis</Enlace>
                <Enlace href="/agent?tab=conexiones-chat&foco=genesis">{historia.activo ? "Cambiarla en Conexiones de chat" : "Activarlo en Conexiones de chat"}</Enlace>
            </div>
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
