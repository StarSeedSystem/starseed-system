"use client";

/**
 * FUSIÓN Y LINAJE DE VOCES (Tarea VZ4 · Ola 240 · Estudio de Voces)
 * ─────────────────────────────────────────────────────────────────────────────
 * Mezcla dos versiones de voz (`src/lib/voces/versiones.ts`) con un control de
 * peso continuo entre ellas y permite ver, en vivo, de dónde sale cada una.
 *
 *  · Arriba, la FUSIÓN: selector A, selector B y un deslizador de peso 0–1 que
 *    interpola speed y expresividad, concatena las instrucciones y elige voz,
 *    motor, tamaño y timbre base del lado de mayor peso, tal como lo resuelve
 *    `fusionarVersiones`. Una vista previa muestra los parámetros resultantes
 *    sin necesidad de crear nada.
 *  · Debajo, el LINAJE: para la versión A y para la B por separado, se recorre
 *    la cadena de padres (hasta tres generaciones) como una lista indentada;
 *    cada nodo muestra su valoración si la tiene, y los que ya no tienen padres
 *    desembocan en su timbre de origen en el catálogo.
 *
 * Este componente NO persiste nada: la creación se delega en `onCrear`, que es
 * quien decide guardar la versión hija resultante.
 */

import { useMemo, useState } from "react";
import { Dna, GitMerge, Star } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Separator } from "@/components/ui/separator";

import { buscarTimbre } from "@/lib/aurora/timbres";
import { fusionarVersiones, type VersionVoz } from "@/lib/voces/versiones";

/** Profundidad máxima de ancestros que se recorren en el linaje. */
const PROFUNDIDAD_LINAJE = 3;

/** Nodo ya resuelto de un linaje, listo para pintarse con su sangría. */
interface FilaLinaje {
    nivel: number;
    nombre: string;
    valoracion: number | null;
    detalle: string;
}

/** Etiqueta humana del tamaño de modelo OmniVoice. */
function etiquetaTamano(t: VersionVoz["tamano"]): string {
    return t === "auto" ? "Automático" : t;
}

/** Etiqueta humana del motor (nivel). */
function etiquetaMotor(m: VersionVoz["motor"]): string {
    switch (m) {
        case "estudio":
            return "Estudio";
        case "alta":
            return "Alta";
        case "ligera":
            return "Ligera";
        default:
            return "Mínima";
    }
}

/**
 * Recorre el árbol genealógico de una versión a partir de sus `padres`, hasta
 * `PROFUNDIDAD_LINAJE` generaciones, y lo aplana en filas indentadas. Cuando un
 * nodo ya no tiene padres, se cierra la rama con su timbre de origen en el
 * catálogo (de ahí «viene» realmente la voz).
 */
function filasLinaje(semillaId: string, porId: Map<string, VersionVoz>): FilaLinaje[] {
    const filas: FilaLinaje[] = [];
    const visitados = new Set<string>();

    const visitar = (id: string, nivel: number): void => {
        if (nivel > PROFUNDIDAD_LINAJE) return;
        if (!id || visitados.has(id)) return;
        visitados.add(id);

        const v = porId.get(id);
        const delCatalogo = buscarTimbre(id);
        const nombre = v?.nombre ?? delCatalogo?.nombre ?? id;
        const valoracion: number | null = v?.valoracion ?? null;
        const detalle = valoracion != null ? `valoración ${valoracion.toFixed(1)} / 5` : "";
        filas.push({ nivel, nombre, valoracion, detalle });

        const padres = v?.padres ?? [];
        if (padres.length === 0) {
            // Rama raíz: la voz desciende de un timbre del catálogo.
            if (v) {
                const origen = buscarTimbre(v.timbreBase);
                filas.push({
                    nivel: nivel + 1,
                    nombre: origen ? `${origen.nombre}` : v.timbreBase || "catálogo",
                    valoracion: null,
                    detalle: "origen del catálogo",
                });
            }
            return;
        }
        for (const padre of padres) visitar(padre, nivel + 1);
    };

    visitar(semillaId, 0);
    return filas;
}

interface Props {
    versiones: VersionVoz[];
    onCrear: (v: VersionVoz) => void;
}

