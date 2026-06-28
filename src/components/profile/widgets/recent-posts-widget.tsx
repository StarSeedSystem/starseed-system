import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { feedItems } from "@/lib/data";
import Link from "next/link";
import { FilePreview, type FileLike } from "@/components/files/file-preview";

const postsData = {
    personal: {
        title: "Publicaciones Recientes",
        description: "Última actividad y pensamientos compartidos.",
        posts: feedItems.slice(0, 2),
    },
    comunidad: {
        title: "Actividad de la Comunidad",
        description: "Publicaciones y debates recientes.",
        posts: [
            { id: 'comm-1', content: '¡El taller de compostaje de este fin de semana fue un éxito! Gracias a todos los que vinieron.', timestamp: 'hace 1 día' },
            { id: 'comm-2', content: 'Se busca voluntario para liderar el proyecto de jardín de polinizadores.', timestamp: 'hace 3 días' },
        ]
    },
    ef: {
        title: "Propuestas y Anuncios",
        description: "Actividad legislativa y ejecutiva reciente.",
         posts: [
            { id: 'ef-1', content: 'Votación Abierta: Propuesta de Ley de Agua Comunitaria. Fecha límite: 30 de junio.', timestamp: 'hace 2 días' },
            { id: 'ef-2', content: 'Proyecto Aprobado: Financiamiento para Jardín Urbano en el Sector 5.', timestamp: 'hace 1 semana' },
        ]
    }
    // Add other page types if needed
}

export function RecentPostsWidget({ pageType = 'personal' }: { pageType: string }) {
    const data = postsData[pageType as keyof typeof postsData] || postsData.personal;

    return (
        <Card>
            <CardHeader>
                <CardTitle className="font-headline">{data.title}</CardTitle>
                <CardDescription>{data.description}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                {data.posts.map((item) => {
                    // Algunos posts traen un medio adjunto; lo previsualizamos con
                    // FilePreview FUERA del <Link> (no anidar interactivos en <a>).
                    const anyItem = item as any;
                    const mediaUrl: string | undefined =
                        anyItem.imageUrl || anyItem.media_url || anyItem.mediaUrl || anyItem.fileUrl || anyItem.url;
                    const file: FileLike | null = mediaUrl
                        ? {
                            url: mediaUrl,
                            name: anyItem.fileName || anyItem.title || undefined,
                            type: anyItem.mediaType || anyItem.type || undefined,
                            thumbnail: anyItem.thumbnail || anyItem.imageUrl || undefined,
                        }
                        : null;
                    return (
                        <div key={item.id} className="rounded-lg border hover:bg-muted/50 transition-colors">
                            <Link href={anyItem.href || "#"} className="block p-3">
                                <p className="text-sm font-medium truncate">{item.content}</p>
                                <p className="text-xs text-muted-foreground mt-1">{item.timestamp}</p>
                            </Link>
                            {file && (
                                <div className="px-3 pb-3">
                                    <FilePreview file={file} context="post" compact actions={false} />
                                </div>
                            )}
                        </div>
                    );
                })}
                 <Link href="#" className="text-sm font-semibold text-primary hover:underline">
                    Ver todas las publicaciones...
                </Link>
            </CardContent>
        </Card>
    )
}
