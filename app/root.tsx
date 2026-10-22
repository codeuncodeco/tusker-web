import { useEffect } from "react";
import {
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  isRouteErrorResponse,
  type ShouldRevalidateFunctionArgs,
} from "react-router";

import { AddingProvider } from "./adding";
import {
  COLOUR_SCHEME_ACTION,
  COLOUR_SCHEME_CSS,
  colourSchemeOf,
  useColourScheme,
} from "./colour-scheme";
import { KeyedSurfaceProvider } from "./keyed-list";
import type { Route } from "./+types/root";
import { listenForPresses } from "./sound";
import { ToastProvider } from "./toast";
import "./app.css";

/**
 * The colour scheme, read on every request, so the server draws the pick on
 * the first paint with no script and no flash. See #223.
 */
export function loader({ request }: Route.LoaderArgs) {
  return { colourScheme: colourSchemeOf(request) };
}

/**
 * Only a pick changes what the root loads, so the root asks again after one,
 * and after whatever else asks it to. A pick asks no other route: the control
 * posts with `defaultShouldRevalidate: false`, so the board keeps its data.
 */
export function shouldRevalidate({
  formAction,
  defaultShouldRevalidate,
}: ShouldRevalidateFunctionArgs) {
  return formAction === COLOUR_SCHEME_ACTION || defaultShouldRevalidate;
}

/**
 * Every colour token is a `light-dark()` pair, so the `color-scheme` on
 * `<html>` is the one thing that picks light or dark.
 */
export function Layout({ children }: { children: React.ReactNode }) {
  const scheme = useColourScheme();
  return (
    <html lang="en" className="h-full" style={{ colorScheme: COLOUR_SCHEME_CSS[scheme] }}>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
        <link rel="icon" href="/favicon-32.png" type="image/png" sizes="32x32" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
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
  // Every press on the page loads the sound once and taps. See `app/sound.ts`.
  useEffect(listenForPresses, []);

  // The org the cross-org quick-add box files into lives here, so the pick
  // holds across a move between pages and dies on a reload. See ADR-0012.
  // One place a page raises a message about a batch it just ran, drawn over
  // every route. See #121.
  // A page draws one keyed list or none, so one surface serves them all: it is
  // where the list, the quick-add box and the decision prompt find each other.
  // See ADR-0022.
  return (
    <AddingProvider>
      <ToastProvider>
        <KeyedSurfaceProvider>
          <Outlet />
        </KeyedSurfaceProvider>
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
