"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import {
  VideoPlay,
  Category,
  AddSquare,
  VideoHorizontal,
  Profile2User,
  Setting2,
  Logout,
  HambergerMenu,
} from "iconsax-react";
import { Button } from "./ui/button";
const links = [
  ["/dashboard", "Overview", Category],
  ["/generations/new", "New generation", AddSquare],
  ["/generations", "Generations", VideoHorizontal],
  ["/characters", "Characters", Profile2User],
  ["/settings", "Settings", Setting2],
] as const;
export function Shell({
  children,
  user,
}: {
  children: React.ReactNode;
  user: { name: string; email: string };
}) {
  const path = usePathname(),
    router = useRouter();
  const [open, setOpen] = useState(false);
  return (
    <div className="app">
      <Button
        variant="outline"
        className="mobile-menu"
        aria-label="Toggle navigation"
        onClick={() => setOpen(!open)}
      >
        <HambergerMenu size={20} />
      </Button>
      <aside className={`sidebar ${open ? "open" : ""}`}>
        <Link className="brand" href="/dashboard">
          <span className="brand-icon">
            <VideoPlay size={19} variant="Bold" />
          </span>
          Video Studio
        </Link>
        <div className="nav-label">Workspace</div>
        <nav>
          {links.map(([href, label, Icon]) => (
            <Link
              key={href}
              href={href}
              onClick={() => setOpen(false)}
              className={`nav-link ${path === href || (href === "/generations" && path.startsWith("/generations/") && path !== "/generations/new") ? "active" : ""}`}
            >
              <Icon size={19} variant="Linear" />
              {label}
            </Link>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="user-row">
            <div className="avatar">{user.name?.slice(0, 2).toUpperCase() || "ME"}</div>
            <div className="user-text">
              {user.name}
              <small>{user.email}</small>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="space-top"
            onClick={async () => {
              await fetch("/api/auth/sign-out", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: "{}",
              });
              router.push("/sign-in");
              router.refresh();
            }}
          >
            <Logout size={16} />
            Sign out
          </Button>
        </div>
      </aside>
      <main className="main">{children}</main>
    </div>
  );
}
