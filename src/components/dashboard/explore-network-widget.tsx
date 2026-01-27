import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Landmark, School, Palette } from "lucide-react";
import Link from "next/link";

export function ExploreNetworkWidget() {
    return (
        <Card>
            <CardHeader>
                <CardTitle className="font-headline">Explorar la Red</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Button asChild size="lg" className="h-20 flex-col gap-2">
                    <Link href="/network/politics">
                        <Landmark className="w-6 h-6" />
                        <span>Política</span>
                    </Link>
                </Button>
                <Button asChild size="lg" className="h-20 flex-col gap-2">
                    <Link href="/network/education">
                        <School className="w-6 h-6" />
                        <span>Educación</span>
                    </Link>
                </Button>
                <Button asChild size="lg" className="h-20 flex-col gap-2">
                    <Link href="/network/culture">
                        <Palette className="w-6 h-6" />
                        <span>Cultura</span>
                    </Link>
                </Button>
            </CardContent>
        </Card>
    );
}
