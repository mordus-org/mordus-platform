import { Button } from "@mordus-platform/ui/components/button";
import { Link, createFileRoute } from "@tanstack/react-router";
export const Route = createFileRoute("/about")({ component: AboutComponent });
function AboutComponent() {
  return (
    <main className="mx-auto flex min-h-[70vh] max-w-5xl flex-col items-start justify-center px-6 py-16">
      <h1 className="text-3xl font-semibold tracking-tight">Sobre o Mordus Platform</h1>
      <p className="mt-5 max-w-2xl text-lg leading-7 text-muted-foreground">
        Mordus Platform é uma plataforma de observabilidade que recebe eventos, organiza consultas e
        oferece uma visão clara da operação por meio de uma API.
      </p>
      <Button nativeButton={false} variant="outline" className="mt-7" render={<Link to="/" />}>
        Voltar ao início
      </Button>
    </main>
  );
}
