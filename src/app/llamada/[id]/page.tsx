"use client";

/**
 * /llamada/[id] — entrar en una llamada por enlace (2026-09-28).
 *
 *  · Con cuenta (miembro del chat o invitado): lectura normal de la sesión (RLS).
 *  · Con `?t=<token>` (enlace público): la sesión se resuelve por la RPC `unirse_sesion_publica`
 *    y, sin cuenta, se entra como invitado con un nombre (id aleatorio en sessionStorage). La
 *    señalización va por el canal privado `llamada:<id>:<token>`, que el servidor solo abre
 *    mientras el enlace sea válido.
 *  · Sin sesión ni enlace: «Iniciar sesión» lleva a `/login?next=/llamada/<id>` y se vuelve aquí.
 *  · Antesala con «Probar cámara y micro» (nada se enciende solo) y después la llamada.
 *  · Mensajes claros para: terminada, sin permiso, enlace roto, sin iniciar sesión y servidor
 *    sin la migración aplicada.
 */
import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { CloudOff, Link2Off, Loader2, Lock, LogIn, MessageSquare, PhoneCall, PhoneOff, RotateCcw, type LucideIcon } from "lucide-react";
import type { SesionViva } from "@/lib/mensajeria/formato-tipos";
import { enlacePrivado, obtenerSesion } from "@/lib/mensajeria/sesiones-vivas";
import { clasificarErrorSesion, MENSAJE_SESION, type ClaseErrorSesion } from "@/lib/llamadas/errores";
import { esTipoLlamada, TEXTO_TIPO } from "@/lib/llamadas/formato";
import { identidadInvitado, leerInvitado, miIdentidad, type Identidad } from "@/lib/llamadas/identidad";
import { minimizarLlamada, unirseALlamada } from "@/lib/llamadas/acciones";
import { useLlamadas } from "@/lib/llamadas/store";
import { soportaLlamadas } from "@/lib/llamadas/medios";
import type { TipoLlamada } from "@/lib/llamadas/tipos";
import { PreLlamada, type EleccionEntrada } from "@/components/llamadas/pre-llamada";
import { VentanaLlamada } from "@/components/llamadas/ventana-llamada";

type Fase = "cargando" | "sin-sesion" | "error" | "no-es-llamada" | "sin-soporte" | "lista";

const ICONO_ERROR: Record<Exclude<ClaseErrorSesion, "ok">, LucideIcon> = {
    "no-desplegada": CloudOff,
    prohibida: Lock,
    "no-encontrada": Link2Off,
    terminada: PhoneOff,
    otro: CloudOff,
};

function Panel({ icono: Icono, titulo, detalle, children, color = "#7C5CFF" }: { icono: LucideIcon; titulo: string; detalle?: string; children?: React.ReactNode; color?: string }) {
    return (
        <section
            className="mx-auto flex w-full max-w-md flex-col items-center gap-3 rounded-[24px] px-6 py-8 text-center text-white"
            style={{ background: "rgba(12,14,34,.55)", backdropFilter: "blur(20px) saturate(140%)", border: "1px solid rgba(255,255,255,.08)", boxShadow: "inset 0 1px 0 rgba(255,255,255,.06), 0 24px 60px rgba(0,0,0,.35)" }}
            role="status"
        >
            <span className="grid h-14 w-14 place-items-center rounded-full" style={{ background: `${color}1f`, boxShadow: `inset 0 0 0 1px ${color}66` }}>
                <Icono className="h-6 w-6" style={{ color }} aria-hidden />
            </span>
            <h1 className="text-[20px] font-semibold leading-tight">{titulo}</h1>
            {detalle && <p className="text-[14px] text-white/70">{detalle}</p>}
            {children && <div className="mt-2 flex flex-wrap items-center justify-center gap-2">{children}</div>}
        </section>
    );
}

