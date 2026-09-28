"use client";
/**
 * Aviso de novedad — pantalla de bloqueo y pantalla de inicio (Ola 384 · D2).
 * ============================================================================
 * El bloqueo y la pantalla inicial (Ola 381-382) solo se ofrecían al final del
 * rito de creación de perfil o al configurar una neurona nueva. Esta ventana,
 * UNA sola vez por dispositivo, se lo recuerda a las cuentas que ya existían:
 * con sesión iniciada, sin bloqueo en ESTA neurona y sin haber elegido nunca
 * una pantalla inicial, aparece a los ~4 s de calma en una página normal —
 * nunca encima del rito de bienvenida/perfil, de Configurar Neurona, del
 * Puente de Mando ni de las rutas de acceso, llamada o vivo.
 *
 * Tres salidas, siempre en este dispositivo (localStorage, ver aviso-novedad.ts):
 *   · Configurar DENTRO del propio diálogo — se reutiliza `PreferenciasArranque`
 *     tal cual; guardar el bloqueo o elegir la pantalla inicial la cierra sola
 *     y la marca «configurado» (no vuelve a insistir).
 *   · «Recordármelo más tarde» — se pospone 3 días. Cerrarla con la X, tocar
 *     fuera o Escape cuenta como esto: un cierre implícito nunca es definitivo.
 *   · «No volver a mostrar» — decisión definitiva de la persona.
 */
import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ShieldCheck, Sparkles } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PreferenciasArranque } from "@/components/inicio/preferencias-arranque";
import { createClient } from "@/utils/supabase/client";
import { activeProfileId } from "@/lib/profiles/profiles";
import { deviceId } from "@/lib/sync/entity-state";
import { EVENTO_CONFIG_BLOQUEO, leerConfigBloqueo } from "@/lib/bloqueo/politica-bloqueo";
import { EVENTO_PANTALLA_INICIAL, leerPreferencias } from "@/lib/inicio/pantalla-inicial";
import { ritoActivo } from "@/lib/ui/rito-activo";
import { primerPlanoOcupado } from "@/lib/ui/fullscreen-modal";
import {
    debeMostrarAviso,
    esRutaExcluidaAviso,
    leerEstadoAviso,
    marcarAviso,
    type RespuestaAvisoNovedad,
} from "@/lib/inicio/aviso-novedad";

/** Cuánta calma en la página antes de asomar el aviso (no es una interrupción). */
const ESPERA_IDLE_MS = 4000;
/** Tras guardar algo dentro, un respiro para ver la confirmación antes de cerrar. */
const CIERRE_TRAS_CONFIGURAR_MS = 900;

/** ¿Hay un rito (bienvenida, perfil inicial…) o cualquier diálogo/sheet abierto ahora mismo? */
function primerPlanoOcupadoAhora(): boolean {
    return ritoActivo() || primerPlanoOcupado();
}

function pantallaInicialSinElegir(perfilId: string, neuronaId: string): boolean {
    try {
        const p = leerPreferencias();
        return !p.perfiles[perfilId] && !p.neuronas[neuronaId];
    } catch {
        return true;
    }
}

export interface AvisoNovedadContenidoProps {
    perfilId: string;
    neuronaId: string;
    onConfigurado: () => void;
    onLuego: () => void;
    onNoMostrar: () => void;
}

/**
 * Cuerpo del diálogo, exportado aparte de `AvisoNovedadArranque` para poder
 * probar sus tres salidas sin depender de la comprobación de sesión/idle.
 */
export function AvisoNovedadContenido({ perfilId, neuronaId, onConfigurado, onLuego, onNoMostrar }: AvisoNovedadContenidoProps) {
    // Configurar DENTRO (bloqueo guardado o pantalla inicial elegida) es la
    // primera salida: no hace falta un botón, basta con usar lo de siempre.
    React.useEffect(() => {
        let vivo = true;
        let cierre: number | undefined;
        const alConfigurar = () => {
            if (!vivo) return;
            if (cierre) window.clearTimeout(cierre);
            cierre = window.setTimeout(() => { if (vivo) onConfigurado(); }, CIERRE_TRAS_CONFIGURAR_MS);
        };
        window.addEventListener(EVENTO_CONFIG_BLOQUEO, alConfigurar);
        window.addEventListener(EVENTO_PANTALLA_INICIAL, alConfigurar);
        return () => {
            vivo = false;
            if (cierre) window.clearTimeout(cierre);
            window.removeEventListener(EVENTO_CONFIG_BLOQUEO, alConfigurar);
            window.removeEventListener(EVENTO_PANTALLA_INICIAL, alConfigurar);
        };
    }, [onConfigurado]);

    return (
        <>
            <DialogHeader className="items-center text-center sm:items-start sm:text-left">
                <div className="flex items-center gap-1.5 text-teal-200">
                    <Sparkles className="size-3.5" aria-hidden />
                    <span className="text-[11px] font-semibold uppercase tracking-[0.14em]">Novedad</span>
                </div>
                <DialogTitle className="flex items-center gap-2">
                    <ShieldCheck className="size-5 shrink-0 text-teal-300" aria-hidden />
                    Nuevo: pantalla de bloqueo y pantalla de inicio
                </DialogTitle>
                <DialogDescription>
                    Ahora puedes proteger este dispositivo con un PIN, una contraseña o tu huella o rostro, y elegir
                    qué ves al abrir StarSeed aquí. Todo opcional y se guarda solo en este dispositivo.
                </DialogDescription>
            </DialogHeader>

            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                <PreferenciasArranque ambito="perfil" id={perfilId} neuronaId={neuronaId} nombreNeurona="Este dispositivo" />
            </div>

            <div className="flex flex-col gap-3 pt-1">
                <p className="text-xs text-white/55">
                    Siempre puedes hacerlo en{" "}
                    <Link href="/cuenta#seguridad" className="text-teal-200 underline-offset-2 hover:underline">
                        Cuenta › Seguridad
                    </Link>
                    .
                </p>
                <div className="flex flex-wrap items-center justify-end gap-4">
                    <button type="button" onClick={onNoMostrar} className="cursor-pointer text-xs text-white/55 underline-offset-4 hover:underline">
                        No volver a mostrar
                    </button>
                    <button
                        type="button"
                        onClick={onLuego}
                        className="cursor-pointer rounded-full ss-redondo bg-white/10 px-4 py-1.5 text-xs font-semibold hover:bg-white/20"
                    >
                        Recordármelo más tarde
                    </button>
                </div>
            </div>
        </>
    );
}

