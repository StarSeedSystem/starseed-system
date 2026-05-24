import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "../ui/button";

const proposals = [
    { title: "Propuesta de Ley de Agua Comunitaria", status: "Votación Activa", urgency: "Urgente", ef: "E.F. del Valle Central" },
    { title: "Financiamiento para Jardín Urbano", status: "En Debate", urgency: "Normal", ef: "E.F. del Valle Central" },
    { title: "Actualización de Protocolos de Mediación", status: "Votación Finaliza Pronto", urgency: "Alta", ef: "Todas" },
];

export function PoliticalSummaryWidget() {
    return (
        <Card>
            <CardHeader>
                <CardTitle className="font-headline">Resumen Político</CardTitle>
                <CardDescription>Propuestas relevantes en tus Entidades Federativas.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
               {proposals.map(p => (
                   <div key={p.title} className="p-3 rounded-lg border bg-muted/20">
                       <div className="flex justify-between items-start">
                           <p className="font-semibold text-sm pr-4">{p.title}</p>
                           <Badge variant={p.urgency === "Urgente" ? "destructive" : "secondary"}>{p.urgency}</Badge>
                       </div>
                       <p className="text-xs text-muted-foreground mt-1">{p.ef}</p>
                       <div className="flex justify-between items-center mt-3">
                           <p className="text-sm text-primary font-medium">{p.status}</p>
                           <Button size="sm" variant="outline">Ver y Votar</Button>
                       </div>
                   </div>
               ))}
            </CardContent>
        </Card>
    );
}
