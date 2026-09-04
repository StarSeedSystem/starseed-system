"use client";

/**
 * VINCULAR VOZ (Tarea VZ5 · Ola 240 · estudio de voces)
 * ─────────────────────────────────────────────────────────────────────────────
 * Decide qué VERSIÓN de voz habla por cada personalidad (timbre) y en dos
 * superficies especiales: el «Rito de bienvenida» y la «Ventana de
 * configuración inicial». Cada fila tiene su selector de versión, un botón
 * «Escuchar» para probarla y un botón «Promover» que materializa el vínculo.
 *
 * Al promover se deja un aviso claro de QUÉ acaba de cambiar en el sistema.
 */

import { useMemo, useState } from "react";
import { Link2, Play, Volume2 } from "lucide-react";

import { TIMBRES } from "@/lib/aurora/timbres";
import { hablarStarSeed } from "@/lib/aurora/voz-starseed/motor";
import type { VersionVoz } from "@/lib/voces/versiones";
import { aplicarVersionATimbre } from "@/lib/voces/versiones";
import { cargarVinculos, promoverVersion, type Vinculos } from "@/lib/voces/vinculos";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";

const FRASE_MUESTRA = "Hola, soy la voz vinculada a esta superficie.";

/** Filas especiales que no son personalidades: rito y configuración. */
interface FilaEspecial {
    clave: "rito" | "configuracion";
    titulo: string;
    desc: string;
}

const FILAS_ESPECIALES: FilaEspecial[] = [
    {
        clave: "rito",
        titulo: "Rito de bienvenida",
        desc: "La voz que narra la guía de primera ejecución con Astraura.",
    },
    {
        clave: "configuracion",
        titulo: "Ventana de configuración inicial",
        desc: "La voz que acompaña la primera configuración de la neurona.",
    },
];

interface Aviso {
    tipo: "ok" | "error";
    texto: string;
}

/** Etiqueta legible para el destino de un aviso de promoción. */
function etiquetaDestino(destino: string): string {
    if (destino === "rito") return "el rito de bienvenida";
    if (destino === "configuracion") return "la ventana de configuración inicial";
    return "esta personalidad";
}

