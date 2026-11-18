"use client";

/**
 * Control entre mis neuronas · la banda visible y el permiso de ESTE aparato (ORD1114P · contrato
 * control-remoto-entre-neuronas §2.4 y permisos-y-control-del-dispositivo §5).
 *
 * `BandaControl` (montada en el layout): mientras otra neurona opera esta, una banda fija dice quién y
 * con qué nivel; un toque la termina y apaga el permiso. En la Mac enseña además el modo de pruebas de llamadas armado.
 * `ControlEntreNeuronasPanel` (en Permisos de antenas): el interruptor, apagado de fábrica, el nivel, los
 * aparatos aceptados y los que piden serlo, con su código para compararlo con el del otro aparato.
 *
 * La banda vive en la web: el indicador y la parada que no dependen de la página son trabajo nativo
 * (Rust/Kotlin) pendiente. Nada aquí pide ni concede permisos del sistema.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { PermisoControl, SesionActiva } from "@/lib/control-remoto/sesion";
import type { EstadoApp } from "@/lib/banco-llamadas/actor";
import { ENLACES_CONTROL, textoEnlace } from "@/lib/nativa/permisos-enlaces";
import { pasosQueFaltan } from "@/lib/banco-llamadas/pasos";
import {
    COSAS_QUE_FALTAN,
    abrirAjusteNativo,
    aceptarControladorNativo,
    capacidadesNativas,
    controladoresAceptadosNativos,
    estadoIndicadorNativo,
    prepararIndicadorNativo,
    quitarControladorNativo,
    type AjusteQueFalta,
    type CapacidadesNativas,
    type CosaQueFalta,
    type EstadoIndicador,
} from "@/lib/control-remoto/nativo";
import { BOTON_FALTA, PALABRAS_FALTA, palabrasMotivo } from "@/lib/control-remoto/palabras";
import { AJUSTES_CONTROL_DEFECTO, leerAjustesControl, type AjustesControl } from "@/lib/control-remoto/ajustes-aparato";
import { quienControla } from "@/lib/control-remoto/quien-controla";
import { AjustesIndicadorControl, EVENTO_AJUSTES_CONTROL } from "./ajustes-indicador";
import { PuntoColor, PuntoControl } from "./punto-control";
import { colorDe } from "@/lib/neurons/color-publico";
import { colorPublicoDeNeurona } from "@/lib/neurons/color-publico-ajuste";

// UNI1115M: el anfitrión (ventana, sesión, vídeo) se carga solo al abrir una ventana; el panel no lo arrastra.
const abrirVentanaControl = (neurona: string, nombre: string) => void import("./anfitrion-control").then((m) => m.abrirVentanaControl(neurona, nombre));
const abrirPaginaControl = (neurona: string, nombre: string) => void import("./anfitrion-control").then((m) => m.abrirPaginaControl(neurona, nombre));

const RE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function useCambios(): number {
    const [n, setN] = useState(0);
    useEffect(() => {
        const f = () => setN((x) => x + 1);
        if (typeof window === "undefined" || typeof window.addEventListener !== "function") return; // entornos sin eventos (pruebas)
        window.addEventListener("starseed:control-neuronas-cambio", f);
        const t = setInterval(f, 15_000); // la sesión caduca sola por inactividad
        return () => {
            window.removeEventListener("starseed:control-neuronas-cambio", f);
            clearInterval(t);
        };
    }, []);
    return n;
}

function hhmm(t: number): string {
    return new Date(t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

/** (CAL1115I) La plataforma de ESTE aparato, para que lo que falta se diga con las palabras de su sistema. */
export function plataformaLocal(ua?: string): "Android" | "macOS" | "otra" {
    const t = ua ?? (typeof navigator !== "undefined" ? navigator.userAgent || "" : "");
    if (/android/i.test(t)) return "Android";
    if (/mac os x|macintosh/i.test(t) && !/iphone|ipod|ipad/i.test(t)) return "macOS";
    return "otra";
}

/** (CAL1115I) Lo que falta, con la plataforma donde se enseña: el diálogo de Android solo se nombra en Android. */
export function textoFalta(c: CosaQueFalta, plataforma: string): { falta: string; boton: string } {
    if (c === "interruptor") {
        const donde = plataforma === "Android" ? "el diálogo de Android" : plataforma === "macOS" ? "el aviso de macOS" : "el aviso del sistema";
        return { falta: `Falta tu «Sí» en ${donde} para dejar que otras neuronas controlen este aparato.`, boton: "Activar el permiso en este aparato" };
    }
    if (c === "notificaciones") {
        return { falta: "Las notificaciones de StarSeed están sin permitir: sin ellas no hay aviso fijo con «Terminar».", boton: "Permitir notificaciones" };
    }
    const android = plataforma === "Android";
    return {
        falta: android
            ? "«Mostrar sobre otras apps» está sin permitir: sin él no hay borde rojo ni pastilla «Terminar»."
            : "El permiso para dibujar sobre otras ventanas está sin dar: sin él no hay borde rojo ni pastilla «Terminar».",
        boton: android ? "Abrir Ajustes de «Mostrar sobre otras apps»" : "Abrir los ajustes de este permiso",
    };
}

