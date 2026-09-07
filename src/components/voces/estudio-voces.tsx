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
 *
 * (Ola 263 · F6, 2026-09-06) En «Ajustes» la instrucción de estilo ya no es
 * texto libre (el demonio OmniVoice solo entiende su vocabulario y descartaba
 * el resto en silencio): se edita con fichas de `VOCABULARIO_INSTRUCT`, con
 * aviso de lo que el motor ignoraría si el timbre traía tokens ajenos. La
 * variación neuronal se completa con semilla (vacía = la del demonio) y tono
 * (1 = natural), y «Probar» suena con el borrador COMPLETO, no con el timbre
 * guardado.
 *
 * (Ola 264 · G3, 2026-09-06) Forja fase 2-3: la pestaña «Ajustes» añade la
 * emoción base y la intensidad de la voz (fichas del catálogo `EMOCIONES`
 * con `title` de la descripción, deslizador 0-2 paso 0.1 y línea gris con
 * el efecto calculado por `aplicarEmocion`), un segundo «Probar con
 * etiqueta» que antepone `[emoción intensidad]` al texto de prueba para
 * ejercitar la ruta de la etiqueta, y un bloque plegable con la vista
 * previa del texto normalizado que oirá el motor
 * (`normalizarParaVoz(FRASE_MUESTRA)`, J1). Guardar conserva `emocionBase`
 * e `intensidad` porque `VozEditable` los replica desde `Timbre`.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Dna, Play, RotateCcw, Save, Shuffle, Tag, Upload, Download } from "lucide-react";

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
    VOCABULARIO_INSTRUCT,
    perfilNeuronal,
    semillaPorDefecto,
    validarInstruct,
} from "@/lib/voces/perfil-neuronal";
import { EMOCIONES, type EmocionVoz, aplicarEmocion } from "@/lib/voces/emociones";
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
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { FichaVoz } from "@/components/voces/ficha-voz";
import { PanelForja } from "@/components/voces/panel-forja";
import { PanelMotorVoz } from "@/components/voces/panel-motor";
import { PanelOido } from "@/components/voces/panel-oido";
import { PanelVersiones } from "@/components/voces/panel-versiones";
import { BancoPruebasVoz } from "@/components/voces/banco-pruebas-voz";
import { FusionVoz } from "@/components/voces/fusion-voz";
import { PanelMotores } from "@/components/voces/panel-motores";
import { VincularVoz } from "@/components/voces/vincular-voz";

type FiltroGenero = "todas" | VozEditable["genero"];

const FRASE_MUESTRA =
    "Hola, soy una voz de StarSeed. Así sueno con estos ajustes: cálida al saludar, clara al contar y serena al cerrar.";

/** Orden de las fichas de emoción (la "neutra" se muestra como "Sin emoción"). */
const ORDEN_EMOCIONES: EmocionVoz[] = [
    "neutra",
    "alegre",
    "serena",
    "urgente",
    "triste",
    "solemne",
    "jugueton",
    "susurro",
    "asombro",
];

/**
 * Etiquetas en español para los tokens del vocabulario del demonio
 * (`VOCABULARIO_INSTRUCT`, Ola 263 · F4). El instruct se guarda SIEMPRE con
 * los tokens en inglés que el demonio entiende; esto es solo la presentación.
 */
const ETIQUETAS_TOKEN: Record<string, string> = {
    female: "Femenina",
    male: "Masculina",
    child: "Infantil",
    teenager: "Adolescente",
    "young adult": "Joven adulto",
    "middle-aged": "Mediana edad",
    elderly: "Mayor",
    "very low pitch": "Muy grave",
    "low pitch": "Grave",
    "moderate pitch": "Moderado",
    "high pitch": "Agudo",
    "very high pitch": "Muy agudo",
    whisper: "Susurro",
    "american accent": "Estadounidense",
    "australian accent": "Australiano",
    "british accent": "Británico",
    "canadian accent": "Canadiense",
    "chinese accent": "Chino",
    "indian accent": "Indio",
    "japanese accent": "Japonés",
    "korean accent": "Coreano",
    "portuguese accent": "Portugués",
    "russian accent": "Ruso",
};

function etiquetaToken(token: string): string {
    return ETIQUETAS_TOKEN[token] ?? token;
}

