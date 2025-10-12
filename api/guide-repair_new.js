// File: /api/guide-repair_new.js

// Set a maximum duration for the serverless function to run (e.g., 60 seconds).
export const maxDuration = 60;

// The main handler function for the API endpoint.
export default async function handler(req, res) {
  // 1. --- Basic Request Validation ---
  // Only allow POST requests.
  if (req.method !== "POST") {
    // Set the 'Allow' header to inform the client which methods are supported.
    res.setHeader("Allow", "POST");
    return res.status(405).json({ message: "Method Not Allowed. Please use POST." });
  }

  // 2. --- API Key and Configuration ---
  // Retrieve the Gemini API key from server-side environment variables.
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    // Log the error on the server for the developer to see.
    console.error("FATAL: GEMINI_API_KEY environment variable is not set.");
    // Return a generic server configuration error to the client.
    return res.status(500).json({ message: "Server configuration error: The API key is missing." });
  }

  try {
    // 3. --- Input Validation ---
    // Destructure the expected data from the request body.
    const { question, stepContext } = req.body;

    // Ensure the 'question' field, which is essential, was provided.
    if (!question || typeof question !== 'string' || question.trim() === '') {
      return res.status(400).json({ message: "Bad Request: 'question' is a required field and cannot be empty." });
    }

    // 4. --- Constructing the Prompt for Gemini ---
    // Create the structured input that Gemini will process.
    const geminiParts = [
      {
        text: "You are H.E.L.G.A., a helpful and expert repair guide. A user has provided a JSON object representing a single step in a repair plan and has a question about it. Your task is to answer their question clearly and concisely in plain text, using the provided JSON as context.",
      },
      {
        // Include the current repair step's data as JSON context.
        text: `Repair Step Context (JSON):\n${JSON.stringify(stepContext || {}, null, 2)}`,
      },
      {
        // Include the user's specific question.
        text: `User's Question:\n"${question}"`,
      },
    ];

    // Define the payload for the Gemini API call.
    const geminiPayload = {
      contents: [{ parts: geminiParts }],
      // Configuration for the generation process.
      generationConfig: {
        temperature: 0.6, // Controls the "creativity" of the response.
        maxOutputTokens: 400, // Limits the length of the generated answer.
      },
    };

    // 5. --- Calling the Gemini API ---
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro-latest:generateContent?key=${apiKey}`;

    const geminiResponse = await fetch(geminiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(geminiPayload),
    });

    // 6. --- ROBUST RESPONSE & ERROR HANDLING ---
    // THIS IS THE CRITICAL CHANGE: Check if the response is NOT OK (e.g., status 400, 500).
    if (!geminiResponse.ok) {
      // Try to read the raw error text from the API's response.
      const errorText = await geminiResponse.text();
      console.error("Gemini API Error:", errorText); // Log the actual error for debugging.
      // Throw an error that includes the status and the raw text, which is more informative.
      throw new Error(`The AI service failed with status ${geminiResponse.status}. Details: ${errorText}`);
    }

    // If the response was OK, we can safely parse it as JSON.
    const data = await geminiResponse.json();

    // 7. --- Extracting the Answer ---
    // Safely navigate the JSON structure to find the generated text.
    // The `?.` (optional chaining) prevents errors if any part of the path is missing.
    const answer = data?.candidates?.[0]?.content?.parts?.[0]?.text.trim();

    // If no answer could be extracted, provide a fallback message.
    if (!answer) {
        console.warn("Could not extract an answer from the Gemini API response:", JSON.stringify(data, null, 2));
        return res.status(200).json({ answer: "I was able to contact the AI, but it did not provide a valid answer. Please try rephrasing your question." });
    }

    // 8. --- Sending the Successful Response ---
    // Return the extracted answer to the client.
    return res.status(200).json({ answer });

  } catch (err) {
    // This block catches any errors from the 'try' block (e.g., network issues, the error we threw).
    console.error("Error in guide-repair_new handler:", err);
    // Return a generic 500 Internal Server Error status.
    return res.status(500).json({
      message: "An internal error occurred while processing your question.",
      // Include the specific error message for easier debugging on the client side if needed.
      error: err.message,
    });
  }
}