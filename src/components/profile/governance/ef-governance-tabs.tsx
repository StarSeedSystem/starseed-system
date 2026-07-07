"use client";
import React from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Scale, Users, BarChart } from "lucide-react";

// NOTA: este componente no se usa en ninguna ruta (superseded por
// DecisionesSection + GovernanceToolkit, que ya dan a EF/Partido su propia
// superficie legislativa/ejecutiva/judicial real). Se conserva sin romper el
// build; ver "src/app/(app)/network/politics" para la implementación viva de
// las tres ramas del Área Política.
export function EFGovernanceTabs() {
    return (
        <Tabs defaultValue="legislativo" className="w-full">
            <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="legislativo"><Scale className="mr-2 h-4 w-4" />Legislativo</TabsTrigger>
                <TabsTrigger value="ejecutivo"><Users className="mr-2 h-4 w-4" />Ejecutivo</TabsTrigger>
                <TabsTrigger value="judicial"><BarChart className="mr-2 h-4 w-4" />Judicial</TabsTrigger>
            </TabsList>
            <TabsContent value="legislativo" className="mt-6 text-center text-muted-foreground py-12">
                <p>Usa la pestaña "Decisiones" de esta entidad para su gobernanza real.</p>
            </TabsContent>
            <TabsContent value="ejecutivo" className="mt-6 text-center text-muted-foreground py-12">
                <p>La sección del Ejecutivo está en desarrollo.</p>
            </TabsContent>
            <TabsContent value="judicial" className="mt-6 text-center text-muted-foreground py-12">
                <p>La sección Judicial está en desarrollo.</p>
            </TabsContent>
        </Tabs>
    )
}
