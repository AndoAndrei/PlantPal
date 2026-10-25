export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { image, mimeType } = req.body || {};
  if (!image || !mimeType) return res.status(400).json({ error: "Missing image or mimeType" });

  const apiKey = process.env.PLANTNET_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "API key not configured" });

  try {
    const imageBuffer = Buffer.from(image, "base64");
    const ext = mimeType === "image/png" ? "png" : "jpg";

    const form = new FormData();
    form.append("images", new Blob([imageBuffer], { type: mimeType }), `plant.${ext}`);
    form.append("organs", "auto");

    const params = new URLSearchParams({
      "api-key": apiKey,
      lang: "en",
      "nb-results": "3",
      "include-related-images": "true"
    });

    const response = await fetch(
      `https://my-api.plantnet.org/v2/diseases/identify?${params.toString()}`,
      { method: "POST", body: form }
    );

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      // PlantNet rejects images that do not look like a plant (404 / "rejected")
      return res.status(200).json({
        error: "Could not analyse this photo",
        detail: data?.message || data?.error || `PlantNet returned ${response.status}`
      });
    }

    const results = (data.results || []).slice(0, 3).map(r => {
      const score = Math.round((r.score || 0) * 100);
      const img = r.images && r.images[0];
      return {
        code: r.name,
        description: r.description || r.name,
        score,
        confidence: score >= 70 ? "High" : score >= 40 ? "Medium" : "Low",
        image: img ? img.url?.m : null,
        citation: img ? img.citation : null
      };
    });

    if (results.length === 0) {
      return res.status(200).json({ error: "No disease or pest matched this photo" });
    }

    return res.status(200).json({
      results,
      remaining: data.remainingIdentificationRequests
    });
  } catch (err) {
    return res.status(500).json({ error: "Request failed", detail: err.message });
  }
}
