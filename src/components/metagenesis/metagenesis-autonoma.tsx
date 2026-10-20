"use client";

/*
 * MetaGenesisAutonoma — el panel de la MetaGenesis que funciona sola (OPA1011, 2026-10-10).
 * Se ve igual desde cualquier neurona (la web de Vercel, la app nativa, otra máquina) porque NO
 * pregunta a la Mac: lee lo que los nodos publican en Supabase (quién dirige, cada medio con su
 * latido, el trabajo, lo último que decidió el líder) y manda órdenes que ejecuta el líder.
 * Solo para miembros de MetaGenesis (a quien no lo es no se le pinta nada: lo explica la
 * envoltura de /metagenesis). Lectura cada 90 s con la pestaña visible y, al momento, cuando el
 * bus avisa de una foto, un cambio de líder o una orden contestada.
 * Lógica pura: `src/lib/metagenesis/remoto-nodos.ts`. SOP: architecture/metagenesis-autonoma.md
 */

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import {
    Activity,
    Cloud,
    Cpu,
    Crown,
    Laptop,
    Loader2,
    Network,
    PauseCircle,
    PlayCircle,
    RefreshCw,
    Server,
    Wrench,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { miAccesoMetaGenesis } from "@/lib/metagenesis/accesos";
import { enviarOrden, leerEstadoAutonomo, type LecturaAutonoma } from "@/lib/metagenesis/remoto-nodos-cliente";
import {
    ACCIONES,
    ACCIONES_DEL_LIDER,
    fraseDelMando,
    textoEstadoOrden,
    type AccionOrden,
    type ArgsOrden,
    type NodoVista,
    type OrdenVista,
} from "@/lib/metagenesis/remoto-nodos";
import type { Boton } from "@/lib/metagenesis/colmena";
import { avisoDeOrdenANodo, botonesDeNodo, lineaDeNodo, ordenDeBoton, porQueNoSePuedeMandar, type ClaveBoton } from "@/lib/metagenesis/colmena-tarjeta";
import { textoHace } from "@/lib/metagenesis/remoto";
import { onTableChange } from "@/lib/realtime/realtime";

const CADA_MS = 90_000;
/** Solo las del líder: desconectar/contenedor NO se ofrecen aquí (van en la tarjeta de cada neurona, COL1012I). */
type AccionLider = keyof typeof ACCIONES_DEL_LIDER;
const BOTONES: AccionLider[] = ["continuar", "revisar_bloqueadas", "buscar_trabajo", "buscar_capacidad", "reactivar", "ceder"];

function IconoMedio({ medio }: { medio: string }) {
    const c = "h-4 w-4 shrink-0";
    if (medio === "mac") return <Laptop className={c} aria-hidden />;
    if (medio === "oracle-a1") return <Server className={c} aria-hidden />;
    if (medio === "nube-cowork" || medio === "gh-actions") return <Cloud className={c} aria-hidden />;
    return <Cpu className={c} aria-hidden />;
}

function Chip({ children, tono = "neutro" }: { children: ReactNode; tono?: "neutro" | "verde" | "ambar" | "rosa" | "cian" }) {
    const clases = {
        neutro: "border-white/10 bg-white/5 text-white/70",
        verde: "border-emerald-400/30 bg-emerald-500/10 text-emerald-100",
        ambar: "border-amber-400/30 bg-amber-500/10 text-amber-100",
        rosa: "border-rose-400/30 bg-rose-500/10 text-rose-100",
        cian: "border-cyan-400/30 bg-cyan-500/10 text-cyan-100",
    }[tono];
    return <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] ${clases}`}>{children}</span>;
}

interface PropsTarjeta {
    n: NodoVista;
    ahora: number;
    ordenes: readonly OrdenVista[];
    /** Clave `accion:destino` de la orden que espera la segunda pulsación, o null. */
    confirmando: string | null;
    /** Clave de la orden que se está enviando, o null. */
    enviando: string | null;
    onOrden: (clave: ClaveBoton, n: NodoVista) => void;
}

/** Un botón de la colmena de una neurona: ficha de `botonesNeurona`, razón visible (también en móvil, donde no hay `title`). */
function BotonColmena({ n, clave, b, confirmando, enviando, onOrden }: Pick<PropsTarjeta, "n" | "confirmando" | "enviando" | "onOrden"> & { clave: ClaveBoton; b: Boton }) {
    if (!b.visible) return null;
    const id = `mg-nodo-${n.nodo}-${clave}`;
    const clavePendiente = `${clave}:${n.nodo}`;
    const pidiendo = confirmando === clavePendiente;
    // La razón se ve en pantalla (en el móvil no hay `title`) cuando el botón está desactivado, pide confirmar o el
    // traspaso entre contenedores aún no está activo: entonces TODO lo que hace el botón lleva su aviso.
    const verExplica = !b.habilitado || pidiendo || n.relevo !== true;
    return (
        <div className="flex min-w-0 flex-col gap-1">
            <Button
                size="sm"
                variant={pidiendo ? "destructive" : "outline"}
                className="min-h-9 cursor-pointer gap-1.5 whitespace-normal text-left text-xs"
                disabled={!b.habilitado || enviando !== null}
                title={b.explica}
                aria-describedby={verExplica ? `${id}-explica` : undefined}
                onClick={() => onOrden(clave, n)}
                data-testid={id}
            >
                {enviando === clavePendiente ? <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" aria-hidden /> : null}
                {pidiendo ? "¿Seguro? Pulsa otra vez" : b.etiqueta}
            </Button>
            {verExplica ? (
                <p id={`${id}-explica`} className="text-[11px] leading-snug text-white/55" data-testid={`${id}-explica`}>
                    {b.explica}
                </p>
            ) : null}
        </div>
    );
}

function TarjetaNodo({ n, ahora, ordenes, confirmando, enviando, onOrden }: PropsTarjeta) {
    const trabajo = Object.entries(n.trabajo).filter(([, v]) => v !== null);
    const botones = botonesDeNodo(n, ordenes, ahora);
    return (
        <li
            data-testid="mg-nodo"
            className={`rounded-xl border p-3 text-sm ${n.lider && n.vivo ? "border-amber-300/40 bg-amber-400/5" : "border-white/10 bg-black/20"} ${
                n.vivo ? "" : "opacity-60"
            }`}
        >
            <div className="flex items-center gap-2">
                <IconoMedio medio={n.medio} />
                <span className="font-medium text-white/90">{n.etiqueta}</span>
                {n.lider && n.vivo ? (
                    <Chip tono="ambar">
                        <Crown className="h-3 w-3" aria-hidden /> dirige
                    </Chip>
                ) : null}
                <span className="ml-auto">
                    <Chip tono={n.vivo ? "verde" : "rosa"}>{n.vivo ? `late ${textoHace(n.hace_ms)}` : `callado ${textoHace(n.hace_ms)}`}</Chip>
                </span>
            </div>
            <p className="mt-1 font-mono text-[11px] text-white/40">{n.nodo}</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
                <Chip tono={n.modo === "seco" ? "cian" : "neutro"}>{n.modo === "seco" ? "en prueba (no lanza)" : "trabaja de verdad"}</Chip>
                {n.orquestadores.length ? (
                    <Chip tono="verde">
                        <Activity className="h-3 w-3" aria-hidden /> {n.orquestadores.join(", ")}
                    </Chip>
                ) : (
                    <Chip>sin enjambre ahora</Chip>
                )}
                {n.caidos.length ? <Chip tono="rosa">caídos: {n.caidos.join(", ")}</Chip> : null}
                {n.disco_gb !== null ? <Chip tono={n.disco_gb < 3 ? "ambar" : "neutro"}>disco {n.disco_gb} GB libres</Chip> : null}
                {trabajo.map(([k, v]) => (
                    <Chip key={k}>
                        {k.replace("_", " ")}: {v}
                    </Chip>
                ))}
            </div>
            <div className="mt-2 space-y-0.5 text-xs text-white/65" data-testid={`mg-nodo-${n.nodo}-info`}>
                {lineaDeNodo(n, ahora).map((linea) => (
                    <p key={linea}>{linea}</p>
                ))}
            </div>
            {botones.desconectar.visible || botones.contenedor.visible ? (
                <div className="mt-2 flex flex-wrap items-start gap-2" role="group" aria-label={`Colmena de ${n.etiqueta}`}>
                    <BotonColmena n={n} clave="desconectar" b={botones.desconectar} confirmando={confirmando} enviando={enviando} onOrden={onOrden} />
                    <BotonColmena n={n} clave="contenedor" b={botones.contenedor} confirmando={confirmando} enviando={enviando} onOrden={onOrden} />
                </div>
            ) : null}
        </li>
    );
}

export function MetaGenesisAutonoma() {
    const [acceso, setAcceso] = useState<"comprobando" | "si" | "no">("comprobando");
    const [lectura, setLectura] = useState<LecturaAutonoma | null>(null);
    const [cargando, setCargando] = useState(false);
    // Clave `accion:destino` (las del líder, `accion:lider`): así «Desconectar» de un nodo no confirma el de otro.
    const [enviando, setEnviando] = useState<string | null>(null);
    const [confirmando, setConfirmando] = useState<string | null>(null);
    const [aviso, setAviso] = useState<{ tono: "verde" | "rosa"; texto: string } | null>(null);
    const [ahora, setAhora] = useState(() => Date.now());
    const enVuelo = useRef(false);

    const leer = useCallback(async () => {
        if (enVuelo.current) return;
        enVuelo.current = true;
        setCargando(true);
        try {
            const r = await leerEstadoAutonomo(Date.now());
            setLectura(r);
        } finally {
            enVuelo.current = false;
            setCargando(false);
            setAhora(Date.now());
        }
    }, []);

    useEffect(() => {
        let vivo = true;
        void miAccesoMetaGenesis().then((a) => {
            if (vivo) setAcceso(a?.miembro ? "si" : "no");
        });
        return () => {
            vivo = false;
        };
    }, []);

    useEffect(() => {
        if (acceso !== "si") return;
        void leer();
        const ciclo = window.setInterval(() => {
            if (document.visibilityState !== "hidden") void leer();
        }, CADA_MS);
        const reloj = window.setInterval(() => setAhora(Date.now()), 15_000);
        let pendiente: number | null = null;
        const quitar = onTableChange("relevo_eventos", { event: "INSERT", filter: "tipo=in.(mg_foto,mg_orden_hecha,mg_lider,mg_baja)" }, () => {
            if (pendiente !== null) return;
            pendiente = window.setTimeout(() => {
                pendiente = null;
                void leer();
            }, 1500);
        });
        return () => {
            window.clearInterval(ciclo);
            window.clearInterval(reloj);
            if (pendiente !== null) window.clearTimeout(pendiente);
            quitar();
        };
    }, [acceso, leer]);

    const mandar = useCallback(
        async (o: { accion: AccionOrden; para: string; args?: ArgsOrden; confirmar: boolean; aviso: string }) => {
            const clave = `${o.accion}:${o.para}`;
            if (o.confirmar && confirmando !== clave) {
                setConfirmando(clave);
                return;
            }
            setConfirmando(null);
            setEnviando(clave);
            setAviso(null);
            try {
                // A un nodo concreto van sus argumentos; al líder, como siempre, solo la acción y el destino.
                const r = o.args ? await enviarOrden(o.accion, o.para, o.args) : await enviarOrden(o.accion, o.para);
                setAviso(r.ok ? { tono: "verde", texto: o.aviso } : { tono: "rosa", texto: r.motivo });
                if (r.ok) void leer();
            } finally {
                setEnviando(null);
            }
        },
        [confirmando, leer],
    );

    const pedirAlLider = useCallback(
        (accion: AccionOrden) =>
            mandar({
                accion,
                para: "lider",
                confirmar: !!ACCIONES[accion].confirmar,
                aviso: `Orden «${ACCIONES[accion].etiqueta}» enviada: la recoge el medio que dirige en menos de 2 min.`,
            }),
        [mandar],
    );

    /** Un botón de la tarjeta de una neurona: la orden sale del propio nodo (nunca «lider») y pide confirmación si hay trabajo. */
    const pedirANodo = useCallback(
        (clave: ClaveBoton, n: NodoVista, ordenes: readonly OrdenVista[]) => {
            const boton = botonesDeNodo(n, ordenes, Date.now())[clave];
            // Defensa: el botón desactivado no se pulsa, así que aquí solo se llega si el latido cambió entre el
            // dibujo y el clic (el nodo pasó a prueba, el reparto dejó de estar activo…). Se dice por qué, no se manda.
            const orden = ordenDeBoton(clave, n);
            const porque = porQueNoSePuedeMandar(clave, n, ordenes, Date.now());
            if (porque || !orden) {
                setConfirmando(null);
                setAviso({ tono: "rosa", texto: porque ?? "Esta orden ya no está disponible para este nodo: su estado cambió." });
                return;
            }
            return mandar({
                accion: orden.accion,
                para: orden.para,
                args: orden.args,
                confirmar: boton.confirmar === true,
                aviso: avisoDeOrdenANodo(boton.etiqueta.replace(/ \(\d+ agentes?\)$/, ""), n.etiqueta, n.relevo === true),
            });
        },
        [mandar],
    );

    if (acceso !== "si") return null;

    const estado = lectura?.ok ? lectura.estado : null;
    const autonomia = estado?.autonomia !== false;
    const medidores = estado ? Object.entries(estado.medidores).filter(([, v]) => v) : [];

    return (
        <section
            data-testid="metagenesis-autonoma"
            aria-labelledby="mg-autonoma-titulo"
            className="mx-auto mb-6 max-w-5xl rounded-2xl border border-white/10 bg-black/30 p-4 text-white/85 backdrop-blur"
        >
            <header className="flex flex-wrap items-start gap-3">
                <Network className="mt-0.5 h-5 w-5 text-cyan-300" aria-hidden />
                <div className="min-w-0 flex-1">
                    <h2 id="mg-autonoma-titulo" className="text-base font-semibold">
                        MetaGenesis autónoma
                    </h2>
                    <p className="text-xs text-white/60" data-testid="mg-frase">
                        {estado ? fraseDelMando(estado) : lectura && !lectura.ok ? lectura.motivo : "Leyendo a los medios…"}
                    </p>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                    {estado ? <Chip tono="cian">{estado.modo === "tablas" ? "estado en la base de datos" : "estado por el bus del enjambre"}</Chip> : null}
                    {estado?.termino ? <Chip>mando nº {estado.termino}</Chip> : null}
                    {estado && estado.fotoHaceMs !== null ? <Chip>foto {textoHace(estado.fotoHaceMs)}</Chip> : null}
                    <Button
                        size="sm"
                        variant="outline"
                        className="h-7 cursor-pointer gap-1 px-2 text-xs"
                        disabled={cargando}
                        onClick={() => void leer()}
                        aria-label="Volver a leer el estado"
                    >
                        {cargando ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <RefreshCw className="h-3.5 w-3.5" aria-hidden />}
                    </Button>
                </div>
            </header>

            {estado ? (
                <>
                    <ul className="mt-3 grid gap-2 md:grid-cols-2" aria-label="Medios de MetaGenesis">
                        {estado.nodos.map((n) => (
                            <TarjetaNodo
                                key={n.nodo}
                                n={n}
                                ahora={ahora}
                                ordenes={estado.ordenes}
                                confirmando={confirmando}
                                enviando={enviando}
                                onOrden={(clave, nodo) => void pedirANodo(clave, nodo, estado.ordenes)}
                            />
                        ))}
                        {!estado.nodos.length ? (
                            <li className="rounded-xl border border-dashed border-white/15 p-3 text-xs text-white/55">
                                Aún no ha latido ningún medio. En cada medio se arranca con{" "}
                                <code className="text-white/75">python3 scripts/puente/nodo_metagenesis.py instalar</code>.
                            </li>
                        ) : null}
                    </ul>

                    {medidores.length ? (
                        <div className="mt-3 flex flex-wrap gap-1.5" aria-label="El trabajo ahora">
                            {medidores.map(([k, v]) => (
                                <Chip key={k}>
                                    <span className="text-white/45">{k.replace("-", " ")}:</span> {v}
                                </Chip>
                            ))}
                        </div>
                    ) : null}

                    <div className="mt-4 grid gap-4 md:grid-cols-2">
                        <div>
                            <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-white/50">Lo último que decidió</h3>
                            {estado.decisiones.length ? (
                                <ul className="space-y-1.5 text-xs" data-testid="mg-decisiones">
                                    {estado.decisiones.slice(0, 6).map((d) => (
                                        <li key={`${d.ts}-${d.accion}-${d.nodo}`} className="rounded-lg border border-white/5 bg-white/[0.03] px-2 py-1.5">
                                            <span className="font-medium text-white/85">{ACCIONES[d.accion as AccionOrden]?.etiqueta ?? d.accion}</span>
                                            <span className="text-white/45"> · {textoHace(ahora - d.ts)}</span>
                                            {d.seco ? <span className="text-cyan-200/80"> · en prueba</span> : null}
                                            <p className="text-white/60">{d.motivo}</p>
                                            {d.resultado ? <p className="text-white/45">{d.resultado}</p> : null}
                                        </li>
                                    ))}
                                </ul>
                            ) : (
                                <p className="text-xs text-white/50">Nada que decidir todavía: todo va solo.</p>
                            )}
                        </div>
                        <div>
                            <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-white/50">Pedir algo al que dirige</h3>
                            <div className="flex flex-wrap gap-1.5">
                                {[...BOTONES, autonomia ? ("pausar" as AccionLider) : ("reanudar" as AccionLider)].map((a) => (
                                    <Button
                                        key={a}
                                        size="sm"
                                        variant={confirmando === `${a}:lider` ? "destructive" : "outline"}
                                        className="h-8 cursor-pointer gap-1.5 text-xs"
                                        disabled={enviando !== null}
                                        title={ACCIONES_DEL_LIDER[a].explica}
                                        onClick={() => void pedirAlLider(a)}
                                        data-testid={`mg-orden-${a}`}
                                    >
                                        {enviando === `${a}:lider` ? (
                                            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                                        ) : a === "pausar" ? (
                                            <PauseCircle className="h-3.5 w-3.5" aria-hidden />
                                        ) : a === "reanudar" ? (
                                            <PlayCircle className="h-3.5 w-3.5" aria-hidden />
                                        ) : (
                                            <Wrench className="h-3.5 w-3.5" aria-hidden />
                                        )}
                                        {confirmando === `${a}:lider` ? "¿Seguro? Pulsa otra vez" : ACCIONES_DEL_LIDER[a].etiqueta}
                                    </Button>
                                ))}
                            </div>
                            {aviso ? (
                                <p role="status" className={`mt-2 text-xs ${aviso.tono === "verde" ? "text-emerald-200" : "text-rose-200"}`}>
                                    {aviso.texto}
                                </p>
                            ) : null}
                            {estado.ordenes.length ? (
                                <ul className="mt-2 space-y-1 text-xs" data-testid="mg-ordenes">
                                    {estado.ordenes.slice(0, 5).map((o) => (
                                        <li key={o.clave} className="flex flex-wrap gap-x-2 text-white/60">
                                            <span className="text-white/80">{ACCIONES[o.accion as AccionOrden]?.etiqueta ?? o.accion}</span>
                                            <span>{textoHace(ahora - o.t)}</span>
                                            <span className={o.estado === "rechazada" || o.estado === "fallo" ? "text-rose-200" : "text-white/70"}>
                                                {textoEstadoOrden(o.estado)}
                                            </span>
                                            {o.resultado ? <span className="w-full text-white/45">{o.resultado}</span> : null}
                                        </li>
                                    ))}
                                </ul>
                            ) : null}
                        </div>
                    </div>
                    <p className="mt-3 text-[11px] text-white/40">
                        Esto no depende de la Mac: cada medio late en la base de datos, el mejor dirige y, si deja de latir, otro toma el
                        mando solo. Las órdenes las ejecuta el que dirige.
                    </p>
                </>
            ) : null}
        </section>
    );
}
