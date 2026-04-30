export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { image, mimeType } = req.body;
  if (!image || !mimeType) return res.status(400).json({ error: "Missing image or mimeType" });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "API key not configured" });

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{
            parts: [
              {
                inline_data: { mime_type: mimeType, data: image }
              },
              {
                text: `You are a plant identification expert. Identify the plant in this image and respond ONLY with a JSON object, no markdown, no explanation:
{"common_name":"...","scientific_name":"...","confidence":"High|Medium|Low","brief_description":"one sentence about the plant","care_tip":"one practical care tip","watering_frequency_days":7}
If you cannot identify a plant, use "Unknown Plant" for names. Always provide a watering_frequency_days number between 1 and 30.`
              }
            ]
          }],
          generationConfig: { temperature: 0.1, maxOutputTokens: 500 }
        })
      }
    );

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "{}";

    try {
      const result = JSON.parse(text.replace(/```json|```/g, "").trim());
      console.log("Gemini result:", JSON.stringify(result));
res.status(200).json(result);
    } catch {
      res.status(200).json({
        common_name: "Unknown",
        scientific_name: "—",
        confidence: "Low",
        brief_description: text,
        care_tip: "",
        watering_frequency_days: 7
      });
    }
  } catch (err) {
    res.status(500).json({ error: "Identification failed", detail: err.message });
  }
}
