"use client";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  AddSquare,
  Category,
  Coin,
  HambergerMenu,
  Logout,
  Profile2User,
  Setting2,
  VideoHorizontal,
} from "iconsax-react";
import { Avatar, AvatarFallback } from "./ui/avatar";
import { Badge } from "./ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
} from "./ui/sidebar";
const links = [
  ["/dashboard", "Overview", Category],
  ["/generations/new", "New generation", AddSquare],
  ["/generations", "Generations", VideoHorizontal],
  ["/characters", "Characters", Profile2User],
  ["/settings", "Settings", Setting2],
] as const;
export type ShellCredits = { used: number; allowance: number; remaining: number };
export function Shell({
  children,
  user,
  credits,
}: {
  children: React.ReactNode;
  user: { name: string; email: string };
  credits: ShellCredits;
}) {
  const path = usePathname(),
    router = useRouter();
  const initials = (user.name || user.email).slice(0, 2).toUpperCase();
  const isActive = (href: string) =>
    path === href ||
    (href === "/generations" &&
      path.startsWith("/generations/") &&
      path !== "/generations/new");
  async function signOut() {
    await fetch("/api/auth/sign-out", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    router.push("/sign-in");
    router.refresh();
  }
  return (
    <SidebarProvider style={{ "--sidebar-width": "15rem" } as React.CSSProperties}>
      <Sidebar collapsible="icon">
        <SidebarHeader>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton size="lg" asChild tooltip="Brio">
                <Link href="/dashboard">
                  <Image
                    src="/brio-mark.png"
                    alt=""
                    width={28}
                    height={28}
                    priority
                    className="size-7 shrink-0"
                  />
                  <span className="truncate text-[15px] font-semibold tracking-tight group-data-[collapsible=icon]:hidden">
                    Brio
                  </span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>Workspace</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {links.map(([href, label, Icon]) => (
                  <SidebarMenuItem key={href}>
                    <SidebarMenuButton
                      asChild
                      isActive={isActive(href)}
                      tooltip={label}
                    >
                      <Link href={href}>
                        <Icon size={18} variant="Linear" />
                        <span>{label}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter>
          <SidebarMenu>
            <SidebarMenuItem>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <SidebarMenuButton
                    size="lg"
                    className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
                  >
                    <Avatar className="size-8 rounded-lg">
                      <AvatarFallback className="rounded-lg bg-sidebar-accent text-xs font-medium text-sidebar-accent-foreground">
                        {initials}
                      </AvatarFallback>
                    </Avatar>
                    <span className="grid flex-1 text-left leading-tight">
                      <span className="truncate text-sm font-medium">
                        {user.name || user.email}
                      </span>
                      <span className="truncate text-xs text-muted-foreground">
                        {user.email}
                      </span>
                    </span>
                    <Badge
                      variant="secondary"
                      className="ml-auto gap-1 tabular-nums group-data-[collapsible=icon]:hidden"
                    >
                      <Coin size={12} variant="Bold" />
                      {credits.remaining}
                    </Badge>
                  </SidebarMenuButton>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  side="top"
                  align="start"
                  sideOffset={8}
                  className="w-[--radix-dropdown-menu-trigger-width] min-w-60"
                >
                  <DropdownMenuLabel className="flex flex-col gap-0.5">
                    <span className="truncate">{user.name || "Your account"}</span>
                    <span className="truncate text-xs font-normal text-muted-foreground">
                      {user.email}
                    </span>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="flex items-center justify-between gap-4"
                    disabled
                  >
                    <span className="flex items-center gap-2 text-muted-foreground">
                      <Coin size={16} variant="Linear" />
                      Credits left
                    </span>
                    <span className="text-xs tabular-nums text-muted-foreground">
                      {credits.remaining} / {credits.allowance} this month
                    </span>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <Link href="/settings">
                      <Setting2 size={16} variant="Linear" />
                      Settings
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    variant="destructive"
                    className="hover:bg-destructive/10 hover:text-destructive focus:bg-destructive/10"
                    onClick={signOut}
                  >
                    <Logout size={16} variant="Linear" />
                    Sign out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
        <SidebarRail />
      </Sidebar>
      <SidebarInset>
        <header className="flex h-14 items-center gap-2 px-4 md:hidden">
          <SidebarTrigger>
            <HambergerMenu size={20} />
          </SidebarTrigger>
        </header>
        <div className="flex-1 px-5 pb-12 pt-6 md:px-8 md:pt-10 lg:px-12">
          {children}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
