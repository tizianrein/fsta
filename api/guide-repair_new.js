// Simple /api/guide-repair_new
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ message: "Use POST" });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(500).json({ message: "Missing GEMINI_API_KEY" });

  try {
    const { question, stepContext } =
      typeof req.body === "object" ? req.body : JSON.parse(req.body || "{}");

    if (!question) return res.status(400).json({ message: "Missing question" });

    const body = {
      systemInstruction: {
        parts: [
          {
            text: `You are H.E.L.G.A., a repair guide. The user will ask about a repair plan (JSON). Use the provided plan step as context, then answer in plain text.`,
          },
        ],
      },
      contents: [
        {
          role: "user",
          parts: [
            {
              text: `Repair plan step:\n${JSON.stringify(stepContext || {}, null, 2)}\n\nUser question:\n${question}`,
            },
          ],
        },
      ],
      generationConfig: {
        temperature: 0.6,
        maxOutputTokens: 400,
        responseMimeType: "text/plain",
      },
    };

    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }
    );

    const data = await r.json();
    const answer =
      data?.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("\n").trim() ||
      data?.candidates?.[0]?.text?.trim() ||
      "No answer.";

    return res.status(200).json({ answer });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Error", error: String(err) });
  }
}
