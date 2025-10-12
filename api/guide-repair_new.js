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

    // A more compatible payload structure using a multi-turn conversation
    // to set the system prompt/persona. This works better with models like gemini-pro.
    const geminiPayload = {
      contents: [
        // Turn 1: Sets the persona of H.E.L.G.A.
        {
          role: "user",
          parts: [{
            text: "You are H.E.L.G.A., a helpful and expert repair guide. When a user provides a JSON object representing a step in a repair plan and asks a question, you must answer their question concisely based on the provided context.",
          }],
        },
        // Turn 2: A simple acknowledgment from the model to confirm it understood the persona.
        {
          role: "model",
          parts: [{
            text: "Understood. I will act as H.E.L.G.A. and answer questions based on the repair step provided.",
          }],
        },
        // Turn 3: The actual user question with the context.
        {
          role: "user",
          parts: [{
            text: `Here is the current repair step:\n${JSON.stringify(
              stepContext || {},
              null,
              2
            )}\n\nHere is my question:\n${question}`,
          }],
        },
      ],
      generationConfig: {
        temperature: 0.6,
        maxOutputTokens: 400,
        responseMimeType: "text/plain",
      },
    };

    const r = await fetch(
      // Using the standard, widely available gemini-pro model
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(geminiPayload),
      }
    );

    const data = await r.json();

    // If the API call was not successful, log the error and throw it.
    if (!r.ok) {
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
    // Log the full error on the server for debugging
    console.error("Backend Error:", err);
    // Send a more descriptive error message to the frontend
    return res.status(500).json({
      message: "An internal error occurred.",
      error: String(err.message), // Send the actual error message
    });
  }
}