"use client";

import React from "react";
import { cn } from "@/lib/utils";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Bell, Settings, User, Zap } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAppearance } from "@/context/appearance-context";

export function RightSidebar({
    className
}: {
    className?: string;
}) {
    const { config } = useAppearance();
    const { menuBehavior } = config.layout;

    // Only show if we theoretically want a right sidebar or if forced
    // For now, we assume it's always rendered if the layout calls it, 
    // but we can add conditional logic here.
    const isSticky = menuBehavior === 'sticky';

    return (
        <div className={cn(
            "flex flex-col h-screen border-l bg-background/80 backdrop-blur-xl transition-all duration-500",
            isSticky && "sticky top-0",
            className
        )}>
            <div className="flex items-center h-[60px] px-6 border-b">
                <span className="font-semibold text-sm tracking-widest text-muted-foreground uppercase">
                    Panel de Control
                </span>
            </div>

            <div className="flex-1 overflow-auto p-4">
                <Tabs defaultValue="notifications" className="w-full">
                    <TabsList className="grid w-full grid-cols-2 mb-4">
                        <TabsTrigger value="notifications">
                            <Bell className="w-4 h-4 mr-2" />
                            Avisos
                        </TabsTrigger>
                        <TabsTrigger value="tools">
                            <Zap className="w-4 h-4 mr-2" />
                            Tools
                        </TabsTrigger>
                    </TabsList>

                    <TabsContent value="notifications" className="space-y-4">
                        <Card className="bg-muted/50 border-0 shadow-none">
                            <CardHeader className="p-4 pb-2">
                                <CardTitle className="text-sm font-medium">Sistema</CardTitle>
                            </CardHeader>
                            <CardContent className="p-4 pt-0">
                                <div className="text-xs text-muted-foreground">
                                    Bienvenido a StarSeed Network. Tu nodo está activo.
                                </div>
                            </CardContent>
                        </Card>
                        <Card className="bg-muted/50 border-0 shadow-none">
                            <CardHeader className="p-4 pb-2">
                                <CardTitle className="text-sm font-medium">Red</CardTitle>
                            </CardHeader>
                            <CardContent className="p-4 pt-0">
                                <div className="text-xs text-muted-foreground">
                                    3 nuevos nodos se han unido a tu constelación.
                                </div>
                            </CardContent>
                        </Card>
                    </TabsContent>

                    <TabsContent value="tools" className="space-y-4">
                        <div className="grid grid-cols-2 gap-2">
                            <Button variant="outline" className="h-20 flex flex-col gap-2 hover:border-primary/50 hover:bg-primary/5">
                                <User className="w-5 h-5" />
                                <span className="text-xs">Perfil</span>
                            </Button>
                            <Button variant="outline" className="h-20 flex flex-col gap-2 hover:border-primary/50 hover:bg-primary/5">
                                <Settings className="w-5 h-5" />
                                <span className="text-xs">Ajustes</span>
                            </Button>
                        </div>

                        <Card className="bg-gradient-to-br from-primary/10 to-transparent border-primary/20">
                            <CardContent className="p-4">
                                <div className="flex items-center justify-between mb-2">
                                    <span className="text-xs font-semibold">Estado del Nodo</span>
                                    <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
                                </div>
                                <div className="space-y-1">
                                    <div className="h-1 w-full bg-background/50 rounded-full overflow-hidden">
                                        <div className="h-full bg-primary w-[75%]" />
                                    </div>
                                    <div className="flex justify-between text-[10px] text-muted-foreground">
                                        <span>Sincronizando...</span>
                                        <span>75%</span>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    </TabsContent>
                </Tabs>
            </div>
        </div>
    );
}