export function VincularVoz({ versiones }: { versiones: VersionVoz[] }) {
    const [vinculos, setVinculos] = useState<Vinculos>(() => cargarVinculos());
    const [aviso, setAviso] = useState<Aviso | null>(null);

    const versionDisponible = useMemo(() => {
        const mapa = new Map<string, VersionVoz>();
        for (const v of versiones) mapa.set(v.id, v);
        return mapa;
    }, [versiones]);

    const versionVinculada = (id: string | null | undefined): VersionVoz | null =>
        id ? versionDisponible.get(id) ?? null : null;

    const elegir = (destino: string, id: string | null) => {
        setVinculos((prev) => {
            const siguiente: Vinculos = { ...prev, porTimbre: { ...prev.porTimbre } };
            if (destino === "rito") siguiente.rito = id;
            else if (destino === "configuracion") siguiente.configuracion = id;
            else siguiente.porTimbre[destino] = id;
            return siguiente;
        });
    };

    const escuchar = async (v: VersionVoz | null) => {
        if (!v) return;
        const timbre = aplicarVersionATimbre(v);
        await hablarStarSeed(FRASE_MUESTRA, {
            timbre,
            contexto: "aviso",
        });
    };

    const promover = (destino: string, id: string | null) => {
        setAviso(null);
        if (!id) {
            setAviso({ tipo: "error", texto: "Elige primero una versión para promover." });
            return;
        }
        const version = versionDisponible.get(id);
        if (!version) {
            setAviso({ tipo: "error", texto: "Esa versión ya no existe." });
            return;
        }
        const resultado = promoverVersion(id, destino);
        if (!resultado) {
            setAviso({ tipo: "error", texto: "No se pudo promover la versión." });
            return;
        }
        setVinculos(resultado);
        setAviso({
            tipo: "ok",
            texto: `Aurora ahora habla con la versión «${version.nombre}» en ${etiquetaDestino(destino)}.`,
        });
    };

    // Componente reutilizable para el selector de versión de una fila.
    const SelectorVersion = ({
        destino,
        valor,
    }: {
        destino: string;
        valor: string | null;
    }) => (
        <Select
            value={valor ?? "ninguna"}
            onValueChange={(x) => elegir(destino, x === "ninguna" ? null : x)}
        >
            <SelectTrigger className="cursor-pointer w-full" aria-label="Versión vinculada">
                <SelectValue placeholder="Sin versión" />
            </SelectTrigger>
            <SelectContent>
                <SelectItem value="ninguna" className="cursor-pointer">
                    Sin versión
                </SelectItem>
                {versiones.map((v) => (
                    <SelectItem key={v.id} value={v.id} className="cursor-pointer">
                        {v.nombre}
                    </SelectItem>
                ))}
            </SelectContent>
        </Select>
    );

    return (
        <div className="space-y-6">
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                        <Link2 className="h-4 w-4" aria-hidden />
                        Qué versión habla por cada superficie
                    </CardTitle>
                    <CardDescription>
                        Cada personalidad y cada momento del sistema puede hablar con su propia
                        versión. «Promover» la deja activa y, en el rito y la configuración,
                        además la fija como timbre del sistema.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Superficie</TableHead>
                                <TableHead>Versión vinculada</TableHead>
                                <TableHead className="text-right">Acciones</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {FILAS_ESPECIALES.map((f) => {
                                const valor =
                                    f.clave === "rito" ? vinculos.rito : vinculos.configuracion;
                                const vinculada = versionVinculada(valor);
                                return (
                                    <TableRow key={f.clave}>
                                        <TableCell>
                                            <span className="block font-medium">{f.titulo}</span>
                                            <span className="block text-xs text-muted-foreground">
                                                {f.desc}
                                            </span>
                                        </TableCell>
                                        <TableCell className="min-w-[160px]">
                                            <SelectorVersion destino={f.clave} valor={valor} />
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <span className="inline-flex items-center gap-1.5">
                                                {vinculada && (
                                                    <Badge variant="secondary">
                                                        {vinculada.nombre}
                                                    </Badge>
                                                )}
                                                <Button
                                                    type="button"
                                                    variant="ghost"
                                                    size="sm"
                                                    disabled={!vinculada}
                                                    onClick={() => void escuchar(vinculada)}
                                                    className="cursor-pointer"
                                                    aria-label={`Escuchar la versión de ${f.titulo}`}
                                                >
                                                    <Play className="h-3.5 w-3.5" />
                                                </Button>
                                                <Button
                                                    type="button"
                                                    size="sm"
                                                    onClick={() => promover(f.clave, valor)}
                                                    className="cursor-pointer"
                                                >
                                                    Promover
                                                </Button>
                                            </span>
                                        </TableCell>
                                    </TableRow>
                                );
                            })}

                            {TIMBRES.map((t) => {
                                const valor = vinculos.porTimbre[t.id] ?? null;
                                const vinculada = versionVinculada(valor);
                                return (
                                    <TableRow key={t.id}>
                                        <TableCell>
                                            <span className="block font-medium">
                                                {t.nombre}
                                            </span>
                                            <span className="block text-xs text-muted-foreground">
                                                {t.genero === "femenina"
                                                    ? "Femenina"
                                                    : t.genero === "masculina"
                                                        ? "Masculina"
                                                        : "Neutra"}{" "}
                                                · {t.desc}
                                            </span>
                                        </TableCell>
                                        <TableCell className="min-w-[160px]">
                                            <SelectorVersion destino={t.id} valor={valor} />
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <span className="inline-flex items-center gap-1.5">
                                                {vinculada && (
                                                    <Badge variant="secondary">
                                                        {vinculada.nombre}
                                                    </Badge>
                                                )}
                                                <Button
                                                    type="button"
                                                    variant="ghost"
                                                    size="sm"
                                                    disabled={!vinculada}
                                                    onClick={() => void escuchar(vinculada)}
                                                    className="cursor-pointer"
                                                    aria-label={`Escuchar la versión de ${t.nombre}`}
                                                >
                                                    <Play className="h-3.5 w-3.5" />
                                                </Button>
                                                <Button
                                                    type="button"
                                                    size="sm"
                                                    onClick={() => promover(t.id, valor)}
                                                    className="cursor-pointer"
                                                >
                                                    Promover
                                                </Button>
                                            </span>
                                        </TableCell>
                                    </TableRow>
                                );
                            })}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>

            {aviso && (
                <div
                    role="status"
                    className={`flex items-start gap-2 rounded-lg border p-3 text-sm ${
                        aviso.tipo === "ok"
                            ? "border-emerald-500/40 bg-emerald-500/5 text-emerald-300"
                            : "border-destructive/40 bg-destructive/5 text-destructive"
                    }`}
                >
                    <Volume2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                    <span>{aviso.texto}</span>
                </div>
            )}
        </div>
    );
}