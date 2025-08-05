import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Sparkles } from "lucide-react";
import Image from "next/image";

export function WelcomeWidget() {
  return (
    <Card className="relative overflow-hidden">
        <CardHeader>
            <CardTitle className="font-headline text-2xl">Welcome to Star Weaver</CardTitle>
            <CardDescription>Your integrated AI-powered workspace is ready.</CardDescription>
        </CardHeader>
        <CardContent>
            <p className="mb-4 max-w-prose text-sm text-muted-foreground">
                Seamlessly generate apps, compose messages, and manage your workflow with the power of AI. Explore the sidebar to discover what you can create today.
            </p>
            <Button>
                <Sparkles className="mr-2 h-4 w-4" />
                Explore AI Features
            </Button>
        </CardContent>
        <Image 
            src="https://placehold.co/400x300.png"
            alt="Abstract background"
            width={400}
            height={300}
            className="absolute -right-20 -top-10 opacity-10 -z-10"
            data-ai-hint="abstract geometric"
        />
    </Card>
  )
}
