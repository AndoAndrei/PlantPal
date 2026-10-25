// Proxies PlantSolve's static care dataset so the browser never hits CORS limits.
// Data: PlantSolve Open Dataset, CC BY 4.0, https://www.plantsolve.com
const BASE = "https://www.plantsolve.com/api/v1/plants/";

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const slug = req.query.slug;
  if (slug && !/^[a-z0-9-]+$/.test(slug)) return res.status(400).json({ error: "Invalid slug" });

  const url = slug ? `${BASE}${slug}.json` : `${BASE}index.json`;

  try {
    const upstream = await fetch(url, { headers: { Accept: "application/json" } });
    if (!upstream.ok) return res.status(upstream.status).json({ error: `PlantSolve returned ${upstream.status}` });
    const data = await upstream.json();
    res.setHeader("Cache-Control", "public, s-maxage=86400, stale-while-revalidate=604800");
    return res.status(200).json(data);
  } catch (err) {
    return res.status(502).json({ error: "Could not reach PlantSolve", detail: err.message });
  }
}
