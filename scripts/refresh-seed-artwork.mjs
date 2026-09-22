// Refresh public catalog artwork, not streaming/episode identity mappings.
import { readFile, writeFile } from "node:fs/promises";
const path = new URL("../src/features/tracker/seed-artwork.json", import.meta.url);
const snapshot = JSON.parse(await readFile(path, "utf8"));
for (const [id, entry] of Object.entries(snapshot)) {
  const response = await fetch(`https://api.jikan.moe/v4/anime/${entry.malId}`, { signal: AbortSignal.timeout(12_000) });
  if (!response.ok) throw new Error(`Metadata unavailable for ${id}: ${response.status}`);
  const { data } = await response.json();
  const coverUrl = data?.images?.jpg?.large_image_url;
  if (data?.mal_id !== entry.malId || data?.title !== entry.title || !coverUrl?.startsWith("https://cdn.myanimelist.net/images/anime/")) throw new Error(`Artwork identity changed for ${id}; review before updating`);
  snapshot[id] = { ...entry, coverUrl };
  await new Promise((resolve) => setTimeout(resolve, 500));
}
await writeFile(path, `${JSON.stringify(snapshot, null, 2)}\n`);
console.log(`Refreshed ${Object.keys(snapshot).length} verified catalog covers.`);
