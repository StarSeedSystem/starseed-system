// src/app/(main)/network/politics/page.tsx
'use client'

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BarChart, FileText, Scale, Users, MessageSquare, Bookmark } from "lucide-react";
import { Bar, BarChart as RechartsBarChart, ResponsiveContainer, XAxis, YAxis, Tooltip } from 'recharts';
import { politicalProposals } from "@/lib/data";
import { CommentSystem } from "@/components/comment-system";


function VoteChart({ data }: { data: any[] }) {
    return (
        <div className="h-40 w-full">
            <ResponsiveContainer width="100%" height="100%">
                <RechartsBarChart data={data} layout="vertical" margin={{ left: 20, right: 20 }}>
                    <XAxis type="number" hide />
                    <YAxis type="category" dataKey="name" hide />
                    <Tooltip 
                        cursor={{ fill: 'hsla(var(--muted-hsl), 0.5)' }}
                        content={({ active, payload }) => {
                          if (active && payload && payload.length) {
                            return (
                              <div className="rounded-lg border bg-background p-2 shadow-sm">
                                <div className="grid grid-cols-2 gap-2">
                                  <div className="flex flex-col">
                                    <span className="text-[0.70rem] uppercase text-muted-foreground">
                                      {payload[0].payload.name}
                                    </span>
                                    <span className="font-bold text-muted-foreground">
                                      {payload[0].value} Votos
                                    </span>
                                  </div>
                                </div>
                              </div>
                            )
                          }
                          return null
                        }}
                    />
                    <Bar dataKey="votes" shape={(props) => {
                       const { x, y, width, height, payload } = props;
                       return <rect x={x} y={y} width={width} height={height} rx={3} ry={3} fill={payload.color} />
                    }}/>
                </RechartsBarChart>
            </ResponsiveContainer>
        </div>
    )
}

function PoliticalProposalCard({ proposal }: { proposal: typeof politicalProposals[0] }) {
    const totalVotes = proposal.votes.reduce((acc, v) => acc + v.votes, 0);
    const chartData = proposal.votes.map(v => ({...v, percentage: (v.votes / totalVotes) * 100}));

    return (
        <Card>
            <CardHeader>
                <div className="flex justify-between items-start gap-4">
                    <div>
                        <CardTitle className="font-headline text-xl">{proposal.title}</CardTitle>
                        <CardDescription className="mt-1">Propuesta en: <span className="font-semibold text-primary">{proposal.ef}</span></CardDescription>
                    </div>
                     <Badge variant={proposal.urgency === "Urgente" ? "destructive" : "secondary"}>{proposal.urgency}</Badge>
                </div>
            </CardHeader>
            <CardContent>
                <p className="text-sm text-muted-foreground mb-6">{proposal.summary}</p>
                
                <Tabs defaultValue="votos">
                    <TabsList className="grid w-full grid-cols-4">
                        <TabsTrigger value="votos">Votos</TabsTrigger>
                        <TabsTrigger value="detalles">Detalles</TabsTrigger>
                        <TabsTrigger value="discusión" className="flex items-center gap-2">
                            Discusión <Badge variant="secondary" className="px-1.5">{proposal.comments.length}</Badge>
                        </TabsTrigger>
                        <TabsTrigger value="archivos">Archivos</TabsTrigger>
                    </TabsList>
                    <TabsContent value="votos" className="mt-4">
                        <h4 className="font-semibold mb-2">Resultados Actuales</h4>
                        <VoteChart data={chartData} />
                        <div className="mt-4 space-y-2">
                            {proposal.votes.map(option => (
                                <div key={option.name} className="flex justify-between items-center text-sm">
                                    <span className="font-medium">{option.name}</span>
                                    <span className="text-muted-foreground">{option.votes} votos ({(option.votes / totalVotes * 100).toFixed(1)}%)</span>
                                </div>
                            ))}
                        </div>
                    </TabsContent>
                    <TabsContent value="detalles" className="mt-4">
                        <p className="text-sm text-muted-foreground">{proposal.details}</p>
                    </TabsContent>
                    <TabsContent value="discusión" className="mt-4">
                        <CommentSystem comments={proposal.comments} />
                    </TabsContent>
                    <TabsContent value="archivos" className="mt-4">
                        <div className="flex flex-col gap-2">
                            {proposal.files.map(file => (
                                <Button variant="outline" asChild key={file.name} className="justify-start">
                                    <a href={file.url} target="_blank">
                                        <FileText className="mr-2 h-4 w-4" />
                                        {file.name}
                                    </a>
                                </Button>
                            ))}
                        </div>
                    </TabsContent>
                </Tabs>
            </CardContent>
            <CardFooter className="flex-col items-stretch gap-4">
                 <div className="flex justify-between items-center text-sm text-muted-foreground">
                    <span>Estado: <span className="text-primary font-semibold">{proposal.status}</span></span>
                    <span>Finaliza en: {proposal.deadline}</span>
                </div>
                <div className="flex gap-2">
                    <Button size="lg" className="flex-1">Ver Propuesta y Votar</Button>
                    <Button size="lg" variant="outline">
                        <Bookmark />
                    </Button>
                </div>
            </CardFooter>
        </Card>
    )
}


export default function PoliticsPage() {
  return (
    <Tabs defaultValue="legislativo" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="legislativo"><Scale className="mr-2 h-4 w-4"/>Legislativo</TabsTrigger>
            <TabsTrigger value="ejecutivo"><Users className="mr-2 h-4 w-4"/>Ejecutivo</TabsTrigger>
            <TabsTrigger value="judicial"><BarChart className="mr-2 h-4 w-4"/>Judicial</TabsTrigger>
        </TabsList>
        <TabsContent value="legislativo" className="mt-6">
            <div className="space-y-6">
                {politicalProposals.map(p => (
                   <PoliticalProposalCard key={p.id} proposal={p} />
                ))}
            </div>
        </TabsContent>
        <TabsContent value="ejecutivo" className="mt-6 text-center text-muted-foreground py-12">
            <p>La sección del Ejecutivo está en desarrollo.</p>
        </TabsContent>
        <TabsContent value="judicial" className="mt-6 text-center text-muted-foreground py-12">
            <p>La sección Judicial está en desarrollo.</p>
        </TabsContent>
    </Tabs>
  );
}
