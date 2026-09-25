"use client";

/**
 * DemoGestosHibridos — paso didáctico e INTERACTIVO de la guía: cómo se abren y
 * se cierran los menús en cualquier dispositivo.
 * ─────────────────────────────────────────────────────────────────────────────
 * Un recuadro de práctica con un mini panel «Horizon»: se abre tirando desde su
 * borde izquierdo (dedo, ratón o lápiz) y se cierra arrastrándolo de vuelta,
 * con su X o tocando fuera — exactamente como las cortinas de verdad, porque usa
 * el MISMO motor de gestos (src/lib/gestos). Mientras nadie lo toca, una mano o
 * un cursor fantasma enseña el gesto; qué se enseña depende del dispositivo
 * (usePerfilDispositivo), y cambia en vivo si se conecta un ratón.
 *
 * Accesible: el borde es un botón («Abrir el panel de práctica»), la X es la
 * común y los logros se anuncian con aria-live. Con menos movimiento no hay
 * fantasma ni resortes: el panel se coloca sin animar.
 */

import { useCallback, useRef, useState } from "react";
import { animate, motion, useMotionValue, useTransform } from "framer-motion";
import { Check, Hand, Keyboard, MonitorSmartphone, MousePointer2, X } from "lucide-react";
import { BotonCerrar } from "@/components/ui/boton-cerrar";
import { usePerfilDispositivo } from "@/hooks/use-perfil-dispositivo";
import {
    decidirDestino,
    elastico,
    evaluarIntencion,
    instanteDeEvento,
    registrarMuestra,
    umbralParaPuntero,
    velocidad,
    type Intencion,
    type Muestra,
} from "@/lib/gestos";

const BANDA_BORDE_PX = 28;

interface Gesto {
    id: number;
    tipo: string;
    inicio: Muestra;
    muestras: Muestra[];
    intencion: Intencion;
    aperturaInicial: number;
    ancho: number;
}

/** Textos por dispositivo: lo que se explica es lo que la persona puede hacer ahí. */
export function instruccionesPractica(entrada: "tactil" | "raton" | "hibrido"): { abrir: string; cerrar: string } {
    if (entrada === "tactil") {
        return {
            abrir: "Desliza el dedo desde el borde izquierdo del recuadro hacia dentro.",
            cerrar: "Ciérralo arrastrándolo de vuelta, tocando fuera o con la X.",
        };
    }
    if (entrada === "raton") {
        return {
            abrir: "Tira del borde izquierdo con el ratón (o haz clic en él).",
            cerrar: "Ciérralo con la X, con un clic fuera o arrastrándolo de vuelta.",
        };
    }
    return {
        abrir: "Desliza desde el borde izquierdo con el dedo o tira de él con el ratón.",
        cerrar: "Ciérralo arrastrándolo de vuelta, con la X o tocando fuera.",
    };
}