/** (CAL1115I) Quién controla a quién, en palabras, para los tres sitios del panel. */
/** CTL1118B: con el control apagado nadie opera este aparato aunque figure aceptado; «Terminar» también lo apaga. */
export const TEXTO_CONTROL_APAGADO = "El control está apagado en este aparato: nadie puede operarlo, aunque esté aceptado, hasta que lo enciendas. «Terminar» también lo apaga.";
export const TEXTO_TERMINADO = "Control terminado: quedó apagado en este aparato. Enciéndelo cuando quieras volver a permitirlo.";

export const quienOpera = {
    esteAparatoPide: (otro: string, codigo: string | null) =>
        `Vas a operar ${otro} desde este aparato; en ${otro} tienen que aceptar el código ${codigo ?? "de este aparato"}.`,
    // CTL1117J · S2: la verdad de lo que concede aceptar: con «Control total» es todo el aparato, apps incluidas.
    otroPide: (otro: string, alcance: "total" | "protegido" = "total") =>
        alcance === "total"
            ? `${otro} quiere operar ESTE aparato; si aceptas, podrá ver la pantalla y operar todo el aparato, apps incluidas (también los ajustes y los permisos).`
            : `${otro} quiere operar ESTE aparato; si aceptas, podrá ver la pantalla y tocarla, pero no las ventanas de permisos, instalador ni ajustes («Protegido»).`,
    puedeOperarEste: (otro: string) => `Puede operar este aparato: ${otro}`,
    esteAparatoPuede: (otro: string) => `Este aparato puede operar: ${otro}`,
};

function esCosa(x: string): x is CosaQueFalta {
    return (COSAS_QUE_FALTAN as readonly string[]).includes(x);
}

function haceCuanto(ms: number): string {
    const s = Math.round(ms / 1000);
    return s < 90 ? `hace ${s} s` : `hace ${Math.round(s / 60)} min`;
}

/**
 * (IND1115F) Lo que falta en ESTE aparato para enseñar el indicador, con un botón por cada cosa, y por qué se negó la
 * última sesión. Solo dice lo que Rust sabe (y desde cuándo): si no falta nada y nada se negó, no sale.
 */
export function FaltasIndicador({ estado, onPedir, plataforma }: { estado: EstadoIndicador | null; onPedir: (que: CosaQueFalta) => void; plataforma?: string }) {
    if (!estado) return null;
    const plat = plataforma ?? plataformaLocal();
    const conocidas = estado.falta.filter(esCosa);
    const otras = estado.falta.filter((x) => !esCosa(x));
    const r = estado.ultimoRechazo;
    if (!conocidas.length && !otras.length && !r) return null;
    return (
        <div className="space-y-2 rounded-lg border border-amber-400/30 bg-amber-400/[0.05] p-3 text-[12px] text-white/80" data-testid="faltas-indicador">
            {(conocidas.length > 0 || otras.length > 0) && <p className="font-medium text-amber-200">Para que otra neurona pueda controlar este aparato falta:</p>}
            {conocidas.map((c) => (
                <div key={c} className="flex flex-wrap items-center gap-2" data-testid={`falta-${c}`}>
                    <span className="min-w-0 flex-1">• {textoFalta(c, plat).falta}</span>
                    <button onClick={() => onPedir(c)} className="min-h-9 cursor-pointer rounded-md bg-amber-500/80 px-2 py-1 font-medium text-black hover:bg-amber-400">
                        {textoFalta(c, plat).boton}
                    </button>
                </div>
            ))}
            {otras.map((x) => (
                <p key={x}>• {x}</p>
            ))}
            {r && (
                <p className="text-white/55" data-testid="ultimo-rechazo">
                    Última sesión negada {haceCuanto(r.haceMs)} por falta de indicador · paso: {r.paso || "-"}
                    {r.error ? ` · ${r.error}` : ""}
                    {r.falta.length ? ` · faltaba: ${r.falta.join(", ")}` : ""}
                </p>
            )}
        </div>
    );
}


/**
 * (UNI1115M) Pantalla y entrada en ESTE aparato (tableta Android): lo que falta para que otra neurona la vea y la toque,
 * con un botón por cada cosa (`control_abrir_ajuste`: abre la pantalla de Ajustes o el diálogo nativo; lo hace la
 * PERSONA), el interruptor «Ver la pantalla sin preguntar en cada sesión», quién está aceptado para tocar y si la
 * pantalla o la entrada se usan ahora mismo. Sin app nativa o sin soporte no sale. Nada aquí concede nada.
 */
