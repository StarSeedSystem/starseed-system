"use client";

/**
 * ESTUDIO DE VOCES (Ola 228 · ampliado en la Ola 240, tarea VZ6)
 * ─────────────────────────────────────────────────────────────────────────────
 * Taller para afinar el catálogo de voces de Aurora (`voces-catalogo.ts`).
 * A la izquierda: buscador, filtro por género y la lista de voces.
 * A la derecha: pestañas «Motor», «Ajustes» (edición, prueba y archivos) y
 * «Ficha técnica» (radiografía de la voz seleccionada), más el flujo de
 * versiones de la Ola 240: «Versiones», «Pruebas A/B», «Fusión», «Motores»
 * y «Vincular». El estado de las versiones vive AQUÍ y baja por props; cada
 * cambio se persiste con `guardarVersiones` (`starseed.voces.versiones.v1`).
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { Dna, Play, RotateCcw, Save, Upload, Download } from "lucide-react";

import {
    cargarVoces,
    clonarVoz,
    exportarVoces,
    guardarVoz,
    importarVoces,
    restablecerVoz,
    type VozEditable,
} from "@/lib/aurora/voces-catalogo";
import { buscarTimbre, type Timbre } from "@/lib/aurora/timbres";
import {
    cargarVersiones,
    guardarVersiones,
    type VersionVoz,
} from "@/lib/voces/versiones";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { FichaVoz } from "@/components/voces/ficha-voz";
import { PanelMotorVoz } from "@/components/voces/panel-motor";
import { PanelVersiones } from "@/components/voces/panel-versiones";
import { BancoPruebasVoz } from "@/components/voces/banco-pruebas-voz";
import { FusionVoz } from "@/components/voces/fusion-voz";
import { PanelMotores } from "@/components/voces/panel-motores";
import { VincularVoz } from "@/components/voces/vincular-voz";

type FiltroGenero = "todas" | VozEditable["genero"];

const FRASE_MUESTRA =
    "Hola, soy una voz de StarSeed. Así sueno con estos ajustes: cálida al saludar, clara al contar y serena al cerrar.";

interface Aviso {
    tipo: "ok" | "error";
    texto: string;
}

export function EstudioVoces() {
    const [voces, setVoces] = useState<VozEditable[]>([]);
    const [busqueda, setBusqueda] = useState("");
    const [filtroGenero, setFiltroGenero] = useState<FiltroGenero>("todas");
    const [seleccionada, setSeleccionada] = useState<string | null>(null);
    /** Copia de trabajo de la voz seleccionada: lo que editan los controles. */
    const [borrador, setBorrador] = useState<VozEditable | null>(null);
    const [aviso, setAviso] = useState<Aviso | null>(null);
    /** Versiones de voz del Estudio (Ola 240): el estado vive aquí y baja por props. */
    const [versiones, setVersiones] = useState<VersionVoz[]>([]);
    const entradaArchivo = useRef<HTMLInputElement | null>(null);

    /** Timbre real detrás de la voz seleccionada (lo que «Crear versión» usa). */
    const timbreSeleccionado = useMemo<Timbre | null>(() => {
        if (!borrador) return null;
        const real = buscarTimbre(borrador.id);
        if (real) return real;
        // Clones: no están en el catálogo de timbres, se reconstruyen igual.
        return {
            id: borrador.id,
            nombre: borrador.nombre,
            genero: borrador.genero,
            desc: borrador.desc,
            local: {
                voz: borrador.local.voz,
                speed: borrador.local.speed,
                ...(borrador.local.instruct ? { instruct: borrador.local.instruct } : {}),
            },
            sistema: {
                bases: ["Paulina", "Mónica", "Monica"],
                pitch: borrador.sistema.pitch,
                rate: borrador.sistema.rate,
            },
            expr: { ...borrador.expr },
        };
    }, [borrador]);

    /** Sustituye la lista de versiones y la persiste de inmediato. */
    const guardarListaVersiones = (lista: VersionVoz[], avisoNuevo: Aviso | null) => {
        guardarVersiones(lista);
        setVersiones(lista);
        if (avisoNuevo) setAviso(avisoNuevo);
    };

    /** Valoración 1–5 que llega desde el banco de pruebas A/B. */
    const valorarVersion = (id: string, valor: number) => {
        guardarListaVersiones(
            versiones.map((v) =>
                v.id === id ? { ...v, valoracion: valor, modificadaEn: new Date().toISOString() } : v,
            ),
            null,
        );
    };

    /** La fusión crea la hija; aquí se incorpora a la lista y se guarda. */
    const incorporarVersion = (v: VersionVoz) => {
        guardarListaVersiones(
            [...versiones, v],
            { tipo: "ok", texto: `Versión «${v.nombre}» fusionada y guardada.` },
        );
    };

    const recargar = (mantenerId?: string) => {
        const lista = cargarVoces();
        setVoces(lista);
        const id = mantenerId ?? seleccionada;
        const viva = lista.find((v) => v.id === id) ?? lista[0] ?? null;
        setSeleccionada(viva?.id ?? null);
        setBorrador(viva ? { ...viva } : null);
    };

    useEffect(() => {
        recargar();
        setVersiones(cargarVersiones());
        // Estado real de la vía de voz: preparando, sonando o sin motor.
        const alEstado = (e: Event) => {
            const detalle = (e as CustomEvent<string>).detail;
            if (detalle === "muda") {
                setAviso({ tipo: "error", texto: "En este navegador no suena ningún motor de voz." });
            } else if (detalle === "navegador" || detalle === "motor") {
                setAviso({ tipo: "ok", texto: detalle === "motor" ? "Sonando por el motor local." : "Sonando por la voz del sistema." });
            }
        };
        void import("@/lib/aurora/voz-rito").then((m) => {
            window.addEventListener(m.VOZ_RITO_EVENT, alEstado);
        }).catch(() => null);
        return () => {
            void import("@/lib/aurora/voz-rito").then((m) => {
                window.removeEventListener(m.VOZ_RITO_EVENT, alEstado);
            }).catch(() => null);
        };
        // Solo al montar: carga el catálogo y suscribe al estado de voz.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const filtradas = useMemo(() => {
        const q = busqueda.trim().toLowerCase();
        return voces.filter((v) => {
            if (filtroGenero !== "todas" && v.genero !== filtroGenero) return false;
            if (!q) return true;
            return (
                v.nombre.toLowerCase().includes(q) ||
                v.desc.toLowerCase().includes(q) ||
                v.id.toLowerCase().includes(q)
            );
        });
    }, [voces, busqueda, filtroGenero]);

    const elegir = (id: string) => {
        setSeleccionada(id);
        const v = voces.find((x) => x.id === id) ?? null;
        setBorrador(v ? { ...v } : null);
        setAviso(null);
    };

    const cambiar = (parche: Partial<VozEditable>) => {
        setBorrador((b) => (b ? { ...b, ...parche } : b));
    };

    const probar = () => {
        if (!borrador) return;
        setAviso(null);
        void import("@/lib/aurora/voz-rito")
            .then((m) => {
                if (!m.ritoPuedeHablar()) {
                    setAviso({ tipo: "error", texto: "Este dispositivo no tiene motor de voz disponible." });
                    return;
                }
                if (!m.hablarRito(FRASE_MUESTRA)) {
                    setAviso({ tipo: "error", texto: "No se pudo iniciar la prueba de voz." });
                }
            })
            .catch(() => setAviso({ tipo: "error", texto: "No se pudo cargar la vía de voz." }));
    };

    const guardar = () => {
        if (!borrador) return;
        guardarVoz(borrador);
        recargar(borrador.id);
        setAviso({ tipo: "ok", texto: `«${borrador.nombre}» quedó guardada.` });
    };

    const clonar = () => {
        if (!borrador) return;
        const clon = clonarVoz(borrador.id, `${borrador.nombre} (copia)`);
        if (!clon) {
            setAviso({ tipo: "error", texto: "No se pudo clonar esta voz." });
            return;
        }
        recargar(clon.id);
        setAviso({ tipo: "ok", texto: `Clon creado: «${clon.nombre}».` });
    };

    const restablecer = () => {
        if (!borrador) return;
        if (borrador.origen === "clon") {
            setAviso({ tipo: "error", texto: "Los clones no tienen valor de fábrica: edítalo o bórralo desde el JSON." });
            return;
        }
        const original = restablecerVoz(borrador.id);
        if (!original) {
            setAviso({ tipo: "error", texto: "No se encontró el valor original de esta voz." });
            return;
        }
        recargar(original.id);
        setAviso({ tipo: "ok", texto: `«${original.nombre}» volvió a su definición de código.` });
    };

    const exportar = () => {
        try {
            const blob = new Blob([exportarVoces()], { type: "application/json" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = "starseed-voces.json";
            a.click();
            URL.revokeObjectURL(url);
            setAviso({ tipo: "ok", texto: "Catálogo exportado en JSON." });
        } catch {
            setAviso({ tipo: "error", texto: "No se pudo exportar el catálogo." });
        }
    };

    const importar = (archivo: File | null) => {
        if (!archivo) return;
        const lector = new FileReader();
        lector.onload = () => {
            const r = importarVoces(String(lector.result ?? ""));
            if (r.ok) {
                recargar();
                setAviso({ tipo: "ok", texto: `Catálogo importado (${r.importadas} voces).` });
            } else {
                setAviso({ tipo: "error", texto: r.error ?? "No se pudo importar el catálogo." });
            }
        };
        lector.onerror = () => setAviso({ tipo: "error", texto: "No se pudo leer el archivo." });
        lector.readAsText(archivo);
    };

    return (
        <div className="grid gap-6 lg:grid-cols-[minmax(260px,340px)_1fr]">
            {/* ── Lista: buscador + filtro + voces ─────────────────────────── */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-base">Voces</CardTitle>
                    <CardDescription>Elige una para ajustarla o ver su ficha.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                    <Input
                        value={busqueda}
                        onChange={(e) => setBusqueda(e.target.value)}
                        placeholder="Buscar por nombre…"
                        aria-label="Buscar voz"
                    />
                    <Select value={filtroGenero} onValueChange={(v) => setFiltroGenero(v as FiltroGenero)}>
                        <SelectTrigger className="cursor-pointer" aria-label="Filtrar por género">
                            <SelectValue placeholder="Género" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="todas">Todas</SelectItem>
                            <SelectItem value="femenina">Femeninas</SelectItem>
                            <SelectItem value="masculina">Masculinas</SelectItem>
                            <SelectItem value="neutra">Neutras</SelectItem>
                        </SelectContent>
                    </Select>

                    <ul className="max-h-[52vh] space-y-1 overflow-y-auto pr-1" aria-label="Lista de voces">
                        {filtradas.length === 0 && (
                            <li className="px-2 py-4 text-sm text-muted-foreground">
                                Ninguna voz coincide con la búsqueda.
                            </li>
                        )}
                        {filtradas.map((v) => (
                            <li key={v.id}>
                                <button
                                    type="button"
                                    onClick={() => elegir(v.id)}
                                    aria-pressed={seleccionada === v.id}
                                    className={`w-full cursor-pointer rounded-lg border px-3 py-2 text-left transition-colors duration-200 ${
                                        seleccionada === v.id
                                            ? "border-primary/60 bg-primary/10"
                                            : "border-transparent hover:bg-muted/60"
                                    }`}
                                >
                                    <span className="flex items-center justify-between gap-2">
                                        <span className="truncate text-sm font-medium">{v.nombre}</span>
                                        <span className="flex shrink-0 items-center gap-1">
                                            {v.origen === "editada" && <Badge variant="secondary">Editada</Badge>}
                                            {v.origen === "clon" && <Badge>Clon</Badge>}
                                        </span>
                                    </span>
                                    <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                                        {v.desc}
                                    </span>
                                </button>
                            </li>
                        ))}
                    </ul>
                </CardContent>
            </Card>

            {/* ── Detalle: Motor / Ajustes / Ficha técnica ─────────────────── */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                        {borrador ? borrador.nombre : "Estudio de Voces"}
                        {borrador && (
                            <Badge variant="outline">
                                {borrador.genero === "femenina"
                                    ? "Femenina"
                                    : borrador.genero === "masculina"
                                      ? "Masculina"
                                      : "Neutra"}
                            </Badge>
                        )}
                    </CardTitle>
                    {borrador && <CardDescription>{borrador.id}</CardDescription>}
                </CardHeader>
                <CardContent>
                    <Tabs defaultValue="motor">
                        <TabsList className="flex-wrap">
                            <TabsTrigger value="motor" className="cursor-pointer">Motor</TabsTrigger>
                            <TabsTrigger value="ajustes" className="cursor-pointer">Ajustes</TabsTrigger>
                            <TabsTrigger value="ficha" className="cursor-pointer">Ficha técnica</TabsTrigger>
                            <TabsTrigger value="versiones" className="cursor-pointer">Versiones</TabsTrigger>
                            <TabsTrigger value="pruebas" className="cursor-pointer">Pruebas A/B</TabsTrigger>
                            <TabsTrigger value="fusion" className="cursor-pointer">Fusión</TabsTrigger>
                            <TabsTrigger value="motores" className="cursor-pointer">Motores</TabsTrigger>
                            <TabsTrigger value="vincular" className="cursor-pointer">Vincular</TabsTrigger>
                        </TabsList>

                        <TabsContent value="motor" className="pt-4">
                            <PanelMotorVoz />
                        </TabsContent>

                        {/* ── Ola 240: flujo de versiones del Estudio ─────────── */}
                        <TabsContent value="versiones" className="pt-4">
                            <PanelVersiones
                                versiones={versiones}
                                timbre={timbreSeleccionado}
                                onGuardar={guardarListaVersiones}
                            />
                        </TabsContent>

                        <TabsContent value="pruebas" className="pt-4">
                            <BancoPruebasVoz
                                versiones={versiones.slice(0, 4)}
                                onValorar={valorarVersion}
                            />
                        </TabsContent>

                        <TabsContent value="fusion" className="pt-4">
                            <FusionVoz versiones={versiones} onCrear={incorporarVersion} />
                        </TabsContent>

                        <TabsContent value="motores" className="pt-4">
                            <PanelMotores />
                        </TabsContent>

                        <TabsContent value="vincular" className="pt-4">
                            <VincularVoz versiones={versiones} />
                        </TabsContent>

                        {borrador ? (
                    <>
                                <TabsContent value="ajustes" className="space-y-5 pt-4">
                                    <div className="grid gap-4 sm:grid-cols-2">
                                        <div className="space-y-1.5">
                                            <Label htmlFor="voz-nombre">Nombre</Label>
                                            <Input
                                                id="voz-nombre"
                                                value={borrador.nombre}
                                                onChange={(e) => cambiar({ nombre: e.target.value })}
                                            />
                                        </div>
                                        <div className="space-y-1.5">
                                            <Label htmlFor="voz-instruct">Instrucción de estilo</Label>
                                            <Input
                                                id="voz-instruct"
                                                value={borrador.local.instruct}
                                                onChange={(e) =>
                                                    cambiar({ local: { ...borrador.local, instruct: e.target.value } })
                                                }
                                                placeholder="p. ej. female, young adult, moderate pitch"
                                            />
                                        </div>
                                    </div>
                                    <div className="space-y-1.5">
                                        <Label htmlFor="voz-desc">Descripción</Label>
                                        <Textarea
                                            id="voz-desc"
                                            rows={2}
                                            value={borrador.desc}
                                            onChange={(e) => cambiar({ desc: e.target.value })}
                                        />
                                    </div>

                                    <div className="space-y-4">
                                        {(
                                            [
                                                {
                                                    clave: "velocidad",
                                                    titulo: "Velocidad",
                                                    valor: borrador.local.speed,
                                                    min: 0.7,
                                                    max: 1.4,
                                                    aplicar: (x: number) =>
                                                        cambiar({ local: { ...borrador.local, speed: x } }),
                                                },
                                                {
                                                    clave: "arco",
                                                    titulo: "Arco (caída del tono)",
                                                    valor: borrador.expr.arco,
                                                    min: 0,
                                                    max: 1,
                                                    aplicar: (x: number) =>
                                                        cambiar({ expr: { ...borrador.expr, arco: x } }),
                                                },
                                                {
                                                    clave: "vivacidad",
                                                    titulo: "Vivacidad (ritmo entre cláusulas)",
                                                    valor: borrador.expr.vivacidad,
                                                    min: 0,
                                                    max: 1,
                                                    aplicar: (x: number) =>
                                                        cambiar({ expr: { ...borrador.expr, vivacidad: x } }),
                                                },
                                                {
                                                    clave: "calidez",
                                                    titulo: "Calidez (apertura del saludo)",
                                                    valor: borrador.expr.calidez,
                                                    min: 0,
                                                    max: 1,
                                                    aplicar: (x: number) =>
                                                        cambiar({ expr: { ...borrador.expr, calidez: x } }),
                                                },
                                            ] as const
                                        ).map((s) => (
                                            <div key={s.clave} className="space-y-1.5">
                                                <div className="flex items-center justify-between">
                                                    <Label>{s.titulo}</Label>
                                                    <span className="text-xs tabular-nums text-muted-foreground">
                                                        {s.valor.toFixed(2)}
                                                    </span>
                                                </div>
                                                <Slider
                                                    aria-label={s.titulo}
                                                    value={[s.valor]}
                                                    min={s.min}
                                                    max={s.max}
                                                    step={0.01}
                                                    onValueChange={(v) => s.aplicar(v[0] ?? s.valor)}
                                                    className="cursor-pointer"
                                                />
                                            </div>
                                        ))}
                                    </div>

                                    {aviso && (
                                        <p
                                            role="status"
                                            className={`text-sm ${aviso.tipo === "ok" ? "text-emerald-500" : "text-destructive"}`}
                                        >
                                            {aviso.texto}
                                        </p>
                                    )}

                                    <div className="flex flex-wrap gap-2">
                                        <Button type="button" onClick={probar} className="cursor-pointer">
                                            <Play className="mr-1.5 h-4 w-4" /> Probar
                                        </Button>
                                        <Button type="button" variant="secondary" onClick={guardar} className="cursor-pointer">
                                            <Save className="mr-1.5 h-4 w-4" /> Guardar
                                        </Button>
                                        <Button type="button" variant="secondary" onClick={clonar} className="cursor-pointer">
                                            <Dna className="mr-1.5 h-4 w-4" /> Clonar
                                        </Button>
                                        <Button type="button" variant="outline" onClick={restablecer} className="cursor-pointer">
                                            <RotateCcw className="mr-1.5 h-4 w-4" /> Restablecer
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
                                            aria-label="Importar catálogo de voces en JSON"
                                            onChange={(e) => {
                                                importar(e.target.files?.[0] ?? null);
                                                e.target.value = "";
                                            }}
                                        />
                                    </div>
                                </TabsContent>

                                <TabsContent value="ficha" className="pt-4">
                                    <FichaVoz voz={borrador} />
                                </TabsContent>
                    </>
                        ) : (
                            <p className="py-10 text-center text-sm text-muted-foreground">
                                Selecciona una voz de la lista para ver sus ajustes.
                            </p>
                        )}
                    </Tabs>
                </CardContent>
            </Card>
        </div>
    );
}
