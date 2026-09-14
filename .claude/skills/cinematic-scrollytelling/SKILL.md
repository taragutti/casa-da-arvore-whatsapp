---
name: cinematic-scrollytelling
description: Design, build, or refine cinematic web experiences where scrolling advances a visual story. Use for immersive landing pages, tourism guides, product narratives, timelines, before-and-after stories, and editorial pages that need purposeful GSAP ScrollTrigger animation. Do not use for ordinary pages that only need simple entrance effects.
---

# Cinematic Scrollytelling

Create a clear story first, then use motion to reveal it. The result must remain understandable, usable, and persuasive without animation.

## Route the request

Use this skill when scroll position should control narrative progress, scene changes, pinned sections, parallax, image sequences, maps, comparisons, or product demonstrations.

For implementation details, use the installed `gsap-scrolltrigger` skill when available. Keep this skill responsible for narrative structure, art direction, responsive behavior, performance, and final experience.

## Workflow

1. Inspect the existing project, framework, design system, assets, and current scroll behavior before editing.
2. Extract the page objective, audience, primary action, available media, and the single idea each section must communicate.
3. Write a compact beat map before coding. For each scene record its narrative purpose, visual focal point, scroll behavior, transition, mobile adaptation, and reduced-motion fallback.
4. Choose the smallest motion system that delivers the story. Read [references/patterns.md](references/patterns.md) only when selecting or implementing interaction patterns.
5. Build a semantic static layout first. Add GSAP timelines and ScrollTrigger progressively.
6. Test the complete story on desktop and a real mobile viewport. Read [references/quality.md](references/quality.md) for final verification.

## Narrative direction

Structure long pages as acts rather than a pile of animated sections:

- **Hook:** establish place, problem, promise, or emotional tension immediately.
- **Orientation:** help the visitor understand where they are and what will unfold.
- **Progression:** reveal evidence, places, features, history, or transformation in a deliberate order.
- **Climax:** reserve the strongest visual transformation for the central proof or promise.
- **Resolution:** reduce visual intensity and make the next action obvious.

Each scene should have one dominant focal point. Motion must direct attention, explain change, preserve continuity, or reinforce hierarchy. Remove animation that serves none of these purposes.

## Implementation rules

- Prefer transforms and opacity for frequent animation. Avoid continuous layout-triggering properties unless the effect requires them.
- Use one coordinated timeline per narrative scene instead of scattered unrelated tweens.
- Use `scrub` only when the visitor benefits from direct control. Use discrete triggers for entrances that simply need to play once.
- Pin only when content evolves meaningfully while held in place. Avoid repeated long pinned sections, especially on mobile.
- Derive `start` and `end` distances from content and viewport needs; do not stretch scrolling merely to appear cinematic.
- Scope selectors to the scene or component. Clean up animations and ScrollTriggers when React components unmount.
- Refresh ScrollTrigger after fonts, responsive images, or layout-changing assets settle.
- Keep debugging markers out of production.
- Respect the existing framework and styling conventions. Do not replace the user's stack solely to add animation.

## Responsive behavior

Design mobile as its own composition. Reduce travel distances, parallax depth, simultaneous layers, and pin duration. Replace horizontal or multi-layer scenes with a vertical sequence when that makes the story clearer. Never assume the desktop timeline can simply be scaled down.

Use responsive GSAP contexts such as `gsap.matchMedia()` when behaviors differ materially. Ensure touch scrolling remains native and predictable unless the user explicitly requests and approves another interaction model.

## Accessibility and control

- Honor `prefers-reduced-motion: reduce` with a complete low-motion presentation.
- Preserve readable contrast, logical DOM order, keyboard access, focus visibility, and usable controls.
- Do not hide essential information behind animation completion.
- Avoid scroll hijacking, forced wheel capture, surprise sound, or interactions that trap the visitor.
- Pause or stop looping media when it is offscreen when practical.

## Asset and content discipline

Use real user-supplied or properly sourced assets when the story depends on a real place, product, person, or historical fact. Preserve image aspect ratios and meaningful focal points. Define responsive image sizes and avoid loading full-resolution media when a smaller rendition is sufficient.

For tourism and editorial experiences, prioritize geographic and historical clarity over decorative effects. For sales pages, place calls to action at narrative decision points without interrupting the story after every scene.

## Completion standard

Deliver the implemented experience, not only an animation sketch. Verify the page loads, the complete scroll path works in both directions, the primary action remains usable, reduced motion works, mobile layout does not overflow, and there are no runtime or console errors.
