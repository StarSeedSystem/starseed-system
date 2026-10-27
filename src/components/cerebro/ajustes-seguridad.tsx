"use client";

/** Pestaña Seguridad y privacidad de los ajustes del cerebro. */
import React from "react";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { APLICACION, AJUSTES_POR_DEFECTO, type AjustesObjetivo } from "@/lib/cerebros/ajustes";

type NivelObjetivo = "cerebro" | "memoria" | "carpeta";

interface AjustesSeguridadProps {
    valor: AjustesObjetivo;
    onCambio: (parcial: Partial<AjustesObjetivo>) => void;
    nivel: NivelObjetivo;
}

function MarcaAplicacion({ texto }: { texto: "se-aplica" | "solo-se-guarda" }) {
    return (
        <span className={cn(
            "text-[11px] px-2 py-0.5 rounded border",
            texto === "se-aplica" 
                ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/30" 
                : "bg-amber-500/15 text-amber-300 border-amber-500/30"
        )}>
            {texto === "se-aplica" ? "Se aplica ya" : "Solo se guarda por ahora"}
        </span>
    );
}

function BotonOpcion({ 
    activo, 
    etiqueta,
    onClick,
    ariaPressed 
}: { 
    activo: boolean; 
    etiqueta: string;
    onClick: () => void;
    ariaPressed: boolean;
}) {
    return (
        <button
            type="button"
            role="button"
            aria-pressed={ariaPressed}
            aria-label={etiqueta}
            onClick={onClick}
            className={cn(
                "px-3 py-1.5 rounded-lg text-sm font-medium transition-all",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                activo 
                    ? "bg-white/10 text-white border-white/20" 
                    : "text-white/70 hover:bg-white/5 hover:text-white"
            )}
        >
            {etiqueta}
        </button>
    );
}

function formatearQuien(quien: string): string {
    const [tipo, ...resto] = quien.split(":");
    const nombre = resto.join(":") || quien;
    const tipoLabel = tipo === "account" ? "Cuenta" : tipo === "profile" ? "Perfil" : tipo === "group" ? "Grupo" : tipo;
    return `${tipoLabel} · ${nombre}`;
}

function getMarca(nivel: NivelObjetivo, clave: keyof typeof APLICACION): "se-aplica" | "solo-se-guarda" {
    if (nivel !== "cerebro") return "solo-se-guarda";
    if (clave === "privacidad") return "se-aplica";
    if (clave === "cifradoLocal") return "solo-se-guarda";
    if (clave === "acceso") return "solo-se-guarda";
    return APLICACION[clave];
}

