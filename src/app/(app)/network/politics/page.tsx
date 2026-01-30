// src/app/(app)/network/politics/page.tsx
'use client'

import { PoliticalProposalCard } from "@/components/political-proposal-card";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BarChart, Scale, Users } from "lucide-react";
import { politicalProposals } from "@/lib/data";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";


import { ExecutiveProjectsBoard, JudicialCaseList } from "./components";

export default function PoliticsPage() {
    return (
        <Dialog>
            <div className="relative">
                <div className="absolute top-0 right-0 z-10">
                    <DialogTrigger asChild>
                        <Button className="bg-primary/20 backdrop-blur hover:bg-primary/30 text-primary border border-primary/50 shadow-lg glow-sm">
                            + Nueva Iniciativa
                        </Button>
                    </DialogTrigger>
                </div>

                <Tabs defaultValue="legislativo" className="w-full">
                    <TabsList className="grid w-full grid-cols-3">
                        <TabsTrigger value="legislativo"><Scale className="mr-2 h-4 w-4" />Legislativo</TabsTrigger>
                        <TabsTrigger value="ejecutivo"><Users className="mr-2 h-4 w-4" />Ejecutivo</TabsTrigger>
                        <TabsTrigger value="judicial"><BarChart className="mr-2 h-4 w-4" />Judicial</TabsTrigger>
                    </TabsList>

                    <TabsContent value="legislativo" className="mt-6 animate-in fade-in-50 duration-500 slide-in-from-bottom-2">
                        <div className="space-y-6">
                            {politicalProposals.map(p => (
                                <PoliticalProposalCard key={p.id} proposal={p} />
                            ))}
                        </div>
                    </TabsContent>

                    <TabsContent value="ejecutivo" className="mt-6 animate-in fade-in-50 duration-500 slide-in-from-bottom-2">
                        <div className="mb-6">
                            <h2 className="text-2xl font-bold font-headline">Tablero de Proyectos</h2>
                            <p className="text-muted-foreground">Gestión transparente de recursos y ejecución de mandatos comunitarios.</p>
                        </div>
                        <ExecutiveProjectsBoard />
                    </TabsContent>

                    <TabsContent value="judicial" className="mt-6 animate-in fade-in-50 duration-500 slide-in-from-bottom-2">
                        <div className="mb-6">
                            <h2 className="text-2xl font-bold font-headline">Sistema de Justicia Restaurativa</h2>
                            <p className="text-muted-foreground">Resolución de conflictos enfocada en la mediación y la armonía comunitaria.</p>
                        </div>
                        <JudicialCaseList />
                    </TabsContent>
                </Tabs>
            </div>

            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle>Crear Nueva Iniciativa</DialogTitle>
                    <DialogDescription>
                        Lanza una propuesta legislativa, proyecto ejecutivo o caso judicial.
                    </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                    <div className="grid gap-2">
                        <Label htmlFor="type" className="text-right">Tipo</Label>
                        <select id="type" className="col-span-3 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                            <option value="law">Propuesta de Ley</option>
                            <option value="project">Proyecto Ejecutivo</option>
                            <option value="dispute">Caso Judicial</option>
                        </select>
                    </div>
                </div>
                <DialogFooter>
                    <Button type="submit">Iniciar Proceso Ontocrático</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog >
    );
}
