"use client";

import { Sidebar } from "./sidebar";
import { useSyncExternalStore, useState, useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { Menu, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { useRealtimeEvents } from "@/hooks/use-realtime-events";
import { notify } from "@/lib/system/notify-store";

const STORAGE_KEY = "sidebar_collapsed";

const PAGE_TITLES: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/files": "Files",
  "/favorites": "Favorites",
  "/shares": "Shared",
  "/recycle-bin": "Recycle Bin",
};

function getPageTitle(pathname: string): string {
  if (pathname.startsWith("/admin")) return "Admin";
  return PAGE_TITLES[pathname] ?? "Storage ByAFR";
}

function getStoredCollapsed(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

function subscribeCollapsed(callback: () => void) {
  if (typeof window === "undefined") return () => {};
  window.addEventListener("storage", callback);
  return () => window.removeEventListener("storage", callback);
}

export function ClientShell({
  user,
  children,
}: {
  user: {
    username: string;
    role: string;
    quotaBytes: number;
    usedBytes: number;
    isImpersonating?: boolean;
  };
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [sidebarTransition, setSidebarTransition] = useState(false);
  const initialCollapsed = useRef(true);

  useRealtimeEvents(true);

  useEffect(() => {
    try {
      if (sessionStorage.getItem("new_login_notice") === "1") {
        sessionStorage.removeItem("new_login_notice");
        notify({
          title: "New login detected",
          description: "New login detected from a new device or location.",
          tone: "warning",
          duration: 6000,
        });
      }
    } catch {
      // ignore
    }
  }, []);

  const collapsed = useSyncExternalStore(
    subscribeCollapsed,
    () => getStoredCollapsed(),
    () => false
  );

  const setCollapsed = (value: boolean) => {
    localStorage.setItem(STORAGE_KEY, String(value));
    window.dispatchEvent(new Event("storage"));
  };

  // Track initial collapsed state to prevent layout shift
  useEffect(() => {
    initialCollapsed.current = collapsed;
  }, []);

  // Enable transition after mount to avoid flash
  useEffect(() => {
    const raf = requestAnimationFrame(() => setSidebarTransition(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  // Close mobile sidebar on route change
  useEffect(() => {
    setMobileSidebarOpen(false);
  }, [pathname]);

  // Prevent body scroll when mobile sidebar is open
  useEffect(() => {
    if (mobileSidebarOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [mobileSidebarOpen]);

  const title = getPageTitle(pathname);

  return (
    <div className="min-h-screen bg-background" suppressHydrationWarning>
      <Sidebar
        user={user}
        collapsed={collapsed}
        setCollapsed={setCollapsed}
        mobileOpen={mobileSidebarOpen}
        onMobileClose={() => setMobileSidebarOpen(false)}
      />

      {/* Mobile/Tablet Header */}
      <header className="fixed top-0 left-0 right-0 z-30 flex h-14 items-center gap-2 border-b border-border/50 bg-card/90 backdrop-blur-xl px-3 shadow-sm lg:hidden">
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9 rounded-lg shrink-0"
          onClick={() => setMobileSidebarOpen(true)}
          aria-label="Open navigation menu"
        >
          <Menu className="h-5 w-5" />
        </Button>
        <h1 className="text-sm font-semibold truncate flex-1">{title}</h1>
        <Link
          href="/files"
          className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent/5 transition-colors"
          aria-label="Search files"
        >
          <Search className="h-4 w-4" />
        </Link>
      </header>

      {/* Main content — padding handled purely by CSS to avoid layout shift */}
      <main
        className={cn(
          "min-h-screen max-lg:!pl-0 max-lg:pt-14",
          sidebarTransition && "transition-all duration-250 ease-out",
          collapsed ? "lg:pl-[72px]" : "lg:pl-[240px]"
        )}
        suppressHydrationWarning
      >
        {children}
      </main>
    </div>
  );
}