# Sacred Forecast motion system

The hero is a four-act scroll score driven by `assets/TIBORESET.mp4` through its optimized public derivative.

| Progress | Chapter | Visual intent | UI intent |
| --- | --- | --- | --- |
| 0–.18 | Shadow | Low exposure, slow opening playback, heavy foreground | Restrained title; probability only hinted |
| .18–.44 | Discovery | Video advances, saturation and light rise | Probability and supporting statistics resolve |
| .44–.70 | Revelation | RESET frame and bloom become dominant | Probability reaches full hierarchy; data becomes readable |
| .70–1 | Payoff | Final bright frame holds | Resolved-event status and the official-source or latest-signals action appear |

GSAP owns hero opacity, transforms, filters, and chapter timing. The video smoothing loop exclusively owns `currentTime`. Ambient fog, rays, and particles are CSS-only and never write GSAP-owned properties. Motion components outside the hero remain independent and do not target hero elements.

The source master is retained unchanged. The browser derivative is 1920×1080 H.264, silent, fast-start enabled, and encoded with half-second keyframes to reduce reverse-seek cost. Mobile uses the same scrub system with a shorter pin range. Reduced motion skips the pinned sequence and presents a readable late-frame state.
