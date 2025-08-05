import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Sparkles } from "lucide-react";
import Image from "next/image";

export function WelcomeWidget() {
  return (
    <Card className="relative overflow-hidden">
        <div className="absolute -right-20 -top-10 -z-10 opacity-10">
          <svg width="400" height="300" viewBox="0 0 400 300" fill="none" xmlns="http://www.w3.org/2000/svg">
              <g clipPath="url(#clip0_101_2)">
              <path d="M112.553 29.882C130.336 -2.71803 182.886 -9.21803 211.953 18.082C241.02 45.382 240.253 93.982 222.453 126.582C204.653 159.182 173.953 177.582 144.886 160.282C115.819 142.982 108.953 103.582 112.553 70.982C116.153 38.382 94.7696 62.482 112.553 29.882Z" fill="url(#paint0_linear_101_2)"/>
              <path d="M259.953 147.282C296.553 107.482 363.353 113.982 393.153 154.582C422.953 195.182 402.053 252.382 365.453 271.682C328.853 290.982 281.353 268.482 251.553 227.882C221.753 187.282 223.353 187.082 259.953 147.282Z" fill="url(#paint1_linear_101_2)"/>
              </g>
              <defs>
              <linearGradient id="paint0_linear_101_2" x1="168" y1="20" x2="168" y2="165.5" gradientUnits="userSpaceOnUse">
              <stop stopColor="hsl(var(--primary-hsl))"/>
              <stop offset="1" stopColor="hsl(var(--primary-hsl))" stopOpacity="0"/>
              </linearGradient>
              <linearGradient id="paint1_linear_101_2" x1="327.5" y1="131" x2="327.5" y2="282.5" gradientUnits="userSpaceOnUse">
              <stop stopColor="hsl(var(--secondary-hsl))"/>
              <stop offset="1" stopColor="hsl(var(--secondary-hsl))" stopOpacity="0"/>
              </linearGradient>
              <clipPath id="clip0_101_2">
              <rect width="400" height="300" fill="white"/>
              </clipPath>
              </defs>
          </svg>
        </div>
        <CardHeader>
            <CardTitle className="font-headline text-2xl">Welcome to StarSeed Network</CardTitle>
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
    </Card>
  )
}
