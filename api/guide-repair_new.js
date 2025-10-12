// Simple /api/guide-repair_new
export default async function handler(req, res) {
  // 1. Basic method check
  if (req.method !== "POST") {
    return res.status(405).json({ message: "Use POST method" });
  }

  // 2. Check for the API Key
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error("GEMINI_API_KEY is not set in environment variables.");
    return res.status(500).json({ message: "Server configuration error: Missing API Key." });
  }

  try {
    // 3. Directly parse the body. In Vercel, this should already be an object.
    const { question, stepContext } = req.body;

    if (!question) {
      return res.status(400).json({ message: "Missing 'question' in request body." });
    }

    // This multi-turn structure is the most compatible way to set a persona
    // for the gemini-pro model.
    const geminiPayload = {
      contents: [
        { role: "user", parts: [{ text: "You are H.E.L.G.A., an expert repair guide. Answer the user's question based on the JSON context of the repair step they provide." }] },
        { role: "model", parts: [{ text: "Understood. I am H.E.L.G.A. I will answer based on the provided repair step." }] },
        { role: "user", parts: [{ text: `Repair step context:\n${JSON.stringify(stepContext || {}, null, 2)}\n\nQuestion:\n${question}` }] }
      ],
      generationConfig: {
        temperature: 0.6,
        maxOutputTokens: 400,
        responseMimeType: "text/plain",
      },
    };

    // 4. Fetch from Google with a timeout controller
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 9000); // 9-second timeout

    const geminiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(geminiPayload),
        signal: controller.signal, // Attach the abort signal
      }
    );

    clearTimeout(timeoutId); // Clear the timeout if the request completes in time

    const data = await geminiResponse.json();

    // 5. Explicitly check if the API call was successful
    if (!geminiResponse.ok) {
      console.error("Gemini API Error Response:", data);
      // Forward the specific error from Google to the frontend
      throw new Error(data.error?.message || `API call failed with status ${geminiResponse.status}`);
    }

    const answer = data?.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("\n").trim() || "Sorry, I could not find an answer.";

    return res.status(200).json({ answer });

  } catch (err) {
    // 6. This is the critical part for debugging.
    console.error("!!! BACKEND CRASH !!!:", err); // This will show the real error in your Vercel logs

    let errorMessage = "An internal server error occurred.";
    if (err.name === 'AbortError') {
      errorMessage = "The request to the AI model timed out. Please try again.";
    } else if (err.message) {
      // Forward the actual error message to the frontend for better debugging
      errorMessage = err.message;
    }

    return res.status(500).json({ message: errorMessage, error: String(err) });
  }
}