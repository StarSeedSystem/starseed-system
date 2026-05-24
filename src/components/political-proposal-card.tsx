// src/components/political-proposal-card.tsx
'use client'

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BarChart, FileText, MessageSquare, Bookmark, Sparkles, PlusCircle } from "lucide-react";
import { Bar, BarChart as RechartsBarChart, ResponsiveContainer, XAxis, YAxis, Tooltip } from 'recharts';
import { politicalProposals, type Comment as CommentType } from "@/lib/data";
import { CommentSystem } from "@/components/comment-system";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "./ui/dialog";
import { RadioGroup, RadioGroupItem } from "./ui/radio-group";
import { Label } from "./ui/label";
import { Separator } from "./ui/separator";
import { Input } from "./ui/input";
import { Skeleton } from "./ui/skeleton";


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

function VotingDialog({ proposal, open, onOpenChange }: { proposal: typeof politicalProposals[0], open: boolean, onOpenChange: (open: boolean) => void }) {
    const [voteOptions, setVoteOptions] = useState(proposal.votes);
    const [newOption, setNewOption] = useState("");
    const [aiAnalysis, setAiAnalysis] = useState("");
    const [isAnalyzing, setIsAnalyzing] = useState(false);

    const handleProposeOption = () => {
        if(newOption.trim()) {
            const newVoteOption = { name: newOption, votes: 0, color: 'hsl(var(--muted-foreground-hsl))' };
            setVoteOptions([...voteOptions, newVoteOption]);
            setNewOption("");
        }
    }

    const handleAnalyze = () => {
        setIsAnalyzing(true);
        // Simulate AI analysis
        setTimeout(() => {
            setAiAnalysis("Basado en el análisis de recursos, impacto comunitario y alineación con los principios constitucionales, la opción 'A Favor' parece ser la más beneficiosa a largo plazo. Sin embargo, la enmienda propuesta para una revisión periódica de la eficiencia de datos (sugerida en los comentarios) mitigaría los riesgos tecnológicos. Una votación 'A Favor', condicionada a la inclusión de esta enmienda, sería el curso de acción óptimo.");
            setIsAnalyzing(false);
        }, 1500);
    }

    return (
        <DialogContent className="sm:max-w-2xl">
            <DialogHeader>
                <DialogTitle className="font-headline text-2xl">{proposal.title}</DialogTitle>
                <DialogDescription>
                    Emitir tu voto es un acto de participación directa en la gobernanza. Revisa las opciones y el análisis de la IA antes de decidir.
                </DialogDescription>
            </DialogHeader>
            <div className="grid md:grid-cols-2 gap-8 py-4">
                <div className="space-y-6">
                    <div>
                        <h3 className="font-semibold mb-4">Elige tu Voto</h3>
                        <RadioGroup defaultValue={voteOptions[0].name} className="space-y-2">
                           {voteOptions.map(option => (
                             <div key={option.name} className="flex items-center space-x-2">
                                <RadioGroupItem value={option.name} id={option.name} />
                                <Label htmlFor={option.name}>{option.name}</Label>
                            </div>
                           ))}
                        </RadioGroup>
                    </div>
                     <Separator />
                     <div>
                        <h3 className="font-semibold mb-2">Proponer una Nueva Opción</h3>
                        <div className="flex gap-2">
                            <Input 
                                placeholder="Escribe tu propuesta de opción..." 
                                value={newOption}
                                onChange={(e) => setNewOption(e.target.value)}
                            />
                            <Button variant="outline" size="icon" onClick={handleProposeOption}><PlusCircle /></Button>
                        </div>
                     </div>
                </div>
                <div className="space-y-4 rounded-lg bg-muted/50 p-4 border">
                    <h3 className="font-semibold flex items-center gap-2"><Sparkles className="text-primary"/> Análisis de la IA</h3>
                    {isAnalyzing ? (
                        <div className="space-y-2">
                            <Skeleton className="h-4 w-full" />
                            <Skeleton className="h-4 w-full" />
                            <Skeleton className="h-4 w-3/4" />
                        </div>
                    ) : aiAnalysis ? (
                        <p className="text-sm text-muted-foreground">{aiAnalysis}</p>
                    ) : (
                         <p className="text-sm text-muted-foreground">La IA puede analizar esta propuesta considerando el impacto, los recursos y el sentimiento comunitario para ofrecerte una sugerencia imparcial.</p>
                    )}
                    <Button className="w-full" onClick={handleAnalyze} disabled={isAnalyzing}>
                        {isAnalyzing ? "Analizando..." : "Pedir Análisis a la IA"}
                    </Button>
                </div>
            </div>
            <DialogFooter>
                <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
                <Button onClick={() => onOpenChange(false)}>Emitir Voto</Button>
            </DialogFooter>
        </DialogContent>
    )
}

export function PoliticalProposalCard({ proposal }: { proposal: typeof politicalProposals[0] }) {
    const totalVotes = proposal.votes.reduce((acc, v) => acc + v.votes, 0);
    const chartData = proposal.votes.map(v => ({...v, percentage: (v.votes / totalVotes) * 100}));
    const [isVotingDialogOpen, setVotingDialogOpen] = useState(false);

    return (
        <>
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
                        <DialogTrigger asChild>
                            <Button size="lg" className="flex-1">Ver Propuesta y Votar</Button>
                        </DialogTrigger>
                        <Button size="lg" variant="outline">
                            <Bookmark />
                        </Button>
                    </div>
                </CardFooter>
            </Card>
            <VotingDialog proposal={proposal} open={isVotingDialogOpen} onOpenChange={setVotingDialogOpen} />
        </>
    )
}
