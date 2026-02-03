"use client";

import React from "react";
import { ThemeSelector } from "@/components/theme/theme-selector";
import { TypographySettings } from "./typography-settings";
import { LayoutSettings } from "./layout-settings";
import { BackgroundSettings } from "./background-settings";
import { UiElementSettings } from "./ui-element-settings";
import { ThemeStore } from "./theme-store";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Type, Layout, PaintBucket, Image as ImageIcon, Sliders, Droplets, ShoppingBag, Cpu, MousePointerClick, SquareDashedBottomCode } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function AppearanceEditor() {
    return (
        <div className="space-y-6">

            {/* 1. Base Theme */}
            <Card>
                <CardHeader>
                    <CardTitle>Tema Base</CardTitle>
                    <CardDescription>Comienza seleccionando un estilo visual global.</CardDescription>
                </CardHeader>
                <CardContent>
                    <ThemeSelector />
                </CardContent>
            </Card>

            {/* 2. Granular Controls */}
            <Tabs defaultValue="typography" className="w-full">
                <TabsList className="grid w-full grid-cols-4 lg:grid-cols-8 h-auto">
                    <TabsTrigger value="typography" className="gap-2"><Type className="w-4 h-4" /> Tipografía</TabsTrigger>
                    <TabsTrigger value="layout" className="gap-2"><Layout className="w-4 h-4" /> Interfaz</TabsTrigger>
                    {/* New UI Elements Tab */}
                    <TabsTrigger value="ui-elements" className="gap-2"><SquareDashedBottomCode className="w-4 h-4" /> Elementos UI</TabsTrigger>
                    <TabsTrigger value="background" className="gap-2"><ImageIcon className="w-4 h-4" /> Fondo</TabsTrigger>
                    {/* Removed standalone Crystal tab */}

                    <TabsTrigger value="store" className="gap-2"><ShoppingBag className="w-4 h-4" /> Tienda</TabsTrigger>
                </TabsList>

                <TabsContent value="typography" className="mt-4">
                    <TypographySettings />
                </TabsContent>

                <TabsContent value="layout" className="mt-4">
                    <LayoutSettings />
                </TabsContent>

                {/* New Tab Content */}
                <TabsContent value="ui-elements" className="mt-4">
                    <UiElementSettings />
                </TabsContent>


                <TabsContent value="background" className="mt-4">
                    <BackgroundSettings />
                </TabsContent>



                <TabsContent value="store" className="mt-4">
                    <ThemeStore />
                </TabsContent>
            </Tabs>

        </div>
    );
}
