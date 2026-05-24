import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { executiveProjects, judicialCases } from "@/lib/data";
import { Calendar, CheckCircle2, Circle, Clock, Gavel, Users } from "lucide-react";

export function ExecutiveProjectsBoard() {
    const columns = [
        { id: 'En Planificación', label: 'En Planificación', color: 'bg-yellow-500/10 text-yellow-500' },
        { id: 'En Progreso', label: 'En Progreso', color: 'bg-blue-500/10 text-blue-500' },
        { id: 'Completado', label: 'Completado', color: 'bg-green-500/10 text-green-500' },
    ];

    return (
        <div className="grid md:grid-cols-3 gap-6 h-full">
            {columns.map(col => (
                <div key={col.id} className="flex flex-col gap-4">
                    <div className={`p-3 rounded-lg font-semibold flex items-center justify-between ${col.color}`}>
                        <span>{col.label}</span>
                        <span className="text-xs opacity-70 bg-background/20 px-2 py-1 rounded">
                            {executiveProjects.filter(p => p.status === col.id).length}
                        </span>
                    </div>
                    <div className="space-y-4">
                        {executiveProjects.filter(p => p.status === col.id).map(proj => (
                            <Card key={proj.id} className="hover:border-primary/50 transition-colors">
                                <CardHeader className="p-4 pb-2">
                                    <CardTitle className="text-base font-medium">{proj.title}</CardTitle>
                                </CardHeader>
                                <CardContent className="p-4 py-2 text-sm text-muted-foreground">
                                    <p className="mb-3 line-clamp-2">{proj.description}</p>

                                    {proj.status !== 'En Planificación' && (
                                        <div className="mb-2">
                                            <div className="flex justify-between text-xs mb-1">
                                                <span>Progreso</span>
                                                <span>{proj.progress}%</span>
                                            </div>
                                            <Progress value={proj.progress} className="h-1.5" />
                                        </div>
                                    )}

                                    <div className="flex items-center gap-4 text-xs mt-2">
                                        <div className="flex items-center gap-1">
                                            <Users className="w-3 h-3" /> {proj.volunteers}
                                        </div>
                                        <div className="flex items-center gap-1">
                                            <Calendar className="w-3 h-3" /> {proj.deadline}
                                        </div>
                                    </div>
                                </CardContent>
                                <CardFooter className="p-4 pt-2">
                                    <Badge variant="outline" className="w-full justify-center">
                                        {proj.budget}
                                    </Badge>
                                </CardFooter>
                            </Card>
                        ))}
                    </div>
                </div>
            ))}
        </div>
    );
}

export function JudicialCaseList() {
    return (
        <div className="grid gap-6 md:grid-cols-2">
            <Card className="md:col-span-2 border-dashed border-2 bg-muted/10">
                <CardHeader className="text-center">
                    <CardTitle className="flex items-center justify-center gap-2">
                        <Gavel className="w-5 h-5" /> Nueva Disputa
                    </CardTitle>
                    <CardDescription>
                        Presenta un caso para mediación comunitaria descentralizada.
                    </CardDescription>
                </CardHeader>
                <CardFooter className="justify-center pb-6">
                    <Button>Iniciar Proceso de Mediación</Button>
                </CardFooter>
            </Card>

            {judicialCases.map(ticket => (
                <Card key={ticket.id}>
                    <CardHeader>
                        <div className="flex justify-between items-start">
                            <div>
                                <CardTitle className="text-base">{ticket.title}</CardTitle>
                                <CardDescription>{ticket.type}</CardDescription>
                            </div>
                            <Badge variant={ticket.status === 'En Mediación' ? 'secondary' : 'destructive'}>
                                {ticket.status}
                            </Badge>
                        </div>
                    </CardHeader>
                    <CardContent className="text-sm space-y-4">
                        <p className="text-muted-foreground">{ticket.description}</p>
                        <div className="flex flex-col gap-2 p-3 bg-muted/30 rounded-lg">
                            <span className="font-semibold text-xs uppercase tracking-wider text-muted-foreground">Partes Involucradas</span>
                            <div className="flex gap-2 flex-wrap">
                                {ticket.participants.map(p => (
                                    <Badge key={p} variant="outline" className="bg-background">{p}</Badge>
                                ))}
                            </div>
                        </div>
                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                            <span className="flex items-center gap-1"><Users className="w-3 h-3" /> Facilitador: {ticket.facilitator}</span>
                            <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {ticket.date}</span>
                        </div>
                    </CardContent>
                    <CardFooter>
                        <Button variant="ghost" className="w-full border">Ver Detalles del Caso</Button>
                    </CardFooter>
                </Card>
            ))}
        </div>
    )
}