export function PantallaYEntradaEsteAparato({ caps, aceptados, pantallaEnUso, entradaEnUso, onAjuste }: {
    caps: CapacidadesNativas | null;
    aceptados: { huella: string; nombre: string; codigo: string }[] | null;
    pantallaEnUso: boolean;
    entradaEnUso: boolean;
    onAjuste: (cual: AjusteQueFalta) => void;
}) {
    if (!caps) return null;
    const faltas = caps.falta.filter((f): f is AjusteQueFalta => f in PALABRAS_FALTA && f !== "consentimiento-pantalla");
    const otras = caps.falta.filter((f) => !(f in PALABRAS_FALTA));
    return (
        <div className="space-y-2 rounded-lg border border-sky-400/30 bg-sky-400/[0.05] p-3 text-[12px] text-white/80" data-testid="pantalla-entrada-aparato">
            <p className="font-medium text-sky-200">Ver y tocar este aparato desde otra neurona</p>
            {faltas.map((f) => (
                <div key={f} className="flex flex-wrap items-center gap-2" data-testid={`falta-ajuste-${f}`}>
                    <span className="min-w-[14rem] flex-1">
                        • {PALABRAS_FALTA[f]}
                        {/* (FAC1116) Qué pantalla se abre y qué pulsar allí, en las palabras de Android. */}
                        <span className="block text-white/55" data-testid={`pasos-${f}`}>{textoEnlace(ENLACES_CONTROL[f as keyof typeof ENLACES_CONTROL])}</span>
                    </span>
                    {/* CTL1118L: lo que falta en un Linux (sesión X11) no se arregla en un panel de Ajustes: sin botón. */}
                    {BOTON_FALTA[f] && (
                        <button onClick={() => onAjuste(f)} className="min-h-9 cursor-pointer rounded-md bg-sky-500/80 px-2 py-1 font-medium text-black hover:bg-sky-400">
                            {BOTON_FALTA[f]}
                        </button>
                    )}
                </div>
            ))}
            {otras.map((f) => (
                <p key={f}>• {palabrasMotivo(f)}</p>
            ))}
            <div className="flex flex-wrap items-center gap-2">
                <button
                    role="switch"
                    aria-checked={caps.pantalla.sinPreguntar}
                    onClick={() => onAjuste("consentimiento-pantalla")}
                    className={`min-h-9 cursor-pointer rounded-lg border px-3 py-1.5 font-medium transition-colors ${caps.pantalla.sinPreguntar ? "border-sky-400 bg-sky-400/20 text-white" : "border-white/20 bg-white/5 text-white/70 hover:bg-white/10"}`}
                >
                    Ver la pantalla sin preguntar en cada sesión: {caps.pantalla.sinPreguntar ? "sí" : "no"}
                </button>
                <span className="min-w-[14rem] flex-1 text-white/55">Se cambia en un diálogo de este aparato: solo tú puedes decir «Sí».</span>
            </div>
            <p data-testid="uso-pantalla-entrada" className={pantallaEnUso || entradaEnUso ? "text-[#ff6b81]" : "text-white/55"}>
                Ahora mismo: {pantallaEnUso ? "otra neurona está viendo la pantalla" : "nadie ve la pantalla"} · {entradaEnUso ? "otra neurona puede tocarla" : "nadie la toca"}.
            </p>
            <p className="text-white/70" data-testid="aceptados-entrada">
                {aceptados && aceptados.length > 0
                    ? `Aceptadas para tocar este aparato: ${aceptados.map((a) => `${a.nombre} (código ${a.codigo})`).join(", ")}.`
                    : "Ninguna neurona está aceptada para tocar este aparato. Al aceptar una de arriba, este aparato te enseñará su código en un diálogo."}
            </p>
        </div>
    );
}

