"use client";

import React from "react";
import { useAppearance } from "@/context/appearance-context";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
    PanelLeft, PanelTop, PanelRight, PanelBottom,
    LayoutDashboard, AppWindow,
    Circle, Hexagon, Square
} from "lucide-react";
import { cn } from "@/lib/utils";

export function LayoutSettings() {
    const { config, updateSection } = useAppearance();

    return (
        <div className="grid gap-6 md:grid-cols-2">
            <Card>
                <CardHeader>
                    <CardTitle>Posición del Menú</CardTitle>
                    <CardDescription>Elige dónde quieres que aparezca la navegación principal.</CardDescription>
                </CardHeader>
                <CardContent>
                    <RadioGroup
                        defaultValue={config.layout.menuPosition}
                        onValueChange={(val: any) => updateSection("layout", { menuPosition: val })}
                        className="grid grid-cols-2 gap-4"
                    >
                        {[
                            { value: "left", label: "Izquierda", icon: PanelLeft },
                            { value: "top", label: "Superior", icon: PanelTop },
                            { value: "right", label: "Derecha", icon: PanelRight },
                            { value: "bottom", label: "Inferior", icon: PanelBottom },
                        ].map((opt) => (
                            <div key={opt.value}>
                                <RadioGroupItem value={opt.value} id={`pos-${opt.value}`} className="peer sr-only" />
                                <Label
                                    htmlFor={`pos-${opt.value}`}
                                    className="flex flex-col items-center justify-between rounded-lg border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary peer-data-[state=checked]:text-primary transition-all cursor-pointer"
                                >
                                    <opt.icon className="mb-3 h-8 w-8" strokeWidth={1.5} />
                                    <span className="text-sm font-medium">{opt.label}</span>
                                </Label>
                            </div>
                        ))}
                    </RadioGroup>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Estilo de Interfaz</CardTitle>
                    <CardDescription>Personaliza la apariencia de los elementos.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-8">

                    <div className="space-y-4">
                        <Label className="text-base">Estilo de Menú</Label>
                        <RadioGroup
                            defaultValue={config.layout.menuStyle}
                            onValueChange={(val: any) => updateSection("layout", { menuStyle: val })}
                            className="grid grid-cols-2 gap-4"
                        >
                            {[
                                { value: "sidebar", label: "Expandido", icon: LayoutDashboard, desc: "Menú completo tradicional" },
                                { value: "dock", label: "Flotante", icon: AppWindow, desc: "Barra moderna tipo Dock" },
                            ].map((opt) => (
                                <div key={opt.value}>
                                    <RadioGroupItem value={opt.value} id={`style-${opt.value}`} className="peer sr-only" />
                                    <Label
                                        htmlFor={`style-${opt.value}`}
                                        className="flex flex-col items-start space-y-2 rounded-lg border p-4 hover:bg-accent peer-data-[state=checked]:border-primary transition-all cursor-pointer h-full"
                                    >
                                        <div className="flex w-full items-center justify-between">
                                            <opt.icon className="h-5 w-5 text-primary" />
                                        </div>
                                        <div className="space-y-1">
                                            <p className="font-medium leading-none">{opt.label}</p>
                                            <p className="text-xs text-muted-foreground">
                                                {opt.desc}
                                            </p>
                                        </div>
                                    </Label>
                                </div>
                            ))}
                        </RadioGroup>
                    </div>

                    <div className="space-y-4">
                        <Label className="text-base">Estilo de Iconos</Label>
                        <RadioGroup
                            defaultValue={config.layout.iconStyle}
                            onValueChange={(val: any) => updateSection("layout", { iconStyle: val })}
                            className="grid grid-cols-3 gap-2"
                        >
                            {[
                                { value: "outline", label: "Línea", icon: Circle, fill: "transparent" },
                                { value: "solid", label: "Sólido", icon: Circle, fill: "currentColor" },
                                { value: "thin", label: "Fino", icon: Circle, fill: "none", strokeWidth: 1 },
                            ].map((opt) => (
                                <div key={opt.value}>
                                    <RadioGroupItem value={opt.value} id={`icon-${opt.value}`} className="peer sr-only" />
                                    <Label
                                        htmlFor={`icon-${opt.value}`}
                                        className="flex flex-col items-center justify-center rounded-md border p-3 hover:bg-accent peer-data-[state=checked]:bg-primary/10 peer-data-[state=checked]:border-primary transition-all cursor-pointer"
                                    >
                                        <opt.icon
                                            className="h-6 w-6 mb-2"
                                            fill={opt.fill}
                                            strokeWidth={opt.strokeWidth}
                                        />
                                        <span className="text-xs">{opt.label}</span>
                                    </Label>
                                </div>
                            ))}
                        </RadioGroup>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
