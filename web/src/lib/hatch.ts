/** Name of the hatch pattern image registered with the map. */
export const HATCH_IMAGE = "gap-hatch";
/** Hatch colour as RGBA: --text-muted at about 60% opacity, so the basemap still shows through. */
export const HATCH_RGBA = [89, 97, 106, 150] as const;

/**
 * A square tile of diagonal stripes ("/"), for MapLibre's fill-pattern. Built
 * pixel by pixel so it needs no canvas. `size` and `stripe` are in device pixels;
 * register it with pixelRatio 2 so it stays sharp on high-density screens.
 */
export function hatchImage(size = 16, stripe = 3): { width: number; height: number; data: Uint8Array } {
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // x + y is constant along a "/" line; the tile repeats every `size` pixels in both directions.
      if ((x + y) % size >= stripe) continue;
      data.set(HATCH_RGBA, (y * size + x) * 4);
    }
  }
  return { width: size, height: size, data };
}
