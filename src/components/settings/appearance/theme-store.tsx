"use client";

import React from "react";
import { useAppearance, AppearanceConfig, DeepPartial } from "@/context/appearance-context";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Download, Check, Sparkles, Monitor, Smartphone } from "lucide-react";
import { cn } from "@/lib/utils";

interface ThemeTemplate {
    id: string;
    name: string;
    description: string;
    author: string;
    image: string;
    config: DeepPartial<AppearanceConfig>;
    tags: string[];
}

const templates: ThemeTemplate[] = [
    {
        id: "nova-cyber",
        name: "Nova Cyber",
        description: "Estética futurista con cristal líquido intenso y neones.",
        author: "StarSeed Core",
        image: "https://images.unsplash.com/photo-1550751827-4bd374c3f58b?q=80&w=1480",
        tags: ["Dark", "Neon", "Liquid"],
        config: {
            background: { type: 'image', value: 'https://images.unsplash.com/photo-1550751827-4bd374c3f58b?q=80&w=1480', blur: 0, animation: 'pan' },
            liquidGlass: { enabled: true, applyToUI: true, cornerRadius: 24, distortWidth: 0.4 },
            styling: { radius: 0.75, glassIntensity: 30, opacity: 0.7 },
            layout: { menuPosition: 'left', menuStyle: 'dock', iconStyle: 'solid' },
            typography: { fontFamily: 'Space Grotesk', scale: 1.05 }
        }
    },
    {
        id: "zen-garden",
        name: "Zen Garden",
        description: "Minimalismo natural para máxima concentración.",
        author: "Nature One",
        image: "https://images.unsplash.com/photo-1584714268709-c3dd9c92b378?q=80&w=1480",
        tags: ["Light", "Minimal", "Clean"],
        config: {
            background: { type: 'image', value: 'https://images.unsplash.com/photo-1584714268709-c3dd9c92b378?q=80&w=1480', blur: 0, animation: 'pulse' },
            liquidGlass: { enabled: false, applyToUI: false, cornerRadius: 16, distortWidth: 0.1 },
            styling: { radius: 1, glassIntensity: 5, opacity: 0.95 },
            layout: { menuPosition: 'top', menuStyle: 'minimal', iconStyle: 'thin' },
            typography: { fontFamily: 'Outfit', scale: 1 }
        }
    },
    {
        id: "deep-space",
        name: "Deep Space",
        description: "Inmersión total en el vacío del cosmos.",
        author: "Voyager",
        image: "https://images.unsplash.com/photo-1444703686981-a3abbc4d4fe3?q=80&w=1480",
        tags: ["Dark", "Space", "Immersive"],
        config: {
            background: { type: 'image', value: 'https://images.unsplash.com/photo-1444703686981-a3abbc4d4fe3?q=80&w=1480', blur: 0, animation: 'zoom' },
            liquidGlass: { enabled: true, applyToUI: true, cornerRadius: 8, distortWidth: 0.2 },
            styling: { radius: 0.2, glassIntensity: 15, opacity: 0.6 },
            layout: { menuPosition: 'right', menuStyle: 'sidebar', iconStyle: 'outline' },
            typography: { fontFamily: 'Inter', scale: 0.95 }
        }
    },
    {
        id: "liquid-demo",
        name: "Flow State",
        description: "La experiencia original de la demo de cristal líquido.",
        author: "System",
        image: "https://i.ibb.co/MDbLn4N4/vectors.png",
        tags: ["Demo", "Vector", "Scroll"],
        config: {
            background: { type: 'image', value: 'https://i.ibb.co/MDbLn4N4/vectors.png', blur: 0, animation: 'scroll' },
            liquidGlass: { enabled: true, applyToUI: true, cornerRadius: 12, distortWidth: 0.5 },
            styling: { radius: 0.75, glassIntensity: 20, opacity: 0.85 },
            layout: { menuPosition: 'left', menuStyle: 'dock', iconStyle: 'solid' },
            typography: { fontFamily: 'Inter', scale: 1 }
        }
    }
];

export function ThemeStore() {
    const { updateConfig, config, updateSection } = useAppearance();
    const [activeTab, setActiveTab] = React.useState("browse");

    const applyTemplate = (template: ThemeTemplate) => {
        updateConfig(template.config as any);
        updateSection("themeStore", { activeTemplateId: template.id });
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-xl font-bold tracking-tight">Tienda de Temas</h2>
                    <p className="text-muted-foreground">Descarga y aplica configuraciones visuales completas.</p>
                </div>
            </div>

            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="browse">Explorar</TabsTrigger>
                    <TabsTrigger value="custom">Código Personalizado</TabsTrigger>
                </TabsList>

                <TabsContent value="browse" className="mt-4 space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {templates.map((template) => (
                            <Card key={template.id} className="overflow-hidden group hover:border-primary/50 transition-all">
                                <div className="h-40 w-full overflow-hidden relative">
                                    <div
                                        className="absolute inset-0 bg-cover bg-center transition-transform duration-700 group-hover:scale-105"
                                        style={{ backgroundImage: `url(${template.image})` }}
                                    />
                                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent flex items-end p-4">
                                        <div className="w-full">
                                            <div className="flex items-center justify-between">
                                                <Badge variant="secondary" className="bg-white/10 backdrop-blur text-white border-white/20">
                                                    {template.author}
                                                </Badge>
                                                <div className="flex gap-1">
                                                    {template.tags.map(tag => (
                                                        <Badge key={tag} variant="outline" className="text-[10px] h-5 px-1 bg-black/50 text-white border-white/20">
                                                            {tag}
                                                        </Badge>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                <CardHeader>
                                    <CardTitle className="flex items-center justify-between">
                                        {template.name}
                                        {config.themeStore?.activeTemplateId === template.id && (
                                            <Badge variant="default" className="gap-1 bg-green-500 hover:bg-green-600"><Check className="h-3 w-3" /> Activo</Badge>
                                        )}
                                    </CardTitle>
                                    <CardDescription>{template.description}</CardDescription>
                                </CardHeader>
                                <CardFooter>
                                    <Button
                                        className="w-full gap-2 group-hover:bg-primary"
                                        onClick={() => applyTemplate(template)}
                                        variant={config.themeStore?.activeTemplateId === template.id ? "secondary" : "default"}
                                    >
                                        <Download className="h-4 w-4" />
                                        {config.themeStore?.activeTemplateId === template.id ? "Re-aplicar" : "Instalar Tema"}
                                    </Button>
                                </CardFooter>
                            </Card>
                        ))}
                    </div>
                </TabsContent>

                <TabsContent value="custom">
                    <Card>
                        <CardHeader>
                            <CardTitle>Importar Configuración</CardTitle>
                            <CardDescription>Pega un código JSON de configuración o un enlace compatible.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="min-h-[200px] rounded-md border border-dashed p-8 text-center flex flex-col items-center justify-center text-muted-foreground bg-muted/20">
                                <Sparkles className="h-10 w-10 mb-4 opacity-20" />
                                <p>Próximamente: Editor de JSON y soporte para enlaces compartidos.</p>
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>
        </div>
    );
}
