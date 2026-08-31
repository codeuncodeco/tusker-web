import {
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  isRouteErrorResponse,
} from "react-router";

import type { Route } from "./+types/root";
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
      <body className="h-full bg-white font-sans text-neutral-900 antialiased dark:bg-neutral-950 dark:text-neutral-100">
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  return <Outlet />;
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
      <h1 className="text-2xl font-semibold">{message}</h1>
      <p className="mt-2 text-neutral-600 dark:text-neutral-400">{details}</p>
      {stack ? (
        <pre className="mt-6 overflow-x-auto rounded bg-neutral-100 p-4 text-xs dark:bg-neutral-900">
          <code>{stack}</code>
        </pre>
      ) : null}
    </main>
  );
}
