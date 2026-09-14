# Quality Check

Read this reference before declaring a cinematic scrollytelling page complete.

## Story

- The opening communicates the subject and promise quickly.
- Every animated scene has one clear narrative job.
- Transitions preserve continuity between sections.
- The strongest effect supports the main proof or emotional peak.
- The closing action is obvious and stable.

## Interaction

- The complete experience works when scrolling down and back up.
- Pinned sections release correctly and do not create blank gaps.
- Resize and orientation changes do not break trigger positions.
- Internal links, browser history, keyboard navigation, and controls remain usable.
- No essential text depends on finishing an animation.

## Mobile

- Test at a narrow phone viewport and a larger touch viewport.
- No horizontal overflow, clipped CTA, overlapping text, or excessive pin duration.
- Touch scrolling feels native and responsive.
- Heavy scenes have a simpler mobile treatment.

## Performance

- Prefer transform and opacity for continuous movement.
- Responsive images declare appropriate dimensions and sizes.
- Offscreen media does not continue expensive work unnecessarily.
- Scroll callbacks avoid repeated DOM queries and heavy per-frame calculations.
- Layout remains stable while fonts and images load.

## Accessibility

- Reduced-motion mode shows all content in a coherent state.
- Focus order follows the visual and document order.
- Text contrast and controls remain accessible throughout transitions.
- Autoplay media is muted, controllable, and nonessential.

## Verification

- Run the project's existing checks and production build.
- Open the page in a browser and inspect the complete route.
- Check the console for runtime errors and warnings.
- Confirm the primary conversion or navigation action works.
