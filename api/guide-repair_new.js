// File: /api/guide-repair_new.js
export const maxDuration = 60; // Set a 60-second timeout

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ message: "Use POST method" });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error("GEMINI_API_KEY is not configured.");
    return res.status(500).json({ message: "Server configuration error: Missing API Key." });
  }

  try {
    const { question, stepContext } = req.body;

    if (!question) {
      return res.status(400).json({ message: "Missing 'question' in request body." });
    }

    const geminiParts = [
      {
        text: `You are H.E.L.G.A., a helpful and expert repair guide. A user has provided a JSON object representing a single step in a repair plan and has a question about it. Your task is to answer their question clearly and concisely, using the provided JSON as context.`,
      },
      {
        text: `Repair Step Context (JSON):\n${JSON.stringify(stepContext || {}, null, 2)}`,
      },
      {
        text: `User's Question:\n"${question}"`,
      },
    ];

    const geminiPayload = {
      contents: [{ parts: geminiParts }],
      generationConfig: {
        temperature: 0.6,
        maxOutputTokens: 400,
        responseMimeType: "text/plain",
      },
    };

    // --- THE FIX: The URL typo is corrected here ---
    const geminiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro-latest:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(geminiPayload),
      }
    );

    const data = await geminiResponse.json();

    if (!geminiResponse.ok) {
      console.error("Gemini API Error Response:", data);
      throw new Error(data.error?.message || `API call failed with status ${geminiResponse.status}`);
    }

    const answer = data?.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("\n").trim() || "Sorry, I could not generate an answer.";

    return res.status(200).json({ answer });

  } catch (err) {
    console.error("Backend Error in guide-repair_new:", err);
    return res.status(500).json({
        message: "An internal error occurred while processing your question.",
        error: err.message
    });
  }
}