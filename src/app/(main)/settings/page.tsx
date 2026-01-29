"use client";

import React from "react";
import { AppearanceEditor } from "@/components/settings/appearance/appearance-editor";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Palette, User, Shield } from "lucide-react";

export default function SettingsPage() {
    return (
        <div className="container mx-auto p-6 space-y-8">
            <div className="flex flex-col gap-2">
                <h1 className="text-3xl font-bold tracking-tight">Configuración</h1>
                <p className="text-muted-foreground">
                    Gestiona tus preferencias, apariencia y seguridad.
                </p>
            </div>

            <Tabs defaultValue="appearance" className="space-y-4">
                <TabsList>
                    <TabsTrigger value="appearance" className="gap-2">
                        <Palette className="h-4 w-4" /> Apariencia
                    </TabsTrigger>
                    <TabsTrigger value="profile" className="gap-2">
                        <User className="h-4 w-4" /> Perfil
                    </TabsTrigger>
                    <TabsTrigger value="security" className="gap-2">
                        <Shield className="h-4 w-4" /> Seguridad
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="appearance" className="space-y-4">
                    <div className="space-y-4">
                        <AppearanceEditor />
                    </div>
                </TabsContent>

                <TabsContent value="profile">
                    <Card>
                        <CardHeader>
                            <CardTitle>Perfil de Usuario</CardTitle>
                            <CardDescription>
                                Gestiona tu información pública y privada.
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <p className="text-sm text-muted-foreground">Configuración de perfil próximamente...</p>
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>
        </div>
    );
}