export function DemoGestosHibridos({ accent, reduce }: { accent: string; reduce: boolean }) {
    const { entrada } = usePerfilDispositivo();
    const textos = instruccionesPractica(entrada);
    const escenarioRef = useRef<HTMLDivElement | null>(null);
    const panelRef = useRef<HTMLDivElement | null>(null);
    const gestoRef = useRef<Gesto | null>(null);
    const apertura = useMotionValue(0);
    const x = useTransform(apertura, (a) => `${((a - 1) * 108).toFixed(2)}%`);
    const fondo = useTransform(apertura, (a) => Math.max(0, Math.min(1, a)) * 0.45);
    const [tocado, setTocado] = useState(false);
    const [abiertoConGesto, setAbiertoConGesto] = useState(false);
    const [cerrado, setCerrado] = useState(false);
    const [abierto, setAbierto] = useState(false);

    const ir = useCallback((destino: "abierto" | "cerrado", vPorSegundo = 0) => {
        const objetivo = destino === "abierto" ? 1 : 0;
        setAbierto(destino === "abierto");
        if (reduce) {
            apertura.set(objetivo);
            return;
        }
        animate(apertura, objetivo, { type: "spring", stiffness: 380, damping: 34, velocity: vPorSegundo });
    }, [apertura, reduce]);

    const cerrarPanel = useCallback(() => {
        if (apertura.get() > 0.05) setCerrado(true);
        ir("cerrado");
    }, [apertura, ir]);

    const muestra = (e: React.PointerEvent): Muestra => ({ x: e.clientX, y: e.clientY, t: instanteDeEvento(e.timeStamp, performance.now()) });

    const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
        if (e.pointerType === "mouse" && e.button !== 0) return;
        const destino = e.target as Element;
        if (destino.closest("[data-boton-cerrar]")) return; // la X es un clic, no un arrastre
        const escenario = escenarioRef.current;
        if (!escenario) return;
        const r = escenario.getBoundingClientRect();
        const desdeBorde = e.clientX - r.left <= BANDA_BORDE_PX;
        const estaAbierto = apertura.get() > 0.5;
        // Cerrado: solo nace desde el borde (como en el OS). Abierto: desde cualquier punto.
        if (!estaAbierto && !desdeBorde) return;
        setTocado(true);
        const m = muestra(e);
        gestoRef.current = {
            id: e.pointerId,
            tipo: e.pointerType,
            inicio: m,
            muestras: [m],
            intencion: "pendiente",
            aperturaInicial: apertura.get(),
            ancho: panelRef.current?.offsetWidth || r.width * 0.6,
        };
    };

    const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
        const g = gestoRef.current;
        if (!g || g.id !== e.pointerId) return;
        const m = muestra(e);
        const dx = m.x - g.inicio.x;
        if (g.intencion === "pendiente") {
            g.intencion = evaluarIntencion("x", dx, m.y - g.inicio.y, { umbralPx: umbralParaPuntero(g.tipo) });
            if (g.intencion === "rechazada") {
                gestoRef.current = null;
                return;
            }
            if (g.intencion === "pendiente") return;
            try {
                e.currentTarget.setPointerCapture(e.pointerId);
            } catch {
                /* sin captura el gesto sigue dentro del recuadro */
            }
        }
        g.muestras = registrarMuestra(g.muestras, m);
        const bruto = g.aperturaInicial + dx / g.ancho;
        apertura.set(bruto > 1 ? 1 + elastico(bruto - 1, 1) : Math.max(0, bruto));
    };

    const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
        const g = gestoRef.current;
        gestoRef.current = null;
        if (!g || g.id !== e.pointerId || g.intencion !== "aceptada") return;
        const v = velocidad(g.muestras, "x", 100, instanteDeEvento(e.timeStamp, performance.now()));
        const origen = g.aperturaInicial > 0.5 ? "abierto" : "cerrado";
        const recorridoPx = (apertura.get() - g.aperturaInicial) * g.ancho;
        const destino = decidirDestino({
            origen,
            // «hacia el otro estado»: abrir = hacia la derecha, cerrar = hacia la izquierda.
            recorrido: origen === "cerrado" ? recorridoPx : -recorridoPx,
            velocidad: origen === "cerrado" ? v : -v,
            tam: g.ancho,
            umbralCambio: 0.3,
        });
        if (destino === "abierto" && origen === "cerrado") setAbiertoConGesto(true);
        if (destino === "cerrado" && origen === "abierto") setCerrado(true);
        // La inercia del gesto continúa en el resorte (unidades de apertura por segundo).
        ir(destino, (v * 1000) / g.ancho);
    };

    const onPointerCancel = () => {
        const g = gestoRef.current;
        gestoRef.current = null;
        if (g?.intencion === "aceptada") ir(g.aperturaInicial > 0.5 ? "abierto" : "cerrado");
    };

    const completo = abiertoConGesto && cerrado;
    const Mano = entrada === "raton" ? MousePointer2 : Hand;

    return (
        <div className="space-y-2">
            {/* Recuadro de práctica: sus gestos son suyos (no pasan de paso ni mueven la página). */}
            <div
                ref={escenarioRef}
                data-sin-arrastre=""
                data-testid="practica-gestos"
                className="relative h-36 w-full touch-none select-none overflow-hidden rounded-2xl border border-white/10"
                style={{ background: `radial-gradient(120% 120% at 0% 50%, color-mix(in srgb, ${accent} 16%, transparent), transparent 60%), rgba(6,10,16,0.65)` }}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerCancel}
            >
                {/* «Página» de fondo; tocarla con el panel abierto es «tocar fuera». */}
                <motion.button
                    type="button"
                    tabIndex={-1}
                    aria-hidden="true"
                    className="absolute inset-0 cursor-default bg-black"
                    style={{ opacity: fondo, pointerEvents: abierto ? "auto" : "none" }}
                    onClick={cerrarPanel}
                />
                {/* Borde que invita a tirar (también es un botón: clic, toque o teclado). */}
                <button
                    type="button"
                    onClick={() => { setTocado(true); if (apertura.get() < 0.5) ir("abierto"); }}
                    aria-label="Abrir el panel de práctica"
                    className="absolute inset-y-3 left-0 z-10 w-3 cursor-grab rounded-r-full focus-visible:outline focus-visible:outline-2"
                    style={{ background: `linear-gradient(180deg, transparent, ${accent}, transparent)`, opacity: 0.8 }}
                />
                {/* Mini panel Horizon */}
                <motion.div
                    ref={panelRef}
                    aria-hidden={!abierto}
                    className="absolute inset-y-2 left-0 z-20 w-[58%] rounded-r-2xl border border-emerald-400/30 bg-emerald-950/85 p-3 shadow-[0_10px_30px_rgba(0,0,0,0.5)]"
                    style={{ x }}
                >
                    {/* pr-10: el texto no pasa por debajo de la X de la esquina. */}
                    <p className="pr-10 text-[11px] font-semibold uppercase tracking-widest text-emerald-200">Horizon</p>
                    <p className="mt-1 pr-10 text-[10.5px] leading-snug text-emerald-100/70">Tu panel de creación. Arrástralo a la izquierda para guardarlo.</p>
                    <BotonCerrar
                        etiqueta="Cerrar el panel de práctica"
                        acento="#10b981"
                        tamano="sm"
                        posicion="interior"
                        tabIndex={abierto ? 0 : -1}
                        onClick={cerrarPanel}
                    />
                </motion.div>
                {/* Mano o cursor fantasma: enseña el gesto hasta que la persona lo prueba. */}
                {!reduce && !tocado && (
                    <motion.span
                        aria-hidden="true"
                        className="pointer-events-none absolute left-2 top-1/2 z-30 text-white"
                        initial={{ x: 0, opacity: 0 }}
                        animate={{ x: [0, 0, 120, 120], opacity: [0, 1, 1, 0] }}
                        transition={{ duration: 2.4, repeat: Infinity, times: [0, 0.15, 0.7, 1], ease: "easeInOut" }}
                    >
                        <Mano className="h-5 w-5 drop-shadow-[0_0_6px_rgba(255,255,255,0.8)]" />
                    </motion.span>
                )}
            </div>

            <div className="text-[11.5px] leading-snug text-white/70">
                <p><span className="font-semibold text-white/85">Pruébalo:</span> {textos.abrir} {textos.cerrar}</p>
            </div>

            <div className="flex flex-wrap gap-1.5" aria-live="polite">
                <Logro hecho={abiertoConGesto} texto="Abierto desde el borde" />
                <Logro hecho={cerrado} texto="Cerrado" />
                {completo && <span className="text-[11px] font-semibold text-emerald-300">¡Perfecto! Así funciona en todo StarSeed.</span>}
            </div>

            <div className="flex flex-wrap gap-1.5">
                <Pista icono={<Mano className="h-3 w-3" />} texto={entrada === "raton" ? "Borde: pasar, clic o tirar" : "Desliza desde un borde"} />
                <Pista icono={<X className="h-3 w-3" />} texto="X en la esquina" />
                <Pista icono={<Keyboard className="h-3 w-3" />} texto="Esc cierra" />
                <Pista icono={<MonitorSmartphone className="h-3 w-3" />} texto="Se adapta solo" />
            </div>
        </div>
    );
}

