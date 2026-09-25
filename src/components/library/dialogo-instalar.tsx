"use client";

/**
 * Diálogo «¿Dónde quieres instalar <App>?» — el botón Instalar de la Librería.
 *
 * (2026-09-25) Alex: «al presionar el botón de instalar se deben seleccionar los medios
 * de instalación, incluyendo solo en la web en servidores StarSeed OS, vincular y
 * sincronizar las descargas en el dispositivo desde donde se instale, y que aparezcan las
 * neuronas vinculadas con esa cuenta y los perfiles para seleccionar en qué medios instalar».
 *
 * Qué hace cada opción (la lógica vive en src/lib/instalaciones/plan.ts, probada aparte):
 *   · Web → Biblioteca de la cuenta; se abre desde cualquier navegador; no descarga nada.
 *   · Este dispositivo → descarga el instalador oficial del último release (si lo hay para
 *     este sistema) o añade la app a su Lanzador y usa la web.
 *   · Otras neuronas → pedido sincronizado por la cuenta; se acepta en ESE dispositivo.
 *   · Perfil → en qué biblioteca aparece (la de la cuenta o la de un perfil).
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Download, Globe, Loader2, MonitorSmartphone, UserRound } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { mejorInstalable } from "@/lib/apps-oficiales/apps-oficiales";
import { useUltimaVersion } from "@/lib/apps-oficiales/ultima-version";
import { esAppNativa, useDispositivoActual } from "@/lib/apps-oficiales/dispositivo-actual";
import { agregarCarpetaDispositivo, soportaCarpetasDispositivo } from "@/lib/storage/carpetas-vinculadas";
import { destinosDeApp, ETIQUETA_ESTADO, etiquetaDestino } from "@/lib/instalaciones/destinos";
import { guardarDestinos, useInstalaciones } from "@/lib/instalaciones/instalaciones-store";
import { planInstalacion, resumenSeleccion, type AppParaInstalar, type SeleccionInstalacion } from "@/lib/instalaciones/plan";
import { abrirWebParaInstalar, ejecutarAcciones } from "@/lib/instalaciones/ejecutar";

import { Casilla, SeccionEsteDispositivo, SeccionNeuronas } from "./dialogo-instalar-secciones";
import { useDatosInstalacion } from "./use-datos-instalacion";

export interface DialogoInstalarProps {
    app: AppParaInstalar | null;
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

export function DialogoInstalar({ app, open, onOpenChange }: DialogoInstalarProps) {
    return (
        <Dialog open={open && Boolean(app)} onOpenChange={onOpenChange}>
            {/* Se monta solo abierto: cada apertura empieza limpia y no pide nada a la cuenta antes de tiempo. */}
            {open && app && <ContenidoInstalar app={app} onCerrar={() => onOpenChange(false)} />}
        </Dialog>
    );
}

