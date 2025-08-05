import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Rocket, Bot } from "lucide-react";
import Link from "next/link";

export function ActionsWidget() {
    return (
        <Card>
            <CardHeader>
                <CardTitle className="font-headline">Acciones Rápidas</CardTitle>
                <CardDescription>Salta directamente a la creación.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
                <Button asChild className="w-full justify-start">
                    <Link href="/apps/create">
                        <Rocket className="mr-2 h-4 w-4" />
                        Generar una nueva App
                    </Link>
                </Button>
                <Button asChild variant="secondary" className="w-full justify-start">
                    <Link href="/compose">
                        <Bot className="mr-2 h-4 w-4" />
                        Componer un Mensaje
                    </Link>
                </Button>
            </CardContent>
        </Card>
    )
}
