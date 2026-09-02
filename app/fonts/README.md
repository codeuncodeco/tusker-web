# Fonts

Both faces are served from this app's own origin. The Google Fonts CDN is not
used: tusker-web runs on a Worker and is keyboard-first, so a render-blocking
cross-origin round trip on a cold load costs more here than the bytes save.

Each file is the `latin` subset of the variable `woff2`, taken from Google
Fonts through Fontsource.

| File | Source | Axes |
| --- | --- | --- |
| `jetbrains-mono-latin-variable.woff2` | `@fontsource-variable/jetbrains-mono@5.3.0`, `files/jetbrains-mono-latin-wght-normal.woff2` | `wght` 100–800 |
| `fraunces-latin-variable.woff2` | `@fontsource-variable/fraunces@5.3.0`, `files/fraunces-latin-opsz-normal.woff2` | `opsz` 9–144, `wght` 100–900 |

Fraunces keeps its `opsz` axis, because the optical size is the point of that
face. The browser drives the axis from the font size, which is what
`font-optical-sizing: auto` does by default.

Both faces are under the SIL Open Font License 1.1. The licences are beside the
files, as `LICENSE-jetbrains-mono` and `LICENSE-fraunces`.

To take a newer version, install the Fontsource package, copy the named file
over, and remove the package again.