export function BandaControl() {
    const router = useRouter();
    const n = useCambios();
    const [sesion, setSesion] = useState<SesionActiva | null>(null);
    const [permiso, setPermiso] = useState<PermisoControl | null>(null);
    const [ajustes, setAjustes] = useState<AjustesControl>(AJUSTES_CONTROL_DEFECTO);
    // CTL1117I: ¿hay indicador nativo (app Android con control de pantalla)? Misma detección que apaga los ajustes del panel. null = aún no se sabe.
    const [hayNativo, setHayNativo] = useState<boolean | null>(null);
    const [banco, setBanco] = useState<{ con: string; hasta: number; restantes: number } | null>(null);

    useEffect(() => {
        const t = setTimeout(() => {
            void import("@/lib/control-remoto/canal").then((c) => c.iniciarCanalControl()).catch(() => undefined);
        }, 3000);
        const abrir = (e: Event) => {
            const ruta = (e as CustomEvent<{ ruta?: string }>).detail?.ruta;
            if (typeof ruta === "string" && /^\/[a-z0-9_\-/]{0,120}$/.test(ruta) && !ruta.includes("//") && !ruta.includes("..")) router.push(ruta);
        };
        window.addEventListener("starseed:control-abrir-ruta", abrir);
        return () => {
            clearTimeout(t);
            window.removeEventListener("starseed:control-abrir-ruta", abrir);
        };
    }, [router]);

    useEffect(() => {
        void import("@/lib/control-remoto/canal").then((c) => {
            setSesion(c.puertaControl()?.sesionActiva() ?? null);
            try {
                setPermiso(c.leerPermisoLocal());
            } catch {
                setPermiso(null);
            }
        });
        void import("@/lib/banco-llamadas/app").then((b) => setBanco(b.estadoBanco()));
    }, [n]);

    // CTL1117I: el indicador (punto u oculto) es de este aparato; se vuelve a leer cuando el panel de ajustes lo cambia.
    useEffect(() => {
        let vivo = true;
        const leer = () => void leerAjustesControl().then((a) => vivo && setAjustes(a));
        leer();
        window.addEventListener(EVENTO_AJUSTES_CONTROL, leer);
        return () => {
            vivo = false;
            window.removeEventListener(EVENTO_AJUSTES_CONTROL, leer);
        };
    }, []);

    useEffect(() => {
        let vivo = true;
        void capacidadesNativas().then((c) => vivo && setHayNativo(c !== null));
        return () => {
            vivo = false;
        };
    }, []);

    const terminar = useCallback(() => {
        void import("@/lib/control-remoto/canal").then((c) => c.puertaControl()?.revocar("terminado-por-el-dueno"));
    }, []);
    const apagarBanco = useCallback(() => {
        void import("@/lib/banco-llamadas/app").then((b) => b.apagarBanco("apagar"));
    }, []);

    // CTL1117I: ya no hay banda roja. Con `indicador=punto`, un punto en la esquina con el color de quien controla (y su panelito);
    // con `oculto` no se dibuja nada: quién controla y «Terminar» siguen en el panel de ajustes de control.
    const quien = quienControla(sesion, permiso);
    // Con indicador nativo (se ve en todo el aparato) la web NO pinta el suyo: solo uno. El panel de ajustes sigue diciendo quién controla.
    const verPunto = !!quien && ajustes.indicador === "punto" && hayNativo === false;
    if (!verPunto && !banco) return null;
    return (
        <>
            {verPunto && quien && <PuntoControl quien={quien} onTerminar={terminar} />}
            {banco && (
                <div className="pointer-events-none fixed inset-x-0 top-0 z-[2147483000] flex flex-col items-center gap-1 p-2" data-testid="banda-control">
                    <div role="status" className="pointer-events-auto flex max-w-[calc(100vw-32px)] flex-wrap items-center gap-3 rounded-xl border-2 border-[#FFBF00] bg-[#1a1404]/95 px-4 py-2 text-sm text-white shadow-lg">
                        <span className="font-semibold text-[#FFBF00]">Modo de pruebas de llamadas</span>
                        <span>
                            llama a {banco.con.slice(0, 8)} · hasta las {hhmm(banco.hasta)} · quedan {banco.restantes}
                        </span>
                        <button onClick={apagarBanco} className="min-h-9 cursor-pointer rounded-lg bg-[#FFBF00] px-3 py-1 font-medium text-black transition-colors hover:bg-[#d9a200]">
                            Apagar
                        </button>
                    </div>
                </div>
            )}
        </>
    );
}

