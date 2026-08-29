# The server is authoritative, and the sync engine goes

The extension was local-first: `chrome.storage.local` held the data, and
`src/sync.js` carried cursors, dirty rows, tombstones and a conflict prompt to
reconcile it with a linked app. That machinery exists to bridge two independent
stores.

Once Tusker owns the only copy (ADR-0001), a second authority buys offline
editing at the price of the hardest code in the repo. The web app reads and
writes through loaders and actions against D1. We port no part of the sync
engine.

## Consequences

Tusker needs the network. There is no offline write path, and we do not plan one.

The extension's JSON backup goes too. A cron'd Worker that dumps D1 to R2 will
replace it. R2 is not in v1.

Live updates start as loader revalidation. A Durable Object per org, with
WebSocket fan-out, is the planned end state and is not v1.
