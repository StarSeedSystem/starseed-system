'use client';

import Link from "next/link";
import {
  Home,
  Rocket,
  Bot,
  Rss,
  FileText,
  Folder,
  Settings,
  AppWindow,
  MessageSquare,
  Users,
  Network,
  Book,
  Library,
  Info,
  PenSquare,
  User,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Logo } from "../logo";
import { cn } from "@/lib/utils";
import { usePathname } from "next/navigation";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

export function AppSidebar() {
  const pathname = usePathname();
  const isNetworkActive = pathname.startsWith('/network');

  return (
    <div className="hidden border-r bg-background/80 backdrop-blur-xl md:block">
      <div className="flex h-full max-h-screen flex-col gap-2">
        <div className="flex h-14 items-center border-b px-4 lg:h-[60px] lg:px-6">
          <Link href="/" className="flex items-center gap-2 font-semibold">
            <Logo />
          </Link>
        </div>
        <div className="flex-1">
          <nav className="grid items-start px-2 text-sm font-medium lg:px-4">
            <NavItem href="/dashboard">
              <Home className="h-4 w-4" />
              Dashboard
            </NavItem>
            <NavItem href="/profile/starseeduser">
              <User className="h-4 w-4" />
              Perfil
            </NavItem>
            <NavItem href="/agent">
              <Bot className="h-4 w-4" />
              Agente de IA
            </NavItem>
            <NavItem href="/messages">
              <MessageSquare className="h-4 w-4" />
              Mensajes
            </NavItem>
             <NavItem href="/hub">
              <Users className="h-4 w-4" />
              Hub de Conexiones
            </NavItem>

            <Accordion type="single" collapsible defaultValue={isNetworkActive ? "network" : ""}>
              <AccordionItem value="network" className="border-b-0">
                <AccordionTrigger className="flex items-center gap-3 rounded-lg px-3 py-2 text-muted-foreground transition-all hover:text-primary hover:no-underline [&[data-state=open]]:text-primary">
                  <Network className="h-4 w-4" />
                  La Red
                </AccordionTrigger>
                <AccordionContent className="pl-4">
                  <nav className="grid gap-1">
                    <NavItem href="/network/politics">
                      Política
                    </NavItem>
                    <NavItem href="/network/education">
                      Educación
                    </NavItem>
                     <NavItem href="/network/culture">
                      Cultura
                    </NavItem>
                  </nav>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
            
            <NavItem href="/publish">
                <PenSquare className="h-4 w-4" />
                Publicar
            </NavItem>
            <NavItem href="/library">
              <Library className="h-4 w-4" />
              Biblioteca
            </NavItem>
            <NavItem href="/info">
              <Info className="h-4 w-4" />
              Información
            </NavItem>
             <NavItem href="/settings">
              <Settings className="h-4 w-4" />
              Configuración
            </NavItem>
          </nav>
        </div>
      </div>
    </div>
  );
}

function NavItem({ href, children }: { href: string; children: React.ReactNode }) {
  const pathname = usePathname();
  const isActive = pathname === href;
  
  return (
    <Link
      href={href}
      className={cn(
        "flex items-center gap-3 rounded-lg px-3 py-2 text-muted-foreground transition-all hover:text-primary",
        isActive && "bg-muted text-primary"
      )}
    >
      {children}
    </Link>
  );
}
