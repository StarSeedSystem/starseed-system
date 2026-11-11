import * as React from "react";
import { createRoot } from "react-dom/client";
import { Dialog, DialogContent, DialogHeader, DialogFooter, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogFooter, AlertDialogTitle, AlertDialogDescription, AlertDialogAction, AlertDialogCancel } from "@/components/ui/alert-dialog";
import { Sheet, SheetContent, SheetHeader, SheetFooter, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AsistentePermisos } from "@/components/nativa/asistente-permisos";

const LARGO = "Título extremadamente largo de una ventana de StarSeed OS que no debe empujar el diseño fuera de la pantalla jamás";
const parrafos = Array.from({ length: 24 }, (_, i) => (
  <p key={i} className="text-sm">Párrafo {i + 1}: contenido realista de la ventana con texto largo que ocupa varias líneas en una pantalla pequeña para forzar el desplazamiento interior.</p>
));
const q = new URLSearchParams(location.search);
const w = q.get("w") || "dialog-largo";
const noop = () => {};

function Pie() {
  return (<><button className="border px-3 py-2" data-accion>Cancelar</button><button className="border px-3 py-2" data-accion>Guardar cambios</button><button className="border px-3 py-2" data-accion>Aplicar y cerrar</button></>);
}
function App() {
  switch (w) {
    case "dialog-largo": return (
      <Dialog open onOpenChange={noop}><DialogContent><DialogHeader><DialogTitle>{LARGO}</DialogTitle><DialogDescription>Descripción de la ventana.</DialogDescription></DialogHeader>
        <div className="space-y-2">{parrafos}<input className="border w-full p-2" placeholder="Campo" data-accion /></div>
        <DialogFooter><Pie /></DialogFooter></DialogContent></Dialog>);
    case "dialog-corto": return (
      <Dialog open onOpenChange={noop}><DialogContent><DialogHeader><DialogTitle>Aviso</DialogTitle></DialogHeader><p>Texto corto.</p><DialogFooter><Pie /></DialogFooter></DialogContent></Dialog>);
    case "alert-dialog": return (
      <AlertDialog open onOpenChange={noop}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>{LARGO}</AlertDialogTitle><AlertDialogDescription>{parrafos}</AlertDialogDescription></AlertDialogHeader>
        <AlertDialogFooter><AlertDialogCancel data-accion>Cancelar</AlertDialogCancel><AlertDialogAction data-accion>Eliminar definitivamente</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>);
    case "sheet-bottom": case "sheet-top": case "sheet-right": return (
      <Sheet open onOpenChange={noop}><SheetContent side={w.slice(6) as "bottom" | "top" | "right"}><SheetHeader><SheetTitle>{LARGO}</SheetTitle><SheetDescription>Hoja</SheetDescription></SheetHeader>
        <div className="space-y-2 flex-1">{parrafos}</div><SheetFooter><Pie /></SheetFooter></SheetContent></Sheet>);
    case "popover": return (
      <div style={{ position: "fixed", bottom: 40, left: 20 }}><Popover open><PopoverTrigger asChild><button className="border p-2">Abrir</button></PopoverTrigger>
        <PopoverContent className="w-[30rem]"><div className="space-y-2">{parrafos}<button data-accion className="border p-2">Aceptar</button></div></PopoverContent></Popover></div>);
    case "dropdown": return (
      <div style={{ position: "fixed", bottom: 60, right: 10 }}><DropdownMenu open><DropdownMenuTrigger asChild><button className="border p-2">Menú</button></DropdownMenuTrigger>
        <DropdownMenuContent>{Array.from({ length: 40 }, (_, i) => <DropdownMenuItem key={i} data-accion>Opción número {i + 1} con etiqueta larga</DropdownMenuItem>)}</DropdownMenuContent></DropdownMenu></div>);
    case "select": return (
      <div style={{ position: "fixed", top: 30, left: 10 }}><Select open><SelectTrigger className="w-40"><SelectValue placeholder="Elige" /></SelectTrigger>
        <SelectContent>{Array.from({ length: 60 }, (_, i) => <SelectItem key={i} value={String(i)}>Elemento {i + 1}</SelectItem>)}</SelectContent></Select></div>);
    case "tabs": return (
      <div className="p-2"><Tabs defaultValue="t0"><TabsList>{Array.from({ length: 10 }, (_, i) => <TabsTrigger key={i} value={"t" + i} data-accion>Pestaña {i + 1} larga</TabsTrigger>)}</TabsList></Tabs></div>);
    case "mano": return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 ss-capa-modal"><div className="w-full max-w-md rounded-2xl border bg-zinc-950 text-white p-4 sm:p-5 ss-ventana-limite" role="dialog">
        <h2 className="text-lg font-semibold ss-titulo-seguro">{LARGO}</h2>{parrafos}<div className="flex gap-2 ss-dialogo-pie"><Pie /></div></div></div>);
    case "permisos": return <AsistentePermisos />;
  }
  return null;
}
createRoot(document.getElementById("root")!).render(<App />);
