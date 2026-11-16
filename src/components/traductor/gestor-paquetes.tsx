"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogAction, AlertDialogCancel } from "@/components/ui/alert-dialog";
import { Download, Trash2, X, AlertCircle, Info, WifiOff, HardDrive } from "lucide-react";
import type { PaqueteModelo } from "@/lib/traductor/modelos-locales";
import type { EntradaPaquete } from "@/lib/traductor/indice-paquetes";
import {
    type GestorPaquetesProps,
    formatearBytes,
    calcularProgreso,
    leerEntradas,
    escribirEntradas,
    calcularEspacioUsado,
    ordenarPares,
    construirUrlDescarga,
    crearEntradaNueva,
} from "@/lib/traductor/gestor-paquetes-logica";

type ParConEstado = { modelo: PaqueteModelo; instalado: boolean; entrada?: EntradaPaquete };

function FilaPar({ par, descargando, onDescargar, onQuitar, onCancelar }: { par: ParConEstado; descargando: { id: string; progreso: number } | null; onDescargar: (m: PaqueteModelo) => void; onQuitar: (id: string) => void; onCancelar: () => void }) {
    const { modelo, instalado, entrada } = par;
    const enProgreso = descargando?.id === modelo.repo;
    return (
        <tr key={modelo.repo} className="border-b last:border-0 hover:bg-muted/30">
            <td className="px-4 py-3">
                <div className="flex items-center gap-2">
                    <span className="font-mono text-sm">{modelo.origen} → {modelo.destino}</span>
                    {!modelo.verificado && <Badge variant="outline" className="text-xs h-5 px-2"><AlertCircle className="h-3 w-3 mr-1" aria-hidden="true" />Sin verificar</Badge>}
                </div>
            </td>
            <td className="px-4 py-3 text-sm text-muted-foreground font-mono">{formatearBytes(modelo.bytes)}</td>
            <td className="px-4 py-3">
                {instalado ? <Badge variant="secondary" className="gap-1"><HardDrive className="h-3 w-3" aria-hidden="true" />Instalado</Badge> : enProgreso ? (
                    <div className="flex items-center gap-2 w-48"><Progress value={descargando.progreso} className="h-2 flex-1" /><span className="text-xs text-muted-foreground font-mono">{descargando.progreso}%</span></div>
                ) : <Badge variant="outline" className="gap-1"><Download className="h-3 w-3" aria-hidden="true" />Disponible</Badge>}
            </td>
            <td className="px-4 py-3 text-right">
                {instalado ? <Button variant="ghost" size="sm" onClick={() => onQuitar(entrada!.id)} className="text-destructive hover:bg-destructive/10" aria-label={`Quitar ${modelo.origen}-${modelo.destino}`}><Trash2 className="h-4 w-4" aria-hidden="true" /></Button> : enProgreso ? (
                    <Button variant="ghost" size="sm" onClick={onCancelar} className="text-muted-foreground" aria-label="Cancelar"><X className="h-4 w-4" aria-hidden="true" /></Button>
                ) : <Button variant="outline" size="sm" onClick={() => onDescargar(modelo)} disabled={!!descargando} aria-label={`Descargar ${modelo.origen}-${modelo.destino}`}><Download className="h-4 w-4 mr-1" aria-hidden="true" />Descargar</Button>}
            </td>
        </tr>
    );
}

function Aviso({ children }: { children: React.ReactNode }) {
    return <div className="flex items-center gap-2 text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 rounded-lg p-3">{children}</div>;
}

