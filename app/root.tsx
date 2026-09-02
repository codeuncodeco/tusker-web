import {
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  isRouteErrorResponse,
} from "react-router";

import { AddingProvider } from "./adding";
import type { Route } from "./+types/root";
import { ToastProvider } from "./toast";
import "./app.css";

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full" style={{ colorScheme: "light dark" }}>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
      </head>
      <body className="h-full bg-bg font-sans text-sm text-fg antialiased">
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  // The org the cross-org quick-add box files into lives here, so the pick
  // holds across a move between pages and dies on a reload. See ADR-0012.
  // One place a page raises a message about a batch it just ran, drawn over
  // every route. See #121.
  return (
    <AddingProvider>
      <ToastProvider>
        <Outlet />
      </ToastProvider>
    </AddingProvider>
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  let message = "Error";
  let details = "The server could not complete this request.";
  let stack: string | undefined;

  if (isRouteErrorResponse(error)) {
    message = String(error.status);
    details =
      error.status === 404 ? "This page does not exist." : error.statusText || details;
  } else if (import.meta.env.DEV && error instanceof Error) {
    details = error.message;
    stack = error.stack;
  }

  return (
    <main className="mx-auto max-w-2xl p-8">
      <h1 className="text-2xl">{message}</h1>
      <p className="mt-2 text-muted">{details}</p>
      {stack ? (
        <pre className="mt-6 overflow-x-auto rounded bg-surface p-4 text-xs">
          <code>{stack}</code>
        </pre>
      ) : null}
    </main>
  );
}
