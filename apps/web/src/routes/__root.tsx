import { Toaster } from "@mordus-platform/ui/components/sonner";
import { HeadContent, Outlet, createRootRouteWithContext } from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";
import { Link } from "@tanstack/react-router";
import { Button } from "@mordus-platform/ui/components/button";

import Header from "@/components/header";
import { ThemeProvider } from "@/components/theme-provider";

import "../index.css";

import type { QueryClient } from "@tanstack/react-query";

export interface RouterAppContext {
  queryClient: QueryClient;
}

export const Route = createRootRouteWithContext<RouterAppContext>()({
  component: RootComponent,
  notFoundComponent: () => (
    <main className="mx-auto flex min-h-[70vh] max-w-5xl flex-col items-start justify-center px-6">
      <p className="text-sm text-muted-foreground">Erro 404</p>
      <h1 className="mt-2 text-3xl font-semibold">Página não encontrada</h1>
      <Button nativeButton={false} className="mt-6" render={<Link to="/" />}>
        Voltar ao início
      </Button>
    </main>
  ),
  head: () => ({
    meta: [
      {
        title: "Mordus Platform",
      },
      {
        name: "description",
        content: "Mordus Platform",
      },
    ],
    links: [
      {
        rel: "icon",
        href: "/mascot/favicon.webp",
        type: "image/webp",
      },
    ],
  }),
});

function RootComponent() {
  return (
    <>
      <HeadContent />
      <ThemeProvider
        attribute="class"
        defaultTheme="dark"
        disableTransitionOnChange
        storageKey="vite-ui-theme"
      >
        <div className="grid grid-rows-[auto_1fr_auto] min-h-svh">
          <Header />
          <Outlet />
          <footer className="mx-auto w-full max-w-5xl border-t px-6 py-5 text-sm text-muted-foreground">
            Mordus Platform
          </footer>
        </div>
        <Toaster richColors />
      </ThemeProvider>
      <TanStackRouterDevtools position="bottom-left" />
    </>
  );
}
