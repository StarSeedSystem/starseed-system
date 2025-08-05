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
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Logo } from "../logo";
import { cn } from "@/lib/utils";
import { usePathname } from "next/navigation";

export function AppSidebar() {
  return (
    <div className="hidden border-r bg-muted/40 md:block">
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
            <NavItem href="/apps/create">
              <Rocket className="h-4 w-4" />
              AI App Generator
              <Badge className="ml-auto flex h-6 w-6 shrink-0 items-center justify-center rounded-full">
                AI
              </Badge>
            </NavItem>
            <NavItem href="/compose">
              <Bot className="h-4 w-4" />
              AI Message Composer
               <Badge className="ml-auto flex h-6 w-6 shrink-0 items-center justify-center rounded-full">
                AI
              </Badge>
            </NavItem>
            <NavItem href="/feed">
              <Rss className="h-4 w-4" />
              Feed
            </NavItem>
            <NavItem href="/document/1">
              <FileText className="h-4 w-4" />
              Documents
            </NavItem>
             <NavItem href="/files">
              <Folder className="h-4 w-4" />
              File Manager
            </NavItem>
             <NavItem href="/settings">
              <Settings className="h-4 w-4" />
              Settings
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
