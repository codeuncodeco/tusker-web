# Fonts

Both faces are served from this app's own origin. The Google Fonts CDN is not
used: tusker-web runs on a Worker and is keyboard-first, so a render-blocking
cross-origin round trip on a cold load costs more here than the bytes save.

Each file is the `latin` subset of the variable `woff2`, taken from Google
Fonts through Fontsource, with the weight axis cut to the range the app draws.

| File | Source | Axes |
| --- | --- | --- |
| `jetbrains-mono-latin-variable.woff2` | `@fontsource-variable/jetbrains-mono@5.3.0`, `files/jetbrains-mono-latin-wght-normal.woff2` | `wght` 400–600 |
| `fraunces-latin-variable.woff2` | `@fontsource-variable/fraunces@5.3.0`, `files/fraunces-latin-opsz-normal.woff2` | `opsz` 9–144, `wght` 400–600 |

The app draws at 400, 500 and 600 and at no other weight, so the axis carries
only that range. Fraunces keeps its `opsz` axis, because the optical size is
the point of that face. The browser drives that axis from the font size, which
is what `font-optical-sizing: auto` does by default.

Both faces are under the SIL Open Font License 1.1. The licences are beside the
files, as `LICENSE-jetbrains-mono` and `LICENSE-fraunces`.

## To take a newer version

1. `pnpm add @fontsource-variable/jetbrains-mono @fontsource-variable/fraunces`
2. Copy the file named in the table above into this folder, under the name in
   the first column.
3. Cut the weight axis, with `fonttools` in a virtualenv:

   ```
   fonttools varLib.instancer -o <file> <file> wght=400:600 --output-format=woff2
   ```

4. `pnpm remove @fontsource-variable/jetbrains-mono @fontsource-variable/fraunces`
5. Read the axes back, to confirm the cut kept `opsz` on Fraunces:

   ```
   python -c "from fontTools.ttLib import TTFont; print(TTFont('<file>')['fvar'].axes)"
   ```
