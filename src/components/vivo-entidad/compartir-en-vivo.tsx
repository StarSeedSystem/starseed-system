"use client";

import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
    Select,
    SelectTrigger,
    SelectValue,
    SelectContent,
    SelectItem,
    SelectGroup,
    SelectLabel,
} from "@/components/ui/select";
import { Copy, Check, Loader2, AlertCircle, Info } from "lucide-react";
import { toast } from "sonner";

export interface PaginaMia {
    id: string;
    titulo: string;
}

export type TipoSesionVivo = "pizarra" | "dashboard";

export type ConQuien = "mis-neuronas" | "entidad" | "enlace";

export type Acceso = "editar" | "mirar";

export interface CompartirEnVivoProps {
    abierta: boolean;
    alCerrar: () => void;
    titulo: string;
    tipo: TipoSesionVivo;
    paginasMias?: PaginaMia[];
    crear: (opciones: {
        con: ConQuien;
        acceso: Acceso;
        tipo: TipoSesionVivo;
        titulo: string;
        hiloId?: string | null;
        entidadRef?: string;
        invitados?: string[];
    }) => Promise<{ ok: true; enlace: string; personas: string[]; sesionId: string } | { ok: false; motivo: string }>;
}

export function CompartirEnVivo({
    abierta,
    alCerrar,
    titulo,
    tipo,
    paginasMias = [],
    crear,
}: CompartirEnVivoProps) {
    const [con, setCon] = useState<ConQuien>("mis-neuronas");
    const [acceso, setAcceso] = useState<Acceso>("editar");
    const [cargando, setCargando] = useState(false);
    const [resultado, setResultado] = useState<{ ok: true; enlace: string; personas: string[] } | { ok: false; motivo: string } | null>(null);
    const entidadSeleccionada = useRef<string | null>(null);
    const dialogRef = useRef<HTMLDivElement>(null);
    const primerFocoRef = useRef<HTMLButtonElement>(null);

    useEffect(() => {
        if (abierta && dialogRef.current) {
            dialogRef.current.focus();
            if (primerFocoRef.current) {
                primerFocoRef.current.focus();
            }
        }
        if (!abierta) {
            setCon("mis-neuronas");
            setAcceso("editar");
            setResultado(null);
            entidadSeleccionada.current = null;
        }
    }, [abierta]);

    const handleCerrar = () => {
        alCerrar();
    };

    const handleCompartir = async () => {
        setCargando(true);
        setResultado(null);
        try {
            const entidadRef = con === "entidad" ? entidadSeleccionada.current : undefined;
            const opciones = {
                con,
                acceso,
                tipo,
                titulo: titulo.trim().slice(0, 200) || "Sesión en vivo",
                hiloId: null as string | null,
                entidadRef: entidadRef ?? undefined,
                invitados: [] as string[],
            };
            const res = await crear(opciones);
            setResultado(res);
            if (res.ok === true) {
                toast.success(`Compartida. ${res.personas.length} ${res.personas.length === 1 ? "persona" : "personas"} dentro.`);
            } else {
                toast.error(res.motivo);
            }
        } catch (e) {
            const motivo = e instanceof Error ? e.message : "No se pudo compartir en vivo.";
            setResultado({ ok: false, motivo });
            toast.error(motivo);
        } finally {
            setCargando(false);
        }
    };

    const handleCopiarEnlace = async () => {
        if (!resultado?.ok || !resultado.enlace) return;
        try {
            await navigator.clipboard.writeText(resultado.enlace);
            toast.success("Enlace copiado al portapapeles");
        } catch {
            toast.message("No se pudo copiar automáticamente", {
                description: resultado.enlace,
            });
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === "Escape") {
            handleCerrar();
        }
    };

    const mostrarAvisoEnlacePublico = con === "enlace";

    return (
        <Dialog open={abierta} onOpenChange={handleCerrar}>
            <DialogContent
                ref={dialogRef}
                className="max-w-sm sm:max-w-md"
                onKeyDown={handleKeyDown}
            >
                <DialogHeader>
                    <DialogTitle>Compartir en vivo</DialogTitle>
                    <DialogDescription>
                        Elige con quién y cómo compartes tu {tipo === "pizarra" ? "pizarra" : "dashboard"}.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4" data-testid="contenido-compartir">
                    <div>
                        <label htmlFor="con-quien" className="block text-sm font-medium mb-2">
                            ¿Con quién?
                        </label>
                        <Select value={con} onValueChange={(v: string) => setCon(v as ConQuien)}>
                            <SelectTrigger id="con-quien" className="w-full min-h-[44px]" data-testid="select-con-quien">
                                <SelectValue placeholder="Elige…" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectGroup>
                                    <SelectLabel>Destinatarios</SelectLabel>
                                    <SelectItem value="mis-neuronas" data-testid="opcion-mis-neuronas">
                                        Mis neuronas
                                    </SelectItem>
                                    {paginasMias.length > 0 && (
                                        <>
                                            <SelectLabel>Mis páginas y grupos</SelectLabel>
                                            {paginasMias.map((p) => (
                                                <SelectItem
                                                    key={p.id}
                                                    value={p.id}
                                                    data-testid={`opcion-pagina-${p.id}`}
                                                    onSelect={() => {
                                                        setCon("entidad");
                                                        entidadSeleccionada.current = p.id;
                                                    }}
                                                >
                                                    {p.titulo}
                                                </SelectItem>
                                            ))}
                                        </>
                                    )}
                                    <SelectItem value="enlace" data-testid="opcion-enlace">
                                        Cualquiera con enlace
                                    </SelectItem>
                                </SelectGroup>
                            </SelectContent>
                        </Select>
                    </div>

                    <div>
                        <label htmlFor="acceso" className="block text-sm font-medium mb-2">
                            ¿Pueden editar o solo mirar?
                        </label>
                        <Select value={acceso} onValueChange={(v: string) => setAcceso(v as Acceso)}>
                            <SelectTrigger id="acceso" className="w-full min-h-[44px]" data-testid="select-acceso">
                                <SelectValue placeholder="Elige…" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectGroup>
                                    <SelectItem value="editar" data-testid="opcion-editar">
                                        Editar
                                    </SelectItem>
                                    <SelectItem value="mirar" data-testid="opcion-mirar">
                                        Mirar
                                    </SelectItem>
                                </SelectGroup>
                            </SelectContent>
                        </Select>
                    </div>

                    {mostrarAvisoEnlacePublico && (
                        <div
                            data-testid="aviso-enlace-publico"
                            className="flex items-start gap-2 p-3 text-sm text-amber-700 bg-amber-50 rounded-lg border border-amber-200"
                            role="alert"
                        >
                            <Info className="w-4 h-4 flex-shrink-0 mt-0.5" aria-hidden="true" />
                            <span>
                                Al elegir «Cualquiera con enlace», cualquiera que tenga el enlace
                                podrá ver tu {tipo === "pizarra" ? "pizarra" : "dashboard"} sin necesidad de cuenta.
                            </span>
                        </div>
                    )}

                    <div className="flex gap-2">
                        <Button
                            ref={primerFocoRef}
                            onClick={handleCompartir}
                            disabled={cargando || resultado?.ok === true}
                            className="flex-1 min-h-[44px]"
                            data-testid="boton-compartir"
                        >
                            {cargando ? (
                                <Loader2 className="w-4 h-4 mr-2 animate-spin" aria-hidden="true" />
                            ) : resultado?.ok === true ? (
                                <Check className="w-4 h-4 mr-2" aria-hidden="true" />
                            ) : (
                                <Copy className="w-4 h-4 mr-2" aria-hidden="true" />
                            )}
                            {cargando
                                ? "Compartiendo…"
                                : resultado?.ok === true
                                ? "Compartida"
                                : "Compartir"}
                        </Button>
                        {resultado?.ok === true && resultado.enlace && (
                            <Button
                                variant="outline"
                                size="icon"
                                onClick={handleCopiarEnlace}
                                className="min-h-[44px] min-w-[44px]"
                                data-testid="boton-copiar-enlace"
                                aria-label="Copiar enlace al portapapeles"
                            >
                                <Copy className="w-4 h-4" aria-hidden="true" />
                            </Button>
                        )}
                    </div>

                    {resultado?.ok === false && (
                        <div
                            data-testid="estado-error"
                            className="flex items-start gap-2 p-3 text-sm text-destructive bg-destructive/10 rounded-lg border border-destructive/20"
                            role="alert"
                        >
                            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" aria-hidden="true" />
                            <span>{resultado.motivo}</span>
                        </div>
                    )}

                    {resultado?.ok === true && (
                        <div
                            data-testid="estado-exito"
                            className="flex items-center gap-2 p-3 text-sm text-emerald-700 bg-emerald-50 rounded-lg border border-emerald-200"
                        >
                            <Check className="w-4 h-4 flex-shrink-0" aria-hidden="true" />
                            <span>
                                Compartida. {resultado.personas.length} {resultado.personas.length === 1 ? "persona" : "personas"} dentro.
                            </span>
                        </div>
                    )}

                    {resultado?.ok === true && resultado.enlace && (
                        <div data-testid="aviso-copiar" className="text-xs text-muted-foreground break-all" role="status" aria-live="polite">
                            Enlace: {resultado.enlace}
                        </div>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}