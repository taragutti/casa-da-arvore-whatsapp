# Scrollytelling Patterns

Read this reference when choosing or implementing scene behavior. Combine patterns only when each one advances the narrative.

## Reveal sequence

Use for chronological steps, benefits, destinations, or evidence. Trigger a scene timeline near the lower-middle viewport. Prefer a short stagger with a stable reading order. Use a discrete trigger unless scroll-linked progress adds meaning.

## Pinned transformation

Use when one visual subject evolves through multiple states: a product assembling, a map zooming, a historic-to-modern comparison, or a number gaining context. Pin one stable stage and drive a single timeline with `scrub`. End the pin as soon as the transformation is understood.

## Sticky editorial scene

Prefer CSS `position: sticky` when the visual can remain fixed while adjacent semantic content scrolls naturally. Use ScrollTrigger only for state changes, highlighting, or controlled transitions. This pattern degrades cleanly without JavaScript.

## Layered parallax

Use subtle differences in movement to communicate depth. Keep foreground movement stronger than distant background movement. On small screens, reduce layers and distance or disable the effect. Do not animate every decorative element.

## Image sequence

Use for frame-by-frame transformations that genuinely require visual continuity. Preload only the initial and nearby frames, size the canvas or images responsively, and provide a static representative frame for reduced motion. Avoid large sequences on data-constrained mobile experiences unless the user accepts the cost.

## Before and after

Use a scrubbed mask, clip path, or stable crossfade to compare two aligned images. Keep labels visible and provide a non-animated side-by-side or stacked fallback.

## Horizontal chapter

Use vertical scroll to advance horizontal panels only when spatial progression is meaningful. Pin the chapter, animate the panel track, and keep the document order logical. Replace it with a vertical stack on narrow screens when readability or touch control suffers.

## Map journey

Use for destinations, routes, or historical expansion. Keep geographic labels stable long enough to read. Animate route progress and location emphasis rather than continuously moving the entire map. Provide a static map or ordered destination list as fallback.

## Text choreography

Animate by line, word, or phrase only when timing changes interpretation or emphasis. Preserve accessible text in the DOM and avoid splitting that damages screen-reader output. Use restrained distances and opacity changes for body copy.

## CTA resolution

After the visual climax, simplify the scene. Bring the offer, next step, price, or booking action into a stable area. Do not tie button usability to the final animation frame.
