Temporary hero images from [Placehold](https://placehold.co/), stored locally
and optimized by Astro with the other site assets.

- `workspace.png`: [1600 × 1000](https://placehold.co/1600x1000/000000/FFFFFF/png),
  shared by the main hero image and video loading poster.
- `mobile.png`: [430 × 932](https://placehold.co/430x932/111111/FFFFFF/png),
  used by the portrait mobile screen in the hero's phone frame.
- `detail.png`: [660 × 600](https://placehold.co/660x600/111111/FFFFFF/png),
  retained for the feature gallery's supporting views.

After building, check the device composition, responsive layout and video flow:

```sh
VERIFY_URL=http://localhost:4322/ node scripts/verify-hero-product.mjs
```