export function AjustesSeguridad({ valor, onCambio, nivel }: AjustesSeguridadProps) {
    const esCerebro = nivel === "cerebro";

    const handlePrivacidadChange = (nuevaPrivacidad: "privado" | "perfil" | "grupo" | "publico") => {
        onCambio({ privacidad: nuevaPrivacidad });
    };

    const handleCifradoChange = (checked: boolean) => {
        onCambio({ cifradoLocal: checked });
    };

    const handleNivelChange = (idx: number, nuevoNivel: "leer" | "escribir" | "admin") => {
        const nuevos = [...valor.acceso];
        nuevos[idx] = { ...nuevos[idx], nivel: nuevoNivel };
        onCambio({ acceso: nuevos });
    };

    const handleQuitar = (idx: number) => {
        const nuevos = valor.acceso.filter((_, i) => i !== idx);
        onCambio({ acceso: nuevos });
    };

    return (
        <div className="space-y-6">
            <section className="space-y-4">
                <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-sm font-semibold text-white/80 uppercase tracking-wide">Privacidad</h3>
                    <MarcaAplicacion texto={getMarca(nivel, "privacidad")} />
                </div>
                <p className="text-xs text-white/50">
                    Define quién puede ver el contenido. 
                    {esCerebro ? "En cerebros de grupo/comunidad, «grupo» permite a los miembros." : ""}
                </p>
                <div className="flex flex-wrap gap-2" role="group" aria-label="Nivel de privacidad">
                    {(["privado", "perfil", "grupo", "publico"] as const).map((opcion) => {
                        const etiqueta = opcion.charAt(0).toUpperCase() + opcion.slice(1);
                        return (
                            <BotonOpcion
                                key={opcion}
                                activo={valor.privacidad === opcion}
                                ariaPressed={valor.privacidad === opcion}
                                onClick={() => handlePrivacidadChange(opcion)}
                                etiqueta={etiqueta}
                            />
                        );
                    })}
                </div>
                {esCerebro && (
                    <p className="text-xs text-cyan-300/80">
                        Con Compartir o Telepatía lo leen quienes tengan permiso; escribir sigue siendo solo tuyo.
                    </p>
                )}
                {!esCerebro && (
                    <p className="text-xs text-white/50" id="lectura-compartida-memoria">
                        La lectura compartida es por cerebro entero (§9a).
                    </p>
                )}
            </section>

            <section className="space-y-4 pt-4 border-t border-white/10">
                <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-sm font-semibold text-white/80 uppercase tracking-wide">Cifrado local</h3>
                    <MarcaAplicacion texto={getMarca(nivel, "cifradoLocal")} />
                </div>
                <p className="text-xs text-white/50">
                    Cifra el contenido en este dispositivo antes de sincronizar. La clave nunca sale de tu equipo.
                </p>
                <div className="flex items-center gap-3">
                    <Switch
                        checked={valor.cifradoLocal}
                        onCheckedChange={handleCifradoChange}
                    />
                    <Label className="text-sm text-white/90">Activar cifrado local</Label>
                </div>
            </section>

            <section className="space-y-4 pt-4 border-t border-white/10">
                <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-sm font-semibold text-white/80 uppercase tracking-wide">Accesos (quién puede hacer qué)</h3>
                    <MarcaAplicacion texto={getMarca(nivel, "acceso")} />
                </div>
                <p className="text-xs text-white/50">
                    Lista de cuentas, perfiles o grupos con permisos específicos. Se guarda por ahora; 
                    {esCerebro ? "la lectura compartida se aplica (§9a)." : ""}
                </p>
                <div className="space-y-2">
                    {valor.acceso.map((a, idx) => (
                        <div key={idx} className="flex items-center gap-2 flex-wrap">
                            <Label 
                                htmlFor={`nivel-${idx}`} 
                                className="text-xs text-white/70 whitespace-nowrap cursor-pointer"
                                id={`label-${idx}`}
                            >
                                Nivel de {formatearQuien(a.quien)}
                            </Label>
                            <Select value={a.nivel} onValueChange={(v) => handleNivelChange(idx, v as "leer" | "escribir" | "admin")} id={`nivel-${idx}`} aria-labelledby={`label-${idx}`}>
                                <SelectTrigger className="w-36">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="leer">Leer</SelectItem>
                                    <SelectItem value="escribir">Escribir</SelectItem>
                                    <SelectItem value="admin">Admin</SelectItem>
                                </SelectContent>
                            </Select>
                            <Button variant="ghost" size="icon" onClick={() => handleQuitar(idx)} aria-label={`Quitar ${formatearQuien(a.quien)}`}>
                                ✕
                            </Button>
                        </div>
                    ))}
                    <div className="flex items-center gap-2" role="group" aria-label="Añadir acceso">
                        <Select value="" onValueChange={(_v) => {}} placeholder="Tipo" aria-label="Tipo de quien entra">
                            <SelectTrigger className="w-32">
                                <SelectValue placeholder="Tipo" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="account">Cuenta</SelectItem>
                                <SelectItem value="profile">Perfil</SelectItem>
                                <SelectItem value="group">Grupo</SelectItem>
                            </SelectContent>
                        </Select>
                        <Input
                            placeholder="Id o nombre"
                            className="w-32"
                            id="nuevo-quien"
                            aria-label="Id o nombre"
                        />
                        <Select value="leer" onValueChange={(_v) => {}} placeholder="Nivel" aria-label="Nivel nuevo">
                            <SelectTrigger className="w-28">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="leer">Leer</SelectItem>
                                <SelectItem value="escribir">Escribir</SelectItem>
                                <SelectItem value="admin">Admin</SelectItem>
                            </SelectContent>
                        </Select>
                        <Button variant="outline" size="sm" disabled aria-label="Añadir">
                            Añadir
                        </Button>
                    </div>
                </div>
            </section>
        </div>
    );
}