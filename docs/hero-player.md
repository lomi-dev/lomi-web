# Hero video player

The hero has one custom control strip for YouTube and uploaded MP4/WebM files.
It uses native buttons and range inputs, the existing colors and typography,
and the same 16px frame as the product preview. On small screens the seek bar
moves above the buttons. Small, transparent controls sit inside the lower part
of the picture, over a subtle dark gradient for contrast. The strip and gradient
fade out after two seconds of inactivity once a frame is available. Moving the
pointer over the video brings them back. Hovering the controls, dragging a
slider or focusing a control with the keyboard keeps them visible. Loading,
ended and error states also keep the controls visible. On touch screens the
first tap on the picture wakes hidden controls; a further tap toggles playback.
The visual fade respects reduced-motion preferences.
Fullscreen expands the whole player, including its controls.

Playback controls provide play, pause, replay, elapsed/total time, seeking,
mute/volume and fullscreen where the browser supports it. All labels live in
**Website → Homepage → Hero → Player**. The checked-in additive migration adds
these labels to published content and versions without replacing existing copy.
Image mode continues to show an image.

When **Hero → Poster** is empty, a local workspace illustration outlines the
future product capture. The same asset stays behind the loading indicator and
serves as the native video poster without JavaScript. An uploaded poster takes
precedence in every mode.

YouTube uses its [official IFrame API](https://developers.google.com/youtube/iframe_api_reference)
with `controls=0`. Its iframe keeps the full video frame, with Lomi's playback
controls over its lower edge. A transparent central playback button observes
pointer movement across the cross-origin embed while leaving its top and
bottom provider UI bands interactive. The provider controls its branding and
other embed content. No YouTube
requests occur before external-media consent. Revocation destroys the player,
restores the local poster, exits fullscreen and invalidates pending callbacks.
The poster remains while loading and yields when playback starts. A failed
load provides retry and a direct link to the video.

Autoplay is muted and starts once more than half of the viewport is visible.
Reduced motion disables automatic start and spinner animation. Manual play
still works. Playback pauses offscreen, in a hidden tab, or behind a feature
dialog; it does not automatically resume after a user pause. Native videos
also pause on navigation and return to a usable state after errors.

Without JavaScript, YouTube's local poster links directly to YouTube and an
uploaded video keeps its browser controls. Custom controls are only revealed
after the controller initializes. Native fullscreen uses a WebKit fallback
where available; exact behavior and volume restrictions on physical iPhones
need device testing.