export function GestorPaquetes({
    modelos,
    almacen,
    descargador,
    reloj,
    topeBytes,
    esPersistente,
    conexionMedida,
    onCambio,
}: GestorPaquetesProps) {
    const [pares, setPares] = React.useState<ParConEstado[]>([]);
    const [descargando, setDescargando] = React.useState<{ id: string; modelo: PaqueteModelo; progreso: number; abortar: AbortController } | null>(null);
    const [confirmarQuitar, setConfirmarQuitar] = React.useState<string | null>(null);
    const [confirmarSinVerificar, setConfirmarSinVerificar] = React.useState<PaqueteModelo | null>(null);

    React.useEffect(() => {
        const cargar = () => setPares(modelos.map((m) => ({ modelo: m, instalado: false, entrada: leerEntradas(almacen).find((e) => e.par === `${m.origen}-${m.destino}`) })));
        cargar();
        const h = () => cargar();
        window.addEventListener("starseed:traductor-paquetes", h);
        return () => window.removeEventListener("starseed:traductor-paquetes", h);
    }, [modelos, almacen]);

    const espacioUsado = calcularEspacioUsado(pares);
    const paresOrdenados = ordenarPares(pares);

    const descargar = async (modelo: PaqueteModelo) => {
        if (!modelo.verificado) return setConfirmarSinVerificar(modelo);
        const abortar = new AbortController();
        setDescargando({ id: modelo.repo, modelo, progreso: 0, abortar });
        try {
            const r = await descargador.descargar(construirUrlDescarga(modelo), (b, t) => setDescargando((d) => d ? { ...d, progreso: calcularProgreso(b, t) } : null), abortar.signal);
            const e = crearEntradaNueva(modelo, r.bytes, r.hash, reloj);
            escribirEntradas(almacen, [...leerEntradas(almacen).filter((x) => x.id !== e.id), e]);
            window.dispatchEvent(new Event("starseed:traductor-paquetes"));
            onCambio?.();
        } catch (e) { if (!(e instanceof DOMException && e.name === "AbortError")) throw e; }
        finally { setDescargando(null); }
    };

    const cancelar = () => { descargando?.abortar.abort(); setDescargando(null); };
    const quitar = (id: string) => { escribirEntradas(almacen, leerEntradas(almacen).filter((e) => e.id !== id)); window.dispatchEvent(new Event("starseed:traductor-paquetes")); onCambio?.(); setConfirmarQuitar(null); };
    const confirmarSinVerif = (m: PaqueteModelo) => { setConfirmarSinVerificar(null); descargar(m); };

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between gap-4"><h2 className="text-lg font-semibold">Paquetes de traducción</h2><div className="flex items-center gap-2 text-sm text-muted-foreground">Usado {formatearBytes(espacioUsado)} de {formatearBytes(topeBytes)}</div></div>
            {!esPersistente && <Aviso><Info className="h-4 w-4 shrink-0" aria-hidden="true" />Se perderá al cerrar</Aviso>}
            {conexionMedida && <Aviso><WifiOff className="h-4 w-4 shrink-0" aria-hidden="true" />Aviso de conexión medida: las descargas consumen datos</Aviso>}
            <div className="rounded-lg border overflow-hidden"><table className="w-full"><thead><tr className="border-b bg-muted/50"><th className="h-10 px-4 text-left text-sm font-medium text-muted-foreground">Par</th><th className="h-10 px-4 text-left text-sm font-medium text-muted-foreground">Tamaño</th><th className="h-10 px-4 text-left text-sm font-medium text-muted-foreground">Estado</th><th className="h-10 px-4 text-right text-sm font-medium text-muted-foreground">Acción</th></tr></thead><tbody>{paresOrdenados.map((p) => <FilaPar key={p.modelo.repo} par={p} descargando={descargando} onDescargar={descargar} onQuitar={setConfirmarQuitar} onCancelar={cancelar} />)}</tbody></table></div>
            <AlertDialog open={!!confirmarQuitar} onOpenChange={(o) => !o && setConfirmarQuitar(null)}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>¿Quitar paquete?</AlertDialogTitle><AlertDialogDescription>Se eliminará el modelo descargado y dejará de funcionar sin conexión. Esta acción no se puede deshacer.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction variant="destructive" onClick={() => confirmarQuitar && quitar(confirmarQuitar)}>Quitar</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
            <AlertDialog open={!!confirmarSinVerificar} onOpenChange={(o) => !o && setConfirmarSinVerificar(null)}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Paquete sin verificar</AlertDialogTitle><AlertDialogDescription>El modelo <strong>{confirmarSinVerificar?.origen} → {confirmarSinVerificar?.destino}</strong> no ha sido verificado. Puede contener errores o no funcionar correctamente. ¿Desea continuar con la descarga?</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction onClick={() => confirmarSinVerificar && confirmarSinVerif(confirmarSinVerificar)}>Descargar anyway</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
        </div>
    );
}