/** Selección actual del editor de fichas, derivada DEL instruct guardado. */
interface SeleccionInstruct {
    genero: string;
    edad: string;
    tono: string;
    whisper: boolean;
    acento: string;
}

const SELECCION_VACIA: SeleccionInstruct = { genero: "", edad: "", tono: "", whisper: false, acento: "" };

/** Descompone el instruct (cadena de tokens) en la selección visible. */
function seleccionDeInstruct(instruct: string): { sel: SeleccionInstruct; ignorados: string[] } {
    const v = validarInstruct(instruct);
    const sel: SeleccionInstruct = { ...SELECCION_VACIA };
    for (const t of v.tokens) {
        if ((VOCABULARIO_INSTRUCT.genero as readonly string[]).includes(t)) sel.genero = t;
        else if ((VOCABULARIO_INSTRUCT.edad as readonly string[]).includes(t)) sel.edad = t;
        else if ((VOCABULARIO_INSTRUCT.tono as readonly string[]).includes(t)) sel.tono = t;
        else if (t === "whisper") sel.whisper = true;
        else if ((VOCABULARIO_INSTRUCT.acento as readonly string[]).includes(t)) sel.acento = t;
    }
    return { sel, ignorados: v.ignorados };
}

/**
 * Recompone el instruct desde la selección, en el orden canónico del demonio
 * (género → edad → tono → otros → acento). Al guardar SOLO tokens del
 * vocabulario, `validarInstruct(...).valido` devuelve la misma cadena y el
 * motor aplicará exactamente lo que se ve aquí.
 */
