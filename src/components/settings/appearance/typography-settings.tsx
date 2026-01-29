"use client";

import React from "react";
import { useAppearance } from "@/context/appearance-context";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { Check } from "lucide-react";

const fonts = [
    { value: "Inter", label: "Inter", desc: "Clean & Modern" },
    { value: "Roboto", label: "Roboto", desc: "Geometric" },
    { value: "Outfit", label: "Outfit", desc: "Stylish Round" },
    { value: "Space Grotesk", label: "Space", desc: "Tech & Mono" },
    { value: "Source Code Pro", label: "Code", desc: "Monospaced" },
    { value: "System", label: "System", desc: "Native UI" },
];

export function TypographySettings() {
    const { config, updateSection } = useAppearance();

    const handleFontChange = (value: string) => {
        updateSection("typography", { fontFamily: value });
    };

    const handleScaleChange = (value: number[]) => {
        updateSection("typography", { fontSizeScale: value[0] });
    };

    return (
        <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
            <Card className="h-full">
                <CardHeader>
                    <CardTitle>Tipografía Principal</CardTitle>
                    <CardDescription>Define la voz visual de la aplicación.</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                        {fonts.map((f) => {
                            const isActive = config.typography.fontFamily === f.value;
                            const fontStyle = f.value === "System" ? "system-ui" : f.value;
                            // Map display font variable for preview if loaded, else fallback to name
                            // Actually, the context maps the name to the variable, so we can't easily access the variable strictly here without duplication. 
                            // But relying on the name "Inter" works if it's installed locally or loaded. 
                            // For the Google Fonts, we need to rely on the classNames or just the raw name if it matches.
                            // Since we put the font mapping in layout.tsx css vars, we can try to use those variables?
                            // Actually, let's just use the raw name, assuming potential flash of unstyled text isn't a huge deal in settings preview.

                            return (
                                <div
                                    key={f.value}
                                    onClick={() => handleFontChange(f.value)}
                                    className={cn(
                                        "cursor-pointer rounded-xl border-2 p-4 transition-all hover:bg-accent relative overflow-hidden",
                                        isActive ? "border-primary bg-primary/5" : "border-transparent bg-muted/30 hover:border-muted-foreground/30"
                                    )}
                                >
                                    {isActive && (
                                        <div className="absolute top-2 right-2 text-primary">
                                            <Check className="w-4 h-4" />
                                        </div>
                                    )}
                                    <div className="flex flex-col gap-2">
                                        <span
                                            className="text-2xl font-bold"
                                            style={{ fontFamily: fontStyle }} // Direct style application
                                        >
                                            Aa
                                        </span>
                                        <div>
                                            <p className="font-semibold text-sm" style={{ fontFamily: fontStyle }}>{f.label}</p>
                                            <p className="text-xs text-muted-foreground">{f.desc}</p>
                                        </div>
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Escala y Legibilidad</CardTitle>
                </CardHeader>
                <CardContent className="space-y-8">
                    <div className="space-y-4">
                        <div className="flex justify-between items-center">
                            <Label>Tamaño Base</Label>
                            <span className="text-sm font-mono bg-muted px-2 py-1 rounded">{config.typography.fontSizeScale}x</span>
                        </div>
                        <Slider
                            min={0.8}
                            max={1.2}
                            step={0.05}
                            value={[config.typography.fontSizeScale]}
                            onValueChange={handleScaleChange}
                        />
                        <div className="flex justify-between text-xs text-muted-foreground">
                            <span>Compacto</span>
                            <span>Cómodo</span>
                        </div>
                    </div>

                    <div className="rounded-lg bg-muted/30 p-4 border border-dashed">
                        <p className="text-sm text-muted-foreground mb-2">Vista Previa</p>
                        <div style={{ fontSize: `${config.typography.fontSizeScale}em` }}>
                            <h4 className="font-bold mb-1">El veloz murciélago</h4>
                            <p className="text-muted-foreground leading-relaxed">
                                Come feliz cardillo y kiwi. La cigüeña tocaba el saxofón detrás del palenque de paja.
                            </p>
                        </div>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
