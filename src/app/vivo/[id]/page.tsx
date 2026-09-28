"use client";

/**
 * /vivo/[id] — la puerta de entrada de una app en vivo (2026-09-28).
 *
 * Está FUERA de los grupos (app)/(main) a propósito: quien llega con un enlace público puede no
 * tener cuenta. Resuelve la sesión así:
 *   · con cuenta → lectura normal (RLS: creador, invitados, miembros del chat);
 *   · si no la ve y trae `?t=` → RPC `unirse_sesion_publica` (enlace público);
 *   · sin cuenta y sin `?t=` → pantalla para iniciar sesión.
 * y enseña una tarjeta de entrada (tipo, título, quién la abrió, permiso) con «Entrar», que lleva
 * a la app con `?sesion=<id>`. Pantallas claras para: terminada, sin permiso, enlace que ya no
 * vale, iniciar sesión y servidor sin la migración.
 */

import { Suspense, useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import {
    ArrowRight,
    CircleStop,
    CloudOff,
    Info,
    Link2Off,
    Loader2,
    Lock,
    LogIn,
    type LucideIcon,
} from "lucide-react";
import type { SesionViva } from "@/lib/mensajeria/formato-tipos";
import {
    MENSAJE_SIN_DESPLEGAR,
    esTipoLlamada,
    esUuid,
    miUid,
    obtenerSesion,
    rutaConSesion,
    sesionVigente,
    usePresentesSesion,
} from "@/lib/mensajeria/sesiones-vivas";
import { fetchProfilesByIds } from "@/lib/social/os-profiles";
import { entradaVivo } from "@/components/messages/vivo/catalogo-vivo";
import { tituloDeSesion } from "@/components/messages/vivo/acciones-vivo";
import {
    ChipVivo,
    ESTILO_CRISTAL,
    IconoTipoVivo,
    MODOS_INFO,
    PERMISOS_INFO,
    VIOLETA_MENSAJES,
    colorTextoSobre,
} from "@/components/messages/vivo/comun-vivo";

export const dynamic = "force-dynamic";

type Pantalla =
    | { tipo: "cargando" }
    | { tipo: "invalido" }
    | { tipo: "sin-desplegar" }
    | { tipo: "iniciar-sesion" }
    | { tipo: "sin-permiso" }
    | { tipo: "enlace-caducado" }
    | { tipo: "error"; mensaje: string }
    | { tipo: "lista"; sesion: SesionViva; porEnlace: boolean; conCuenta: boolean };

function Marco({ children }: { children: ReactNode }) {
    return (
        <main className="grid min-h-[100dvh] place-items-center px-4 py-10">
            <div className="w-full max-w-md rounded-[24px] p-6 text-white sm:p-7" style={ESTILO_CRISTAL}>
                {children}
            </div>
        </main>
    );
}

function Aviso({
    icono: Icono,
    color = VIOLETA_MENSAJES,
    titulo,
    texto,
    accion,
}: {
    icono: LucideIcon;
    color?: string;
    titulo: string;
    texto: string;
    accion?: ReactNode;
}) {
    return (
        <Marco>
            <div className="space-y-4 text-center" role="status">
                <span
                    aria-hidden="true"
                    className="mx-auto grid h-14 w-14 place-items-center rounded-2xl"
                    style={{ background: `${color}24`, boxShadow: `inset 0 0 0 1px ${color}66`, color }}
                >
                    <Icono className="h-6 w-6" />
                </span>
                <h1 className="text-xl font-semibold text-white">{titulo}</h1>
                <p className="text-[14px] leading-relaxed text-white/70">{texto}</p>
                {accion ? <div className="pt-1">{accion}</div> : null}
            </div>
        </Marco>
    );
}

function BotonPrincipal({ children, color, onClick, href }: { children: ReactNode; color: string; onClick?: () => void; href?: string }) {
    const clase = "ss-redondo inline-flex h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-full text-[15px] font-semibold transition-[filter,transform] duration-200 hover:brightness-110 active:scale-[0.98] motion-reduce:active:scale-100";
    const estilo = { background: `linear-gradient(135deg, ${color}, ${color}b3)`, color: colorTextoSobre(color), boxShadow: `0 12px 26px -14px ${color}` };
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

function EnlaceSecundario({ href, children }: { href: string; children: ReactNode }) {
    return (
        <Link
            href={href}
            className="inline-flex cursor-pointer items-center justify-center rounded-full px-4 py-2 text-[13px] font-semibold text-white/70 transition-colors duration-200 hover:bg-white/[0.06] hover:text-white"
        >
            {children}
        </Link>
    );
}

function Entrada() {
    const params = useParams<{ id: string }>();
    const buscar = useSearchParams();
    const router = useRouter();
    // El efecto de carga no depende del objeto router (solo se usa para redirigir llamadas).
    const routerRef = useRef(router);
    routerRef.current = router;
    const id = typeof params?.id === "string" ? params.id : "";
    const token = buscar?.get("t") ?? null;
    const [pantalla, setPantalla] = useState<Pantalla>({ tipo: "cargando" });

    useEffect(() => {
        let vivo = true;
        const poner = (p: Pantalla) => {
            if (vivo) setPantalla(p);
        };
        void (async () => {
            if (!esUuid(id)) return poner({ tipo: "invalido" });
            const uid = await miUid();

            let sesion: SesionViva | null = null;
            let error: string | null = null;
            let porEnlace = false;
            if (uid) {
                const r = await obtenerSesion(id);
                sesion = r.sesion;
                error = r.error;
            }
            if (!sesion && token && error !== MENSAJE_SIN_DESPLEGAR) {
                const r = await obtenerSesion(id, token);
                sesion = r.sesion;
                error = r.error;
                porEnlace = Boolean(r.sesion);
            }

            if (error === MENSAJE_SIN_DESPLEGAR) return poner({ tipo: "sin-desplegar" });
            if (sesion) {
                if (esTipoLlamada(sesion.tipo)) {
                    routerRef.current.replace(`/llamada/${encodeURIComponent(id)}${token ? `?t=${encodeURIComponent(token)}` : ""}`);
                    return;
                }
                return poner({ tipo: "lista", sesion, porEnlace, conCuenta: Boolean(uid) });
            }
            if (error) return poner({ tipo: "error", mensaje: error });
            if (token) return poner({ tipo: "enlace-caducado" });
            if (!uid) return poner({ tipo: "iniciar-sesion" });
            return poner({ tipo: "sin-permiso" });
        })();
        return () => {
            vivo = false;
        };
    }, [id, token]);

    const siguiente = `/vivo/${encodeURIComponent(id)}${token ? `?t=${encodeURIComponent(token)}` : ""}`;

    switch (pantalla.tipo) {
        case "cargando":
            return (
                <Marco>
                    <p className="flex items-center justify-center gap-2 py-6 text-[14px] text-white/70" role="status">
                        <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> Abriendo la sesión…
                    </p>
                </Marco>
            );
        case "invalido":
            return (
                <Aviso
                    icono={Link2Off}
                    titulo="Este enlace no es válido"
                    texto="Puede que se haya copiado incompleto. Pide que te lo vuelvan a enviar."
                    accion={<EnlaceSecundario href="/">Ir al inicio</EnlaceSecundario>}
                />
            );
        case "sin-desplegar":
            return (
                <Aviso
                    icono={CloudOff}
                    color="#FFBF00"
                    titulo="Aún no disponible aquí"
                    texto={`${MENSAJE_SIN_DESPLEGAR}. Quien administra este servidor tiene que aplicar la última actualización de la base de datos.`}
                    accion={<EnlaceSecundario href="/">Ir al inicio</EnlaceSecundario>}
                />
            );
        case "iniciar-sesion":
            return (
                <Aviso
                    icono={LogIn}
                    titulo="Inicia sesión para entrar"
                    texto="Esta app en vivo es privada: entran, con su cuenta, las personas del chat donde se compartió y las invitadas."
                    accion={
                        <BotonPrincipal color={VIOLETA_MENSAJES} href={`/login?next=${encodeURIComponent(siguiente)}`}>
                            <LogIn className="h-4 w-4" aria-hidden="true" /> Iniciar sesión
                        </BotonPrincipal>
                    }
                />
            );
        case "sin-permiso":
            return (
                <Aviso
                    icono={Lock}
                    titulo="No tienes acceso a esta sesión"
                    texto="Solo entran las personas del chat donde se compartió y las invitadas. Pide a quien la abrió que te invite o que te pase su enlace público."
                    accion={<EnlaceSecundario href="/messages">Ir a Mensajes</EnlaceSecundario>}
                />
            );
        case "enlace-caducado":
            return (
                <Aviso
                    icono={Link2Off}
                    titulo="Este enlace público ya no funciona"
                    texto="Puede que lo hayan desactivado o renovado, o que la sesión haya terminado. Pide el enlace nuevo a quien te lo pasó."
                    accion={<EnlaceSecundario href="/">Ir al inicio</EnlaceSecundario>}
                />
            );
        case "error":
            return (
                <Aviso
                    icono={Info}
                    titulo="No se pudo abrir la sesión"
                    texto={pantalla.mensaje}
                    accion={<EnlaceSecundario href={siguiente}>Intentarlo de nuevo</EnlaceSecundario>}
                />
            );
        case "lista":
            return <TarjetaEntrada sesion={pantalla.sesion} porEnlace={pantalla.porEnlace} conCuenta={pantalla.conCuenta} />;
    }
}

function TarjetaEntrada({ sesion, porEnlace, conCuenta }: { sesion: SesionViva; porEnlace: boolean; conCuenta: boolean }) {
    const router = useRouter();
    const entrada = entradaVivo(sesion.tipo);
    const color = entrada?.color ?? VIOLETA_MENSAJES;
    const [creador, setCreador] = useState<{ nombre: string; avatarUrl?: string } | null>(null);
    const vigente = sesionVigente(sesion);
    const presentes = usePresentesSesion(sesion.id, vigente);

    useEffect(() => {
        let vivo = true;
        void fetchProfilesByIds([sesion.creador]).then((m) => {
            const p = m[sesion.creador];
            if (vivo && p) setCreador({ nombre: p.displayName, avatarUrl: p.avatarUrl });
        });
        return () => {
            vivo = false;
        };
    }, [sesion.creador]);

    if (!vigente) {
        return (
            <Aviso
                icono={CircleStop}
                color="#9CA3AF"
                titulo="Esta sesión terminó"
                texto={`«${tituloDeSesion(sesion)}» ya no está abierta. Lo que se hizo sigue guardado; pide a quien la abrió que la comparta de nuevo.`}
                accion={<EnlaceSecundario href={conCuenta ? "/messages" : "/"}>{conCuenta ? "Ir a Mensajes" : "Ir al inicio"}</EnlaceSecundario>}
            />
        );
    }
    if (!sesion.ruta) {
        return (
            <Aviso
                icono={Info}
                titulo="No hay nada que abrir"
                texto="Esta sesión no tiene ninguna app asociada. Pide a quien la compartió que la vuelva a crear."
            />
        );
    }

    const soloVer = porEnlace && entrada && !entrada.edicionPorEnlacePublico;
    const permisoEfectivo = soloVer ? "ver" : sesion.permiso;
    const infoPermiso = PERMISOS_INFO[permisoEfectivo];
    const infoModo = MODOS_INFO[sesion.modo];
    const ruta = sesion.ruta;

    return (
        <Marco>
            <div className="space-y-5">
                <div className="flex items-start gap-4">
                    <IconoTipoVivo entrada={entrada} tam={56} />
                    <div className="min-w-0 flex-1">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.14em]" style={{ color }}>
                            {entrada?.etiqueta ?? "App en vivo"}
                        </p>
                        <h1 className="break-words text-xl font-semibold leading-snug text-white">{tituloDeSesion(sesion)}</h1>
                        <p className="mt-1 text-[13px] text-white/65">
                            Compartida por {creador?.nombre ?? "alguien de StarSeed"}
                        </p>
                    </div>
                </div>

                <div className="flex flex-wrap gap-1.5">
                    <ChipVivo color={color} icono={infoPermiso.icono}>{infoPermiso.etiqueta}</ChipVivo>
                    <ChipVivo color="#FFFFFF" icono={infoModo.icono} titulo={infoModo.ayuda}>{infoModo.etiqueta}</ChipVivo>
                    {presentes !== null && presentes > 0 && (
                        <ChipVivo color="#10B981">{presentes === 1 ? "1 persona dentro" : `${presentes} personas dentro`}</ChipVivo>
                    )}
                </div>

                {entrada?.descripcion && <p className="text-[14px] leading-relaxed text-white/70">{entrada.descripcion}</p>}

                {entrada?.nota && (
                    <p className="flex items-start gap-2 rounded-[14px] bg-white/[0.04] px-3 py-2.5 text-[12px] leading-snug text-white/70">
                        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" style={{ color }} aria-hidden="true" />
                        {entrada.nota}
                    </p>
                )}
                {soloVer && sesion.permiso !== "ver" && (
                    <p className="flex items-start gap-2 rounded-[14px] bg-white/[0.04] px-3 py-2.5 text-[12px] leading-snug text-white/70">
                        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-300" aria-hidden="true" />
                        Por el enlace público entras a ver en directo. Para editar, pide a quien la compartió que te invite.
                    </p>
                )}
                {porEnlace && !conCuenta && (
                    <p className="text-[12px] text-white/55">Entras sin cuenta: nadie verá tu nombre.</p>
                )}

                <div className="space-y-2">
                    <BotonPrincipal color={color} onClick={() => router.push(rutaConSesion(ruta, sesion.id))}>
                        Entrar <ArrowRight className="h-4 w-4" aria-hidden="true" />
                    </BotonPrincipal>
                    {conCuenta && (
                        <div className="text-center">
                            <EnlaceSecundario href="/messages">Volver a Mensajes</EnlaceSecundario>
                        </div>
                    )}
                </div>
            </div>
        </Marco>
    );
}

export default function PaginaVivo() {
    return (
        <Suspense
            fallback={
                <Marco>
                    <p className="flex items-center justify-center gap-2 py-6 text-[14px] text-white/70">
                        <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> Abriendo la sesión…
                    </p>
                </Marco>
            }
        >
            <Entrada />
        </Suspense>
    );
}