function ContenidoInstalar({ app, onCerrar }: { app: AppParaInstalar; onCerrar: () => void }) {
    const datos = useDatosInstalacion();
    const version = useUltimaVersion(app.oficialId ?? "");
    const dispositivo = useDispositivoActual();
    const lista = useInstalaciones();
    const [esNativa, setEsNativa] = useState(false);
    const [web, setWeb] = useState(true);
    const [este, setEste] = useState(false);
    const [otras, setOtras] = useState<string[]>([]);
    const [perfilSel, setPerfilSel] = useState<string | null>(null);
    const [carpetaSel, setCarpetaSel] = useState("");
    const [instalando, setInstalando] = useState(false);

    useEffect(() => setEsNativa(esAppNativa()), []);

    const instalable = app.oficialId ? mejorInstalable(version.instalables, dispositivo) : null;
    const yaEsta = useMemo(() => destinosDeApp(app.id, lista), [app.id, lista]);
    // Hasta que la persona elija, el perfil propuesto es el activo en este dispositivo.
    const perfilId = perfilSel ?? datos.perfilActivo ?? "";
    const perfil = datos.perfiles.find((p) => p.id === perfilId) ?? null;
    const carpeta = datos.carpetas.find((c) => c.id === carpetaSel) ?? null;

    const seleccion: SeleccionInstalacion = {
        web,
        esteDispositivo: este,
        otrasNeuronas: otras,
        perfil: perfil ? { id: perfil.id, nombre: perfil.name } : null,
        carpetaBiblioteca: carpeta?.nombre ?? null,
    };
    const neuronasBreves = useMemo(() => datos.otras.map((n) => ({ id: n.id, nombre: n.name })), [datos.otras]);
    const resumen = resumenSeleccion(seleccion, { estaNeurona: datos.estaNeurona, neuronas: neuronasBreves });
    const nada = !web && !este && otras.length === 0;
    // Sin la versión todavía no se sabe qué instalador toca: se espera en vez de instalar a medias.
    const esperandoVersion = este && Boolean(app.oficialId) && version.cargando;

    const cambiarNeurona = useCallback((id: string, marcada: boolean) => {
        setOtras((prev) => (marcada ? [...prev.filter((x) => x !== id), id] : prev.filter((x) => x !== id)));
    }, []);

    const vincularCarpeta = useCallback(async () => {
        const nueva = await agregarCarpetaDispositivo();
        if (nueva) setCarpetaSel(nueva.id);
    }, []);

    const instalar = () => {
        if (nada || instalando || esperandoVersion) return;
        setInstalando(true);
        try {
            const plan = planInstalacion(app, seleccion, {
                estaNeurona: datos.estaNeurona,
                neuronas: neuronasBreves,
                instalable,
                version: app.oficialId ? version.release?.tag : undefined,
                esNativa,
                existentes: lista,
            });
            // Primero lo que exige el clic de la persona (descarga), luego guardar y sincronizar.
            const res = ejecutarAcciones(app, plan.acciones);
            // Si la descarga no arrancó, este dispositivo queda como «no se pudo instalar», no como descargado.
            const destinos = res.errores.length
                ? plan.destinos.map((d) =>
                      d.tipo === "neurona" && d.neuronaId === datos.estaNeurona?.id && d.estado === "descargada" ? { ...d, estado: "fallida" as const } : d,
                  )
                : plan.destinos;
            if (destinos.length) guardarDestinos(destinos);
            const extra = res.descargaIniciada ? " La descarga va a tu carpeta de Descargas." : "";
            // El título dice lo que pasó de verdad: un pedido a otra neurona aún no es una instalación.
            const titulo =
                !web && !este ? `Pedido enviado: ${app.nombre}` : res.descargaIniciada ? `Descargando ${app.nombre}` : `${app.nombre} instalada`;
            if (res.errores.length) toast.error(`${app.nombre}: algo no salió`, { description: res.errores.join(" ") });
            else toast.success(titulo, { description: `${plan.resumen}.${extra}` });
            onCerrar();
        } finally {
            setInstalando(false);
        }
    };

    return (
        <DialogContent className="max-h-[90dvh] max-w-lg">
            <DialogHeader>
                <DialogTitle>¿Dónde quieres instalar {app.nombre}?</DialogTitle>
                <DialogDescription>
                    Elige uno o varios sitios. Puedes volver aquí para añadir más cuando quieras.
                    {app.oficialId && version.release && (
                        <span className="mt-1 block text-xs">
                            Última versión: {version.release.tag}
                            {version.origen === "respaldo" ? " (sin conexión con GitHub: última versión conocida)" : ""}
                        </span>
                    )}
                </DialogDescription>
            </DialogHeader>

            <div className="flex flex-col gap-4 py-1">
                {yaEsta.length > 0 && (
                    <div className="rounded-xl border border-white/10 bg-black/20 p-3 text-xs">
                        <p className="font-semibold text-white/85">Ya está en {yaEsta.length === 1 ? "1 sitio" : `${yaEsta.length} sitios`}:</p>
                        <ul className="mt-1 flex flex-col gap-0.5 text-muted-foreground">
                            {yaEsta.map((d) => (
                                <li key={d.id}>
                                    {etiquetaDestino(d, datos.estaNeurona?.id)} — {ETIQUETA_ESTADO[d.estado]}
                                </li>
                            ))}
                        </ul>
                    </div>
                )}

                <fieldset className="flex flex-col gap-2">
                    <legend className="mb-1 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-white/70">
                        <Globe className="h-3.5 w-3.5" aria-hidden /> En la web
                    </legend>
                    <Casilla
                        id="instalar-web"
                        marcada={web}
                        onCambio={setWeb}
                        titulo="En la web (servidores StarSeed)"
                        descripcion="Se abre desde cualquier navegador con tu cuenta; no descarga nada."
                    />
                </fieldset>

                <fieldset className="flex flex-col gap-2">
                    <legend className="mb-1 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-white/70">
                        <Download className="h-3.5 w-3.5" aria-hidden /> En este dispositivo
                    </legend>
                    <SeccionEsteDispositivo
                        app={app}
                        nombreDispositivo={datos.estaNeurona?.nombre ?? ""}
                        marcada={este}
                        onCambio={setEste}
                        instalable={instalable}
                        buscandoVersion={Boolean(app.oficialId) && version.cargando}
                        dispositivo={dispositivo}
                        esNativa={esNativa}
                        carpetas={datos.carpetas}
                        carpetaSel={carpetaSel}
                        onCarpeta={setCarpetaSel}
                        puedeVincularCarpeta={soportaCarpetasDispositivo()}
                        onVincularCarpeta={() => void vincularCarpeta()}
                        onInstalarDesdeWeb={() => app.web && abrirWebParaInstalar(app.web)}
                    />
                </fieldset>

                <fieldset className="flex flex-col gap-2">
                    <legend className="mb-1 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-white/70">
                        <MonitorSmartphone className="h-3.5 w-3.5" aria-hidden /> Otras neuronas de tu cuenta
                    </legend>
                    <SeccionNeuronas sesion={datos.sesion} cargando={datos.cargando} otras={datos.otras} seleccion={otras} onCambio={cambiarNeurona} />
                </fieldset>

                <div className="flex flex-col gap-1">
                    <label htmlFor="instalar-perfil" className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-white/70">
                        <UserRound className="h-3.5 w-3.5" aria-hidden /> Perfil
                    </label>
                    <select
                        id="instalar-perfil"
                        value={perfilId}
                        onChange={(e) => setPerfilSel(e.target.value)}
                        aria-describedby="instalar-perfil-desc"
                        className="h-9 w-full rounded-lg border border-white/15 bg-black/40 px-2 text-sm text-white"
                    >
                        <option value="">Biblioteca de la cuenta</option>
                        {datos.perfiles.map((p) => (
                            <option key={p.id} value={p.id}>
                                {p.name}
                            </option>
                        ))}
                    </select>
                    <p id="instalar-perfil-desc" className="text-xs text-muted-foreground">
                        En qué biblioteca aparecerá la app: la de toda la cuenta o la de uno de tus perfiles.
                    </p>
                </div>
            </div>

            <DialogFooter className="flex-col gap-2 sm:flex-col sm:space-x-0">
                <p aria-live="polite" className="text-sm text-white/85">
                    {resumen}
                </p>
                <div className="flex flex-wrap justify-end gap-2">
                    <Button type="button" variant="ghost" onClick={onCerrar} className="cursor-pointer">
                        Cancelar
                    </Button>
                    <Button
                        type="button"
                        onClick={instalar}
                        disabled={nada || instalando || esperandoVersion}
                        className="gap-2 bg-gradient-to-r from-emerald-500 to-teal-600 text-white hover:from-emerald-600 hover:to-teal-700 border-0 cursor-pointer"
                    >
                        {instalando ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Download className="h-4 w-4" aria-hidden />}
                        Instalar
                    </Button>
                </div>
            </DialogFooter>
        </DialogContent>
    );
}

export default DialogoInstalar;
