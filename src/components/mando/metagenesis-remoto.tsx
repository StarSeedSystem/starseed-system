"use client";

/*
 * MetaGenesisRemoto — envoltura de /metagenesis para usarlo desde cualquier neurona (2026-10-10).
 * En la propia Mac (localhost) no hace nada: pinta la consola tal cual. Fuera de la Mac:
 *   · sin sesión → invita a entrar; cuenta no miembro → explica qué es MetaGenesis y le lleva a
 *     su Genesis;
 *   · miembro → busca el motor (la propia página o el túnel publicado en `metagenesis_motor`),
 *     lo SONDEA con el token y pone `guardia-fetch` en modo remoto: toda `/api/mando/*` va a la
 *     Mac con `Authorization: Bearer`. Aviso siempre a la vista: conectado, o «la Mac está
 *     apagada o sin túnel (último latido hace X)». Vuelve a comprobar cada minuto (cada 5 tras
 *     cinco fallos seguidos).
 * Al salir de la página quita el modo remoto. La URL del túnel nunca se pinta ni se guarda.
 * Lógica pura: `src/lib/metagenesis/conexion.ts`. SOP: architecture/metagenesis-remoto-tunel.md
 */

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { ArrowRight, DatabaseZap, Loader2, LogIn, PlugZap, RefreshCw, ServerOff, ShieldAlert, Unplug } from "lucide-react";
import { Button } from "@/components/ui/button";
import { miAccesoMetaGenesis } from "@/lib/metagenesis/accesos";
import { leerMotor, proveedorTokenDeLaSesion, sondearMotor } from "@/lib/metagenesis/motor";
import { hostsExtraDeEntorno, textoHace } from "@/lib/metagenesis/remoto";
import { comprobarConexion, type FaseConexion } from "@/lib/metagenesis/conexion";
import { fetchSinGuardia, ponerModoRemoto } from "@/lib/mando/guardia-fetch";

const CADA_MS = 60_000;
/** Tras 5 comprobaciones fallidas seguidas se reintenta cada 5 min (menos peticiones a Supabase). */
const FALLOS_ANTES_DE_ESPACIAR = 5;
const ACCESO_VALE_MS = 30 * 60_000;

function textoReintento(fallos: number): string {
    return fallos >= FALLOS_ANTES_DE_ESPACIAR ? "Vuelvo a comprobar solo cada 5 min." : "Vuelvo a comprobar solo cada minuto.";
}

type Estado = { fase: "comprobando" } | FaseConexion | { fase: "perdido"; anterior: Extract<FaseConexion, { fase: "conectado" }>; latidoHaceMs: number | null; motivo: string };

function Tarjeta({ tono, icono, titulo, children }: { tono: "ambar" | "neutro" | "rosa"; icono: ReactNode; titulo: string; children?: ReactNode }) {
    const clases =
        tono === "ambar"
            ? "border-amber-400/30 bg-amber-500/10 text-amber-100"
            : tono === "rosa"
              ? "border-rose-400/30 bg-rose-500/10 text-rose-100"
              : "border-white/10 bg-black/20 text-white/80";
    return (
        <div role="status" className={`mx-auto flex max-w-2xl items-start gap-3 rounded-2xl border p-4 text-sm ${clases}`}>
            <span className="mt-0.5 shrink-0" aria-hidden>
                {icono}
            </span>
            <div className="min-w-0 space-y-2">
                <p className="font-semibold">{titulo}</p>
                {children}
            </div>
        </div>
    );
}

