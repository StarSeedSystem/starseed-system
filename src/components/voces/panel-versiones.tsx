"use client";

/**
 * PANEL DE VERSIONES (Ola 240 · Tarea VZ6 · Estudio de Voces)
 * ─────────────────────────────────────────────────────────────────────────────
 * Pestaña «Versiones» del Estudio: lista las versiones de voz guardadas
 * (`starseed.voces.versiones.v1`) y permite crear una desde el timbre
 * seleccionado, duplicar, borrar, editar notas y valoración, y
 * exportar/importar el lote completo en JSON.
 *
 * Este componente NO persiste nada por su cuenta: todo cambio sube al padre
 * por los `on…`, que es quien guarda con `guardarVersiones`. La excepción es
 * la importación, que valida con `importarVersiones` (que ya guarda) y luego
 * avisa al padre con la lista resultante.
 */

import { useRef, useState } from "react";
import { Copy, Download, FilePlus2, Star, Trash2, Upload } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";

import type { Timbre } from "@/lib/aurora/timbres";
import { versionDesdeTimbre, type VersionVoz } from "@/lib/voces/versiones";
import { exportarVersiones, importarVersiones } from "@/lib/voces/versiones";

interface Aviso {
    tipo: "ok" | "error";
    texto: string;
}

interface Props {
    /** Versiones actuales (estado del padre). */
    versiones: VersionVoz[];
    /** Timbre seleccionado en la lista del Estudio, o null si no hay. */
    timbre: Timbre | null;
    /** Sustituye la lista completa de versiones (el padre la guarda). */
    onGuardar: (lista: VersionVoz[], aviso: Aviso | null) => void;
}

/** Estrellas 1–5 para valorar una versión. */
function Estrellas({ valor, onElegir }: { valor: number | null; onElegir: (v: number) => void }) {
    return (
        <div className="flex items-center gap-0.5" role="radiogroup" aria-label="Valoración de la versión">
            {[1, 2, 3, 4, 5].map((n) => (
                <button
                    key={n}
                    type="button"
                    onClick={() => onElegir(n)}
                    aria-checked={(valor ?? 0) >= n}
                    role="radio"
                    className="cursor-pointer p-0.5 text-muted-foreground transition-colors duration-150 hover:text-amber-400"
                    title={`Valorar con ${n} estrella${n === 1 ? "" : "s"}`}
                >
                    <Star
                        className={`h-4 w-4 ${(valor ?? 0) >= n ? "fill-amber-400 text-amber-400" : ""}`}
                        aria-hidden
                    />
                </button>
            ))}
        </div>
    );
}

