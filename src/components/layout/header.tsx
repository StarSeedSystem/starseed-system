"use client";

import Link from "next/link";
import { useState } from "react";
import {
  Bell,
  Search,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { UserNav } from "./user-nav";
import { NotificationCenter } from "./notification-center";

export function AppHeader() {
  // Mobile menu removed as per request to rely on Trinity Dock

  return (
    <header className="flex h-14 items-center gap-4 border-b bg-background/80 backdrop-blur-xl px-4 lg:h-[60px] lg:px-6">
      {/* Search Bar */}
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

      {/* Right Side Actions */}
      <NotificationCenter />
      <UserNav />
    </header>
  );
}
