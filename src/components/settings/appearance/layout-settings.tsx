"use client";

import React from "react";
import { useAppearance } from "@/context/appearance-context";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import {
    PanelLeft, PanelTop, PanelRight, PanelBottom,
    LayoutDashboard, AppWindow,
    Circle, Smartphone, Monitor, Glasses, Box,
    Hand, Lock, Vibrate, Eye, Minimize2,
    Tablet, MonitorSmartphone, Tv, Columns, SplitSquareHorizontal,
    PanelLeftClose, LayoutGrid, Pin, Move, RefreshCw,
    ArrowLeftRight, ArrowUpDown, Palette, Film,
    Menu, ChevronDown, Maximize2, PanelRightOpen, Layers,
    ArrowDownUp, GripVertical, EyeOff, MousePointerClick, Bot
} from "lucide-react";
import { cn } from "@/lib/utils";

export function LayoutSettings() {
    const { config, updateSection } = useAppearance();

    return (
        <div className="grid gap-6 md:grid-cols-2">
            {/* Menu Position Card */}
            <Card>
                <CardHeader>
                    <CardTitle>Posición del Menú</CardTitle>
                    <CardDescription>Elige dónde quieres que aparezca la navegación principal.</CardDescription>
                </CardHeader>
                <CardContent>
                    <RadioGroup
                        value={config.layout.menuPosition}
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

            {/* Interface Style Card */}
            <Card>
                <CardHeader>
                    <CardTitle>Estilo de Interfaz</CardTitle>
                    <CardDescription>Personaliza la apariencia de los elementos.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    <div className="space-y-3">
                        <Label className="text-base">Estilo de Menú</Label>
                        <RadioGroup
                            value={config.layout.menuStyle}
                            onValueChange={(val: any) => updateSection("layout", { menuStyle: val })}
                            className="grid grid-cols-2 gap-3"
                        >
                            {[
                                { value: "sidebar", label: "Expandido", icon: LayoutDashboard, desc: "Tradicional" },
                                { value: "dock", label: "Flotante", icon: AppWindow, desc: "Tipo Dock" },
                            ].map((opt) => (
                                <div key={opt.value}>
                                    <RadioGroupItem value={opt.value} id={`style-${opt.value}`} className="peer sr-only" />
                                    <Label
                                        htmlFor={`style-${opt.value}`}
                                        className="flex flex-col items-start space-y-1 rounded-lg border p-3 hover:bg-accent peer-data-[state=checked]:border-primary transition-all cursor-pointer h-full"
                                    >
                                        <opt.icon className="h-5 w-5 text-primary" />
                                        <p className="font-medium text-sm">{opt.label}</p>
                                        <p className="text-[10px] text-muted-foreground">{opt.desc}</p>
                                    </Label>
                                </div>
                            ))}
                        </RadioGroup>
                    </div>

                    <div className="space-y-3">
                        <Label className="text-base">Comportamiento</Label>
                        <RadioGroup
                            value={config.layout.menuBehavior}
                            onValueChange={(val: any) => updateSection("layout", { menuBehavior: val })}
                            className="grid grid-cols-3 gap-2"
                        >
                            {[
                                { value: "sticky", label: "Fijo" },
                                { value: "static", label: "Normal" },
                                { value: "smart", label: "Auto" },
                            ].map((opt) => (
                                <div key={opt.value}>
                                    <RadioGroupItem value={opt.value} id={`beh-${opt.value}`} className="peer sr-only" />
                                    <Label
                                        htmlFor={`beh-${opt.value}`}
                                        className="flex items-center justify-center p-2 rounded-md border text-center hover:bg-accent peer-data-[state=checked]:bg-primary/10 peer-data-[state=checked]:border-primary transition-all cursor-pointer"
                                    >
                                        <span className="font-medium text-xs">{opt.label}</span>
                                    </Label>
                                </div>
                            ))}
                        </RadioGroup>
                    </div>

                    <div className="space-y-3">
                        <Label className="text-base">Iconos</Label>
                        <RadioGroup
                            value={config.layout.iconStyle}
                            onValueChange={(val: any) => updateSection("layout", { iconStyle: val })}
                            className="grid grid-cols-3 gap-2"
                        >
                            {[
                                { value: "outline", label: "Línea", fill: "transparent", sw: 1.5 },
                                { value: "solid", label: "Sólido", fill: "currentColor", sw: 1.5 },
                                { value: "thin", label: "Fino", fill: "none", sw: 1 },
                            ].map((opt) => (
                                <div key={opt.value}>
                                    <RadioGroupItem value={opt.value} id={`icon-${opt.value}`} className="peer sr-only" />
                                    <Label
                                        htmlFor={`icon-${opt.value}`}
                                        className="flex flex-col items-center justify-center rounded-md border p-2 hover:bg-accent peer-data-[state=checked]:bg-primary/10 peer-data-[state=checked]:border-primary transition-all cursor-pointer"
                                    >
                                        <Circle className="h-5 w-5 mb-1" fill={opt.fill} strokeWidth={opt.sw} />
                                        <span className="text-[10px]">{opt.label}</span>
                                    </Label>
                                </div>
                            ))}
                        </RadioGroup>
                    </div>
                </CardContent>
            </Card>

            {/* Mobile Settings Card */}
            <Card className="border-cyan-500/30">
                <CardHeader>
                    <div className="flex items-center gap-2">
                        <Menu className="h-5 w-5 text-cyan-500" />
                        <CardTitle>Menú Flotante</CardTitle>
                    </div>
                    <CardDescription>Personaliza el comportamiento y apariencia del menú móvil.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    {/* Menu Type */}
                    <div className="space-y-3">
                        <Label className="text-base">Tipo de Menú</Label>
                        <RadioGroup
                            value={config.mobile.menuType}
                            onValueChange={(val: any) => updateSection("mobile", { menuType: val })}
                            className="grid grid-cols-2 gap-3"
                        >
                            {[
                                { value: "sheet", label: "Panel", icon: PanelRightOpen, desc: "Deslizable lateral" },
                                { value: "dropdown", label: "Desplegable", icon: ChevronDown, desc: "Desde el FAB" },
                                { value: "fullscreen", label: "Pantalla Completa", icon: Maximize2, desc: "Overlay total" },
                                { value: "sidebar", label: "Barra Lateral", icon: PanelLeft, desc: "Fija en el lado" },
                            ].map((opt) => (
                                <div key={opt.value}>
                                    <RadioGroupItem value={opt.value} id={`menutype-${opt.value}`} className="peer sr-only" />
                                    <Label
                                        htmlFor={`menutype-${opt.value}`}
                                        className="flex flex-col items-center space-y-2 rounded-lg border p-4 hover:bg-accent peer-data-[state=checked]:border-cyan-500 peer-data-[state=checked]:bg-cyan-500/10 transition-all cursor-pointer h-full"
                                    >
                                        <opt.icon className="h-6 w-6 text-cyan-500" />
                                        <p className="font-medium text-sm">{opt.label}</p>
                                        <p className="text-[10px] text-muted-foreground text-center">{opt.desc}</p>
                                    </Label>
                                </div>
                            ))}
                        </RadioGroup>
                    </div>

                    {/* Menu Behavior */}
                    <div className="space-y-3">
                        <Label className="text-sm">Comportamiento</Label>
                        <RadioGroup
                            value={config.mobile.menuBehavior}
                            onValueChange={(val: any) => updateSection("mobile", { menuBehavior: val })}
                            className="grid grid-cols-3 gap-2"
                        >
                            {[
                                { value: "push", label: "Empujar" },
                                { value: "overlay", label: "Superponer" },
                                { value: "slide", label: "Deslizar" },
                            ].map((opt) => (
                                <div key={opt.value}>
                                    <RadioGroupItem value={opt.value} id={`behavior-${opt.value}`} className="peer sr-only" />
                                    <Label
                                        htmlFor={`behavior-${opt.value}`}
                                        className="flex items-center justify-center p-2 rounded-md border hover:bg-accent peer-data-[state=checked]:bg-cyan-500/10 peer-data-[state=checked]:border-cyan-500 transition-all cursor-pointer"
                                    >
                                        <span className="text-xs">{opt.label}</span>
                                    </Label>
                                </div>
                            ))}
                        </RadioGroup>
                    </div>

                    {/* Menu Position */}
                    <div className="space-y-3">
                        <Label className="text-sm">Posición del Menú (Móvil)</Label>
                        <RadioGroup
                            value={config.mobile.menuPosition}
                            onValueChange={(val: any) => updateSection("mobile", { menuPosition: val })}
                            className="grid grid-cols-3 gap-2"
                        >
                            {[
                                { value: "left", label: "Izquierda" },
                                { value: "right", label: "Derecha" },
                                { value: "bottom", label: "Inferior" },
                            ].map((opt) => (
                                <div key={opt.value}>
                                    <RadioGroupItem value={opt.value} id={`menupos-${opt.value}`} className="peer sr-only" />
                                    <Label
                                        htmlFor={`menupos-${opt.value}`}
                                        className="flex items-center justify-center p-2 rounded-md border hover:bg-accent peer-data-[state=checked]:bg-cyan-500/10 peer-data-[state=checked]:border-cyan-500 transition-all cursor-pointer"
                                    >
                                        <span className="text-xs">{opt.label}</span>
                                    </Label>
                                </div>
                            ))}
                        </RadioGroup>
                    </div>

                    {/* FAB Position */}
                    <div className="space-y-3">
                        <Label className="text-sm">Botón Flotante (FAB)</Label>
                        <RadioGroup
                            value={config.mobile.fabPosition}
                            onValueChange={(val: any) => updateSection("mobile", { fabPosition: val })}
                            className="grid grid-cols-2 gap-3"
                        >
                            {[
                                { value: "fixed", label: "Fijo", icon: Lock },
                                { value: "draggable", label: "Arrastrable", icon: Hand },
                            ].map((opt) => (
                                <div key={opt.value}>
                                    <RadioGroupItem value={opt.value} id={`fab-${opt.value}`} className="peer sr-only" />
                                    <Label
                                        htmlFor={`fab-${opt.value}`}
                                        className="flex items-center justify-center gap-2 p-3 rounded-lg border hover:bg-accent peer-data-[state=checked]:border-cyan-500 peer-data-[state=checked]:bg-cyan-500/10 transition-all cursor-pointer"
                                    >
                                        <opt.icon className="h-4 w-4 text-cyan-500" />
                                        <span className="text-sm font-medium">{opt.label}</span>
                                    </Label>
                                </div>
                            ))}
                        </RadioGroup>
                    </div>

                    {/* FAB Vertical Position (only if fixed) */}
                    {config.mobile.fabPosition === "fixed" && (
                        <div className="space-y-3">
                            <Label className="text-sm">Posición Vertical del FAB</Label>
                            <RadioGroup
                                value={config.mobile.fabVerticalPosition}
                                onValueChange={(val: any) => updateSection("mobile", { fabVerticalPosition: val })}
                                className="grid grid-cols-3 gap-2"
                            >
                                {[
                                    { value: "top", label: "Arriba" },
                                    { value: "center", label: "Centro" },
                                    { value: "bottom", label: "Abajo" },
                                ].map((opt) => (
                                    <div key={opt.value}>
                                        <RadioGroupItem value={opt.value} id={`fabvert-${opt.value}`} className="peer sr-only" />
                                        <Label
                                            htmlFor={`fabvert-${opt.value}`}
                                            className="flex items-center justify-center p-2 rounded-md border hover:bg-accent peer-data-[state=checked]:bg-cyan-500/10 peer-data-[state=checked]:border-cyan-500 transition-all cursor-pointer"
                                        >
                                            <span className="text-xs">{opt.label}</span>
                                        </Label>
                                    </div>
                                ))}
                            </RadioGroup>
                        </div>
                    )}

                    {/* FAB Side (only if fixed) */}
                    {config.mobile.fabPosition === "fixed" && (
                        <div className="space-y-3">
                            <Label className="text-sm">Lado del FAB</Label>
                            <RadioGroup
                                value={config.mobile.fabSide}
                                onValueChange={(val: any) => updateSection("mobile", { fabSide: val })}
                                className="grid grid-cols-2 gap-2"
                            >
                                {[
                                    { value: "left", label: "Izquierda" },
                                    { value: "right", label: "Derecha" },
                                ].map((opt) => (
                                    <div key={opt.value}>
                                        <RadioGroupItem value={opt.value} id={`fabside-${opt.value}`} className="peer sr-only" />
                                        <Label
                                            htmlFor={`fabside-${opt.value}`}
                                            className="flex items-center justify-center p-2 rounded-md border hover:bg-accent peer-data-[state=checked]:bg-cyan-500/10 peer-data-[state=checked]:border-cyan-500 transition-all cursor-pointer"
                                        >
                                            <span className="text-xs font-medium">{opt.label}</span>
                                        </Label>
                                    </div>
                                ))}
                            </RadioGroup>
                        </div>
                    )}

                    {/* Menu Animation */}
                    <div className="space-y-3">
                        <Label className="text-sm">Animación del Menú</Label>
                        <RadioGroup
                            value={config.mobile.menuAnimation}
                            onValueChange={(val: any) => updateSection("mobile", { menuAnimation: val })}
                            className="grid grid-cols-4 gap-2"
                        >
                            {[
                                { value: "slide", label: "Deslizar" },
                                { value: "fade", label: "Desvanecer" },
                                { value: "scale", label: "Escalar" },
                                { value: "morph", label: "Transformar" },
                            ].map((opt) => (
                                <div key={opt.value}>
                                    <RadioGroupItem value={opt.value} id={`anim-${opt.value}`} className="peer sr-only" />
                                    <Label
                                        htmlFor={`anim-${opt.value}`}
                                        className="flex items-center justify-center p-2 rounded-md border hover:bg-accent peer-data-[state=checked]:bg-cyan-500/10 peer-data-[state=checked]:border-cyan-500 transition-all cursor-pointer"
                                    >
                                        <span className="text-xs">{opt.label}</span>
                                    </Label>
                                </div>
                            ))}
                        </RadioGroup>
                    </div>

                    {/* Gesture Threshold Slider */}
                    <div className="space-y-3">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <GripVertical className="h-4 w-4 text-muted-foreground" />
                                <Label className="text-sm">Sensibilidad de Gestos</Label>
                            </div>
                            <span className="text-xs text-muted-foreground">{config.mobile.gestureThreshold}px</span>
                        </div>
                        <Slider
                            value={[config.mobile.gestureThreshold]}
                            onValueChange={([val]) => updateSection("mobile", { gestureThreshold: val })}
                            min={20}
                            max={100}
                            step={5}
                            className="w-full"
                        />
                    </div>

                    {/* Toggle Options */}
                    <div className="space-y-4 pt-2 border-t">
                        <div className="flex items-center justify-between pt-4">
                            <div className="flex items-center gap-2">
                                <MousePointerClick className="h-4 w-4 text-muted-foreground" />
                                <Label htmlFor="swipe" className="text-sm">Deslizar para Abrir</Label>
                            </div>
                            <Switch
                                id="swipe"
                                checked={config.mobile.swipeToOpen}
                                onCheckedChange={(checked) => updateSection("mobile", { swipeToOpen: checked })}
                            />
                        </div>
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <EyeOff className="h-4 w-4 text-muted-foreground" />
                                <Label htmlFor="autohide" className="text-sm">Ocultar al Desplazar</Label>
                            </div>
                            <Switch
                                id="autohide"
                                checked={config.mobile.autoHideOnScroll}
                                onCheckedChange={(checked) => updateSection("mobile", { autoHideOnScroll: checked })}
                            />
                        </div>
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <Monitor className="h-4 w-4 text-muted-foreground" />
                                <Label htmlFor="showdesktop" className="text-sm">Mostrar en Escritorio</Label>
                            </div>
                            <Switch
                                id="showdesktop"
                                checked={config.mobile.showOnDesktop}
                                onCheckedChange={(checked) => updateSection("mobile", { showOnDesktop: checked })}
                            />
                        </div>
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <Minimize2 className="h-4 w-4 text-muted-foreground" />
                                <Label htmlFor="compact" className="text-sm">Modo Compacto</Label>
                            </div>
                            <Switch
                                id="compact"
                                checked={config.mobile.compactMode}
                                onCheckedChange={(checked) => updateSection("mobile", { compactMode: checked })}
                            />
                        </div>
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <Vibrate className="h-4 w-4 text-muted-foreground" />
                                <Label htmlFor="haptic" className="text-sm">Retroalimentación Háptica</Label>
                            </div>
                            <Switch
                                id="haptic"
                                checked={config.mobile.hapticFeedback}
                                onCheckedChange={(checked) => updateSection("mobile", { hapticFeedback: checked })}
                            />
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Control Panel Settings Card */}
            <Card className="border-indigo-500/30">
                <CardHeader>
                    <div className="flex items-center gap-2">
                        <Bot className="h-5 w-5 text-indigo-500" />
                        <CardTitle>Panel de Control</CardTitle>
                    </div>
                    <CardDescription>Configuración del panel de herramientas y asistente IA.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    {/* Menu Position */}
                    <div className="space-y-3">
                        <Label className="text-sm">Posición del Panel</Label>
                        <RadioGroup
                            value={config.mobile.controlPanel.menuPosition}
                            onValueChange={(val: any) => updateSection("mobile", {
                                controlPanel: { ...config.mobile.controlPanel, menuPosition: val }
                            })}
                            className="grid grid-cols-3 gap-2"
                        >
                            {[
                                { value: "left", label: "Izquierda" },
                                { value: "right", label: "Derecha" },
                                { value: "bottom", label: "Inferior" },
                            ].map((opt) => (
                                <div key={opt.value}>
                                    <RadioGroupItem value={opt.value} id={`cp-pos-${opt.value}`} className="peer sr-only" />
                                    <Label
                                        htmlFor={`cp-pos-${opt.value}`}
                                        className="flex items-center justify-center p-2 rounded-md border hover:bg-accent peer-data-[state=checked]:bg-indigo-500/10 peer-data-[state=checked]:border-indigo-500 transition-all cursor-pointer"
                                    >
                                        <span className="text-xs">{opt.label}</span>
                                    </Label>
                                </div>
                            ))}
                        </RadioGroup>
                    </div>

                    {/* FAB Position */}
                    <div className="space-y-3">
                        <Label className="text-sm">Botón Flotante (FAB)</Label>
                        <RadioGroup
                            value={config.mobile.controlPanel.fabPosition}
                            onValueChange={(val: any) => updateSection("mobile", {
                                controlPanel: { ...config.mobile.controlPanel, fabPosition: val }
                            })}
                            className="grid grid-cols-2 gap-3"
                        >
                            {[
                                { value: "fixed", label: "Fijo", icon: Lock },
                                { value: "draggable", label: "Arrastrable", icon: Hand },
                            ].map((opt) => (
                                <div key={opt.value}>
                                    <RadioGroupItem value={opt.value} id={`cp-fab-${opt.value}`} className="peer sr-only" />
                                    <Label
                                        htmlFor={`cp-fab-${opt.value}`}
                                        className="flex items-center justify-center gap-2 p-3 rounded-lg border hover:bg-accent peer-data-[state=checked]:border-indigo-500 peer-data-[state=checked]:bg-indigo-500/10 transition-all cursor-pointer"
                                    >
                                        <opt.icon className="h-4 w-4 text-indigo-500" />
                                        <span className="text-sm font-medium">{opt.label}</span>
                                    </Label>
                                </div>
                            ))}
                        </RadioGroup>
                    </div>

                    {/* FAB Vertical Position (only if fixed) */}
                    {config.mobile.controlPanel.fabPosition === "fixed" && (
                        <div className="space-y-3">
                            <Label className="text-sm">Posición Vertical del FAB</Label>
                            <RadioGroup
                                value={config.mobile.controlPanel.fabVerticalPosition}
                                onValueChange={(val: any) => updateSection("mobile", {
                                    controlPanel: { ...config.mobile.controlPanel, fabVerticalPosition: val }
                                })}
                                className="grid grid-cols-3 gap-2"
                            >
                                {[
                                    { value: "top", label: "Arriba" },
                                    { value: "center", label: "Centro" },
                                    { value: "bottom", label: "Abajo" },
                                ].map((opt) => (
                                    <div key={opt.value}>
                                        <RadioGroupItem value={opt.value} id={`cp-fabvert-${opt.value}`} className="peer sr-only" />
                                        <Label
                                            htmlFor={`cp-fabvert-${opt.value}`}
                                            className="flex items-center justify-center p-2 rounded-md border hover:bg-accent peer-data-[state=checked]:bg-indigo-500/10 peer-data-[state=checked]:border-indigo-500 transition-all cursor-pointer"
                                        >
                                            <span className="text-xs">{opt.label}</span>
                                        </Label>
                                    </div>
                                ))}
                            </RadioGroup>
                        </div>
                    )}

                    {/* FAB Side (only if fixed) */}
                    {config.mobile.controlPanel.fabPosition === "fixed" && (
                        <div className="space-y-3">
                            <Label className="text-sm">Lado del FAB</Label>
                            <RadioGroup
                                value={config.mobile.controlPanel.fabSide}
                                onValueChange={(val: any) => updateSection("mobile", {
                                    controlPanel: { ...config.mobile.controlPanel, fabSide: val }
                                })}
                                className="grid grid-cols-2 gap-2"
                            >
                                {[
                                    { value: "left", label: "Izquierda" },
                                    { value: "right", label: "Derecha" },
                                ].map((opt) => (
                                    <div key={opt.value}>
                                        <RadioGroupItem value={opt.value} id={`cp-fabside-${opt.value}`} className="peer sr-only" />
                                        <Label
                                            htmlFor={`cp-fabside-${opt.value}`}
                                            className="flex items-center justify-center p-2 rounded-md border hover:bg-accent peer-data-[state=checked]:bg-indigo-500/10 peer-data-[state=checked]:border-indigo-500 transition-all cursor-pointer"
                                        >
                                            <span className="text-xs font-medium">{opt.label}</span>
                                        </Label>
                                    </div>
                                ))}
                            </RadioGroup>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Display Mode Card (VR/AR) */}
            <Card className="border-purple-500/30">
                <CardHeader>
                    <div className="flex items-center gap-2">
                        <Glasses className="h-5 w-5 text-purple-500" />
                        <CardTitle>Modo de Pantalla</CardTitle>
                    </div>
                    <CardDescription>Configuración para VR, AR y pantallas especiales.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    {/* Display Mode Selection */}
                    <div className="space-y-3">
                        <Label className="text-base">Modo de Visualización</Label>
                        <RadioGroup
                            value={config.display.mode}
                            onValueChange={(val: any) => updateSection("display", { mode: val })}
                            className="grid grid-cols-2 gap-3"
                        >
                            {[
                                { value: "standard", label: "Estándar", icon: Monitor, desc: "Pantalla normal" },
                                { value: "vr", label: "VR", icon: Glasses, desc: "Realidad virtual" },
                                { value: "ar", label: "AR", icon: Eye, desc: "Realidad aumentada" },
                                { value: "spatial", label: "Espacial", icon: Box, desc: "Computación espacial" },
                            ].map((opt) => (
                                <div key={opt.value}>
                                    <RadioGroupItem value={opt.value} id={`display-${opt.value}`} className="peer sr-only" />
                                    <Label
                                        htmlFor={`display-${opt.value}`}
                                        className="flex flex-col items-center space-y-2 rounded-lg border p-3 hover:bg-accent peer-data-[state=checked]:border-purple-500 peer-data-[state=checked]:bg-purple-500/10 transition-all cursor-pointer h-full"
                                    >
                                        <opt.icon className="h-5 w-5 text-purple-500" />
                                        <p className="font-medium text-sm">{opt.label}</p>
                                        <p className="text-[10px] text-muted-foreground text-center">{opt.desc}</p>
                                    </Label>
                                </div>
                            ))}
                        </RadioGroup>
                    </div>

                    {/* FOV Slider (for VR/AR/Spatial) */}
                    {config.display.mode !== "standard" && (
                        <>
                            <div className="space-y-3">
                                <div className="flex items-center justify-between">
                                    <Label className="text-sm">Campo de Visión (FOV)</Label>
                                    <span className="text-xs text-muted-foreground">{config.display.fov}°</span>
                                </div>
                                <Slider
                                    value={[config.display.fov]}
                                    onValueChange={([val]) => updateSection("display", { fov: val })}
                                    min={60}
                                    max={180}
                                    step={5}
                                    className="w-full"
                                />
                            </div>

                            <div className="space-y-3">
                                <div className="flex items-center justify-between">
                                    <Label className="text-sm">Escala de Profundidad</Label>
                                    <span className="text-xs text-muted-foreground">{config.display.depthScale.toFixed(1)}x</span>
                                </div>
                                <Slider
                                    value={[config.display.depthScale]}
                                    onValueChange={([val]) => updateSection("display", { depthScale: val })}
                                    min={0.5}
                                    max={2}
                                    step={0.1}
                                    className="w-full"
                                />
                            </div>
                        </>
                    )}

                    {/* Immersive Toggles */}
                    <div className="space-y-4 pt-2">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <Box className="h-4 w-4 text-muted-foreground" />
                                <Label htmlFor="immersive" className="text-sm">UI Inmersiva</Label>
                            </div>
                            <Switch
                                id="immersive"
                                checked={config.display.immersiveUI}
                                onCheckedChange={(checked) => updateSection("display", { immersiveUI: checked })}
                            />
                        </div>
                        {config.display.mode === "vr" && (
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <Glasses className="h-4 w-4 text-muted-foreground" />
                                    <Label htmlFor="curved" className="text-sm">Paneles Curvados</Label>
                                </div>
                                <Switch
                                    id="curved"
                                    checked={config.display.curvedUI}
                                    onCheckedChange={(checked) => updateSection("display", { curvedUI: checked })}
                                />
                            </div>
                        )}
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <Eye className="h-4 w-4 text-muted-foreground" />
                                <Label htmlFor="eyecomfort" className="text-sm">Comodidad Visual</Label>
                            </div>
                            <Switch
                                id="eyecomfort"
                                checked={config.display.eyeComfort}
                                onCheckedChange={(checked) => updateSection("display", { eyeComfort: checked })}
                            />
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Smartphone Settings Card */}
            <Card className="border-cyan-400/30">
                <CardHeader>
                    <div className="flex items-center gap-2">
                        <Smartphone className="h-5 w-5 text-cyan-400" />
                        <CardTitle>Smartphone</CardTitle>
                    </div>
                    <CardDescription>Configuración optimizada para móviles (&lt;768px).</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    {/* Orientation */}
                    <div className="space-y-3">
                        <Label className="text-sm">Orientación</Label>
                        <RadioGroup
                            defaultValue={config.responsive.smartphone.orientation}
                            onValueChange={(val: any) => updateSection("responsive", {
                                smartphone: { ...config.responsive.smartphone, orientation: val }
                            })}
                            className="grid grid-cols-3 gap-2"
                        >
                            {[
                                { value: "auto", label: "Auto" },
                                { value: "portrait", label: "Vertical" },
                                { value: "landscape", label: "Horizontal" },
                            ].map((opt) => (
                                <div key={opt.value}>
                                    <RadioGroupItem value={opt.value} id={`sp-ori-${opt.value}`} className="peer sr-only" />
                                    <Label
                                        htmlFor={`sp-ori-${opt.value}`}
                                        className="flex items-center justify-center p-2 rounded-md border hover:bg-accent peer-data-[state=checked]:bg-cyan-400/10 peer-data-[state=checked]:border-cyan-400 transition-all cursor-pointer"
                                    >
                                        <span className="text-xs">{opt.label}</span>
                                    </Label>
                                </div>
                            ))}
                        </RadioGroup>
                    </div>

                    {/* Content Density */}
                    <div className="space-y-3">
                        <Label className="text-sm">Densidad de Contenido</Label>
                        <RadioGroup
                            defaultValue={config.responsive.smartphone.contentDensity}
                            onValueChange={(val: any) => updateSection("responsive", {
                                smartphone: { ...config.responsive.smartphone, contentDensity: val }
                            })}
                            className="grid grid-cols-3 gap-2"
                        >
                            {[
                                { value: "compact", label: "Compacto" },
                                { value: "comfortable", label: "Cómodo" },
                                { value: "spacious", label: "Amplio" },
                            ].map((opt) => (
                                <div key={opt.value}>
                                    <RadioGroupItem value={opt.value} id={`sp-den-${opt.value}`} className="peer sr-only" />
                                    <Label
                                        htmlFor={`sp-den-${opt.value}`}
                                        className="flex items-center justify-center p-2 rounded-md border hover:bg-accent peer-data-[state=checked]:bg-cyan-400/10 peer-data-[state=checked]:border-cyan-400 transition-all cursor-pointer"
                                    >
                                        <span className="text-xs">{opt.label}</span>
                                    </Label>
                                </div>
                            ))}
                        </RadioGroup>
                    </div>

                    {/* Toggle Options */}
                    <div className="space-y-4 pt-2">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <PanelBottom className="h-4 w-4 text-muted-foreground" />
                                <Label htmlFor="sp-bottomnav" className="text-sm">Navegación Inferior</Label>
                            </div>
                            <Switch
                                id="sp-bottomnav"
                                checked={config.responsive.smartphone.bottomNavigation}
                                onCheckedChange={(checked) => updateSection("responsive", {
                                    smartphone: { ...config.responsive.smartphone, bottomNavigation: checked }
                                })}
                            />
                        </div>
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <Move className="h-4 w-4 text-muted-foreground" />
                                <Label htmlFor="sp-gesture" className="text-sm">Navegación por Gestos</Label>
                            </div>
                            <Switch
                                id="sp-gesture"
                                checked={config.responsive.smartphone.gestureNavigation}
                                onCheckedChange={(checked) => updateSection("responsive", {
                                    smartphone: { ...config.responsive.smartphone, gestureNavigation: checked }
                                })}
                            />
                        </div>
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <RefreshCw className="h-4 w-4 text-muted-foreground" />
                                <Label htmlFor="sp-pull" className="text-sm">Deslizar para Actualizar</Label>
                            </div>
                            <Switch
                                id="sp-pull"
                                checked={config.responsive.smartphone.pullToRefresh}
                                onCheckedChange={(checked) => updateSection("responsive", {
                                    smartphone: { ...config.responsive.smartphone, pullToRefresh: checked }
                                })}
                            />
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Tablet Settings Card */}
            <Card className="border-green-500/30">
                <CardHeader>
                    <div className="flex items-center gap-2">
                        <Tablet className="h-5 w-5 text-green-500" />
                        <CardTitle>Tablet</CardTitle>
                    </div>
                    <CardDescription>Para pantallas medianas (768px - 1024px).</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    {/* Orientation */}
                    <div className="space-y-3">
                        <Label className="text-sm">Orientación</Label>
                        <RadioGroup
                            defaultValue={config.responsive.tablet.orientation}
                            onValueChange={(val: any) => updateSection("responsive", {
                                tablet: { ...config.responsive.tablet, orientation: val }
                            })}
                            className="grid grid-cols-3 gap-2"
                        >
                            {[
                                { value: "auto", label: "Auto" },
                                { value: "portrait", label: "Vertical" },
                                { value: "landscape", label: "Horizontal" },
                            ].map((opt) => (
                                <div key={opt.value}>
                                    <RadioGroupItem value={opt.value} id={`tb-ori-${opt.value}`} className="peer sr-only" />
                                    <Label
                                        htmlFor={`tb-ori-${opt.value}`}
                                        className="flex items-center justify-center p-2 rounded-md border hover:bg-accent peer-data-[state=checked]:bg-green-500/10 peer-data-[state=checked]:border-green-500 transition-all cursor-pointer"
                                    >
                                        <span className="text-xs">{opt.label}</span>
                                    </Label>
                                </div>
                            ))}
                        </RadioGroup>
                    </div>

                    {/* Content Width */}
                    <div className="space-y-3">
                        <Label className="text-sm">Ancho del Contenido</Label>
                        <RadioGroup
                            defaultValue={config.responsive.tablet.contentWidth}
                            onValueChange={(val: any) => updateSection("responsive", {
                                tablet: { ...config.responsive.tablet, contentWidth: val }
                            })}
                            className="grid grid-cols-3 gap-2"
                        >
                            {[
                                { value: "full", label: "Completo" },
                                { value: "centered", label: "Centrado" },
                                { value: "narrow", label: "Estrecho" },
                            ].map((opt) => (
                                <div key={opt.value}>
                                    <RadioGroupItem value={opt.value} id={`tb-width-${opt.value}`} className="peer sr-only" />
                                    <Label
                                        htmlFor={`tb-width-${opt.value}`}
                                        className="flex items-center justify-center p-2 rounded-md border hover:bg-accent peer-data-[state=checked]:bg-green-500/10 peer-data-[state=checked]:border-green-500 transition-all cursor-pointer"
                                    >
                                        <span className="text-xs">{opt.label}</span>
                                    </Label>
                                </div>
                            ))}
                        </RadioGroup>
                    </div>

                    {/* Toggle Options */}
                    <div className="space-y-4 pt-2">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <SplitSquareHorizontal className="h-4 w-4 text-muted-foreground" />
                                <Label htmlFor="tb-split" className="text-sm">Vista Dividida</Label>
                            </div>
                            <Switch
                                id="tb-split"
                                checked={config.responsive.tablet.splitView}
                                onCheckedChange={(checked) => updateSection("responsive", {
                                    tablet: { ...config.responsive.tablet, splitView: checked }
                                })}
                            />
                        </div>
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <PanelLeftClose className="h-4 w-4 text-muted-foreground" />
                                <Label htmlFor="tb-sidebar" className="text-sm">Barra Lateral Colapsable</Label>
                            </div>
                            <Switch
                                id="tb-sidebar"
                                checked={config.responsive.tablet.sidebarCollapsible}
                                onCheckedChange={(checked) => updateSection("responsive", {
                                    tablet: { ...config.responsive.tablet, sidebarCollapsible: checked }
                                })}
                            />
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Desktop Settings Card */}
            <Card className="border-blue-500/30">
                <CardHeader>
                    <div className="flex items-center gap-2">
                        <Monitor className="h-5 w-5 text-blue-500" />
                        <CardTitle>Escritorio</CardTitle>
                    </div>
                    <CardDescription>Para computadoras (1024px - 1536px).</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    {/* Sidebar Width */}
                    <div className="space-y-3">
                        <div className="flex items-center justify-between">
                            <Label className="text-sm">Ancho de Barra Lateral</Label>
                            <span className="text-xs text-muted-foreground">{config.responsive.desktop.sidebarWidth}px</span>
                        </div>
                        <Slider
                            value={[config.responsive.desktop.sidebarWidth]}
                            onValueChange={([val]) => updateSection("responsive", {
                                desktop: { ...config.responsive.desktop, sidebarWidth: val }
                            })}
                            min={200}
                            max={400}
                            step={20}
                            className="w-full"
                        />
                    </div>

                    {/* Content Max Width */}
                    <div className="space-y-3">
                        <div className="flex items-center justify-between">
                            <Label className="text-sm">Ancho Máximo de Contenido</Label>
                            <span className="text-xs text-muted-foreground">{config.responsive.desktop.contentMaxWidth}px</span>
                        </div>
                        <Slider
                            value={[config.responsive.desktop.contentMaxWidth]}
                            onValueChange={([val]) => updateSection("responsive", {
                                desktop: { ...config.responsive.desktop, contentMaxWidth: val }
                            })}
                            min={1200}
                            max={1920}
                            step={40}
                            className="w-full"
                        />
                    </div>

                    {/* Toggle Options */}
                    <div className="space-y-4 pt-2">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <Columns className="h-4 w-4 text-muted-foreground" />
                                <Label htmlFor="dt-multi" className="text-sm">Multi-Columna</Label>
                            </div>
                            <Switch
                                id="dt-multi"
                                checked={config.responsive.desktop.multiColumn}
                                onCheckedChange={(checked) => updateSection("responsive", {
                                    desktop: { ...config.responsive.desktop, multiColumn: checked }
                                })}
                            />
                        </div>
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <Pin className="h-4 w-4 text-muted-foreground" />
                                <Label htmlFor="dt-sticky" className="text-sm">Header Fijo</Label>
                            </div>
                            <Switch
                                id="dt-sticky"
                                checked={config.responsive.desktop.stickyHeader}
                                onCheckedChange={(checked) => updateSection("responsive", {
                                    desktop: { ...config.responsive.desktop, stickyHeader: checked }
                                })}
                            />
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Large Screen Settings Card */}
            <Card className="border-amber-500/30">
                <CardHeader>
                    <div className="flex items-center gap-2">
                        <Tv className="h-5 w-5 text-amber-500" />
                        <CardTitle>Pantalla Grande</CardTitle>
                    </div>
                    <CardDescription>Para pantallas ultra-anchas (&gt;1536px).</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    {/* Ultra-Wide Layout */}
                    <div className="space-y-3">
                        <Label className="text-sm">Diseño Ultra-Ancho</Label>
                        <RadioGroup
                            defaultValue={config.responsive.largeScreen.ultraWideLayout}
                            onValueChange={(val: any) => updateSection("responsive", {
                                largeScreen: { ...config.responsive.largeScreen, ultraWideLayout: val }
                            })}
                            className="grid grid-cols-3 gap-2"
                        >
                            {[
                                { value: "centered", label: "Centrado" },
                                { value: "expanded", label: "Expandido" },
                                { value: "split", label: "Dividido" },
                            ].map((opt) => (
                                <div key={opt.value}>
                                    <RadioGroupItem value={opt.value} id={`ls-layout-${opt.value}`} className="peer sr-only" />
                                    <Label
                                        htmlFor={`ls-layout-${opt.value}`}
                                        className="flex items-center justify-center p-2 rounded-md border hover:bg-accent peer-data-[state=checked]:bg-amber-500/10 peer-data-[state=checked]:border-amber-500 transition-all cursor-pointer"
                                    >
                                        <span className="text-xs">{opt.label}</span>
                                    </Label>
                                </div>
                            ))}
                        </RadioGroup>
                    </div>

                    {/* Column Count */}
                    <div className="space-y-3">
                        <Label className="text-sm">Número de Columnas</Label>
                        <RadioGroup
                            defaultValue={String(config.responsive.largeScreen.columnCount)}
                            onValueChange={(val) => updateSection("responsive", {
                                largeScreen: { ...config.responsive.largeScreen, columnCount: Number(val) as 2 | 3 | 4 }
                            })}
                            className="grid grid-cols-3 gap-2"
                        >
                            {[2, 3, 4].map((num) => (
                                <div key={num}>
                                    <RadioGroupItem value={String(num)} id={`ls-col-${num}`} className="peer sr-only" />
                                    <Label
                                        htmlFor={`ls-col-${num}`}
                                        className="flex items-center justify-center p-2 rounded-md border hover:bg-accent peer-data-[state=checked]:bg-amber-500/10 peer-data-[state=checked]:border-amber-500 transition-all cursor-pointer"
                                    >
                                        <span className="text-xs">{num} cols</span>
                                    </Label>
                                </div>
                            ))}
                        </RadioGroup>
                    </div>

                    {/* Panel Spacing */}
                    <div className="space-y-3">
                        <div className="flex items-center justify-between">
                            <Label className="text-sm">Espaciado de Paneles</Label>
                            <span className="text-xs text-muted-foreground">{config.responsive.largeScreen.panelSpacing}px</span>
                        </div>
                        <Slider
                            value={[config.responsive.largeScreen.panelSpacing]}
                            onValueChange={([val]) => updateSection("responsive", {
                                largeScreen: { ...config.responsive.largeScreen, panelSpacing: val }
                            })}
                            min={16}
                            max={48}
                            step={4}
                            className="w-full"
                        />
                    </div>

                    {/* Cinematic Mode */}
                    <div className="flex items-center justify-between pt-2">
                        <div className="flex items-center gap-2">
                            <Film className="h-4 w-4 text-muted-foreground" />
                            <Label htmlFor="ls-cinematic" className="text-sm">Modo Cinemático</Label>
                        </div>
                        <Switch
                            id="ls-cinematic"
                            checked={config.responsive.largeScreen.cinematicMode}
                            onCheckedChange={(checked) => updateSection("responsive", {
                                largeScreen: { ...config.responsive.largeScreen, cinematicMode: checked }
                            })}
                        />
                    </div>
                </CardContent>
            </Card>

            {/* Responsive Options Card */}
            <Card className="border-violet-500/30 md:col-span-2">
                <CardHeader>
                    <div className="flex items-center gap-2">
                        <LayoutGrid className="h-5 w-5 text-violet-500" />
                        <CardTitle>Opciones Responsivas</CardTitle>
                    </div>
                    <CardDescription>Configuración global de adaptabilidad.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    <div className="grid gap-6 md:grid-cols-2">
                        {/* Adaptive UI Toggle */}
                        <div className="flex items-center justify-between p-4 rounded-lg border bg-violet-500/5">
                            <div className="space-y-1">
                                <div className="flex items-center gap-2">
                                    <Palette className="h-4 w-4 text-violet-500" />
                                    <Label htmlFor="adaptive-ui" className="text-sm font-medium">UI Adaptativa</Label>
                                </div>
                                <p className="text-xs text-muted-foreground">
                                    Ajusta automáticamente la interfaz según el dispositivo.
                                </p>
                            </div>
                            <Switch
                                id="adaptive-ui"
                                checked={config.responsive.adaptiveUI}
                                onCheckedChange={(checked) => updateSection("responsive", { adaptiveUI: checked })}
                            />
                        </div>

                        {/* Reduced Motion Toggle */}
                        <div className="flex items-center justify-between p-4 rounded-lg border bg-violet-500/5">
                            <div className="space-y-1">
                                <div className="flex items-center gap-2">
                                    <Minimize2 className="h-4 w-4 text-violet-500" />
                                    <Label htmlFor="reduced-motion" className="text-sm font-medium">Reducir Movimiento</Label>
                                </div>
                                <p className="text-xs text-muted-foreground">
                                    Desactiva animaciones para accesibilidad.
                                </p>
                            </div>
                            <Switch
                                id="reduced-motion"
                                checked={config.responsive.reducedMotion}
                                onCheckedChange={(checked) => updateSection("responsive", { reducedMotion: checked })}
                            />
                        </div>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
