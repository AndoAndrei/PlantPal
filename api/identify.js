export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { image, mimeType } = req.body;
  if (!image || !mimeType) return res.status(400).json({ error: "Missing image or mimeType" });

  const apiKey = process.env.PLANTNET_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "API key not configured" });

  try {
    const imageBuffer = Buffer.from(image, "base64");
    const ext = mimeType === "image/png" ? "png" : "jpg";

    // Use native Node.js FormData (available in Node 18+)
    const form = new FormData();
    const blob = new Blob([imageBuffer], { type: mimeType });
    form.append("images", blob, `plant.${ext}`);
    form.append("organs", "auto");

    const response = await fetch(
      `https://my-api.plantnet.org/v2/identify/all?api-key=${apiKey}&include-related-images=false`,
      { method: "POST", body: form }
    );

    const data = await response.json();

    if (!response.ok) {
      return res.status(200).json({ error: "PlantNet error", detail: JSON.stringify(data) });
    }

    const best = data.results?.[0];
    if (!best) {
      return res.status(200).json({ error: "No results found", detail: JSON.stringify(data) });
    }

    const score = Math.round((best.score || 0) * 100);
    const confidence = score >= 70 ? "High" : score >= 40 ? "Medium" : "Low";
    const commonName = best.species?.commonNames?.[0] || best.species?.scientificNameWithoutAuthor || "Unknown Plant";
    const scientificName = best.species?.scientificNameWithoutAuthor || "—";

    return res.status(200).json({
      common_name: commonName,
      scientific_name: scientificName,
      confidence,
      brief_description: `Identified with ${score}% confidence via PlantNet.`,
      care_tip: "Check a plant care guide for specific watering and light requirements.",
      watering_frequency_days: 7
    });

  } catch (err) {
    return res.status(500).json({ error: "Request failed", detail: err.message });
  }
}
