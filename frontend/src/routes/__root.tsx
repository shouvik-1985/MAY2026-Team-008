import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { CustomCursor } from "../components/CustomCursor";
import { PerformanceModeClass } from "../lib/performance";
import { ThemeProvider } from "../lib/theme";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "CampusVerse" },
      { name: "description", content: "Unified student platform for campus life." },
      { name: "author", content: "CampusVerse" },
      { property: "og:title", content: "CampusVerse" },
      { property: "og:description", content: "Unified student platform for campus life." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:site", content: "@CampusVerse" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=Inter:wght@300;400;500;600&display=swap",
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="theme-pending">
      <head>
        <script
          // Run before the stylesheet is evaluated so a refresh never paints
          // the fallback palette before React restores the saved preference.
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var theme=localStorage.getItem('campusverse-theme');if(theme!=='light'&&theme!=='dark')theme='light';var root=document.documentElement;root.classList.remove('light','dark');root.classList.add(theme);root.dataset.theme=theme;document.documentElement.style.colorScheme=theme;}catch(_){}})();`,
          }}
        />
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <NavigationScrollReset />
        <PerformanceModeClass />
        <CustomCursor />
        {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
        <Outlet />
      </ThemeProvider>
    </QueryClientProvider>
  );
}

function NavigationScrollReset() {
  useEffect(() => {
    const reset = () => {
      window.scrollTo({ top: 0, left: 0, behavior: "auto" });
      document.scrollingElement?.scrollTo({ top: 0, left: 0, behavior: "auto" });
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
    };
    const resetAfterNavigation = () => {
      reset();
      requestAnimationFrame(() => requestAnimationFrame(reset));
    };
    const handleInternalLink = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const target = event.target;
      if (!(target instanceof Element)) return;
      const link = target.closest("a[href]");
      const href = link?.getAttribute("href");
      if (!href || href === "#" || /^(mailto:|tel:|https?:\/\/)/.test(href)) return;

      // Let TanStack Router or the browser complete the navigation first,
      // then reset on the next frame and once more after layout settles.
      window.setTimeout(resetAfterNavigation, 0);
      window.setTimeout(reset, 120);
    };

    // Never allow the browser/router to restore the previous page position
    // after a menu selection. All CampusVerse screens open from their top.
    if ("scrollRestoration" in window.history) window.history.scrollRestoration = "manual";
    resetAfterNavigation();
    const lateReset = window.setTimeout(reset, 120);
    document.addEventListener("click", handleInternalLink, true);
    window.addEventListener("hashchange", resetAfterNavigation);
    window.addEventListener("popstate", resetAfterNavigation);

    return () => {
      window.clearTimeout(lateReset);
      document.removeEventListener("click", handleInternalLink, true);
      window.removeEventListener("hashchange", resetAfterNavigation);
      window.removeEventListener("popstate", resetAfterNavigation);
    };
  }, []);

  return null;
}
