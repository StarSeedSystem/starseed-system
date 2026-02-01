import { useAppearance } from "@/context/appearance-context";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Layout, Move, MousePointer2, Smartphone } from "lucide-react";

export function TrinitySettings() {
    const { config, updateSection } = useAppearance();
    const { position, mode, style } = config.trinity;

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h3 className="text-lg font-medium">Interfaz Trinity</h3>
                    <p className="text-sm text-muted-foreground">Configura el comportamiento y estilo del controlador principal.</p>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Mode Selection */}
                <Card>
                    <CardHeader className="pb-3">
                        <CardTitle className="text-base flex items-center gap-2">
                            <MousePointer2 className="w-4 h-4" />
                            Modo de Interacción
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <RadioGroup
                            value={mode}
                            onValueChange={(val: any) => updateSection("trinity", { mode: val })}
                            className="grid grid-cols-2 gap-4"
                        >
                            <div>
                                <RadioGroupItem value="floating" id="mode-floating" className="peer sr-only" />
                                <Label
                                    htmlFor="mode-floating"
                                    className="flex flex-col items-center justify-between rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary"
                                >
                                    <Move className="mb-3 h-6 w-6" />
                                    <span className="text-sm font-medium">Flotante</span>
                                    <span className="text-xs text-muted-foreground mt-1 text-center">Arrastrable</span>
                                </Label>
                            </div>
                            <div>
                                <RadioGroupItem value="docked" id="mode-docked" className="peer sr-only" />
                                <Label
                                    htmlFor="mode-docked"
                                    className="flex flex-col items-center justify-between rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary"
                                >
                                    <Layout className="mb-3 h-6 w-6" />
                                    <span className="text-sm font-medium">Fijo</span>
                                    <span className="text-xs text-muted-foreground mt-1 text-center">Posición Estática</span>
                                </Label>
                            </div>
                        </RadioGroup>
                    </CardContent>
                </Card>

                {/* Position Selection */}
                <Card>
                    <CardHeader className="pb-3">
                        <CardTitle className="text-base flex items-center gap-2">
                            <Smartphone className="w-4 h-4" />
                            Posición Inicial
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <Select
                            value={position}
                            onValueChange={(val: any) => updateSection("trinity", { position: val })}
                        >
                            <SelectTrigger>
                                <SelectValue placeholder="Seleccionar posición" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="bottom-center">Abajo Centro</SelectItem>
                                <SelectItem value="bottom-right">Abajo Derecha</SelectItem>
                                <SelectItem value="left-center">Izquierda Centro</SelectItem>
                                <SelectItem value="right-center">Derecha Centro</SelectItem>
                                <SelectItem value="top-right">Arriba Derecha</SelectItem>
                            </SelectContent>
                        </Select>
                        <p className="text-xs text-muted-foreground mt-2">
                            Determina donde aparece la interfaz al cargar o resetear.
                        </p>
                    </CardContent>
                </Card>

                {/* Style Selection */}
                <Card>
                    <CardHeader className="pb-3">
                        <CardTitle className="text-base flex items-center gap-2">
                            <Layout className="w-4 h-4" />
                            Estilo Visual
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <Select
                            value={style}
                            onValueChange={(val: any) => updateSection("trinity", { style: val })}
                        >
                            <SelectTrigger>
                                <SelectValue placeholder="Seleccionar estilo" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="glass">Cristal (Glassmorphism)</SelectItem>
                                <SelectItem value="solid">Sólido</SelectItem>
                                <SelectItem value="minimal">Minimalista</SelectItem>
                            </SelectContent>
                        </Select>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
