"use client";

import Link from "next/link";
import {
  Home,
  Bot,
  MessageSquare,
  Users,
  Network,
  Library,
  Info,
  PenSquare,
  User,
  Settings,
  Globe,
  Cloud,
  Sun,
  Layers,
  type LucideIcon
} from "lucide-react";
import { Logo } from "../logo";
import { cn } from "@/lib/utils";
import { usePathname } from "next/navigation";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAppearance } from "@/context/appearance-context";
import { useControlPanel } from "@/context/control-panel-context";

export function AppSidebar({
  side = "left",
  className
}: {
  side?: "left" | "right" | "top" | "bottom";
  className?: string;
}) {
  const pathname = usePathname();
  const { config } = useAppearance();
  const { toggle } = useControlPanel();
  const { menuStyle, iconStyle, menuBehavior } = config.layout;

  const isNetworkActive = pathname.startsWith('/network');
  const isHorizontal = side === "top" || side === "bottom";
  const isDock = menuStyle === "dock";

  // Icon props generator - increased sizes
  const getIconProps = () => ({
    strokeWidth: iconStyle === "thin" ? 1 : 1.5,
    fill: iconStyle === "solid" ? "currentColor" : "none",
    className: "h-5 w-5 sm:h-6 sm:w-6"
  });

  const NavItem = ({ href, icon: Icon, label, children, className }: { href?: string, icon?: LucideIcon, label?: string, children?: React.ReactNode, className?: string }) => {
    const isActive = href ? pathname === href : false;
    const content = (
      <>
        {Icon && <Icon {...getIconProps()} />}
        {label && <span className={cn(isHorizontal && "hidden lg:inline")}>{label}</span>}
        {children}
      </>
    );

    const baseClass = cn(
      "flex items-center gap-4 rounded-full px-5 py-3.5 transition-all hover:text-foreground cursor-pointer text-base md:text-lg w-full",
      isActive ? "bg-foreground/10 text-foreground font-medium shadow-sm backdrop-blur-md border border-foreground/5" : "text-foreground/70 hover:bg-foreground/5",
      className
    );

    if (href) {
      return <Link href={href} className={baseClass}>{content}</Link>;
    }
    return <div className={baseClass}>{content}</div>;
  };

  return (
    <div className={cn(
      "bg-background/80 backdrop-blur-2xl transition-all duration-500 ease-in-out",

      // Border logic (only if not dock)
      !isDock && !isHorizontal && (side === "left" ? "border-r border-foreground/10" : "border-l border-foreground/10"),
      !isDock && isHorizontal && (side === "top" ? "border-b border-foreground/10" : "border-t border-foreground/10"),

      // Dock Logic
      isDock && "m-4 rounded-3xl border border-foreground/10 shadow-2xl bg-card/60 dark:bg-black/60",
      isDock && !isHorizontal && "h-[calc(100vh-2rem)]",

      // Behavior Logic
      menuBehavior === 'sticky' && !isHorizontal && "sticky top-0 h-screen",
      menuBehavior === 'sticky' && isHorizontal && "sticky top-0 z-50",

      // Floating/Stacking context for sticky
      (menuBehavior === 'sticky' || isDock) && "z-40",

      "relative overflow-hidden shadow-[inset_0_0_20px_rgba(255,255,255,0.05),0_8px_32px_rgba(0,0,0,0.1)] dark:shadow-[inset_0_0_20px_rgba(255,255,255,0.05),0_8px_32px_rgba(0,0,0,0.4)]",

      className
    )}>
      <div className={cn(
        "flex h-full flex-col gap-4",
        !isHorizontal && "max-h-screen py-4",
        isHorizontal && "flex-row h-20 items-center px-6 lg:px-8",
        // Allow inner scrolling when sticky
        menuBehavior === 'sticky' && !isHorizontal && "overflow-hidden"
      )}>
        <div className={cn(
          "flex items-center justify-center",
          !isHorizontal && "pb-6 border-b border-foreground/10 px-4 shrink-0",
          isHorizontal && "mr-8",
          // Hide border in dock mode if desired, or keep specific styling
          isDock && "border-b-0"
        )}>
          <Link href="/" className="flex items-center gap-3 font-semibold scale-110 md:scale-125 transition-transform hover:scale-130">
            <Logo />
          </Link>
        </div>
        <div className={cn(
          "flex-1 overflow-auto py-2 custom-scrollbar",
          isHorizontal && "flex items-center justify-center w-full"
        )}>
          <nav className={cn(
            "grid font-medium w-full",
            !isHorizontal && "items-stretch px-4 lg:px-6 gap-2",
            isHorizontal && "flex items-center justify-center w-full gap-2 md:gap-4 lg:gap-6 mx-auto"
          )}>
            <NavItem href="/dashboard" icon={Home} label="Dashboard" />
            <NavItem href="/profile/starseeduser" icon={User} label="Perfil" />
            <NavItem href="/agent" icon={Bot} label="IA" />
            <NavItem href="/messages" icon={MessageSquare} label="Mensajes" />
            <NavItem href="/hub" icon={Users} label="Hub" />

            {/* Weather Apps */}
            <div className={cn(
              "mt-4 mb-2 text-xs md:text-sm font-semibold text-foreground/50 uppercase tracking-widest",
              !isHorizontal && "px-4",
              isHorizontal && "hidden"
            )}>
              Atmósfera
            </div>
            <NavItem href="/atmosphere" icon={Layers} label="Centro Climático" />

            <div className={cn(
              "mt-4 mb-2 text-xs md:text-sm font-semibold text-foreground/50 uppercase tracking-widest",
              !isHorizontal && "px-4",
              isHorizontal && "hidden"
            )}>
              Sistema
            </div>
            {!isHorizontal && (
              <Accordion type="single" collapsible defaultValue={isNetworkActive ? "network" : ""}>
                <AccordionItem value="network" className="border-b-0 w-full">
                  <AccordionTrigger className="flex items-center w-full gap-4 rounded-full px-5 py-3.5 text-base md:text-lg text-foreground/70 transition-all hover:text-foreground hover:bg-foreground/5 hover:no-underline [&[data-state=open]]:text-foreground [&[data-state=open]]:bg-foreground/5 [&[data-state=open]]:font-medium">
                    <div className="flex items-center gap-3 md:gap-4">
                      <Network {...getIconProps()} />
                      La Red
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="pl-6 md:pl-8 pt-2">
                    <nav className="grid gap-2 border-l-2 border-foreground/10 pl-4 ml-2">
                      <NavItem href="/network/politics" label="Política" className="py-2 text-sm md:text-base opacity-80" />
                      <NavItem href="/network/education" label="Educación" className="py-2 text-sm md:text-base opacity-80" />
                      <NavItem href="/network/culture" label="Cultura" className="py-2 text-sm md:text-base opacity-80" />
                    </nav>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            )}

            {isHorizontal && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  {/* Using NavItem as a generic trigger without href */}
                  <button className="flex items-center gap-3 md:gap-4 rounded-full px-4 py-3 md:px-5 md:py-3 text-base md:text-lg text-foreground/70 hover:bg-foreground/5 transition-all hover:text-foreground outline-none">
                    <Network {...getIconProps()} />
                    <span className={cn("hidden lg:inline")}>La Red</span>
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="rounded-2xl border-foreground/10 bg-card/90 backdrop-blur-xl p-2 min-w-[200px]">
                  <DropdownMenuItem asChild className="rounded-xl py-3 cursor-pointer text-base">
                    <Link href="/network/politics">Política</Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild className="rounded-xl py-3 cursor-pointer text-base">
                    <Link href="/network/education">Educación</Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild className="rounded-xl py-3 cursor-pointer text-base">
                    <Link href="/network/culture">Cultura</Link>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}

            <NavItem href="/publish" icon={PenSquare} label="Publicar" />
            <NavItem href="/explorer" icon={Globe} label="Explorador" />
            <NavItem href="/library" icon={Library} label="Biblioteca" />
            <NavItem href="/info" icon={Info} label="Info" />
            <NavItem href="/settings" icon={Settings} label="Config" />

            {/* Control Panel Trigger */}
            <div
              className="flex items-center gap-3 md:gap-4 rounded-full px-4 py-3 md:px-5 md:py-3 text-base md:text-lg text-foreground/70 hover:bg-foreground/5 transition-all hover:text-foreground cursor-pointer mt-4"
              onClick={() => toggle()}
            >
              <Bot {...getIconProps()} />
              <span className={cn(isHorizontal && "hidden lg:inline")}>Panel de Control</span>
            </div>
          </nav>
        </div>
      </div>
    </div>
  );
}
