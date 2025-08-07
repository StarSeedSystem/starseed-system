import Link from "next/link";
import {
  Bell,
  Home,
  Menu,
  Search,
  Bot,
  MessageSquare,
  Users,
  Network,
  PenSquare,
  Library,
  Info,
  Settings,
  User
} from "lucide-react";
import { Button } from "@/components/ui/button";

import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { UserNav } from "./user-nav";
import { Logo } from "../logo";
import { NotificationCenter } from "./notification-center";

export function AppHeader() {
  return (
    <header className="flex h-14 items-center gap-4 border-b bg-background/80 backdrop-blur-xl px-4 lg:h-[60px] lg:px-6">
      <Sheet>
        <SheetTrigger asChild>
          <Button variant="outline" size="icon" className="shrink-0 md:hidden">
            <Menu className="h-5 w-5" />
            <span className="sr-only">Alternar menú de navegación</span>
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="flex flex-col">
           <SheetHeader>
              <SheetTitle className="sr-only">Menú de Navegación</SheetTitle>
           </SheetHeader>
          <nav className="grid gap-2 text-lg font-medium">
            <Link
              href="#"
              className="mb-4 flex items-center gap-2 text-lg font-semibold"
            >
              <Logo />
            </Link>
            <Link
              href="/dashboard"
              className="mx-[-0.65rem] flex items-center gap-4 rounded-xl px-3 py-2 text-muted-foreground hover:text-foreground"
            >
              <Home className="h-5 w-5" />
              Dashboard
            </Link>
            <Link
              href="/profile/starseeduser"
              className="mx-[-0.65rem] flex items-center gap-4 rounded-xl px-3 py-2 text-muted-foreground hover:text-foreground"
            >
              <User className="h-5 w-5" />
              Perfil
            </Link>
            <Link
              href="/agent"
              className="mx-[-0.65rem] flex items-center gap-4 rounded-xl px-3 py-2 text-muted-foreground hover:text-foreground"
            >
              <Bot className="h-5 w-5" />
              Agente de IA
            </Link>
            <Link
              href="/messages"
              className="mx-[-0.65rem] flex items-center gap-4 rounded-xl px-3 py-2 text-muted-foreground hover:text-foreground"
            >
              <MessageSquare className="h-5 w-5" />
              Mensajes
            </Link>
            <Link
              href="/hub"
              className="mx-[-0.65rem] flex items-center gap-4 rounded-xl px-3 py-2 text-muted-foreground hover:text-foreground"
            >
              <Users className="h-5 w-5" />
              Hub de Conexiones
            </Link>
            <Link
              href="/network"
              className="mx-[-0.65rem] flex items-center gap-4 rounded-xl px-3 py-2 text-muted-foreground hover:text-foreground"
            >
              <Network className="h-5 w-5" />
              La Red
            </Link>
            <Link
              href="/publish"
              className="mx-[-0.65rem] flex items-center gap-4 rounded-xl px-3 py-2 text-muted-foreground hover:text-foreground"
            >
              <PenSquare className="h-5 w-5" />
              Publicar
            </Link>
             <Link
              href="/library"
              className="mx-[-0.65rem] flex items-center gap-4 rounded-xl px-3 py-2 text-muted-foreground hover:text-foreground"
            >
              <Library className="h-5 w-5" />
              Biblioteca
            </Link>
            <Link
              href="/info"
              className="mx-[-0.65rem] flex items-center gap-4 rounded-xl px-3 py-2 text-muted-foreground hover:text-foreground"
            >
              <Info className="h-5 w-5" />
              Información
            </Link>
            <Link
              href="/settings"
              className="mx-[-0.65rem] flex items-center gap-4 rounded-xl px-3 py-2 text-muted-foreground hover:text-foreground"
            >
              <Settings className="h-5 w-5" />
              Configuración
            </Link>
          </nav>
        </SheetContent>
      </Sheet>
      <div className="w-full flex-1">
        <form>
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Buscar funciones, documentos..."
              className="w-full appearance-none bg-background/80 pl-8 shadow-none md:w-2/3 lg:w-1/3"
            />
          </div>
        </form>
      </div>
      <NotificationCenter />
      <UserNav />
    </header>
  );
}
