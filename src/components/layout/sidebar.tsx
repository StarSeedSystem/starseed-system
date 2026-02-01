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

  // Icon props generator
  const getIconProps = () => ({
    strokeWidth: iconStyle === "thin" ? 1 : 1.5,
    fill: iconStyle === "solid" ? "currentColor" : "none",
    className: "h-4 w-4"
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
      "flex items-center gap-3 rounded-lg px-3 py-2 text-muted-foreground transition-all hover:text-primary cursor-pointer",
      isActive && "bg-muted text-primary",
      className
    );

    if (href) {
      return <Link href={href} className={baseClass}>{content}</Link>;
    }
    return <div className={baseClass}>{content}</div>;
  };

  return (
    <div className={cn(
      "bg-background/80 backdrop-blur-xl transition-all duration-500 ease-in-out",
      // Global Toggle Logic: Only applies if we want it to be toggleable.
      // We will handle this via the specific Sidebar implementation in layout.tsx via className or conditional rendering,
      // BUT if we want internal animation support, we can use the context here.
      // For now, let's rely on the parent to hide/show or use a specific prop.
      // Actually, let's allow the className to control visibility, but use isOpen for state classes if needed.

      // Border logic (only if not dock)
      !isDock && !isHorizontal && (side === "left" ? "border-r" : "border-l"),
      !isDock && isHorizontal && (side === "top" ? "border-b" : "border-t"),

      // Dock Logic
      isDock && "m-4 rounded-xl border shadow-xl bg-background/95",
      isDock && !isHorizontal && "h-[calc(100vh-2rem)]",

      // Behavior Logic
      menuBehavior === 'sticky' && !isHorizontal && "sticky top-0 h-screen",
      menuBehavior === 'sticky' && isHorizontal && "sticky top-0 z-50",

      // Floating/Stacking context for sticky
      (menuBehavior === 'sticky' || isDock) && "z-40",

      className
    )}>
      <div className={cn(
        "flex h-full flex-col gap-2",
        !isHorizontal && "max-h-screen",
        isHorizontal && "flex-row h-16 items-center px-4",
        // Allow inner scrolling when sticky
        menuBehavior === 'sticky' && !isHorizontal && "overflow-hidden"
      )}>
        <div className={cn(
          "flex items-center",
          !isHorizontal && "h-14 border-b px-4 lg:h-[60px] lg:px-6 shrink-0",
          isHorizontal && "mr-8",
          // Hide border in dock mode if desired, or keep specific styling
          isDock && "border-b-0"
        )}>
          <Link href="/" className="flex items-center gap-2 font-semibold">
            <Logo />
          </Link>
        </div>
        <div className="flex-1 overflow-auto py-2">
          <nav className={cn(
            "grid text-sm font-medium",
            !isHorizontal && "items-start px-2 lg:px-4 gap-1",
            isHorizontal && "flex items-center gap-2"
          )}>
            <NavItem href="/dashboard" icon={Home} label="Dashboard" />
            <NavItem href="/profile/starseeduser" icon={User} label="Perfil" />
            <NavItem href="/agent" icon={Bot} label="IA" />
            <NavItem href="/messages" icon={MessageSquare} label="Mensajes" />
            <NavItem href="/hub" icon={Users} label="Hub" />

            {!isHorizontal && (
              <Accordion type="single" collapsible defaultValue={isNetworkActive ? "network" : ""}>
                <AccordionItem value="network" className="border-b-0">
                  <AccordionTrigger className="flex items-center gap-3 rounded-lg px-3 py-2 text-muted-foreground transition-all hover:text-primary hover:no-underline [&[data-state=open]]:text-primary">
                    <Network {...getIconProps()} />
                    La Red
                  </AccordionTrigger>
                  <AccordionContent className="pl-4">
                    <nav className="grid gap-1 mt-1">
                      <NavItem href="/network/politics" label="Política" />
                      <NavItem href="/network/education" label="Educación" />
                      <NavItem href="/network/culture" label="Cultura" />
                    </nav>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            )}

            {isHorizontal && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  {/* Using NavItem as a generic trigger without href */}
                  <button className="flex items-center gap-3 rounded-lg px-3 py-2 text-muted-foreground transition-all hover:text-primary outline-none">
                    <Network {...getIconProps()} />
                    <span className={cn("hidden lg:inline")}>La Red</span>
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  <DropdownMenuItem asChild>
                    <Link href="/network/politics">Política</Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href="/network/education">Educación</Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
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
              className="flex items-center gap-3 rounded-lg px-3 py-2 text-muted-foreground transition-all hover:text-primary cursor-pointer"
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