export function FusionVoz({ versiones, onCrear }: Props) {
    const [idA, setIdA] = useState<string>(versiones[0]?.id ?? "");
    const [idB, setIdB] = useState<string>(versiones[1]?.id ?? "");
    const [peso, setPeso] = useState<number>(0.5);
    const [nombre, setNombre] = useState<string>("");
    const [aviso, setAviso] = useState<{ tipo: "ok" | "error"; texto: string } | null>(null);

    const porId = useMemo(() => new Map(versiones.map((v) => [v.id, v])), [versiones]);

    const a = porId.get(idA) ?? null;
    const b = porId.get(idB) ?? null;

    /** Vista previa viva: la hija que saldría con el peso actual. */
    const previa = useMemo(() => {
        if (!a || !b) return null;
        return fusionarVersiones(a, b, peso);
    }, [a, b, peso]);

    const linajeA = useMemo(() => (a ? filasLinaje(a.id, porId) : []), [a, porId]);
    const linajeB = useMemo(() => (b ? filasLinaje(b.id, porId) : []), [b, porId]);

    const elegirA = (id: string) => {
        setIdA(id);
        setAviso(null);
    };

    const elegirB = (id: string) => {
        setIdB(id);
        setAviso(null);
    };

    const crear = () => {
        if (!a || !b) {
            setAviso({ tipo: "error", texto: "Elige las dos versiones para fusionar." });
            return;
        }
        if (a.id === b.id) {
            setAviso({ tipo: "error", texto: "Las dos versiones deben ser distintas." });
            return;
        }
        const hija = fusionarVersiones(a, b, peso, nombre.trim() || undefined);
        setAviso(null);
        onCrear(hija);
    };

    const opciones = (activo: string | null, excluirId: string | null) =>
        versiones.map((v) => {
            // En cada selector se deshabilita la versión que ya ocupa el otro
            // hueco, para no fusionar una voz consigo misma.
            const bloqueada = v.id !== activo && v.id === excluirId;
            return (
                <SelectItem key={v.id} value={v.id} disabled={bloqueada} className="cursor-pointer">
                    {v.nombre}
                </SelectItem>
            );
        });

    return (
        <div className="space-y-6">
            {/* ── Fusión ────────────────────────────────────────────────────── */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                        <GitMerge className="h-4 w-4" aria-hidden />
                        Fusión de versiones
                    </CardTitle>
                    <CardDescription>
                        Mezcla dos voces con un peso entre ellas y mira el resultado antes de crearlo.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-5">
                    <div className="grid gap-4 sm:grid-cols-2">
                        <div className="space-y-1.5">
                            <Label htmlFor="fusion-a">Versión A</Label>
                            <Select value={idA} onValueChange={elegirA}>
                                <SelectTrigger id="fusion-a" className="cursor-pointer">
                                    <SelectValue placeholder="Elige la versión A" />
                                </SelectTrigger>
                                <SelectContent>{opciones(a?.id ?? null, b?.id ?? null)}</SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="fusion-b">Versión B</Label>
                            <Select value={idB} onValueChange={elegirB}>
                                <SelectTrigger id="fusion-b" className="cursor-pointer">
                                    <SelectValue placeholder="Elige la versión B" />
                                </SelectTrigger>
                                <SelectContent>{opciones(b?.id ?? null, a?.id ?? null)}</SelectContent>
                            </Select>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <div className="flex items-center justify-between">
                            <Label htmlFor="fusion-peso">Peso</Label>
                            <span className="text-xs tabular-nums text-muted-foreground">
                                A {Math.round(peso * 100)} % · B {Math.round((1 - peso) * 100)} %
                            </span>
                        </div>
                        <Slider
                            id="fusion-peso"
                            aria-label="Peso de la fusión"
                            value={[peso]}
                            min={0}
                            max={1}
                            step={0.01}
                            onValueChange={(v) => setPeso(v[0] ?? 0.5)}
                            className="cursor-pointer"
                        />
                        <div className="flex justify-between text-xs text-muted-foreground">
                            <span>{a?.nombre ?? "—"}</span>
                            <span>{b?.nombre ?? "—"}</span>
                        </div>
                    </div>

                    <div className="space-y-1.5">
                        <Label htmlFor="fusion-nombre">Nombre de la versión hija</Label>
                        <Input
                            id="fusion-nombre"
                            value={nombre}
                            onChange={(e) => setNombre(e.target.value)}
                            placeholder={a && b ? `${a.nombre} × ${b.nombre}` : "Nombre de la fusión"}
                        />
                    </div>

                    {/* Vista previa en vivo de los parámetros resultantes */}
                    {previa ? (
                        <div className="rounded-lg border border-border/50 bg-muted/30 p-3">
                            <p className="mb-2 text-xs font-medium text-muted-foreground">
                                Resultado en vivo
                            </p>
                            <div className="flex flex-wrap items-center gap-2">
                                <Badge variant="secondary">voz {previa.params.voz}</Badge>
                                <Badge variant="outline">velocidad {previa.params.speed.toFixed(2)}</Badge>
                                <Badge variant="outline">{etiquetaMotor(previa.motor)}</Badge>
                                <Badge variant="outline">{etiquetaTamano(previa.tamano)}</Badge>
                            </div>
                            <dl className="mt-3 space-y-1 text-sm">
                                <div className="flex gap-2">
                                    <dt className="shrink-0 text-muted-foreground">Expresividad</dt>
                                    <dd className="tabular-nums">
                                        arco {previa.params.expr.arco.toFixed(2)} · vivacidad{" "}
                                        {previa.params.expr.vivacidad.toFixed(2)} · calidez{" "}
                                        {previa.params.expr.calidez.toFixed(2)}
                                    </dd>
                                </div>
                                <div className="flex gap-2">
                                    <dt className="shrink-0 text-muted-foreground">Instrucción</dt>
                                    <dd className="break-words">
                                        {previa.params.instruct.trim() || "Sin instrucción de estilo"}
                                    </dd>
                                </div>
                            </dl>
                        </div>
                    ) : (
                        <p className="text-sm text-muted-foreground">
                            Elige dos versiones para ver el resultado de la fusión.
                        </p>
                    )}

                    {aviso && (
                        <p
                            role="status"
                            className={`text-sm ${aviso.tipo === "ok" ? "text-emerald-500" : "text-destructive"}`}
                        >
                            {aviso.texto}
                        </p>
                    )}

                    <Button
                        type="button"
                        onClick={crear}
                        disabled={!a || !b || a.id === b.id}
                        className="cursor-pointer"
                    >
                        <Dna className="mr-1.5 h-4 w-4" />
                        Crear versión fusionada
                    </Button>
                </CardContent>
            </Card>

            {/* ── Linaje ───────────────────────────────────────────────────── */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                        <Star className="h-4 w-4" aria-hidden />
                        Linaje
                    </CardTitle>
                    <CardDescription>
                        De dónde viene cada voz: padres y abuelos hasta tres generaciones, con su
                        valoración cuando la tienen.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="grid gap-6 sm:grid-cols-2">
                        <BloqueLinaje titulo={a?.nombre ?? "Versión A"} filas={linajeA} />
                        <BloqueLinaje titulo={b?.nombre ?? "Versión B"} filas={linajeB} />
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}

/** Lista indentada de un único linaje; cada fila lleva su valoración si la tiene. */
function BloqueLinaje({ titulo, filas }: { titulo: string; filas: FilaLinaje[] }) {
    return (
        <div className="space-y-1.5">
            <p className="text-sm font-medium">{titulo}</p>
            {filas.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sin linaje todavía.</p>
            ) : (
                <ul className="space-y-0.5 text-sm" aria-label={`Linaje de ${titulo}`}>
                    {filas.map((f, i) => (
                        <li
                            key={`${f.nivel}-${f.nombre}-${i}`}
                            style={{ paddingLeft: `${f.nivel * 16}px` }}
                            className="flex items-center gap-2 py-0.5"
                        >
                            <span className="text-muted-foreground" aria-hidden>
                                {f.nivel > 0 ? "↳" : "●"}
                            </span>
                            <span className="truncate">{f.nombre}</span>
                            {f.valoracion != null && (
                                <Badge variant="outline" className="ml-auto shrink-0">
                                    <Star className="mr-1 h-3 w-3" aria-hidden />
                                    {f.valoracion.toFixed(1)}
                                </Badge>
                            )}
                            {f.valoracion == null && f.detalle && (
                                <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                                    {f.detalle}
                                </span>
                            )}
                        </li>
                    ))}
                </ul>
            )}
            <Separator className="mt-2 sm:!hidden" />
        </div>
    );
}