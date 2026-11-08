"use client";

/**
 * PanelNeuronas — pestaña «Neuronas» de Mensajes (MSJ1107A · 2026-11-07).
 * Las conversaciones con las neuronas vinculadas de TODOS los cerebros de la cuenta (y de los
 * cerebros de grupos que la cuenta comparte), agrupadas por cerebro. Cada mensaje sale por los
 * medios que permiten los ajustes de ese chat y dice por dónde viajó. El historial vive en este
 * aparato: funciona sin internet.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Phone, RefreshCw, Route, Search, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { AvisoSesion } from "@/components/auth/aviso-sesion";
import { ACENTO, CLASE_ROTULO, pildoraFantasma } from "@/components/messages/marco/estilos";
import { MarcoDosPaneles } from "@/components/messages/marco/marco-dos-paneles";
import { etiquetaFechaLista } from "@/components/messages/marco/formato-tiempo";
import { HiloNeurona } from "@/components/messages/neuronas/hilo-neurona";
import { IconoNeurona } from "@/components/messages/neuronas/icono-neurona";
import {
    agruparNeuronasPorCerebro, type AmbitoSeccion, type CerebroBasico, type ConversacionNeurona, type NeuronaBasica,
} from "@/lib/mensajeria/neuronas/agrupar";
import { esClaveNeurona, noLeidosDe, ultimoDe } from "@/lib/mensajeria/neuronas/bandeja";
import { buzonEscuchando, fijarNombreEstaNeurona, useBandejaMalla } from "@/lib/mensajeria/neuronas/buzon";
import { claveChat, usePreferenciasMedio } from "@/lib/mensajeria/medios/preferencias-store";

export interface PanelNeuronasProps {
    esMovil: boolean;
    enfocado: boolean;
    onAlternarEnfoque: () => void;
    /** Avisa a la página cuando hay un chat abierto (en móvil aparta la barra de la sección). */
    onDetalleAbierto?: (abierto: boolean) => void;
    /** (NOT1108A) Abre esta conversación (`n:<neurona>` / `c:<cuenta>`): el aviso de un mensaje nuevo pulsado. */
    abrirClave?: string | null;
}

interface Datos {
    cargando: boolean;
    cerebros: CerebroBasico[];
    neuronas: NeuronaBasica[];
    miUid: string | null;
    sinSesion: boolean;
}

const ETIQUETA_AMBITO: Record<AmbitoSeccion, string> = {
    cuenta: "Cerebros de tu cuenta",
    grupo: "Cerebros de grupos",
    compartido: "Compartido contigo",
    otras: "Fuera de tus cerebros",
};

