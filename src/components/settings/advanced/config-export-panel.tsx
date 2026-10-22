"use client";

/*
 * Ajustes → Avanzado → "Exportar / importar configuración completa".
 * ----------------------------------------------------------------------
 * A diferencia de exportTheme/importTheme (appearance-context.tsx), que
 * solo mueven el AppearanceConfig, este panel exporta/importa TODAS las
 * claves relevantes de localStorage — reutiliza SYNCED_KEYS de
 * settings-sync.ts como fuente única de verdad (no se duplica la lista).
 *
 * Formato del archivo: { version: 1, exportedAt: ISOString, data: { [key]: valor } }
 *
 * Patrón de import de archivo calcado de theme-selector.tsx
 * (fileInputRef + <input type="file" hidden> + handleFileChange).
 * Patrón de "recarga tras importar" calcado de account-sync-panel.tsx
 * (toast.success + setTimeout(reload, 900)).
 */

import React, { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download, Upload, RotateCcw, FileJson, ShieldAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { SYNCED_KEYS } from "@/lib/settings-sync";
import {
    VERSION_ENTORNO,
    aplicar,
    capturarEntorno,
    diferencia,
    duplicarEntorno,
    revisarEntorno,
    type EntornoCompleto,
} from "@/lib/nucleo/entorno-completo";
import { empaquetar, type PaqueteSistema } from "@/lib/nucleo/paquete-sistema";
import { validarUiSpec } from "@/lib/nucleo/ui-spec";
import { validarContraInvariantes } from "@/lib/nucleo/invariantes";

interface ExportedConfigFile {
    version: typeof VERSION_ENTORNO;
    exportedAt: string;
    data: Record<string, unknown>;
}

/** Guardianes reales del núcleo: el panel exporta/importa en el cliente, donde
 *  `ArranqueNucleo` ya los tiene registrados; pasarlos explícitos evita que la
 *  revisión caiga en el fallo cerrado si el panel se monta aislado. */
const DEPENDENCIAS_NUCLEO = { validarUiSpec, validarContraInvariantes };

/** Paquete que acompaña a la configuración exportada. No pide permisos ni
 *  trae interfaz: solo da forma revisable a un entorno de ajustes del sistema. */
function paqueteDelEntorno(nombre: string): PaqueteSistema {
    const ahora = Date.now();
    return empaquetar(
        {
            nombre,
            autor: { perfil: "local", nombre: "Este dispositivo" },
            uiSpec: {
                version: 1,
                superficie: "os:ajustes",
                titulo: "Configuración del sistema",
                bloques: [],
            },
            permisosPedidos: [],
            requiere: [],
        },
        ahora,
        `entorno-${ahora}`,
    );
}

function lectorLocal() {
    return { leer: (clave: string): string | null => window.localStorage.getItem(clave) };
}

/** Cuenta cuántas de SYNCED_KEYS tienen valor no-null en localStorage ahora mismo. */
function countAvailableKeys(): number {
    if (typeof window === "undefined") return 0;
    let count = 0;
    for (const key of SYNCED_KEYS) {
        if (window.localStorage.getItem(key) != null) count++;
    }
    return count;
}

export function ConfigExportPanel() {
    const confirm = useConfirm();
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [busy, setBusy] = useState<"export" | "import" | "reset" | null>(null);
    // Recalculado en cada render — refleja el estado actual de localStorage sin
    // necesidad de un efecto extra (el panel es ligero y se abre poco).
    const availableCount = useMemo(() => countAvailableKeys(), [busy]);

    const handleExportClick = () => {
        setBusy("export");
        try {
            const ahora = new Date();
            const nombre = `starseed_config_${ahora.toISOString().slice(0, 10)}`;
            const capturado = capturarEntorno(lectorLocal(), paqueteDelEntorno(nombre), []);
            const copia = duplicarEntorno(capturado, nombre);
            const revision = revisarEntorno(copia, DEPENDENCIAS_NUCLEO);
            if (!revision.instalable) {
                toast.error("No se exporta: la configuración lleva secretos o claves prohibidas.", {
                    description: revision.motivos.join(" · "),
                });
                return;
            }
            const file: ExportedConfigFile = {
                version: VERSION_ENTORNO,
                exportedAt: ahora.toISOString(),
                data: copia.ajustes,
            };
            const blob = new Blob([JSON.stringify(file, null, 2)], { type: "application/json" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `${nombre}.json`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(url);
            toast.success(`Configuración exportada (${Object.keys(file.data).length} claves).`);
        } catch (e: unknown) {
            toast.error(`Error al exportar: ${e instanceof Error ? e.message : String(e)}`);
        } finally {
            setBusy(null);
        }
    };

    const handleImportClick = () => {
        fileInputRef.current?.click();
    };

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setBusy("import");
        try {
            const text = await file.text();
            const parsed: unknown = JSON.parse(text);

            if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
                toast.error("Archivo inválido: falta el campo «data» con la configuración.");
                return;
            }
            const datos = (parsed as { data?: unknown }).data;
            if (!datos || typeof datos !== "object" || Array.isArray(datos)) {
                toast.error("Archivo inválido: falta el campo «data» con la configuración.");
                return;
            }

            const nombre = `importado_${new Date().toISOString().slice(0, 10)}`;
            const entrada: EntornoCompleto = {
                version: VERSION_ENTORNO,
                nombre,
                paquete: paqueteDelEntorno(nombre),
                ajustes: datos as Record<string, unknown>,
                volumenes: [],
            };
            const revision = revisarEntorno(entrada, DEPENDENCIAS_NUCLEO);
            if (!revision.instalable) {
                toast.error("El archivo no se importa: lleva secretos o claves prohibidas.", {
                    description: revision.motivos.join(" · "),
                });
                return;
            }

            const actual = capturarEntorno(lectorLocal(), paqueteDelEntorno("actual"), []);
            const diferencias = diferencia(actual, entrada);
            const { cambios: applied, omitidas } = aplicar(entrada, {
                leer: (clave: string) => window.localStorage.getItem(clave),
                escribir: (clave: string, valor: unknown) => {
                    if (valor === null) window.localStorage.removeItem(clave);
                    else window.localStorage.setItem(clave, typeof valor === "string" ? valor : JSON.stringify(valor));
                },
            });

            if (applied.length === 0) {
                toast.error("No se encontró ninguna clave conocida en el archivo.");
                return;
            }

            const resumen = [
                `${diferencias.anadidas.length} nuevas`,
                `${diferencias.cambiadas.length} cambiadas`,
            ].join(", ");
            toast.success(
                `Configuración importada (${applied.length} claves${omitidas.length > 0 ? `, ${omitidas.length} ignoradas` : ""}).`,
                { description: `${resumen}. Recargando para aplicar tus ajustes…` }
            );
            setTimeout(() => window.location.reload(), 900);
        } catch (error: unknown) {
            console.error(error);
            toast.error(`Error al leer el archivo: ${error instanceof Error ? error.message : "formato JSON inválido"}`);
        } finally {
            setBusy(null);
            if (fileInputRef.current) fileInputRef.current.value = "";
        }
    };

    const handleResetAll = async () => {
        const confirmed = await confirm({
            title: "Restablecer todo a valores de fábrica",
            description:
                "Esto borrará permanentemente tu apariencia, dock, Trinity, memoria del Exocórtex y el resto de preferencias sincronizadas en ESTE dispositivo. Esta acción no se puede deshacer. ¿Quieres continuar?",
            destructive: true,
        });
        if (!confirmed) return;

        setBusy("reset");
        try {
            for (const key of SYNCED_KEYS) {
                window.localStorage.removeItem(key);
            }
            toast.success("Configuración restablecida a valores de fábrica.", {
                description: "Recargando…",
            });
            setTimeout(() => window.location.reload(), 900);
        } catch (e: any) {
            toast.error(`Error al restablecer: ${e?.message ?? e}`);
            setBusy(null);
        }
    };

    return (
        <Card className="bg-background/40 backdrop-blur-sm border-0 shadow-none">
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <FileJson className="w-5 h-5 text-primary" />
                    Exportar / importar configuración completa
                </CardTitle>
                <CardDescription>
                    A diferencia de la exportación de tema (solo apariencia), esto descarga
                    o restaura TODAS tus preferencias del sistema — apariencia, dock, Trinity,
                    Aurora, neuronas, biblioteca y memoria del Exocórtex — en un único archivo
                    JSON portátil.
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="flex items-center gap-2.5 p-3 rounded-xl border border-border/50 bg-card/30 text-xs">
                    <span className="grid place-items-center w-7 h-7 rounded-lg bg-primary/10 border border-primary/20 text-primary shrink-0">
                        <FileJson className="w-3.5 h-3.5" />
                    </span>
                    <span className="text-muted-foreground">
                        <span className="font-semibold text-foreground">{availableCount}</span> de{" "}
                        {SYNCED_KEYS.length} claves detectadas en este dispositivo, listas para exportar.
                    </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Button
                        type="button"
                        variant="outline"
                        disabled={busy !== null}
                        onClick={handleExportClick}
                        className={cn(
                            "gap-2 justify-center cursor-pointer border-primary/40 bg-primary/10 hover:bg-primary/20 text-primary",
                            busy !== null && "opacity-50 cursor-not-allowed"
                        )}
                    >
                        <Download className={cn("w-4 h-4", busy === "export" && "animate-pulse")} />
                        {busy === "export" ? "Exportando…" : "Exportar configuración (.json)"}
                    </Button>

                    <div className="relative">
                        <input
                            type="file"
                            ref={fileInputRef}
                            onChange={handleFileChange}
                            accept=".json"
                            className="hidden"
                        />
                        <Button
                            type="button"
                            variant="outline"
                            disabled={busy !== null}
                            onClick={handleImportClick}
                            className={cn(
                                "w-full gap-2 justify-center cursor-pointer border-border/60 bg-card/40 hover:bg-card/70",
                                busy !== null && "opacity-50 cursor-not-allowed"
                            )}
                        >
                            <Upload className={cn("w-4 h-4", busy === "import" && "animate-pulse")} />
                            {busy === "import" ? "Importando…" : "Importar configuración (.json)"}
                        </Button>
                    </div>
                </div>

                <div className="pt-2 border-t border-border/40">
                    <div className="flex items-start gap-2.5 mb-3">
                        <ShieldAlert className="w-4 h-4 text-destructive/80 shrink-0 mt-0.5" />
                        <p className="text-[11px] text-muted-foreground leading-relaxed">
                            Restablecer borra permanentemente todas tus preferencias locales
                            (apariencia, dock, Trinity, Aurora, memoria) en este dispositivo. No
                            afecta a otros dispositivos ni a copias ya sincronizadas en tu cuenta.
                        </p>
                    </div>
                    <Button
                        type="button"
                        variant="outline"
                        disabled={busy !== null}
                        onClick={handleResetAll}
                        className={cn(
                            "w-full gap-2 justify-center cursor-pointer border-destructive/40 bg-destructive/5 text-destructive hover:bg-destructive/10",
                            busy !== null && "opacity-50 cursor-not-allowed"
                        )}
                    >
                        <RotateCcw className={cn("w-4 h-4", busy === "reset" && "animate-pulse")} />
                        {busy === "reset" ? "Restableciendo…" : "Restablecer TODO a valores de fábrica"}
                    </Button>
                </div>

                <details className="text-[11px] text-muted-foreground">
                    <summary className="cursor-pointer hover:text-foreground transition-colors">
                        ¿Qué incluye el archivo exportado?
                    </summary>
                    <ul className="mt-2 grid gap-1 pl-1">
                        <li>· Apariencia completa (tema, fondos, cristal, tipografía, Trinity táctil)</li>
                        <li>· OmniDock personalizado y botón Trinity (posición y visibilidad)</li>
                        <li>· Aurora: voz, canales, visión y neuronas (dispositivos)</li>
                        <li>· Biblioteca instalada, réplicas propias y ramas publicadas</li>
                        <li>· Memoria del Exocórtex (intereses y rasgos)</li>
                        <li className="opacity-60 font-mono">
                            {SYNCED_KEYS.length} claves conocidas · el resto se ignora al importar
                        </li>
                    </ul>
                </details>
            </CardContent>
        </Card>
    );
}