export function ControlEntreNeuronasPanel() {
    const n = useCambios();
    const [permiso, setPermiso] = useState<PermisoControl | null>(null);
    const [codigos, setCodigos] = useState<Record<string, string>>({});
    const [miCodigo, setMiCodigo] = useState<string | null>(null);
    const [destino, setDestino] = useState("");
    const [aviso, setAviso] = useState<string | null>(null);
    const [banco, setBanco] = useState<{ con: string; hasta: number; restantes: number } | null>(null);
    // BAN1115D: las neuronas de la cuenta (para elegir sin teclear el id) y lo que la app informa de sí misma
    const [neuronas, setNeuronas] = useState<Array<{ id: string; nombre: string; plataforma: string; online: boolean }>>([]);
    const [informe, setInforme] = useState<EstadoApp | null>(null);
    const [indicador, setIndicador] = useState<EstadoIndicador | null>(null);
    // UNI1115M: pantalla y entrada de ESTE aparato (solo la app nativa de Android responde) y la espera de «Pedir controlarla»
    const [capsNat, setCapsNat] = useState<CapacidadesNativas | null>(null);
    const [aceptadosNat, setAceptadosNat] = useState<{ huella: string; nombre: string; codigo: string }[] | null>(null);
    const [uso, setUso] = useState({ pantalla: false, entrada: false });
    const [sesionAct, setSesionAct] = useState<SesionActiva | null>(null); // CTL1117I: quién controla ahora (aunque el punto esté oculto)
    const [esperando, setEsperando] = useState<string | null>(null);
    const [alcance, setAlcance] = useState<"total" | "protegido">("total"); // CTL1117J · S2
    useEffect(() => {
        let vivo = true;
        const leer = () => void leerAjustesControl().then((a) => vivo && setAlcance(a.alcance));
        leer();
        // CTL1117J: hay montajes (y pruebas) con una `window` sin eventos; sin ellos se lee una vez y basta.
        const conEventos = typeof window !== "undefined" && typeof window.addEventListener === "function";
        if (conEventos) window.addEventListener(EVENTO_AJUSTES_CONTROL, leer);
        return () => {
            vivo = false;
            if (conEventos) window.removeEventListener(EVENTO_AJUSTES_CONTROL, leer);
        };
    }, []);
    const leerPantallaEntrada = useCallback(() => {
        void capacidadesNativas().then(setCapsNat);
        void controladoresAceptadosNativos().then(setAceptadosNat);
        void (async () => {
            const c = await import("@/lib/control-remoto/canal");
            const o = await import("@/lib/control-remoto/pantalla-origen");
            const ses = c.puertaControl()?.sesionActiva() ?? null;
            setUso({ pantalla: o.origenGlobal().enMarcha(), entrada: ses?.nivel === "controlar" });
            setSesionAct(ses);
        })().catch(() => undefined);
    }, []);
    const pedirAjuste = useCallback(
        async (cual: AjusteQueFalta) => {
            const r = await abrirAjusteNativo(cual);
            if (!r.ok && r.motivo) setAviso(palabrasMotivo(r.motivo) ?? `No se pudo abrir: ${r.motivo}`);
            // La persona contesta en Ajustes o en el diálogo: se vuelve a leer mientras tanto y al volver.
            for (const ms of [1500, 5000, 12000]) setTimeout(leerPantallaEntrada, ms);
        },
        [leerPantallaEntrada],
    );
    // «Pedir controlarla desde aquí» que termina en una sesión abierta: la ventana de control se abre sola.
    const reloj = useRef<ReturnType<typeof setInterval> | null>(null);
    useEffect(() => {
        if (!esperando) return;
        const objetivo = esperando;
        const t0 = Date.now();
        reloj.current = setInterval(() => {
            void import("@/lib/banco-llamadas/app").then((b) => {
                b.informarBanco(objetivo);
                const i = b.ultimoInforme();
                if (i?.sesion?.estado === "aceptada" && i.objetivo?.toLowerCase() === objetivo.toLowerCase()) {
                    abrirVentanaControl(objetivo, nombreRef.current(objetivo));
                    setEsperando(null);
                } else if (i?.sesion?.estado === "rechazada" && i.objetivo?.toLowerCase() === objetivo.toLowerCase()) {
                    setAviso(`${nombreRef.current(objetivo)} no te aceptó${i.sesion.motivo ? `: ${palabrasMotivo(i.sesion.motivo) ?? i.sesion.motivo}` : "."}`);
                    setEsperando(null);
                } else if (Date.now() - t0 > 5 * 60_000) {
                    setAviso(`${nombreRef.current(objetivo)} no contestó en 5 minutos. Cuando acepte, pulsa «Abrir ventana de control».`);
                    setEsperando(null);
                }
            });
        }, 6000);
        return () => {
            if (reloj.current) clearInterval(reloj.current);
            reloj.current = null;
        };
    }, [esperando]);

    // IND1115F: lo que Rust sabe del indicador de este aparato (nada fuera de la app nativa).
    const leerIndicador = useCallback(() => void estadoIndicadorNativo().then(setIndicador), []);
    useEffect(() => {
        leerIndicador();
    }, [n, leerIndicador]);
    const pedirFalta = useCallback(
        async (que: CosaQueFalta) => {
            await prepararIndicadorNativo(que);
            // La persona contesta en el diálogo del sistema o en Ajustes: se vuelve a leer mientras tanto y al volver.
            for (const ms of [1500, 5000, 12000]) setTimeout(leerIndicador, ms);
        },
        [leerIndicador],
    );

    useEffect(() => {
        void (async () => {
            try {
                const nn = await import("@/lib/neurons/neurons");
                const yo = nn.thisDeviceId();
                const lista = await nn.listNeurons();
                setNeuronas(
                    lista
                        .filter((x) => x.id !== yo && !x.isThisDevice)
                        .map((x) => ({ id: x.id, nombre: x.name, plataforma: x.capabilities?.platform || x.kind, online: !!x.online })),
                );
            } catch {
                setNeuronas([]); // sin lista: queda el campo del id
            }
        })();
    }, [n]);

    useEffect(() => {
        void import("@/lib/banco-llamadas/app").then((b) => setInforme(b.ultimoInforme()));
    }, [n]);

    useEffect(() => {
        void (async () => {
            const c = await import("@/lib/control-remoto/canal");
            const p = c.leerPermisoLocal();
            setPermiso(p);
            const f = await import("@/lib/chats-genesis/firma-aparato");
            const yo = await f.aparatoLocal().catch(() => null);
            setMiCodigo(yo?.codigo ?? null);
            const cs: Record<string, string> = {};
            for (const x of [...p.controladores, ...p.pendientes]) cs[x.huella] = await f.codigoDe(x.huella, x.cuenta).catch(() => "?");
            setCodigos(cs);
            const b = await import("@/lib/banco-llamadas/app");
            setBanco(b.estadoBanco());
            leerPantallaEntrada(); // UNI1115M: después de lo de arriba, no a la vez (dos importaciones dinámicas de canal a la vez)
        })();
    }, [n, leerPantallaEntrada]);

    const nombreDe = useCallback(
        (id: string) => neuronas.find((x) => x.id.toLowerCase() === id.toLowerCase())?.nombre ?? "esa neurona",
        [neuronas],
    );

    const nombreRef = useRef(nombreDe);
    nombreRef.current = nombreDe;

    const cambiar = useCallback(async (f: (p: PermisoControl) => PermisoControl) => {
        const c = await import("@/lib/control-remoto/canal");
        const antes = c.leerPermisoLocal();
        const nuevo = f(antes);
        c.guardarPermisoLocal(nuevo);
        // CTL1118B: «revocar» solo cuando la persona APAGA (antes se repetía en cada guardado con el control ya apagado).
        if (antes.encendido && !nuevo.encendido) c.puertaControl()?.revocar("apagado-por-el-dueno");
    }, []);

    const aceptar = useCallback(
        async (huella: string, encender = false) => {
            const s = await import("@/lib/control-remoto/sesion");
            const c = await import("@/lib/control-remoto/canal");
            const antes = c.leerPermisoLocal();
            const quien = antes.pendientes.find((x) => x.huella === huella);
            // CTL1118B: con el control apagado el botón dice «Aceptar y encender el control»: la persona hace las dos cosas a sabiendas.
            await cambiar((p) => ({ ...s.aceptarPendiente(p, huella), ...(encender ? { encendido: true } : {}) }));
            // UNI1115M · costura g: para tocar este aparato (nivel «controlar») lo NATIVO enseña su diálogo con el código y solo
            // el «Sí» de la persona acepta; la página solo lo pide. Sin ese «Sí», las órdenes de entrada se rechazan.
            if (quien && antes.nivel === "controlar") {
                const r = await aceptarControladorNativo(quien.spki, quien.cuenta, quien.nombre);
                if (r.ok) setAviso(`Mira este aparato: te enseña el código ${r.codigo ?? ""} de ${quien.nombre}. Si coincide con el que ves allí, di «Sí» para dejarle tocar la pantalla.`);
                else if (r.motivo && r.motivo !== "sin-soporte") setAviso(`Quedó aceptada para ver, pero no para tocar: ${palabrasMotivo(r.motivo) ?? r.motivo}`);
                for (const ms of [1500, 6000, 15000]) setTimeout(leerPantallaEntrada, ms);
            }
        },
        [cambiar, leerPantallaEntrada],
    );
    const quitar = useCallback(
        async (huella: string) => {
            const s = await import("@/lib/control-remoto/sesion");
            const c = await import("@/lib/control-remoto/canal");
            const nivel = c.leerPermisoLocal().nivel;
            await cambiar((p) => s.quitarControlador(p, huella));
            // PENB4: la lista aceptada para TOCAR la escribe solo Kotlin; aquí se le pide quitarlo (mismo criterio que `aceptar`:
            // nivel «controlar», o ya figura en la lista nativa, que solo trae el comienzo de la huella).
            const nat = await controladoresAceptadosNativos();
            if (nivel !== "controlar" && !nat?.some((a) => a.huella !== "" && huella.startsWith(a.huella))) return;
            const r = await quitarControladorNativo(huella);
            if (r.ok) setAviso("Quitado");
            else if (r.motivo !== "sin-soporte") setAviso(`Se quitó aquí, pero este aparato aún lo tiene aceptado para tocar: ${palabrasMotivo(r.motivo) ?? "sin respuesta"}`);
            leerPantallaEntrada();
        },
        [cambiar, leerPantallaEntrada],
    );

    const elegir = useCallback(async (id: string) => {
        setDestino(id);
        if (RE_UUID.test(id)) void import("@/lib/banco-llamadas/app").then((b) => b.informarBanco(id)); // solo mira si ya te aceptó
    }, []);

    const ofrecer = useCallback(async () => {
        if (!RE_UUID.test(destino.trim())) {
            setAviso("Escribe el id completo de la neurona (lo ves en Mensajes › Neuronas).");
            return;
        }
        const c = await import("@/lib/control-remoto/canal");
        const r = await c.presentarmeA(destino.trim().toLowerCase(), typeof navigator !== "undefined" ? (navigator.platform || "Neurona") : "Neurona");
        if (r.ok) {
            setTimeout(() => void import("@/lib/banco-llamadas/app").then((b) => b.informarBanco(destino.trim())), 6000); // mira si ya te aceptó
            setEsperando(destino.trim().toLowerCase()); // UNI1115M: cuando acepte, la ventana de control se abre sola
        }
        setAviso(
            r.ok
                ? `Pedido enviado. ${quienOpera.esteAparatoPide(nombreDe(destino.trim()), miCodigo)}${(r.resultado as { apagado?: unknown } | undefined)?.apagado === true ? ` ${nombreDe(destino.trim())} tiene el control apagado: allí, además de aceptar, hay que encenderlo (el botón de aceptar lo hace).` : ""}`
                : r.motivo === "sin-aparato"
                  ? "Este aparato no tiene clave propia: créala en Chats de Genesis (emparejar)."
                  : `No se pudo pedir: ${r.motivo}.`,
        );
    }, [destino, miCodigo, nombreDe]);

    const armar = useCallback(async () => {
        const b = await import("@/lib/banco-llamadas/app");
        if (!b.armarBanco(destino.trim(), 4, 40)) setAviso("Escribe el id completo de la tableta.");
    }, [destino]);
    const apagar = useCallback(async () => {
        const b = await import("@/lib/banco-llamadas/app");
        b.apagarBanco("apagar");
    }, []);

    if (!permiso) return null;
    return (
        <div id="control-entre-neuronas" className="mb-6 space-y-3 rounded-xl border border-[#DC143C]/30 bg-[#DC143C]/[0.04] p-4" data-testid="control-entre-neuronas">
            <div className="flex flex-wrap items-center gap-3">
                <h3 className="flex-1 text-sm font-medium text-white/80">Control entre mis neuronas</h3>
                <button
                    role="switch"
                    aria-checked={permiso.encendido}
                    onClick={() => void cambiar((p) => ({ ...p, encendido: !p.encendido }))}
                    className={`min-h-9 cursor-pointer rounded-lg border px-3 py-1.5 text-[12px] font-medium transition-colors ${permiso.encendido ? "border-[#DC143C] bg-[#DC143C]/30 text-white" : "border-white/20 bg-white/5 text-white/70 hover:bg-white/10"}`}
                >
                    {permiso.encendido ? "Encendido en este aparato" : "Apagado en este aparato"}
                </button>
            </div>
            <p className="text-[12px] text-white/55">
                Deja que otra neurona de tu cuenta, que tú aceptes aquí, opere este aparato: llamar, contestar, colgar, micrófono y cámara, abrir una sección y leer su estado; con el nivel «controlar» y la pantalla,
                {alcance === "total" ? " también ver la pantalla y operar el aparato entero, apps, ajustes y permisos incluidos (Control total)." : " también ver la pantalla y tocarla, salvo las ventanas protegidas: permisos, instalador y ajustes (Protegido)."} Mientras alguien la opera tendrás un aviso en las notificaciones y, si quieres, un punto de su color en la esquina; desde cualquiera de los dos puedes terminar. Cada orden queda en el registro de llamadas.
            </p>
            {!permiso.encendido && (permiso.controladores.length > 0 || permiso.pendientes.length > 0) && (
                <div role="status" data-testid="control-apagado-aviso" className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-400/40 bg-amber-400/10 p-2 text-[12px] text-amber-100">
                    <span className="min-w-0 flex-1">{TEXTO_CONTROL_APAGADO}</span>
                    <button onClick={() => void cambiar((p) => ({ ...p, encendido: true }))} className="min-h-9 cursor-pointer rounded-md bg-amber-400/80 px-2 py-1 font-medium text-black transition-colors hover:bg-amber-400">
                        Encender el control
                    </button>
                </div>
            )}
            <label className="flex items-center gap-2 text-[12px] text-white/70">
                Nivel
                <select
                    value={permiso.nivel}
                    onChange={(e) => {
                        // CTL1118B: el valor se lee YA; `cambiar` espera una importación y para entonces React ya devolvió el <select> a su valor de antes (el nivel no cambiaba nunca).
                        const nivel = e.target.value === "ver" ? "ver" : "controlar";
                        void cambiar((p) => ({ ...p, nivel }));
                    }}
                    className="cursor-pointer rounded-md border border-white/20 bg-black/40 px-2 py-1"
                >
                    <option value="ver">ver (solo leer el estado)</option>
                    <option value="controlar">controlar (órdenes de la app)</option>
                </select>
            </label>
            <FaltasIndicador estado={indicador} onPedir={(q) => void pedirFalta(q)} />
            <PantallaYEntradaEsteAparato caps={capsNat} aceptados={aceptadosNat} pantallaEnUso={uso.pantalla} entradaEnUso={uso.entrada} onAjuste={(c) => void pedirAjuste(c)} />
            <AjustesIndicadorControl disponible={capsNat !== null} quien={quienControla(sesionAct, permiso)} onTerminar={() => void import("@/lib/control-remoto/canal").then((c) => { c.puertaControl()?.revocar("terminado-por-el-dueno"); setSesionAct(null); setAviso(TEXTO_TERMINADO); })} />
            <p className="text-[12px] text-white/50">Código de este aparato: {miCodigo ?? "sin clave propia (créala en Chats de Genesis)"}</p>
            {permiso.pendientes.map((x) => (
                <div key={x.huella} className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-400/30 p-2 text-[12px] text-white/80">
                    <PuntoColor color={colorDe(x.neurona, x.color)} />
                    <span className="flex-1">
                        {quienOpera.otroPide(x.nombre, alcance)} Código {codigos[x.huella] ?? "…"} (compáralo con el que enseña ese aparato)
                    </span>
                    <button onClick={() => void aceptar(x.huella, !permiso.encendido)} className="cursor-pointer rounded-md bg-emerald-600/70 px-2 py-1 hover:bg-emerald-600">
                        {permiso.encendido ? "Aceptar" : "Aceptar y encender el control"}
                    </button>
                    <button onClick={() => void quitar(x.huella)} className="cursor-pointer rounded-md bg-white/10 px-2 py-1 hover:bg-white/20">
                        Rechazar
                    </button>
                </div>
            ))}
            {permiso.controladores.map((x) => (
                <div key={x.huella} className="flex flex-wrap items-center gap-2 rounded-lg border border-white/10 p-2 text-[12px] text-white/70">
                    <PuntoColor color={colorDe(x.neurona, x.color)} />
                    <span className="flex-1">
                        {quienOpera.puedeOperarEste(x.nombre)} · código {codigos[x.huella] ?? "…"} · desde {x.desde.slice(0, 10)}
                    </span>
                    <button onClick={() => void quitar(x.huella)} className="cursor-pointer rounded-md bg-white/10 px-2 py-1 hover:bg-white/20">
                        Quitar
                    </button>
                </div>
            ))}
            {informe?.sesion?.estado === "aceptada" && informe.objetivo && (
                <div className="flex flex-wrap items-center gap-2" data-testid="este-aparato-puede">
                    <p className="min-w-0 flex-1 text-[12px] text-emerald-300/80">{quienOpera.esteAparatoPuede(nombreDe(informe.objetivo))}</p>
                    {/* UNI1115M: la ventana de control de esa neurona, flotante (sigue al cambiar de sección) o en una pestaña propia */}
                    <button
                        onClick={() => informe.objetivo && abrirVentanaControl(informe.objetivo, nombreDe(informe.objetivo))}
                        className="min-h-9 cursor-pointer rounded-md bg-emerald-600/70 px-2 py-1 text-[12px] hover:bg-emerald-600"
                    >
                        Abrir ventana de control
                    </button>
                    <button
                        onClick={() => informe.objetivo && abrirPaginaControl(informe.objetivo, nombreDe(informe.objetivo))}
                        className="min-h-9 cursor-pointer rounded-md bg-white/10 px-2 py-1 text-[12px] text-white/80 hover:bg-white/20"
                    >
                        Abrir en una pestaña
                    </button>
                </div>
            )}
            {esperando && (
                <p className="text-[12px] text-sky-200" data-testid="esperando-aceptacion">
                    Esperando a que {nombreDe(esperando)} te acepte (compara el código {miCodigo ?? "de este aparato"}). Cuando lo haga, la ventana de control se abrirá sola.
                </p>
            )}
            {neuronas.length > 0 && (
                <div className="flex flex-wrap gap-2 border-t border-white/10 pt-3" role="listbox" aria-label="Neuronas de tu cuenta" data-testid="neuronas-elegir">
                    {neuronas.map((x) => (
                        <button
                            key={x.id}
                            role="option"
                            aria-selected={destino.trim().toLowerCase() === x.id.toLowerCase()}
                            onClick={() => void elegir(x.id)}
                            className={`min-h-9 cursor-pointer rounded-lg border px-3 py-1.5 text-left text-[12px] transition-colors ${destino.trim().toLowerCase() === x.id.toLowerCase() ? "border-[#FFBF00] bg-[#FFBF00]/15 text-white" : "border-white/15 bg-white/5 text-white/75 hover:bg-white/10"}`}
                        >
                            <PuntoColor color={colorPublicoDeNeurona(x.id)} /> <span className="font-medium">{x.nombre}</span> · {x.plataforma} · <span className={x.online ? "text-emerald-300" : "text-white/40"}>{x.online ? "conectada" : "sin conexión"}</span>
                        </button>
                    ))}
                </div>
            )}
            {(destino.trim() !== "" || banco) && (
                <ul className="space-y-1 text-[12px]" data-testid="pasos-banco">
                    {pasosQueFaltan({ informe, destino: destino.trim(), codigo: miCodigo }).map((p) => (
                        <li key={p.clave} className={p.hecho ? "text-emerald-300/80" : "text-amber-200"}>
                            {p.hecho ? "✓ " : "• "}
                            {p.texto}
                        </li>
                    ))}
                </ul>
            )}
            {RE_UUID.test(destino.trim()) && (
                <p className="text-[12px] text-sky-200" data-testid="este-aparato-pide">
                    {quienOpera.esteAparatoPide(nombreDe(destino.trim()), miCodigo)}
                </p>
            )}
            <div className="flex flex-wrap items-center gap-2 border-t border-white/10 pt-3">
                <input
                    value={destino}
                    onChange={(e) => void elegir(e.target.value)}
                    placeholder="o escribe el id de la otra neurona"
                    className="min-w-0 flex-1 rounded-md border border-white/20 bg-black/40 px-2 py-1 text-[12px] text-white"
                />
                <button onClick={() => void ofrecer()} className="cursor-pointer rounded-md bg-white/10 px-2 py-1 text-[12px] text-white/80 hover:bg-white/20">
                    Pedir controlarla desde aquí
                </button>
                {banco ? (
                    <button onClick={() => void apagar()} className="cursor-pointer rounded-md bg-[#FFBF00] px-2 py-1 text-[12px] text-black">
                        Apagar el modo de pruebas de llamadas
                    </button>
                ) : (
                    <button onClick={() => void armar()} className="cursor-pointer rounded-md border border-[#FFBF00]/50 px-2 py-1 text-[12px] text-[#FFBF00] hover:bg-[#FFBF00]/10">
                        Modo de pruebas de llamadas hacia esa tableta (4 h, 40 llamadas)
                    </button>
                )}
            </div>
            {aviso && <p className="text-[12px] text-sky-300">{aviso}</p>}
        </div>
    );
}

export default BandaControl;