export function AvisoNovedadArranque() {
    const ruta = usePathname();
    const [abierto, setAbierto] = React.useState(false);
    const cerradaRef = React.useRef(false);
    const perfilId = React.useMemo(() => activeProfileId() ?? "local", []);
    const neuronaId = React.useMemo(() => deviceId(), []);

    React.useEffect(() => {
        if (cerradaRef.current || esRutaExcluidaAviso(ruta)) return;
        let vivo = true;
        let temporizador: number | undefined;

        const evaluarTrasIdle = () => {
            if (temporizador) window.clearTimeout(temporizador);
            temporizador = window.setTimeout(() => { void evaluar(); }, ESPERA_IDLE_MS);
        };

        const evaluar = async () => {
            if (!vivo || cerradaRef.current) return;
            try {
                // Un rito o cualquier modal en primer plano: se reintenta tras la
                // próxima calma en vez de renunciar (el rito puede terminar pronto).
                if (primerPlanoOcupadoAhora()) { evaluarTrasIdle(); return; }
                const cfg = leerConfigBloqueo(neuronaId);
                if (cfg.metodo !== "ninguno") return;
                if (!pantallaInicialSinElegir(perfilId, neuronaId)) return;

                const sb = createClient();
                const { data } = await sb.auth.getUser();
                const user = data?.user;
                if (!vivo || cerradaRef.current || !user || (user as { is_anonymous?: boolean }).is_anonymous) return;
                const creado = user.created_at ? Date.parse(user.created_at) : NaN;

                const debe = debeMostrarAviso({
                    conSesion: true,
                    ruta,
                    ritualOModalActivo: primerPlanoOcupadoAhora(),
                    sinBloqueoConfigurado: true,
                    pantallaInicialSinElegir: true,
                    cuentaCreadaHaceMs: Number.isFinite(creado) ? Date.now() - creado : null,
                    estadoPrevio: leerEstadoAviso(),
                    ahora: Date.now(),
                });
                if (debe && vivo && !cerradaRef.current) setAbierto(true);
            } catch {
                /* una novedad nunca debe romper la página */
            }
        };

        evaluarTrasIdle();
        const actividad: (keyof WindowEventMap)[] = ["pointerdown", "keydown", "scroll"];
        actividad.forEach((ev) => window.addEventListener(ev, evaluarTrasIdle, { passive: true }));
        return () => {
            vivo = false;
            if (temporizador) window.clearTimeout(temporizador);
            actividad.forEach((ev) => window.removeEventListener(ev, evaluarTrasIdle));
        };
    }, [ruta, perfilId, neuronaId]);

    const cerrar = React.useCallback((respuesta: RespuestaAvisoNovedad) => {
        marcarAviso(respuesta);
        cerradaRef.current = true;
        setAbierto(false);
    }, []);

    if (!abierto) return null;
    return (
        <Dialog open={abierto} onOpenChange={(o) => { if (!o) cerrar("luego"); }}>
            <DialogContent
                data-testid="aviso-novedad-arranque"
                className="max-sm:inset-x-0 max-sm:bottom-0 max-sm:top-auto max-sm:w-full max-sm:max-w-none max-sm:translate-x-0 max-sm:translate-y-0 max-sm:rounded-b-none max-sm:rounded-t-3xl max-sm:border-x-0 max-sm:border-b-0 sm:max-w-md"
            >
                <AvisoNovedadContenido
                    perfilId={perfilId}
                    neuronaId={neuronaId}
                    onConfigurado={() => cerrar("configurado")}
                    onLuego={() => cerrar("luego")}
                    onNoMostrar={() => cerrar("no-mostrar")}
                />
            </DialogContent>
        </Dialog>
    );
}

export default AvisoNovedadArranque;