function instructDesdeSeleccion(sel: SeleccionInstruct): string {
    const partes = [sel.genero, sel.edad, sel.tono].filter((t) => t !== "");
    if (sel.whisper) partes.push("whisper");
    if (sel.acento) partes.push(sel.acento);
    return partes.join(", ");
}

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
    /**
     * (Ola 264 · G3) Bloque plegable de «Vista previa de lo que oirá el motor»:
     * cerrado por defecto para no abrumar, se abre con un clic.
     */
    const [vistaPreviaAbierta, setVistaPreviaAbierta] = useState(false);
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

    /**
     * Timbre con el BORRADOR COMPLETO tal y como se editará/probará: instruct
     * validado contra el vocabulario del demonio, `seed` y `pitch` incluidos.
     * «Probar» suena EXACTAMENTE con esto (Ola 263 · F6): nada de caer al
     * timbre guardado, que dejaría fuera lo que se está ajustando.
     */
    const timbreBorrador = useMemo<Timbre | null>(() => {
        if (!borrador) return null;
        const real = buscarTimbre(borrador.id);
        const instruct = validarInstruct(borrador.local.instruct).valido;
        return {
            id: borrador.id,
            nombre: borrador.nombre,
            genero: borrador.genero,
            desc: borrador.desc,
            local: {
                voz: borrador.local.voz,
                speed: borrador.local.speed,
                ...(instruct ? { instruct } : {}),
                ...(real?.local.ref ? { ref: real.local.ref } : {}),
                ...(borrador.local.seed !== undefined ? { seed: borrador.local.seed } : {}),
                ...(borrador.local.pitch !== undefined ? { pitch: borrador.local.pitch } : {}),
            },
            sistema: real?.sistema ?? {
                bases: ["Paulina", "Mónica", "Monica"],
                pitch: borrador.sistema.pitch,
                rate: borrador.sistema.rate,
            },
            expr: { ...borrador.expr },
        };
    }, [borrador]);

    /**
     * (Ola 264 · G3) Resumen legible del efecto de la emoción sobre este
     * timbre: factores de velocidad/tono e instruct efectivo. Es la línea
     * gris que aparece bajo las fichas y bajo el deslizador de intensidad.
     * Se calcula SIEMPRE sobre el timbre del borrador (no el guardado) para
     * que lo que se ve sea lo que sonará al pulsar «Probar».
     */
    const efectoCalculado = useMemo(() => {
        if (!timbreBorrador) return null;
        const emocion = borrador?.emocionBase ?? "neutra";
        const intensidad = borrador?.intensidad ?? 1;
        if (emocion === "neutra" || intensidad <= 0) {
            return {
                factorSpeed: 1,
                factorPitch: 1,
                instruct: timbreBorrador.local.instruct ?? "",
                intensidadAplicada: 0,
            };
        }
        const base = perfilNeuronal(timbreBorrador);
        const { perfil } = aplicarEmocion(base, timbreBorrador.expr, emocion, intensidad);
        return {
            factorSpeed: base.speed > 0 ? perfil.speed / base.speed : 1,
            factorPitch: base.pitch > 0 ? perfil.pitch / base.pitch : 1,
            instruct: perfil.instruct,
            intensidadAplicada: intensidad,
        };
    }, [timbreBorrador, borrador?.emocionBase, borrador?.intensidad]);

    /**
     * (Ola 264 · G3) Texto normalizado que oirá el motor: `normalizarParaVoz`
     * (J1) convierte números a palabras, signos a pausas, etc. La
     * importación es DINÁMICA y defensiva: si J1 aún no entró al árbol, el
     * bloque muestra el texto original sin marcar «normalizado» y la app
     * sigue funcionando. En cuanto J1 integre su archivo, la vista previa
     * aparece sola sin tocar este código.
     */
    const [normalizador, setNormalizador] = useState<
        ((texto: string) => string) | null
    >(null);
    useEffect(() => {
        let vivo = true;
        // @ts-expect-error módulo aún no integrado por J1; la importación es defensiva (catch silencioso)
        void import("@/lib/voces/normalizar-es")
            .then((mod) => {
                if (!vivo) return;
                if (typeof mod.normalizarParaVoz === "function") {
                    setNormalizador(() => mod.normalizarParaVoz);
                }
            })
            .catch(() => {
                // Módulo ausente: J1 aún no entra al árbol; se mostrará el original.
            });
        return () => {
            vivo = false;
        };
    }, []);

    const textoNormalizado = useMemo<
        { original: string; normalizado: string; disponible: boolean; difiere: boolean }
        | null
    >(() => {
        if (!borrador) return null;
        const normalizado = normalizador ? normalizador(FRASE_MUESTRA) : FRASE_MUESTRA;
        return {
            original: FRASE_MUESTRA,
            normalizado,
            disponible: normalizador !== null,
            difiere: normalizador !== null && normalizado !== FRASE_MUESTRA,
        };
    }, [borrador, normalizador]);

    /**
     * Selección visible del editor de fichas, derivada del instruct del
     * borrador. Los tokens que no pertenecen al vocabulario quedan en
     * `ignoradosInstruct` para el aviso «El motor ignoraría: …».
     */
    const { sel: seleccionInstruct, ignorados: ignoradosInstruct } = useMemo(
        () => seleccionDeInstruct(borrador?.local.instruct ?? ""),
        [borrador?.local.instruct],
    );

    /** Cambia UNA ficha y recompone el instruct en el orden del demonio. */
    const fijarFicha = (parche: Partial<SeleccionInstruct>) => {
        if (!borrador) return;
        const instruct = instructDesdeSeleccion({ ...seleccionInstruct, ...parche });
        cambiar({ local: { ...borrador.local, instruct } });
    };

    /** «Otra variante»: semilla aleatoria en el rango del demonio [700000, 789999]. */
    const otraVariante = () => {
        if (!borrador) return;
        const seed = 700000 + Math.floor(Math.random() * 90000);
        cambiar({ local: { ...borrador.local, seed } });
    };

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

    /**
     * Habla con la emoción e intensidad del BORRADOR. La emoción se pasa
     * tanto en `opciones.emocion`/`opciones.intensidad` (lo que el motor usa
     * para aplicar la capa) como, en `usarEtiqueta: true`, anteponiendo
     * `[emoción intensidad]` al texto para ejercitar la ruta de la etiqueta
     * (que siempre manda sobre las opciones y se recorta al hablar).
     *
     *  · `usarEtiqueta: false` → camino normal: la emoción viene de las
     *    opciones y la etiqueta no aparece.
     *  · `usarEtiqueta: true`  → camino etiqueta: la emoción del texto
     *    manda; las opciones también la llevan para que ambos caminos
     *    concuerden (la etiqueta se recorta, las opciones quedan para
     *    auditorías y para el gesto del avatar).
     */
    const probar = (usarEtiqueta: boolean = false) => {
        if (!borrador || !timbreBorrador) return;
        setAviso(null);
        const emocion = borrador.emocionBase ?? "neutra";
        const intensidad = borrador.intensidad ?? 1;
        void (async () => {
            try {
                const vozRito = await import("@/lib/aurora/voz-rito");
                if (!vozRito.ritoPuedeHablar()) {
                    setAviso({ tipo: "error", texto: "Este dispositivo no tiene motor de voz disponible." });
                    return;
                }
                // (Ola 263 · F6) Se habla con el timbre del BORRADOR completo
                // (instruct validado + seed + pitch + speed), no con el timbre
                // guardado; si no, lo que suena no sería lo que se está viendo.
                // (Ola 264 · G3) La emoción y la intensidad se pasan en
                // opciones; con etiqueta se antepone `[emoción intensidad]`
                // al texto (omitida si no hay emoción efectiva).
                const { hablarStarSeed, nivelActual } = await import("@/lib/aurora/voz-starseed/motor");
                const hayEmocion = emocion !== "neutra" && intensidad > 0;
                const texto = usarEtiqueta && hayEmocion
                    ? `[${emocion} ${intensidad.toFixed(1)}] ${FRASE_MUESTRA}`
                    : FRASE_MUESTRA;
                const sono = await hablarStarSeed(texto, {
                    timbre: timbreBorrador,
                    contexto: "rito",
                    ...(hayEmocion ? { emocion, intensidad } : {}),
                });
                if (!sono) {
                    setAviso({ tipo: "error", texto: "No se pudo iniciar la prueba de voz." });
                    return;
                }
                setAviso({
                    tipo: "ok",
                    texto: nivelActual() === "minima" ? "Sonando por la voz del sistema." : "Sonando por el motor local.",
                });
            } catch {
                setAviso({ tipo: "error", texto: "No se pudo cargar la vía de voz." });
            }
        })();
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
                            <TabsTrigger value="forja" className="cursor-pointer">Forja 1.58</TabsTrigger>
                            <TabsTrigger value="oido" className="cursor-pointer">Oído 1.58</TabsTrigger>
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

                        {/* ── Ola 246: Forja de Voz 1.58, el programa propio ── */}
                        <TabsContent value="forja" className="pt-4">
                            <PanelForja />
                        </TabsContent>

                        {/* ── Ola 249: oído ternario VibeASR.cpp por el daemon ── */}
                        <TabsContent value="oido" className="pt-4">
                            <PanelOido />
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
                                            <Label htmlFor="voz-semilla">Semilla</Label>
                                            <div className="flex gap-2">
                                                <Input
                                                    id="voz-semilla"
                                                    type="number"
                                                    min={700000}
                                                    max={789999}
                                                    step={1}
                                                    value={borrador.local.seed ?? ""}
                                                    placeholder={String(semillaPorDefecto(borrador.id))}
                                                    onChange={(e) => {
                                                        const crudo = e.target.value.trim();
                                                        const n = Number(crudo);
                                                        cambiar({
                                                            local: {
                                                                ...borrador.local,
                                                                // Vacío o no numérico → sin fijar (usa la de por defecto).
                                                                ...(crudo !== "" && Number.isFinite(n)
                                                                    ? { seed: Math.round(n) }
                                                                    : { seed: undefined }),
                                                            },
                                                        });
                                                    }}
                                                />
                                                <Button
                                                    type="button"
                                                    variant="outline"
                                                    onClick={otraVariante}
                                                    className="shrink-0 cursor-pointer"
                                                >
                                                    <Shuffle className="mr-1.5 h-4 w-4" /> Otra variante
                                                </Button>
                                            </div>
                                            <p className="text-xs text-muted-foreground">
                                                La misma semilla hace sonar siempre la misma voz; vacía usa la suya por defecto.
                                            </p>
                                        </div>
                                    </div>

                                    {/* Instrucción de estilo: editor de fichas (Ola 263 · F6).
                                        Texto libre que el demonio descarta ya no se puede escribir:
                                        cada ficha es un token del vocabulario válido y el instruct
                                        resultante pasa `validarInstruct` siempre. */}
                                    <div className="space-y-3 rounded-lg border p-3">
                                        <p className="text-sm font-medium leading-none">Instrucción de estilo</p>
                                        {(
                                            [
                                                { titulo: "Género", clave: "genero" as const, actual: seleccionInstruct.genero, opciones: VOCABULARIO_INSTRUCT.genero },
                                                { titulo: "Edad", clave: "edad" as const, actual: seleccionInstruct.edad, opciones: VOCABULARIO_INSTRUCT.edad },
                                                { titulo: "Tono", clave: "tono" as const, actual: seleccionInstruct.tono, opciones: VOCABULARIO_INSTRUCT.tono },
                                            ]
                                        ).map((grupo) => (
                                            <div key={grupo.clave} className="space-y-1.5">
                                                <Label>{grupo.titulo}</Label>
                                                <div className="flex flex-wrap gap-1.5">
                                                    {["", ...grupo.opciones].map((token) => {
                                                        const activo = seleccionInstruct[grupo.clave] === token;
                                                        return (
                                                            <button
                                                                key={token || "sin-fijar"}
                                                                type="button"
                                                                aria-pressed={activo}
                                                                onClick={() => fijarFicha({ [grupo.clave]: token })}
                                                                className={`cursor-pointer rounded-full border px-2.5 py-1 text-xs transition-colors duration-200 ${
                                                                    activo
                                                                        ? "border-primary/60 bg-primary/10 text-foreground"
                                                                        : "border-border text-muted-foreground hover:bg-muted/60"
                                                                }`}
                                                            >
                                                                {token === "" ? "Sin fijar" : etiquetaToken(token)}
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        ))}
                                        <div className="flex items-center gap-2">
                                            <Switch
                                                id="voz-whisper"
                                                checked={seleccionInstruct.whisper}
                                                onCheckedChange={(on) => fijarFicha({ whisper: on })}
                                                className="cursor-pointer"
                                            />
                                            <Label htmlFor="voz-whisper" className="cursor-pointer">Susurro</Label>
                                        </div>
                                        <div className="space-y-1.5">
                                            <Label htmlFor="voz-acento">Acento</Label>
                                            <Select
                                                value={seleccionInstruct.acento || "ninguno"}
                                                onValueChange={(v) => fijarFicha({ acento: v === "ninguno" ? "" : v })}
                                            >
                                                <SelectTrigger id="voz-acento" className="cursor-pointer">
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="ninguno">Ninguno</SelectItem>
                                                    {VOCABULARIO_INSTRUCT.acento.map((a) => (
                                                        <SelectItem key={a} value={a}>{etiquetaToken(a)}</SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                            <p className="text-xs text-muted-foreground">
                                                Solo tiene efecto cuando el servidor habla inglés.
                                            </p>
                                        </div>
                                        {ignoradosInstruct.length > 0 && (
                                            <p className="text-xs text-amber-500">
                                                El motor ignoraría: {ignoradosInstruct.join(", ")}
                                            </p>
                                        )}
                                    </div>

                                    {/* (Ola 264 · G3) Emoción base e intensidad. La emoción es
                                        una CAPA sobre el perfil neuronal (mismo timbre, otro
                                        matiz): se elige con fichas del catálogo `EMOCIONES`,
                                        se exagera con un deslizador 0-2 y la línea gris de
                                        abajo muestra el efecto real que oirá el motor. */}
                                    <div className="space-y-3 rounded-lg border p-3">
                                        <p className="text-sm font-medium leading-none">Emoción base</p>
                                        <p className="text-xs text-muted-foreground">
                                            Capa sobre el perfil: misma voz, distinto matiz.
                                        </p>
                                        <div className="flex flex-wrap gap-1.5">
                                            {ORDEN_EMOCIONES.map((clave) => {
                                                const meta = EMOCIONES[clave];
                                                const activo = (borrador.emocionBase ?? "neutra") === clave;
                                                const esNeutro = clave === "neutra";
                                                return (
                                                    <button
                                                        key={clave}
                                                        type="button"
                                                        title={meta.desc}
                                                        aria-pressed={activo}
                                                        onClick={() =>
                                                            cambiar(
                                                                esNeutro
                                                                    ? { emocionBase: undefined, intensidad: undefined }
                                                                    : { emocionBase: clave },
                                                            )
                                                        }
                                                        className={`cursor-pointer rounded-full border px-2.5 py-1 text-xs transition-colors duration-200 ${
                                                            activo
                                                                ? "border-primary/60 bg-primary/10 text-foreground"
                                                                : "border-border text-muted-foreground hover:bg-muted/60"
                                                        }`}
                                                    >
                                                        {meta.nombre}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                        <div className="space-y-1.5">
                                            <div className="flex items-center justify-between">
                                                <Label htmlFor="voz-intensidad">Intensidad (0–2, 1 = de manual)</Label>
                                                <span className="text-xs tabular-nums text-muted-foreground">
                                                    {(borrador.intensidad ?? 1).toFixed(1)}
                                                </span>
                                            </div>
                                            <Slider
                                                id="voz-intensidad"
                                                aria-label="Intensidad de la emoción"
                                                value={[borrador.intensidad ?? 1]}
                                                min={0}
                                                max={2}
                                                step={0.1}
                                                onValueChange={(v) =>
                                                    cambiar({ intensidad: v[0] ?? 1 })
                                                }
                                                className="cursor-pointer"
                                            />
                                            <p className="text-xs text-muted-foreground">
                                                Escala la desviación: 0 = sin marca, 2 = caricatura.
                                            </p>
                                        </div>
                                        {efectoCalculado && (
                                            <p className="text-xs leading-relaxed text-muted-foreground">
                                                velocidad ×{efectoCalculado.factorSpeed.toFixed(2)} · tono ×
                                                {efectoCalculado.factorPitch.toFixed(2)} · instruct:{" "}
                                                <span className="text-foreground/80">
                                                    {efectoCalculado.instruct.trim() || "—"}
                                                </span>
                                            </p>
                                        )}
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
                                                    // (Ola 263 · F6) Tono del post-proceso local: 1 = natural;
                                                    // acotado igual que en `perfilNeuronal` ([0.7, 1.4]).
                                                    clave: "tono",
                                                    titulo: "Tono (1 = natural)",
                                                    valor: borrador.local.pitch ?? 1,
                                                    min: 0.7,
                                                    max: 1.4,
                                                    paso: 0.02,
                                                    aplicar: (x: number) =>
                                                        cambiar({ local: { ...borrador.local, pitch: x } }),
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
                                                    step={"paso" in s ? s.paso : 0.01}
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

                                    {/* (Ola 264 · G3) Vista previa de lo que oirá el motor:
                                        bloque plegable con el texto normalizado por
                                        `normalizarParaVoz` (J1). Si difiere del original
                                        aparece marcado; si J1 aún no entró, se ve el
                                        original sin la marca «normalizado». */}
                                    {textoNormalizado && (
                                        <div className="rounded-lg border bg-muted/30">
                                            <button
                                                type="button"
                                                onClick={() => setVistaPreviaAbierta((v) => !v)}
                                                aria-expanded={vistaPreviaAbierta}
                                                aria-controls="voz-vista-previa-motor"
                                                className="flex w-full cursor-pointer items-center justify-between gap-2 px-3 py-2 text-left text-sm font-medium"
                                            >
                                                <span>Vista previa de lo que oirá el motor</span>
                                                <ChevronDown
                                                    className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 ${
                                                        vistaPreviaAbierta ? "rotate-180" : ""
                                                    }`}
                                                />
                                            </button>
                                            {vistaPreviaAbierta && (
                                                <div
                                                    id="voz-vista-previa-motor"
                                                    className="space-y-2 border-t px-3 py-2 text-xs"
                                                >
                                                    <p className="text-muted-foreground">Original</p>
                                                    <p className="rounded bg-background/60 p-2 font-mono text-foreground/90">
                                                        {textoNormalizado.original}
                                                    </p>
                                                    <div className="flex items-center justify-between">
                                                        <p className="text-muted-foreground">Lo que oirá el motor</p>
                                                        {textoNormalizado.disponible ? (
                                                            textoNormalizado.difiere ? (
                                                                <Badge variant="secondary">normalizado</Badge>
                                                            ) : (
                                                                <span className="text-muted-foreground">sin cambios</span>
                                                            )
                                                        ) : (
                                                            <span className="text-muted-foreground">
                                                                normalizador no disponible
                                                            </span>
                                                        )}
                                                    </div>
                                                    <p className="rounded bg-background/60 p-2 font-mono text-foreground/90">
                                                        {textoNormalizado.normalizado}
                                                    </p>
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    <div className="flex flex-wrap gap-2">
                                        <Button type="button" onClick={() => probar(false)} className="cursor-pointer">
                                            <Play className="mr-1.5 h-4 w-4" /> Probar
                                        </Button>
                                        <Button
                                            type="button"
                                            variant="secondary"
                                            onClick={() => probar(true)}
                                            className="cursor-pointer"
                                            title="Antepone [emoción intensidad] al texto para ejercitar el camino de la etiqueta"
                                        >
                                            <Tag className="mr-1.5 h-4 w-4" /> Probar con etiqueta
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
