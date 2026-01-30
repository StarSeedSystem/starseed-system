'use client';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ChevronRight, Users, Rocket, Clock } from "lucide-react";

export function CollabProjectsWidget() {
    // Simulated data
    const projects = [
        {
            id: 1,
            title: "Sistema Solar Artificial",
            status: "En Progreso",
            progress: 75,
            members: [1, 2, 3],
            deadline: "2d"
        },
        {
            id: 2,
            title: "Red Neuronal Cuántica",
            status: "Revisión",
            progress: 90,
            members: [4, 5],
            deadline: "5h"
        },
        {
            id: 3,
            title: "Archivo Akáshico",
            status: "Planeación",
            progress: 20,
            members: [1, 6, 7, 8],
            deadline: "1w"
        }
    ];

    return (
        <Card className="h-full border-none shadow-none bg-transparent">
            <CardHeader className="pb-2 px-0 pt-0">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <div className="p-2 rounded-full bg-violet-500/10">
                            <Rocket className="h-4 w-4 text-violet-500" />
                        </div>
                        <h3 className="font-semibold text-sm">Proyectos Activos</h3>
                    </div>
                    <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-white/10">
                        <ChevronRight className="h-4 w-4 opacity-50" />
                    </Button>
                </div>
            </CardHeader>
            <CardContent className="px-0 pb-0 space-y-4">
                {projects.map(project => (
                    <div key={project.id} className="group flex flex-col gap-3 p-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/5 transition-all cursor-pointer">
                        <div className="flex items-start justify-between">
                            <div>
                                <h4 className="font-medium text-sm text-shadow-sm">{project.title}</h4>
                                <div className="flex items-center gap-2 mt-1">
                                    <Badge variant="secondary" className="text-[10px] h-5 bg-violet-500/20 text-violet-200 border-0">
                                        {project.status}
                                    </Badge>
                                    <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                                        <Clock className="h-3 w-3" /> {project.deadline}
                                    </span>
                                </div>
                            </div>
                            <div className="flex -space-x-2">
                                {project.members.map((m, i) => (
                                    <Avatar key={i} className="h-6 w-6 border-2 border-background">
                                        <AvatarFallback className="text-[9px] bg-slate-800">U{m}</AvatarFallback>
                                    </Avatar>
                                ))}
                            </div>
                        </div>
                        <div className="space-y-1">
                            <div className="flex justify-between text-[10px] text-muted-foreground">
                                <span>Progreso</span>
                                <span>{project.progress}%</span>
                            </div>
                            <Progress value={project.progress} className="h-1 bg-white/10" indicatorClassName="bg-gradient-to-r from-violet-500 to-fuchsia-500" />
                        </div>
                    </div>
                ))}
            </CardContent>
        </Card>
    );
}
