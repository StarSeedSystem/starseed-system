// src/app/(main)/library/page.tsx
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { File, Folder, Grid, List, MoreVertical, PlusCircle, Search, Upload } from "lucide-react";
import Image from "next/image";

const files = [
  { id: 1, type: "image", name: "Concept Art v1", size: "2.5 MB", date: "2024-06-10", preview: "https://placehold.co/400x300.png", dataAiHint: "concept art" },
  { id: 2, type: "document", name: "Propuesta de Proyecto", size: "512 KB", date: "2024-06-09", icon: <File className="w-12 h-12 text-muted-foreground" /> },
  { id: 3, type: "video", name: "Demo Animación UI", size: "15.2 MB", date: "2024-06-08", preview: "https://placehold.co/400x300.png", dataAiHint: "animation" },
  { id: 4, type: "folder", name: "Documentos de Investigación", size: "123 archivos", date: "2024-06-07", icon: <Folder className="w-12 h-12 text-muted-foreground" /> },
  { id: 5, type: "audio", name: "Podcast Episodio 3", size: "30.1 MB", date: "2024-06-06", preview: "https://placehold.co/400x300.png", dataAiHint: "sound wave" },
  { id: 6, type: "image", name: "Foto del Equipo", size: "4.1 MB", date: "2024-06-05", preview: "https://placehold.co/400x300.png", dataAiHint: "team photo" },
];

export default function LibraryPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-3xl font-bold font-headline">Biblioteca</h1>
        <p className="text-muted-foreground">
          Organiza todas tus herramientas digitales, archivos y avatares.
        </p>
      </div>

      <div className="flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="relative w-full md:w-1/2 lg:w-1/3">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar por nombre, tipo o etiqueta..." className="pl-8" />
        </div>
        <div className="flex gap-2">
            <Button variant="outline">
                <Folder className="mr-2 h-4 w-4" />
                Nueva Carpeta
            </Button>
            <Button>
                <Upload className="mr-2 h-4 w-4" />
                Subir Archivo
            </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
        {files.map(file => (
          <Card key={file.id} className="overflow-hidden">
            <CardContent className="p-0">
                <div className="aspect-video bg-muted flex items-center justify-center">
                    {file.preview ? (
                        <Image src={file.preview} alt={file.name} width={400} height={300} className="object-cover w-full h-full" data-ai-hint={file.dataAiHint} />
                    ) : (
                        file.icon
                    )}
                </div>
            </CardContent>
            <CardFooter className="flex-col items-start p-3">
              <div className="flex justify-between w-full items-start">
                <div className="flex-1">
                  <p className="text-sm font-semibold truncate">{file.name}</p>
                  <p className="text-xs text-muted-foreground">{file.size}</p>
                </div>
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0">
                            <MoreVertical className="h-4 w-4" />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                        <DropdownMenuItem>Renombrar</DropdownMenuItem>
                        <DropdownMenuItem>Mover</DropdownMenuItem>
                        <DropdownMenuItem>Compartir</DropdownMenuItem>
                        <DropdownMenuItem className="text-destructive">Eliminar</DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </CardFooter>
          </Card>
        ))}
      </div>
    </div>
  );
}