export function MetaGenesisRemoto({ children }: { children: ReactNode }) {
    const [estado, setEstado] = useState<Estado>({ fase: "comprobando" });
    const [ahora, setAhora] = useState(() => Date.now());
    const [ocupado, setOcupado] = useState(false);
    const tokenRef = useRef<ReturnType<typeof proveedorTokenDeLaSesion> | null>(null);
    const estadoRef = useRef<Estado>(estado);
    estadoRef.current = estado;
    /** Membresía comprobada (vale 30 min: no cambia a cada minuto y cuesta dos RPC). */
    const accesoRef = useRef<{ t: number; v: { miembro: boolean } } | null>(null);
    const fallosRef = useRef(0);
    const vueltaRef = useRef(0);

    const comprobar = useCallback(async () => {
        if (typeof window === "undefined") return;
        tokenRef.current ??= proveedorTokenDeLaSesion();
        const token = tokenRef.current;
        setOcupado(true);
        try {
            const fase = await comprobarConexion({
                hostname: window.location.hostname,
                origenPagina: window.location.origin,
                hostsExtra: hostsExtraDeEntorno(process.env.NEXT_PUBLIC_METAGENESIS_MOTOR_HOSTS),
                token,
                acceso: async () => {
                    const a = accesoRef.current;
                    if (a && Date.now() - a.t < ACCESO_VALE_MS) return a.v;
                    const v = await miAccesoMetaGenesis();
                    accesoRef.current = v ? { t: Date.now(), v } : null;
                    return v;
                },
                leerMotor,
                sondear: (base, t) => sondearMotor(base, t, fetchSinGuardia()),
                ahora: () => Date.now(),
            });
            const previo = estadoRef.current;
            fallosRef.current = fase.fase === "conectado" || fase.fase === "local" ? 0 : fallosRef.current + 1;
            if (fase.fase === "conectado") {
                ponerModoRemoto({ base: fase.base, token });
                setEstado(fase);
            } else if (fase.fase === "sin-sesion" || fase.fase === "no-miembro") {
                // Sesión cerrada o acceso retirado: fuera el modo remoto y fuera la consola.
                ponerModoRemoto(null);
                setEstado(fase);
            } else if (previo.fase === "conectado" || previo.fase === "perdido") {
                // La consola ya está pintada: se queda con lo último que llegó y lo dice.
                const anterior = previo.fase === "conectado" ? previo : previo.anterior;
                const latidoHaceMs = fase.fase === "mac-apagada" ? fase.latidoHaceMs : null;
                const motivo = fase.fase === "mac-apagada" || fase.fase === "error" || fase.fase === "sin-tabla" ? fase.motivo : "La Mac no acepta la sesión.";
                setEstado({ fase: "perdido", anterior, latidoHaceMs, motivo });
            } else {
                setEstado(fase);
            }
        } finally {
            setOcupado(false);
            setAhora(Date.now());
        }
    }, []);

    /**
     * Conectado: basta con volver a sondear el MISMO motor (cero peticiones a Supabase). Solo si
     * no contesta se repite la comprobación entera (que relee la fila: el túnel pudo cambiar).
     */
    const revisar = useCallback(async () => {
        const e = estadoRef.current;
        const token = tokenRef.current;
        if (e.fase !== "conectado" || !token) return comprobar();
        const sonda = await sondearMotor(e.base, await token(false), fetchSinGuardia());
        if (!sonda.ok) return comprobar();
        setEstado({ ...e, comprobadoEn: Date.now() });
        setAhora(Date.now());
    }, [comprobar]);

    useEffect(() => {
        void comprobar();
        const ciclo = window.setInterval(() => {
            setAhora(Date.now());
            const f = estadoRef.current.fase;
            if (f === "local" || f === "no-miembro" || document.visibilityState === "hidden") return;
            vueltaRef.current += 1;
            if (fallosRef.current >= FALLOS_ANTES_DE_ESPACIAR && vueltaRef.current % 5 !== 0) return;
            void revisar();
        }, CADA_MS);
        const reloj = window.setInterval(() => setAhora(Date.now()), 15_000);
        return () => {
            window.clearInterval(ciclo);
            window.clearInterval(reloj);
            ponerModoRemoto(null);
        };
    }, [comprobar, revisar]);

    const botonComprobar = (
        <Button size="sm" variant="outline" className="h-8 cursor-pointer gap-1.5" disabled={ocupado} onClick={() => void comprobar()}>
            {ocupado ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <RefreshCw className="h-3.5 w-3.5" aria-hidden />}
            Comprobar ahora
        </Button>
    );

    switch (estado.fase) {
        case "local":
            return <>{children}</>;
        case "comprobando":
            return (
                <p className="flex items-center justify-center gap-2 py-10 text-sm text-white/60" data-testid="metagenesis-remoto-comprobando">
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                    Buscando el motor de MetaGenesis…
                </p>
            );
        case "sin-sesion":
            return (
                <Tarjeta tono="neutro" icono={<LogIn className="h-5 w-5 text-cyan-300" />} titulo="Entra con tu cuenta para usar MetaGenesis desde esta neurona.">
                    <p className="text-xs leading-relaxed text-white/65">
                        El motor de MetaGenesis vive en la Mac de desarrollo. Desde otro aparato se usa con tu cuenta de StarSeed, por un
                        túnel cifrado.
                    </p>
                    <Button asChild size="sm" className="h-8 cursor-pointer gap-1.5">
                        <Link href={`/login?next=${encodeURIComponent("/metagenesis")}`}>
                            <LogIn className="h-3.5 w-3.5" aria-hidden /> Iniciar sesión
                        </Link>
                    </Button>
                </Tarjeta>
            );
        case "no-miembro":
            return (
                <Tarjeta tono="ambar" icono={<ShieldAlert className="h-5 w-5" />} titulo="MetaGenesis es solo para desarrolladores de StarSeed OS con permiso.">
                    <p className="text-xs leading-relaxed text-amber-100/80">
                        Aquí se edita el código del sistema (enjambre, olas, publicación), así que solo entran las cuentas que un dueño
                        añadió en Ajustes › Accesos. Tu cuenta tiene su propio <strong>Genesis</strong>: tu perfil, tus páginas, la
                        apariencia, el dock, tus escritorios y tus agentes.
                    </p>
                    <Button asChild size="sm" variant="outline" className="h-8 cursor-pointer gap-1.5">
                        <Link href="/genesis">
                            Ir a mi Genesis <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                        </Link>
                    </Button>
                </Tarjeta>
            );
        case "sin-tabla":
            return (
                <Tarjeta tono="ambar" icono={<DatabaseZap className="h-5 w-5" />} titulo="Falta preparar la base de datos para MetaGenesis remoto.">
                    <p className="text-xs leading-relaxed text-amber-100/80">
                        La tabla donde la Mac publica su túnel (migración 20261010100000) aún no está aplicada, así que no hay forma de
                        encontrar el motor desde aquí.
                    </p>
                    {botonComprobar}
                </Tarjeta>
            );
        case "rechazado":
            return (
                <Tarjeta tono="rosa" icono={<ShieldAlert className="h-5 w-5" />} titulo="El motor de la Mac no aceptó tu sesión.">
                    <p className="text-xs leading-relaxed text-rose-100/80">
                        Contestó {estado.estado ?? "con un rechazo"}. Sal y vuelve a entrar; si sigue igual, comprueba en Ajustes › Accesos
                        (desde la Mac) que tu cuenta está en la lista.
                    </p>
                    {botonComprobar}
                </Tarjeta>
            );
        case "error":
            return (
                <Tarjeta tono="ambar" icono={<ServerOff className="h-5 w-5" />} titulo="No se pudo comprobar la conexión con MetaGenesis.">
                    <p className="text-xs leading-relaxed text-amber-100/80">{estado.motivo}</p>
                    {botonComprobar}
                </Tarjeta>
            );
        case "mac-apagada":
            return (
                <Tarjeta
                    tono="ambar"
                    icono={<ServerOff className="h-5 w-5" />}
                    titulo={`La Mac está apagada o sin túnel (último latido ${textoHace(estado.latidoHaceMs)}).`}
                >
                    <p className="text-xs leading-relaxed text-amber-100/80">
                        {estado.motivo}
                        {estado.maquina ? ` Máquina: ${estado.maquina}.` : ""} {textoReintento(fallosRef.current)}
                    </p>
                    {botonComprobar}
                </Tarjeta>
            );
        case "conectado":
        case "perdido": {
            const c = estado.fase === "conectado" ? estado : estado.anterior;
            return (
                <>
                    {estado.fase === "conectado" ? (
                        <div
                            role="status"
                            data-testid="metagenesis-remoto-conectado"
                            className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-100"
                        >
                            <PlugZap className="h-4 w-4 shrink-0" aria-hidden />
                            <span className="font-medium">Conectado a MetaGenesis en la Mac{c.maquina ? ` (${c.maquina})` : ""}</span>
                            <span className="text-xs text-emerald-100/70">
                                {c.desde === "tunel" ? "por túnel cifrado" : "esta página la sirve la propia Mac"} · respuesta comprobada{" "}
                                {textoHace(ahora - c.comprobadoEn)}
                            </span>
                        </div>
                    ) : (
                        <div
                            role="alert"
                            className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-100"
                        >
                            <Unplug className="h-4 w-4 shrink-0" aria-hidden />
                            <span className="min-w-0 flex-1">
                                <span className="font-medium">La Mac está apagada o sin túnel (último latido {textoHace(estado.latidoHaceMs)}).</span>{" "}
                                <span className="text-xs text-amber-100/75">
                                    {estado.motivo} Lo que ves es lo último que llegó. {textoReintento(fallosRef.current)}
                                </span>
                            </span>
                            {botonComprobar}
                        </div>
                    )}
                    {children}
                </>
            );
        }
    }
}
