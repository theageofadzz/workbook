# Weather Tutorial Animations

Six 16-second operation diagrams, built from the actual seven-layer artwork
inside the published weather HTML. The cursor actions are explanatory
reconstructions, not recordings of the earlier chat.

From this directory, run `node prepare.mjs ../..`, then `npm run check`.
Open `npx hyperframes preview --background` to review, and use `npm run render`
to produce a 96-second source at 1120 by 840.

The article embeds six silent MP4 excerpts named `weather-align`,
`weather-layers`, `weather-type`, `weather-gif`, `weather-preview`,
and `weather-check`. Each excerpt has a WebP poster, no controls, and a visible
cursor. The website pauses offscreen videos and respects reduced motion.
