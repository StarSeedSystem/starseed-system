// src/app/(app)/network/politics/page.tsx
'use client'

import { PoliticalProposalCard } from "@/components/political-proposal-card";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BarChart, Scale, Users, Landmark, Flag, ArrowUpRight } from "lucide-react";
import { politicalProposals } from "@/lib/data";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import Link from "next/link";
import { listFederativeEntities, listPartidos } from "@/data/sample-governance";

import { ExecutiveProjectsBoard, JudicialCaseList } from "./components";
import { SystemShowcase } from "@/components/showcase/SystemShowcase";

/** Lanzador de gobernanza: enlaza a las páginas de detalle de E.F. y partidos. */
function GovernanceLauncher() {
    const efs = listFederativeEntities();
    const partidos = listPartidos();
    return (
        <Card className="mb-6 liquid-glass-panel">
            <CardHeader className="pb-3">
                <CardTitle className="font-headline text-lg">Mapa de Gobernanza</CardTitle>
                <CardDescription>Entra a las Entidades Federativas y Partidos de la red.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
                <div>
                    <p className="mb-2 flex items-center gap-1.5 text-xs uppercase tracking-wide text-muted-foreground">
                        <Landmark className="h-3.5 w-3.5" /> Entidades Federativas
                    </p>
                    <div className="flex flex-col gap-1.5">
                        {efs.map((ef) => (
                            <Link
                                key={ef.slug}
                                href={`/entidad/${ef.slug}`}
                                className="group flex items-center justify-between rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 cursor-pointer transition-all hover:border-white/25"
                            >
                                <span className="flex items-center gap-2 text-sm font-medium">
                                    <span className="h-2 w-2 rounded-full" style={{ background: ef.accent }} />
                                    {ef.name}
                                </span>
                                <span className="flex items-center gap-2 text-xs text-muted-foreground">
                                    {ef.citizens.toLocaleString("es-ES")}
                                    <ArrowUpRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                                </span>
                            </Link>
                        ))}
                    </div>
                </div>
                <div>
                    <p className="mb-2 flex items-center gap-1.5 text-xs uppercase tracking-wide text-muted-foreground">
                        <Flag className="h-3.5 w-3.5" /> Partidos Políticos
                    </p>
                    <div className="flex flex-col gap-1.5">
                        {partidos.map((p) => (
                            <Link
                                key={p.slug}
                                href={`/partido/${p.slug}`}
                                className="group flex items-center justify-between rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 cursor-pointer transition-all hover:border-white/25"
                            >
                                <span className="flex items-center gap-2 text-sm font-medium">
                                    <span className="h-2 w-2 rounded-full" style={{ background: p.accent }} />
                                    {p.name}
                                </span>
                                <span className="flex items-center gap-2 text-xs text-muted-foreground">
                                    {p.members.toLocaleString("es-ES")}
                                    <ArrowUpRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                                </span>
                            </Link>
                        ))}
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}

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

                <div className="mt-8">
                    <GovernanceLauncher />
                </div>

                <SystemShowcase system="politico" />
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
