// File: /api/guide-repair_new.js

// Set a maximum duration for the serverless function to run (e.g., 60 seconds).
export const maxDuration = 60;

// The main handler function for the API endpoint.
export default async function handler(req, res) {
  // 1. --- Basic Request Validation ---
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ message: "Method Not Allowed. Please use POST." });
  }

  // 2. --- API Key and Configuration ---
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error("FATAL: GEMINI_API_KEY environment variable is not set.");
    return res.status(500).json({ message: "Server configuration error: The API key is missing." });
  }

  try {
    // 3. --- Input Validation ---
    const { question, stepContext } = req.body;
    if (!question || typeof question !== 'string' || question.trim() === '') {
      return res.status(400).json({ message: "Bad Request: 'question' is a required field and cannot be empty." });
    }

    // 4. --- Constructing the Prompt for Gemini ---
    const geminiParts = [
      {
        text: "You are H.E.L.G.A., a helpful and expert repair guide. A user has provided a JSON object representing a single step in a repair plan and has a question about it. Your task is to answer their question clearly and concisely in plain text, using the provided JSON as context.",
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
      },
    };

    // 5. --- Calling the Gemini API ---
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${apiKey}`;

    const geminiResponse = await fetch(geminiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(geminiPayload),
    });

    // 6. --- ROBUST RESPONSE & ERROR HANDLING ---
    if (!geminiResponse.ok) {
      const errorText = await geminiResponse.text();
      console.error("Gemini API Error:", errorText);
      throw new Error(`The AI service failed with status ${geminiResponse.status}. Details: ${errorText}`);
    }

    const data = await geminiResponse.json();

    // 7. --- Extracting the Answer ---
    const answer = data?.candidates?.[0]?.content?.parts?.[0]?.text.trim();

    if (!answer) {
        console.warn("Could not extract an answer from the Gemini API response:", JSON.stringify(data, null, 2));
        return res.status(200).json({ answer: "I was able to contact the AI, but it did not provide a valid answer. Please try rephrasing your question." });
    }

    // 8. --- Sending the Successful Response ---
    return res.status(200).json({ answer });

  } catch (err) {
    console.error("Error in guide-repair_new handler:", err);
    return res.status(500).json({
      message: "An internal error occurred while processing your question.",
      error: err.message,
    });
  }
}