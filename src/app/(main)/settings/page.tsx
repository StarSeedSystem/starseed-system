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

            <div className="relative">
                {/* Glass Container for the entire Settings Area */}
                <div className="backdrop-blur-xl bg-background/30 border rounded-xl overflow-hidden shadow-2xl">
                    <Tabs defaultValue="appearance" className="w-full">
                        <div className="border-b bg-muted/20 p-4">
                            <TabsList className="grid w-full grid-cols-3 max-w-md mx-auto">
                                <TabsTrigger value="appearance" className="gap-2 data-[state=active]:bg-background/50">
                                    <Palette className="h-4 w-4" /> Diseños de UI
                                </TabsTrigger>
                                <TabsTrigger value="profile" className="gap-2 data-[state=active]:bg-background/50">
                                    <User className="h-4 w-4" /> Perfil
                                </TabsTrigger>
                                <TabsTrigger value="security" className="gap-2 data-[state=active]:bg-background/50">
                                    <Shield className="h-4 w-4" /> Seguridad
                                </TabsTrigger>
                            </TabsList>
                        </div>

                        <div className="p-6 min-h-[600px] bg-gradient-to-br from-background/50 to-background/10">
                            <TabsContent value="appearance" className="m-0 space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
                                <AppearanceEditor />
                            </TabsContent>

                            <TabsContent value="profile" className="m-0 animate-in fade-in slide-in-from-bottom-4 duration-500">
                                <Card className="bg-background/40 backdrop-blur-sm border-0 shadow-none">
                                    <CardHeader>
                                        <CardTitle className="flex items-center gap-2">
                                            <User className="w-5 h-5 text-primary" />
                                            Identidad Soberana
                                        </CardTitle>
                                        <CardDescription>
                                            Tu representación en el Grafo Vivo. Estos datos están anclados en IPFS.
                                        </CardDescription>
                                    </CardHeader>
                                    <CardContent className="space-y-6">
                                        <div className="flex flex-col md:flex-row gap-6 items-start">
                                            <div className="flex flex-col items-center gap-3">
                                                <div className="relative group cursor-pointer">
                                                    <div className="absolute -inset-1 bg-gradient-to-tr from-primary to-accent rounded-full blur opacity-40 group-hover:opacity-75 transition-opacity" />
                                                    <div className="h-24 w-24 rounded-full overflow-hidden border-2 border-background relative z-10">
                                                        <img src="https://placehold.co/200x200.png" alt="Profile" className="object-cover w-full h-full" />
                                                    </div>
                                                    <div className="absolute bottom-0 right-0 bg-background border p-1 rounded-full z-20 shadow-sm">
                                                        <Palette className="w-3 h-3 text-muted-foreground" />
                                                    </div>
                                                </div>
                                                <button className="text-xs text-primary hover:underline">Cambiar Avatar NFT</button>
                                            </div>

                                            <div className="flex-1 space-y-4 w-full">
                                                <div className="grid md:grid-cols-2 gap-4">
                                                    <div className="space-y-2">
                                                        <label className="text-sm font-medium">Alias (Handle)</label>
                                                        <input className="w-full flex h-10 w-full rounded-md border border-input bg-background/50 px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                                                            defaultValue="@alex_starseed"
                                                        />
                                                    </div>
                                                    <div className="space-y-2">
                                                        <label className="text-sm font-medium">Nombre Público</label>
                                                        <input className="w-full flex h-10 w-full rounded-md border border-input bg-background/50 px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                                                            defaultValue="Alex"
                                                        />
                                                    </div>
                                                </div>

                                                <div className="space-y-2">
                                                    <label className="text-sm font-medium">Bio (Manifiesto Personal)</label>
                                                    <textarea className="flex min-h-[80px] w-full rounded-md border border-input bg-background/50 px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                                                        defaultValue="Arquitecto de realidades y explorador del sistema StarSeed. Buscando la convergencia entre tecnología y naturaleza."
                                                    />
                                                </div>

                                                <div className="space-y-2">
                                                    <label className="text-sm font-medium">Credenciales Verificables (Claims)</label>
                                                    <div className="flex flex-wrap gap-2 p-3 bg-muted/20 rounded-lg border border-dashed">
                                                        <div className="px-2 py-1 rounded-full bg-primary/10 text-primary text-xs border border-primary/20 flex items-center gap-1">
                                                            <span>🌱 Permacultor Nivel 3</span>
                                                        </div>
                                                        <div className="px-2 py-1 rounded-full bg-primary/10 text-primary text-xs border border-primary/20 flex items-center gap-1">
                                                            <span>🧬 Humano Verificado</span>
                                                        </div>
                                                        <div className="px-2 py-1 rounded-full bg-muted text-muted-foreground text-xs border flex items-center gap-1 opacity-50 cursor-not-allowed">
                                                            <span>+ Vincular Nueva Credencial</span>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </CardContent>
                                </Card>
                            </TabsContent>

                            <TabsContent value="security" className="m-0 animate-in fade-in slide-in-from-bottom-4 duration-500">
                                <Card className="bg-background/40 backdrop-blur-sm border-0 shadow-none">
                                    <CardHeader>
                                        <CardTitle className="flex items-center gap-2">
                                            <Shield className="w-5 h-5 text-primary" />
                                            Soberanía y Seguridad MPC
                                        </CardTitle>
                                        <CardDescription>
                                            Gestiona tus llaves criptográficas y la fragmentación de datos (Multi-Party Computation).
                                        </CardDescription>
                                    </CardHeader>
                                    <CardContent className="space-y-6">

                                        <div className="p-4 rounded-lg bg-muted/30 border border-primary/10">
                                            <div className="flex items-center justify-between mb-4">
                                                <div>
                                                    <h3 className="font-semibold text-sm">Estado de Fragmentación (Shards)</h3>
                                                    <p className="text-xs text-muted-foreground">Tus llaves privadas están divididas en 3 nodos seguros.</p>
                                                </div>
                                                <div className="flex gap-1">
                                                    <div className="w-3 h-3 rounded-full bg-green-500 animate-pulse" title="Nodo Alpha: Activo" />
                                                    <div className="w-3 h-3 rounded-full bg-green-500 animate-pulse delay-75" title="Nodo Beta: Activo" />
                                                    <div className="w-3 h-3 rounded-full bg-green-500 animate-pulse delay-150" title="Nodo Gamma: Activo" />
                                                </div>
                                            </div>
                                            <div className="h-2 w-full bg-secondary/20 rounded-full overflow-hidden">
                                                <div className="h-full bg-primary w-[100%] animate-[shimmer_2s_infinite]" />
                                            </div>
                                            <div className="mt-2 flex justify-between text-xs font-mono opacity-70">
                                                <span>Integridad: 100%</span>
                                                <span>Protocolo: Shamir's Secret Sharing</span>
                                            </div>
                                        </div>

                                        <div className="grid md:grid-cols-2 gap-4">
                                            <div className="p-4 rounded-lg border bg-card/50 hover:bg-card/80 transition-colors cursor-pointer group">
                                                <div className="flex items-center justify-between mb-2">
                                                    <span className="font-medium text-sm">Respaldo Biométrico</span>
                                                    <div className="w-8 h-4 rounded-full bg-primary/20 p-0.5 group-hover:bg-primary/30 transition-colors">
                                                        <div className="w-3 h-3 rounded-full bg-primary translate-x-4 transition-transform" />
                                                    </div>
                                                </div>
                                                <p className="text-xs text-muted-foreground">Usar FaceID/TouchID para regenerar fragmentos locales.</p>
                                            </div>

                                            <div className="p-4 rounded-lg border bg-card/50 hover:bg-card/80 transition-colors cursor-pointer group">
                                                <div className="flex items-center justify-between mb-2">
                                                    <span className="font-medium text-sm">Modo Fantasma</span>
                                                    <div className="w-8 h-4 rounded-full bg-muted p-0.5 group-hover:bg-muted/80 transition-colors">
                                                        <div className="w-3 h-3 rounded-full bg-muted-foreground/50 transition-transform" />
                                                    </div>
                                                </div>
                                                <p className="text-xs text-muted-foreground">Ocultar actividad en el grafo público (ActivityPub).</p>
                                            </div>
                                        </div>

                                    </CardContent>
                                </Card>
                            </TabsContent>
                        </div>
                    </Tabs>
                </div>
            </div>
        </div>
    );
}