function Pildora({ href, onClick, children, color = "#7C5CFF", solida = false }: { href?: string; onClick?: () => void; children: React.ReactNode; color?: string; solida?: boolean }) {
    const clase = "ss-redondo inline-flex cursor-pointer items-center gap-2 rounded-full px-4 py-2 text-[14px] font-semibold text-white transition-transform duration-200 hover:scale-[1.03]";
    const estilo = solida ? { background: color, boxShadow: `0 0 18px ${color}66` } : { background: `${color}1f`, boxShadow: `inset 0 0 0 1px ${color}66` };
    if (href) {
        return (
            <Link href={href} className={clase} style={estilo}>
                {children}
            </Link>
        );
    }
    return (
        <button type="button" onClick={onClick} className={clase} style={estilo}>
            {children}
        </button>
    );
}

function Contenido() {
    const params = useParams<{ id: string }>();
    const busqueda = useSearchParams();
    const id = decodeURIComponent(String(params?.id ?? ""));
    const token = busqueda?.get("t") || null;

    const [fase, setFase] = useState<Fase>("cargando");
    const [clase, setClase] = useState<ClaseErrorSesion>("ok");
    const [sesion, setSesion] = useState<SesionViva | null>(null);
    const [identidad, setIdentidad] = useState<Identidad | null>(null);
    const [invitado, setInvitado] = useState<{ id: string; nombre: string } | null>(null);
    const [unido, setUnido] = useState(false);
    const [intento, setIntento] = useState(0);
    const { activa, hosts } = useLlamadas();

    const cargar = useCallback(async () => {
        setFase("cargando");
        if (!soportaLlamadas()) {
            setFase("sin-soporte");
            return;
        }
        const yo = await miIdentidad();
        setIdentidad(yo);
        if (!yo) {
            if (!token) {
                setFase("sin-sesion");
                return;
            }
            setInvitado(leerInvitado());
        }
        const r = await obtenerSesion(id, token);
        const c = clasificarErrorSesion(r.error, r.sesion);
        setSesion(r.sesion);
        setClase(c);
        if (c !== "ok") {
            setFase("error");
            return;
        }
        if (!r.sesion?.tipo.startsWith("llamada:")) {
            setFase("no-es-llamada");
            return;
        }
        setFase("lista");
    }, [id, token]);

    useEffect(() => {
        void cargar();
    }, [cargar, intento]);

    const enEsta = !!activa && activa.sesionId === id;

    // Si no hay capa global de llamadas montada, esta página pinta la ventana.
    const ventanaLocal = enEsta && hosts === 0 ? <VentanaLlamada /> : null;

    if (fase === "cargando") {
        return (
            <div className="grid min-h-[60vh] place-items-center text-white/70" role="status">
                <span className="inline-flex items-center gap-2 text-[14px]">
                    <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
                    Abriendo la llamada…
                </span>
            </div>
        );
    }

    if (fase === "sin-soporte") {
        return (
            <Panel icono={CloudOff} titulo="Este navegador no permite llamadas" detalle="Hace falta una conexión segura (https) y un navegador actual con cámara y micrófono (Chrome, Edge, Firefox o Safari recientes)." color="#FFBF00" />
        );
    }

    if (fase === "sin-sesion") {
        return (
            <Panel icono={LogIn} titulo="Inicia sesión para unirte" detalle="Esta llamada es privada de un chat. Entra con tu cuenta, o pide a quien la creó un enlace público (lleva «?t=» al final).">
                <Pildora href={`/login?next=${encodeURIComponent(`/llamada/${encodeURIComponent(id)}`)}`} solida>
                    <LogIn className="h-4 w-4" aria-hidden />
                    Iniciar sesión
                </Pildora>
            </Panel>
        );
    }

    if (fase === "error" && clase !== "ok") {
        const m = MENSAJE_SESION[clase];
        return (
            <Panel icono={ICONO_ERROR[clase]} titulo={m.titulo} detalle={m.detalle} color={clase === "terminada" ? "#DC143C" : clase === "no-desplegada" ? "#FFBF00" : "#7C5CFF"}>
                {clase === "otro" && (
                    <Pildora onClick={() => setIntento((n) => n + 1)}>
                        <RotateCcw className="h-4 w-4" aria-hidden />
                        Reintentar
                    </Pildora>
                )}
                {identidad && (
                    <Pildora href="/messages">
                        <MessageSquare className="h-4 w-4" aria-hidden />
                        Ir a Mensajes
                    </Pildora>
                )}
            </Panel>
        );
    }

    if (fase === "no-es-llamada" && sesion) {
        const ruta = enlacePrivado(sesion) + (token ? `?t=${encodeURIComponent(token)}` : "");
        return (
            <Panel icono={Link2Off} titulo="Este enlace no es de una llamada" detalle="Es de una app en vivo compartida. Puedes abrirla desde su propia entrada.">
                <Pildora href={ruta} solida>
                    Abrir la app en vivo
                </Pildora>
            </Panel>
        );
    }

    if (!sesion) return null;
    const bruto = sesion.tipo.slice("llamada:".length);
    const tipo: TipoLlamada = esTipoLlamada(bruto) ? bruto : "audio";
    const titulo = sesion.titulo || TEXTO_TIPO[tipo].nombre;

    if (enEsta && activa) {
        return (
            <>
                {ventanaLocal}
                <Panel icono={PhoneCall} titulo="Estás en esta llamada" detalle="Sigue en una ventanita mientras navegas por el OS." color="#10B981">
                    <Pildora onClick={() => minimizarLlamada(false)} color="#10B981" solida>
                        <PhoneCall className="h-4 w-4" aria-hidden />
                        Volver a la llamada
                    </Pildora>
                </Panel>
            </>
        );
    }

    if (unido) {
        return (
            <Panel icono={PhoneOff} titulo="Has salido de la llamada" detalle="Si sigue abierta, puedes volver a entrar cuando quieras." color="#DC143C">
                <Pildora onClick={() => setUnido(false)} color="#10B981" solida>
                    <RotateCcw className="h-4 w-4" aria-hidden />
                    Volver a entrar
                </Pildora>
                {identidad && (
                    <Pildora href="/messages">
                        <MessageSquare className="h-4 w-4" aria-hidden />
                        Ir a Mensajes
                    </Pildora>
                )}
            </Panel>
        );
    }

    const alUnirse = async (e: EleccionEntrada): Promise<string | null> => {
        let quien = identidad;
        if (!quien) {
            if (!e.nombreInvitado) return "Escribe tu nombre para entrar.";
            quien = identidadInvitado(e.nombreInvitado);
        }
        const error = await unirseALlamada({
            sesionId: sesion.id,
            tipo,
            hiloId: sesion.hiloId,
            titulo,
            identidad: quien,
            token,
            stream: e.stream,
            microActivo: e.microActivo,
            camara: e.camara,
            unoAUno: false,
        });
        if (!error) setUnido(true);
        return error;
    };

    return (
        <PreLlamada
            sesionId={sesion.id}
            tipo={tipo}
            titulo={titulo}
            miNombre={identidad?.nombre ?? invitado?.nombre ?? "Invitado"}
            miAvatar={identidad?.avatar ?? null}
            miId={identidad?.base ?? invitado?.id ?? "invitado"}
            invitado={!identidad}
            nombreInicial={invitado?.nombre ?? ""}
            token={token}
            onUnirse={alUnirse}
        />
    );
}

export default function PaginaLlamada() {
    return (
        <main className="relative z-10 flex min-h-[100dvh] w-full flex-col items-center justify-center px-4 pb-28 pt-[max(1.5rem,env(safe-area-inset-top))] sm:px-6">
            <Suspense
                fallback={
                    <div className="grid min-h-[60vh] place-items-center text-white/70" role="status">
                        <Loader2 className="h-5 w-5 animate-spin" aria-label="Cargando" />
                    </div>
                }
            >
                <Contenido />
            </Suspense>
        </main>
    );
}
