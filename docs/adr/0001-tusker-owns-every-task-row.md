# Tusker owns every task row

Tusker started as a Chrome extension that kept tasks in `chrome.storage.local`
and synced them into whichever app owned the work, such as blrhikes-app. The web
app inverts that: Tusker holds the only copy of a task, and an org app reads its
own tasks back over the Tusker API with a per-org key.

The alternative was federation, where each org app keeps its own tasks table and
Tusker aggregates them. Federation costs one adapter per org for every feature,
and it cannot hold personal work, because no other app owns that data. Both
options give the same unified view, so the one with a single write path wins.

## Consequences

An org app's task screens depend on Tusker. If Tusker is down, the rest of that
app still works, but its task screens fail. We accept a visible failure there
rather than a cache or a mirror.

Ids belong to Tusker now. The old rule, where the app minted `tsk_*` ids and
Tusker recorded a mapping, is gone.
