"use client";
/**
 * Pestaña Director del Mando (3/3 · p318H) — Ajustes Director real: carga
 * GET /api/mando/director/config, valida en cliente con `validar` (mismos
 * límites que el servidor) y guarda con PUT. Nada hardcodeado.
 */
import { useEffect, useState } from "react";
import { Loader2, Plus, X } from "lucide-react";
import { DEFAULTS, validar, type ConfigDirector } from "@/lib/mando/director-config";
import {
    CAMPOS_NUMERICOS, agregarProveedor, entradaDeFormulario, quitarProveedor, textosDeConfig,
    type TextosNumericos,
} from "@/lib/mando/ajustes-director-campos";

interface RespuestaConfig { config: ConfigDirector; pausado: boolean }
const CAMPO = "rounded border border-border/30 bg-black/30 px-2 py-1 text-foreground/90";
const BOTON = "cursor-pointer rounded-full border px-3 py-1.5 font-black uppercase tracking-wider disabled:cursor-not-allowed disabled:opacity-50";
function horaActual(): string {
    const d = new Date();
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function AjustesDirector() {
    const [textos, setTextos] = useState<TextosNumericos>(() => textosDeConfig(DEFAULTS));
    const [escaladaActiva, setEscaladaActiva] = useState(DEFAULTS.escalada.activa);
    const [avisoCheckin, setAvisoCheckin] = useState(DEFAULTS.aviso_checkin);
    const [apartados, setApartados] = useState<string[]>(DEFAULTS.proveedores_apartados);
    const [nuevoProveedor, setNuevoProveedor] = useState(""); const [pausado, setPausado] = useState(false);
    const [cargando, setCargando] = useState(true); const [errorCarga, setErrorCarga] = useState<string | null>(null);
    const [guardando, setGuardando] = useState(false); const [guardadoEn, setGuardadoEn] = useState<string | null>(null);
    const [erroresEnvio, setErroresEnvio] = useState<string[]>([]); const [ocupadoVigilante, setOcupadoVigilante] = useState(false);
    useEffect(() => {
        (async () => {
            try {
                const r = await fetch("/api/mando/director/config", { cache: "no-store" });
                if (!r.ok) throw new Error(`HTTP ${r.status}`);
                const cuerpo = (await r.json()) as RespuestaConfig;
                setTextos(textosDeConfig(cuerpo.config)); setEscaladaActiva(cuerpo.config.escalada.activa);
                setAvisoCheckin(cuerpo.config.aviso_checkin); setApartados(cuerpo.config.proveedores_apartados); setPausado(cuerpo.pausado);
            } catch {
                setErrorCarga("no se pudo leer /api/mando/director/config");
            } finally { setCargando(false); }
        })();
    }, []);
    const resultado = validar(entradaDeFormulario(textos, escaladaActiva, avisoCheckin, apartados));
    const onGuardar = async () => {
        if (!resultado.ok) return;
        setGuardando(true); setErroresEnvio([]); setGuardadoEn(null);
        try {
            const r = await fetch("/api/mando/director/config", {
                method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(resultado.valor),
            });
            const cuerpo = (await r.json()) as { ok?: boolean; errores?: string[] };
            if (r.ok && cuerpo.ok) setGuardadoEn(horaActual());
            else setErroresEnvio(cuerpo.errores ?? ["No se pudo guardar la configuración."]);
        } catch {
            setErroresEnvio(["No se pudo hablar con el Mando."]);
        } finally { setGuardando(false); }
    };
    const onVigilante = async () => {
        setOcupadoVigilante(true);
        try {
            const r = await fetch("/api/mando/director/accion", {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ accion: pausado ? "reanudar_vigilante" : "pausar_vigilante" }),
            });
            const cuerpo = (await r.json()) as { ok?: boolean };
            if (cuerpo.ok) setPausado((p) => !p);
        } finally { setOcupadoVigilante(false); }
    };
    if (cargando) return <p className="p-3 text-sm text-muted-foreground/70">Cargando ajustes…</p>;
    const CASILLAS = [
        { id: "escalada-activa", etiqueta: "Escalada a Claude activa", valor: escaladaActiva, cambiar: setEscaladaActiva },
        { id: "aviso-checkin", etiqueta: "Avisar de check-in diario pendiente", valor: avisoCheckin, cambiar: setAvisoCheckin }];
    return (
        <div className="flex flex-col gap-3 p-3 text-xs" data-testid="ajustes-director">
            {errorCarga ? <p className="text-rose-400/80">{errorCarga}</p> : null}
            <div className="grid gap-3 sm:grid-cols-2">
                {CAMPOS_NUMERICOS.map((c) => (
                    <label key={c.clave} className="flex flex-col gap-1" htmlFor={`campo-${c.clave}`}>
                        <span className="font-semibold text-foreground/90">{c.etiqueta}</span>
                        <input id={`campo-${c.clave}`} type="number" value={textos[c.clave]} className={CAMPO}
                            onChange={(e) => setTextos((t) => ({ ...t, [c.clave]: e.target.value }))} />
                        <span className="text-[10px] text-muted-foreground/70">{c.ayuda}</span>
                    </label>
                ))}
            </div>
            {CASILLAS.map((c) => (
                <label key={c.id} className="flex cursor-pointer items-center gap-2" htmlFor={`campo-${c.id}`}>
                    <input id={`campo-${c.id}`} type="checkbox" checked={c.valor} onChange={(e) => c.cambiar(e.target.checked)} /> {c.etiqueta}
                </label>
            ))}
            <div className="flex flex-col gap-1.5">
                <span className="font-semibold text-foreground/90">Proveedores apartados</span>
                <div className="flex flex-wrap items-center gap-1.5">
                    {apartados.map((p) => (
                        <span key={p} className="inline-flex items-center gap-1 rounded-full border border-border/30 bg-black/30 px-2 py-0.5">
                            {p}
                            <button type="button" className="cursor-pointer" aria-label={`Quitar ${p}`} onClick={() => setApartados((a) => quitarProveedor(a, p))}><X className="size-3" aria-hidden /></button>
                        </span>
                    ))}
                    <input aria-label="Nuevo proveedor apartado" value={nuevoProveedor} placeholder="proveedor" className={`w-24 ${CAMPO}`}
                        onChange={(e) => setNuevoProveedor(e.target.value)} />
                    <button type="button" aria-label="Añadir proveedor" className="cursor-pointer rounded-full border border-border/30 px-2 py-0.5"
                        onClick={() => { setApartados((a) => agregarProveedor(a, nuevoProveedor)); setNuevoProveedor(""); }}><Plus className="size-3" aria-hidden /></button>
                </div>
            </div>
            {[...(!resultado.ok ? resultado.errores : []), ...erroresEnvio].map((e) => <p key={e} className="text-rose-400/80">{e}</p>)}
            {guardadoEn ? <p className="text-emerald-400/80">Guardado {guardadoEn}</p> : null}
            <div className="flex items-center gap-2">
                <button type="button" disabled={!resultado.ok || guardando} onClick={() => void onGuardar()} className={`${BOTON} border-emerald-400/30 bg-emerald-500/10 text-emerald-300`}>
                    {guardando ? <Loader2 className="mr-1 inline size-3 animate-spin" aria-hidden /> : null}Guardar
                </button>
                <button type="button" disabled={ocupadoVigilante} onClick={() => void onVigilante()} className={`${BOTON} border-amber-400/30 bg-amber-500/10 text-amber-300`}>
                    {pausado ? "Reanudar vigilante" : "Pausar vigilante"}
                </button>
            </div>
        </div>
    );
}
