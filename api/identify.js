export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { image, mimeType } = req.body;
  if (!image || !mimeType) return res.status(400).json({ error: "Missing image or mimeType" });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "API key not configured" });

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{
            parts: [
              { inline_data: { mime_type: mimeType, data: image } },
              { text: `You are a plant identification expert. Identify the plant in this image and respond ONLY with a JSON object, no markdown, no explanation, no backticks:
{"common_name":"...","scientific_name":"...","confidence":"High|Medium|Low","brief_description":"one sentence about the plant","care_tip":"one practical care tip","watering_frequency_days":7}
If you cannot identify a plant, use "Unknown Plant" for names. Always provide a watering_frequency_days number between 1 and 30.` }
            ]
          }],
          generationConfig: { temperature: 0.1, maxOutputTokens: 500 }
        })
      }
    );

    const raw = await response.json();

    // Return raw so we can debug if needed
    if (!raw.candidates || !raw.candidates[0]) {
      return res.status(200).json({ error: "No candidates", detail: JSON.stringify(raw) });
    }

    const text = raw.candidates[0]?.content?.parts[0]?.text || "";

    if (!text) {
      return res.status(200).json({ error: "Empty text from Gemini", detail: JSON.stringify(raw) });
    }

    // Strip any markdown backticks just in case
    const cleaned = text.replace(/```json|```/g, "").trim();

    try {
      const result = JSON.parse(cleaned);
      return res.status(200).json(result);
    } catch {
      return res.status(200).json({ error: "JSON parse failed", detail: cleaned });
    }

  } catch (err) {
    return res.status(500).json({ error: "Request failed", detail: err.message });
  }
}
