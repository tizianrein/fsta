// Simple /api/guide-repair_new
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ message: "Use POST" });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ message: "Missing GEMINI_API_KEY" });
  }

  try {
    const { question, stepContext } =
      typeof req.body === "object" ? req.body : JSON.parse(req.body || "{}");

    if (!question) {
      return res.status(400).json({ message: "Missing question" });
    }

    // Corrected payload structure for the Gemini API
    const geminiPayload = {
      system_instruction: { // Correct key: "system_instruction" with an underscore
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
              text: `Repair plan step:\n${JSON.stringify(
                stepContext || {},
                null,
                2
              )}\n\nUser question:\n${question}`,
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
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro-latest:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(geminiPayload), // Send the correctly structured payload
      }
    );

    const data = await r.json();

    if (!r.ok) {
      // Improved error logging to see the actual API error on the server
      console.error("Gemini API Error Response:", data);
      throw new Error(
        data.error?.message || `The API call failed with status ${r.status}`
      );
    }

    const answer =
      data?.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("\n").trim() ||
      "Sorry, I could not generate an answer.";

    return res.status(200).json({ answer });
  } catch (err) {
    console.error("Backend Error:", err);
    // Send a more descriptive error to the frontend
    return res.status(500).json({ message: "An internal error occurred.", error: String(err.message) });
  }
}