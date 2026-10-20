Temporary hero images from [Placehold](https://placehold.co/), stored locally
and optimized by Astro with the other site assets.

- `workspace.png`: [1600 × 1000](https://placehold.co/1600x1000/000000/FFFFFF/png),
  used by the single hero preview while the inline video API loads.
- `mobile.png`: [430 × 932](https://placehold.co/430x932/111111/FFFFFF/png),
  archived from the previous two-device hero composition.
- `detail.png`: [660 × 600](https://placehold.co/660x600/111111/FFFFFF/png),
  retained for the feature gallery's supporting views.

After building, check the single preview, responsive layout and inline video flow:

```sh
VERIFY_URL=http://localhost:4322/ node scripts/verify-hero-product.mjs
```