export function PanelVersiones({ versiones, timbre, onGuardar }: Props) {
    const entradaArchivo = useRef<HTMLInputElement | null>(null);
    const [avisoLocal, setAvisoLocal] = useState<Aviso | null>(null);

    const crear = () => {
        if (!timbre) {
            setAvisoLocal({ tipo: "error", texto: "Elige una voz en la lista de la izquierda para crear su versión." });
            return;
        }
        const nueva = versionDesdeTimbre(timbre);
        onGuardar([...versiones, nueva], { tipo: "ok", texto: `Versión «${nueva.nombre}» creada desde «${timbre.nombre}».` });
        setAvisoLocal(null);
    };

    const duplicar = (id: string) => {
        const original = versiones.find((v) => v.id === id);
        if (!original) return;
        const copia: VersionVoz = {
            ...original,
            id: `ver-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
            nombre: `${original.nombre} (copia)`,
            params: { ...original.params, expr: { ...original.params.expr } },
            padres: [original.id],
            creadaEn: new Date().toISOString(),
            modificadaEn: new Date().toISOString(),
            promovidaA: [],
        };
        onGuardar([...versiones, copia], { tipo: "ok", texto: `Duplicada como «${copia.nombre}».` });
    };

    const borrar = (id: string) => {
        const v = versiones.find((x) => x.id === id);
        onGuardar(versiones.filter((x) => x.id !== id), { tipo: "ok", texto: `Versión «${v?.nombre ?? id}» borrada.` });
    };

    const parchear = (id: string, parche: Partial<VersionVoz>) => {
        const lista = versiones.map((v) =>
            v.id === id ? { ...v, ...parche, modificadaEn: new Date().toISOString() } : v,
        );
        onGuardar(lista, null);
    };

    const exportar = () => {
        try {
            const blob = new Blob([exportarVersiones()], { type: "application/json" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = "starseed-versiones-voz.json";
            a.click();
            URL.revokeObjectURL(url);
            setAvisoLocal({ tipo: "ok", texto: "Versiones exportadas en JSON." });
        } catch {
            setAvisoLocal({ tipo: "error", texto: "No se pudo exportar el lote de versiones." });
        }
    };

    const importar = (archivo: File | null) => {
        if (!archivo) return;
        const lector = new FileReader();
        lector.onload = () => {
            const r = importarVersiones(String(lector.result ?? ""));
            if (r.ok) {
                onGuardar(r.versiones, { tipo: "ok", texto: `Importadas ${r.versiones.length} versiones.` });
                setAvisoLocal(null);
            } else {
                setAvisoLocal({ tipo: "error", texto: r.errores[0] ?? "No se pudo importar el archivo." });
            }
        };
        lector.onerror = () => setAvisoLocal({ tipo: "error", texto: "No se pudo leer el archivo." });
        lector.readAsText(archivo);
    };

    return (
        <div className="space-y-4">
            <Card>
                <CardHeader>
                    <CardTitle className="text-base">Versiones de voz</CardTitle>
                    <CardDescription>
                        Recetas congeladas y listas para probar, comparar, fusionar y promover.
                    </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-wrap gap-2">
                    <Button type="button" onClick={crear} className="cursor-pointer">
                        <FilePlus2 className="mr-1.5 h-4 w-4" /> Crear desde el timbre seleccionado
                    </Button>
                    <Button type="button" variant="outline" onClick={exportar} className="cursor-pointer">
                        <Download className="mr-1.5 h-4 w-4" /> Exportar JSON
                    </Button>
                    <Button
                        type="button"
                        variant="outline"
                        onClick={() => entradaArchivo.current?.click()}
                        className="cursor-pointer"
                    >
                        <Upload className="mr-1.5 h-4 w-4" /> Importar JSON
                    </Button>
                    <input
                        ref={entradaArchivo}
                        type="file"
                        accept="application/json"
                        className="hidden"
                        aria-label="Importar versiones de voz en JSON"
                        onChange={(e) => {
                            importar(e.target.files?.[0] ?? null);
                            e.target.value = "";
                        }}
                    />
                </CardContent>
            </Card>

            {avisoLocal && (
                <p role="status" className={`text-sm ${avisoLocal.tipo === "ok" ? "text-emerald-500" : "text-destructive"}`}>
                    {avisoLocal.texto}
                </p>
            )}

            {versiones.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                    Aún no hay versiones. Elige una voz a la izquierda y pulsa «Crear desde el timbre seleccionado».
                </p>
            ) : (
                <ul className="space-y-3" aria-label="Lista de versiones de voz">
                    {versiones.map((v) => (
                        <li key={v.id}>
                            <Card>
                                <CardHeader className="pb-2">
                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                        <CardTitle className="text-sm">{v.nombre}</CardTitle>
                                        <span className="flex flex-wrap items-center gap-1.5">
                                            <Badge variant="secondary">{v.motor}</Badge>
                                            <Badge variant="outline">{v.tamano === "auto" ? "Automático" : v.tamano}</Badge>
                                            <Badge variant="outline">de {v.timbreBase}</Badge>
                                            {v.promovidaA.length > 0 && (
                                                <Badge>Promovida ×{v.promovidaA.length}</Badge>
                                            )}
                                        </span>
                                    </div>
                                    <CardDescription>
                                        voz {v.params.voz} · velocidad {v.params.speed.toFixed(2)}
                                    </CardDescription>
                                </CardHeader>
                                <CardContent className="space-y-3">
                                    <Textarea
                                        rows={2}
                                        value={v.notas}
                                        placeholder="Notas de esta versión…"
                                        aria-label={`Notas de ${v.nombre}`}
                                        onChange={(e) => parchear(v.id, { notas: e.target.value })}
                                    />
                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                        <Estrellas
                                            valor={v.valoracion}
                                            onElegir={(n) => parchear(v.id, { valoracion: n })}
                                        />
                                        <span className="flex gap-2">
                                            <Button
                                                type="button"
                                                variant="outline"
                                                size="sm"
                                                onClick={() => duplicar(v.id)}
                                                className="cursor-pointer"
                                            >
                                                <Copy className="mr-1.5 h-4 w-4" /> Duplicar
                                            </Button>
                                            <Button
                                                type="button"
                                                variant="outline"
                                                size="sm"
                                                onClick={() => borrar(v.id)}
                                                className="cursor-pointer"
                                            >
                                                <Trash2 className="mr-1.5 h-4 w-4" /> Borrar
                                            </Button>
                                        </span>
                                    </div>
                                </CardContent>
                            </Card>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