function plegar(s: string): string {
    return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

export function PanelNeuronas({ esMovil, enfocado, onAlternarEnfoque, onDetalleAbierto, abrirClave }: PanelNeuronasProps) {
    const bandeja = useBandejaMalla();
    const medios = usePreferenciasMedio();
    const [datos, setDatos] = useState<Datos>({ cargando: true, cerebros: [], neuronas: [], miUid: null, sinSesion: false });
    const [seleccion, setSeleccion] = useState<string | null>(null);
    const [verDetalle, setVerDetalle] = useState(false);
    const [busqueda, setBusqueda] = useState("");

    const cargar = useCallback(async (fresco = false) => {
        setDatos((d) => ({ ...d, cargando: true }));
        try {
            const [neu, br, comp, usu] = await Promise.all([
                import("@/lib/neurons/neurons"),
                import("@/lib/brains/brains"),
                import("@/lib/cerebros/compartidos"),
                import("@/lib/consumo/usuario"),
            ]);
            const [neuronas, propios, compartidos, uid] = await Promise.all([
                neu.listNeurons({ fresco }).catch(() => []),
                br.listarCerebros().catch(() => ({ ok: false, brains: [] })),
                comp.listarCerebrosCompartidos().catch(() => ({ ok: false, brains: [] })),
                usu.uidActual().catch(() => null),
            ]);
            setDatos({
                cargando: false,
                miUid: uid,
                sinSesion: !uid,
                neuronas: neuronas.map((n) => ({
                    id: n.id,
                    name: n.name,
                    kind: n.kind,
                    online: n.online,
                    isThisDevice: n.isThisDevice,
                    last_seen_at: n.last_seen_at,
                    // (NEU1108A) Versión y aparato de su fila, para el chat cuando la presencia no los trae.
                    capabilities: (n.capabilities ?? null) as unknown as Record<string, unknown> | null,
                })),
                cerebros: [
                    ...propios.brains.map((b) => ({ id: b.id, name: b.name, scope: b.scope, scope_ref: b.scope_ref, owner: b.owner, servers: b.servers as Array<Record<string, unknown>> })),
                    ...compartidos.brains.map((b) => ({ id: b.id, name: b.name, scope: b.scope, scope_ref: b.scope_ref, owner: b.owner, compartido: true })),
                ],
            });
        } catch {
            setDatos((d) => ({ ...d, cargando: false }));
        }
    }, []);

    useEffect(() => {
        void cargar(false);
    }, [cargar]);

    const nombresConocidos = useMemo(() => {
        const out: Record<string, string> = {};
        for (const [clave, c] of Object.entries(bandeja.conv)) {
            const conNombre = [...c.mensajes].reverse().find((m) => m.dir === "entra" && m.deNombre);
            if (conNombre?.deNombre) out[clave] = conNombre.deNombre;
        }
        return out;
    }, [bandeja]);

    const agrupado = useMemo(
        () =>
            agruparNeuronasPorCerebro({
                cerebros: datos.cerebros,
                neuronas: datos.neuronas,
                miUid: datos.miUid,
                clavesConMensajes: Object.keys(bandeja.conv).filter(esClaveNeurona),
                nombresConocidos,
            }),
        [datos, bandeja, nombresConocidos],
    );

    useEffect(() => {
        fijarNombreEstaNeurona(agrupado.estaNeurona?.name);
    }, [agrupado.estaNeurona?.name]);

    // Cerebros de cada conversación (una neurona puede servir a varias secciones).
    const cerebrosDe = useMemo(() => {
        const out: Record<string, string[]> = {};
        for (const s of agrupado.secciones) for (const c of s.conversaciones) out[c.clave] = [...(out[c.clave] ?? []), ...s.cerebros];
        return out;
    }, [agrupado]);

    const todas = useMemo(() => {
        const m = new Map<string, ConversacionNeurona>();
        for (const s of agrupado.secciones) for (const c of s.conversaciones) if (!m.has(c.clave)) m.set(c.clave, c);
        return m;
    }, [agrupado]);

    const seleccionada = seleccion ? todas.get(seleccion) ?? null : null;

    // (NOT1108A) ?neurona=<clave>: el chat de la notificación pulsada (en cuanto la conversación está en la
    // lista). Una vez por clave: después manda lo que la persona elija.
    const abiertaPorAviso = useRef<string | null>(null);
    useEffect(() => {
        if (!abrirClave || abiertaPorAviso.current === abrirClave || !esClaveNeurona(abrirClave) || !todas.has(abrirClave)) return;
        abiertaPorAviso.current = abrirClave;
        setSeleccion(abrirClave);
        setVerDetalle(true);
    }, [abrirClave, todas]);

    // En escritorio, la primera conversación con mensajes (o la primera) se abre sola.
    useEffect(() => {
        if (seleccion || esMovil || datos.cargando || !todas.size) return;
        const conMensajes = Array.from(todas.keys()).find((k) => (bandeja.conv[k]?.mensajes.length ?? 0) > 0);
        setSeleccion(conMensajes ?? Array.from(todas.keys())[0]);
    }, [seleccion, esMovil, datos.cargando, todas, bandeja]);

    const detalleVisible = verDetalle && !!seleccionada;
    useEffect(() => {
        onDetalleAbierto?.(esMovil && detalleVisible);
    }, [esMovil, detalleVisible, onDetalleAbierto]);
    useEffect(() => () => onDetalleAbierto?.(false), [onDetalleAbierto]);

    const filtro = plegar(busqueda.trim());
    const secciones = agrupado.secciones
        .map((s) => ({
            ...s,
            conversaciones: filtro ? s.conversaciones.filter((c) => plegar(`${c.nombre} ${s.titulo}`).includes(filtro)) : s.conversaciones,
        }))
        .filter((s) => s.conversaciones.length > 0);

    const abrir = (clave: string) => {
        setSeleccion(clave);
        setVerDetalle(true);
    };

    const fila = (c: ConversacionNeurona, seccionId: string) => {
        const ultimo = ultimoDe(bandeja, c.clave);
        const sinLeer = noLeidosDe(bandeja, c.clave);
        const activa = c.clave === seleccion && !esMovil;
        const propio = !!medios.estado.porChat[claveChat("neurona", c.clave)];
        const espera = bandeja.conv[c.clave]?.mensajes.some((m) => m.dir === "sale" && m.estado === "en-espera");
        return (
            <li key={`${seccionId}-${c.clave}`}>
                <button
                    type="button"
                    onClick={() => abrir(c.clave)}
                    aria-current={activa ? "true" : undefined}
                    className={cn(
                        "flex w-full cursor-pointer items-center gap-3 rounded-2xl p-2.5 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#7C5CFF]",
                        activa ? "bg-white/[0.07]" : "hover:bg-white/[0.04]",
                    )}
                    style={activa ? pildoraFantasma(ACENTO.mensajes) : undefined}
                >
                    <IconoNeurona kind={c.kind} propia={c.propia} enLinea={c.enLinea} />
                    <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5">
                            <span className={cn("truncate text-[14px] text-white", sinLeer ? "font-bold" : "font-semibold")}>{c.nombre}</span>
                            {propio && <Route className="h-3 w-3 shrink-0 text-[#10B981]" aria-label="Con su propio medio de transmisión" />}
                            {ultimo && <span className="ml-auto shrink-0 pl-1 text-[11px] text-white/50">{etiquetaFechaLista(new Date(ultimo.at).toISOString(), true)}</span>}
                        </span>
                        <span className="mt-0.5 flex items-center gap-1.5">
                            <span className={cn("min-w-0 flex-1 truncate text-[13px]", sinLeer ? "text-white/80" : "text-white/55")}>
                                {ultimo ? `${ultimo.dir === "sale" ? "Tú: " : ""}${ultimo.texto}` : c.detalle}
                            </span>
                            {espera && <span className="shrink-0 text-[11px] font-semibold text-[#FFBF00]">En espera</span>}
                            {sinLeer > 0 && (
                                <span
                                    className="min-w-[20px] shrink-0 rounded-full px-1.5 text-center text-[11px] font-bold leading-5 text-white"
                                    style={{ background: ACENTO.mensajes }}
                                    aria-label={`${sinLeer} sin leer`}
                                >
                                    {sinLeer > 99 ? "99+" : sinLeer}
                                </span>
                            )}
                        </span>
                    </span>
                </button>
            </li>
        );
    };

    const lista = (
        <div className="flex h-full min-h-0 flex-col">
            <div className="shrink-0 space-y-3 px-4 pb-3 pt-4">
                <div className="flex items-center justify-between gap-2">
                    <h1 className="text-[20px] font-semibold tracking-tight text-white">Neuronas</h1>
                    <button
                        type="button"
                        onClick={() => void cargar(true)}
                        disabled={datos.cargando}
                        aria-label="Actualizar neuronas y cerebros"
                        title="Actualizar neuronas y cerebros"
                        className="ss-redondo grid h-9 w-9 shrink-0 cursor-pointer place-items-center rounded-full border border-white/[0.08] bg-white/[0.04] text-white/75 transition-colors hover:bg-white/[0.09] hover:text-white disabled:cursor-wait"
                    >
                        {datos.cargando ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                    </button>
                </div>
                <p className="text-[12px] leading-relaxed text-white/55">
                    Mensajes con las neuronas de tus cerebros.{" "}
                    {buzonEscuchando() ? "Escuchando por la malla y por el canal de tu cuenta." : "La escucha por la malla aún no arrancó en esta pestaña."}
                    {agrupado.estaNeurona ? ` Estás en «${agrupado.estaNeurona.name}».` : ""}
                </p>
                <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
                    <input
                        value={busqueda}
                        onChange={(e) => setBusqueda(e.target.value)}
                        placeholder="Buscar neurona o cerebro"
                        aria-label="Buscar neurona o cerebro"
                        className="h-10 w-full rounded-2xl border border-white/[0.08] bg-white/[0.04] pl-9 pr-9 text-[14px] text-white placeholder:text-white/40 transition-colors focus:border-[#7C5CFF]/60 focus:bg-white/[0.06] focus:outline-none"
                    />
                    {busqueda && (
                        <button
                            type="button"
                            onClick={() => setBusqueda("")}
                            aria-label="Borrar la búsqueda"
                            className="ss-redondo absolute right-2 top-1/2 grid h-6 w-6 -translate-y-1/2 cursor-pointer place-items-center rounded-full text-white/50 hover:bg-white/10 hover:text-white"
                        >
                            <X className="h-3.5 w-3.5" />
                        </button>
                    )}
                </div>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3" data-testid="lista-neuronas">
                {datos.cargando && !agrupado.secciones.length ? (
                    <div className="space-y-2 p-2" aria-busy="true" aria-label="Cargando neuronas">
                        {[0, 1, 2].map((i) => (
                            <div key={i} className="flex items-center gap-3 rounded-2xl p-2.5">
                                <div className="h-10 w-10 animate-pulse rounded-2xl bg-white/[0.06]" />
                                <div className="flex-1 space-y-2">
                                    <div className="h-3 w-1/2 animate-pulse rounded bg-white/[0.06]" />
                                    <div className="h-3 w-3/4 animate-pulse rounded bg-white/[0.04]" />
                                </div>
                            </div>
                        ))}
                    </div>
                ) : secciones.length ? (
                    secciones.map((s) => (
                        <section key={s.id} aria-label={s.titulo} className="pb-2">
                            <div className="flex items-end gap-2 px-3 pb-1 pt-2">
                                <div className="min-w-0 flex-1">
                                    <p className={CLASE_ROTULO}>{ETIQUETA_AMBITO[s.ambito]}</p>
                                    <p className="truncate text-[13px] font-semibold text-white/85" title={s.cerebros.join(" · ") || s.titulo}>
                                        {s.titulo}
                                    </p>
                                </div>
                                {s.conversaciones.length > 1 && <BotonGrupoNeuronas titulo={s.titulo} seccionId={s.id} conversaciones={s.conversaciones} />}
                            </div>
                            <ul className="space-y-0.5">{s.conversaciones.map((c) => fila(c, s.id))}</ul>
                        </section>
                    ))
                ) : datos.sinSesion && !filtro ? (
                    <div className="px-2 py-8">
                        <AvisoSesion
                            texto="Inicia sesión para ver tus neuronas"
                            detalle="Las neuronas son los aparatos de tu cuenta y de los cerebros que compartes."
                            compacto
                        />
                    </div>
                ) : (
                    <div className="flex flex-col items-center justify-center gap-2 px-6 py-16 text-center" role="status">
                        <Route className="h-8 w-8 text-white/25" />
                        <p className="text-[14px] font-medium text-white/80">{filtro ? "Ninguna neurona coincide" : "Aún no hay otras neuronas vinculadas"}</p>
                        {!filtro && (
                            <p className="max-w-[260px] text-[12px] leading-relaxed text-white/50">
                                Abre StarSeed OS en otro aparato con tu cuenta (o vincúlalo sin internet) y aparecerá aquí, con su cerebro.
                            </p>
                        )}
                    </div>
                )}
            </div>
        </div>
    );

    const detalle = seleccionada ? (
        <HiloNeurona
            key={seleccionada.clave}
            conversacion={seleccionada}
            cerebros={Array.from(new Set(cerebrosDe[seleccionada.clave] ?? []))}
            esMovil={esMovil}
            onAtras={esMovil ? () => setVerDetalle(false) : undefined}
            enfocado={enfocado}
            onAlternarEnfoque={esMovil ? undefined : onAlternarEnfoque}
        />
    ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
            <span className="grid h-16 w-16 place-items-center rounded-3xl" style={pildoraFantasma(ACENTO.esmeralda)}>
                <Route className="h-7 w-7 text-white/85" />
            </span>
            <p className="text-[15px] font-medium text-white/85">Elige una neurona</p>
            <p className="max-w-xs text-[13px] text-white/55">Escríbele por la malla sin internet, tu red local o el servidor: tú decides el medio.</p>
        </div>
    );

    return (
        <MarcoDosPaneles
            esMovil={esMovil}
            enfocado={enfocado && !!seleccionada}
            verDetalle={detalleVisible}
            claveDetalle={seleccionada?.clave ?? "vacio"}
            etiquetaLista="Lista de neuronas"
            etiquetaDetalle="Chat con la neurona"
            lista={lista}
            detalle={detalle}
        />
    );
}

export default PanelNeuronas;

/**
 * (GRP1107A) Llamada de grupo con las neuronas de esta sección por la malla (sin servidor): suena
 * en cada aparato con enlace sin internet abierto (los tuyos y los de las cuentas de la sección);
 * cada par se ve por su propio enlace. Tope de 6 aparatos; con más de 4, solo voz.
 */
function BotonGrupoNeuronas({ titulo, seccionId, conversaciones }: { titulo: string; seccionId: string; conversaciones: Array<{ destino: { uid?: string } }> }) {
    const [ocupado, setOcupado] = useState(false);
    const llamar = () => {
        if (ocupado) return;
        setOcupado(true);
        const miembros = Array.from(new Set(conversaciones.map((c) => c.destino.uid).filter((u): u is string => !!u)));
        void import("@/lib/llamadas/grupo-malla-motor")
            .then((g) => g.empezarLlamadaGrupoMalla({ hiloId: `cerebro-${seccionId}`, tipoChat: "grupo", tipo: "audio", titulo, miembros }))
            .then((r) => {
                if (!r.ok) toast.error(r.motivo ?? "No se pudo llamar a estas neuronas por la malla.");
            })
            .catch(() => toast.error("No se pudo llamar a estas neuronas por la malla."))
            .finally(() => setOcupado(false));
    };
    return (
        <button
            type="button"
            onClick={llamar}
            disabled={ocupado}
            title="Llamada de grupo por la malla (sin servidor)"
            aria-label={`Llamada de grupo por la malla con las neuronas de ${titulo}`}
            className="ss-redondo grid h-8 w-8 shrink-0 cursor-pointer place-items-center rounded-full text-white/70 transition-colors hover:bg-white/10 hover:text-white disabled:cursor-wait disabled:opacity-50"
        >
            {ocupado ? <Loader2 className="h-4 w-4 animate-spin" /> : <Phone className="h-4 w-4" />}
        </button>
    );
}
