import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { feedItems } from "@/lib/data";
import Link from "next/link";


export function RecentPostsWidget() {
    const recentPosts = feedItems.slice(0, 2);

    return (
        <Card>
            <CardHeader>
                <CardTitle className="font-headline">Publicaciones Recientes</CardTitle>
                <CardDescription>Última actividad y pensamientos compartidos.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                {recentPosts.map(item => (
                    <Link href="#" key={item.id} className="block p-3 rounded-lg border hover:bg-muted/50 transition-colors">
                        <p className="text-sm font-medium truncate">{item.content}</p>
                        <p className="text-xs text-muted-foreground mt-1">{item.timestamp}</p>
                    </Link>
                ))}
                 <Link href="#" className="text-sm font-semibold text-primary hover:underline">
                    Ver todas las publicaciones...
                </Link>
            </CardContent>
        </Card>
    )
}