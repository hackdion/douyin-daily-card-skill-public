# Public Safe V1 Assets

This public asset set intentionally ships no binary image files and no HTML templates.

## Scope

- No private PNG, JPG, WebP, SVG, or other binary visual assets are included.
- No branded or account-specific HTML templates are included.
- Generated visuals should be built with pure CSS shapes, gradients, layout, and text supplied by the caller.

## Public Safety Notes

- Do not include private account names, handles, logos, watermarks, or brand-specific identifiers in this directory.
- Do not include character artwork, game artwork, screenshots, or other materials that may require separate rights clearance.
- Keep reusable examples generic, for example: `Daily Brief`, `News Card`, `Creator Update`, or `Public Template`.
- If a downstream project needs custom images, store them outside this public-safe asset directory and document their license separately.

## Recommended Rendering Approach

Use pure CSS for visual style:

- CSS gradients for backgrounds.
- CSS border, shadow, radius, and pseudo-elements for decorative shapes.
- Text placeholders supplied at runtime.
- Optional emoji-free geometric ornaments created with CSS only.

This keeps the public version portable and avoids redistributing private or third-party visual assets.