/**
 * ResumenGestos — tarjeta breve para el asistente de alta de la cuenta: cómo se
 * abren y se cierran los menús EN ESTE dispositivo, antes de practicarlo en la guía.
 */
export function ResumenGestos() {
    const { entrada } = usePerfilDispositivo();
    const abrir = entrada === "raton"
        ? "Abre cada menú dejando el cursor un instante en su borde, con un clic en el borde o tirando de él."
        : entrada === "tactil"
            ? "Abre cada menú deslizando el dedo desde su borde hacia dentro: te sigue mientras lo mueves."
            : "Abre cada menú desde su borde: con el dedo deslizando, con el ratón dejando el cursor, con un clic o tirando.";
    return (
        <div className="rounded-xl border border-cyan-400/20 bg-cyan-950/10 p-3 text-[12px] leading-snug text-cyan-50/85" data-testid="resumen-gestos">
            <p className="mb-1.5 flex items-center gap-1.5 font-semibold text-cyan-100">
                <MonitorSmartphone className="h-4 w-4 text-cyan-300" /> Moverte por StarSeed
            </p>
            <ul className="space-y-1">
                <li>• {abrir}</li>
                <li>• Para cerrar: devuélvelo a su borde, toca fuera, pulsa la X de su esquina o la tecla Escape.</li>
                <li>• Todo se adapta solo a tu pantalla (móvil, tableta u ordenador) y a si usas el dedo, el ratón o los dos.</li>
            </ul>
            <p className="mt-1.5 text-cyan-200/60">En la guía que viene después podrás practicarlo.</p>
        </div>
    );
}

function Logro({ hecho, texto }: { hecho: boolean; texto: string }) {
    return (
        <span
            className={
                "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10.5px] transition-colors " +
                (hecho ? "border-emerald-400/50 bg-emerald-500/15 text-emerald-200" : "border-white/10 bg-white/[0.03] text-white/45")
            }
        >
            <Check className={"h-3 w-3 " + (hecho ? "opacity-100" : "opacity-30")} /> {texto}
        </span>
    );
}

function Pista({ icono, texto }: { icono: React.ReactNode; texto: string }) {
    return (
        <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.03] px-2 py-0.5 text-[10.5px] text-white/65">
            <span className="text-[#6FE6D6]">{icono}</span> {texto}
        </span>
    );
}

export default DemoGestosHibridos;
