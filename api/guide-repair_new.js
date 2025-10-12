// /api/guide-repair_new.js
// Minimal, robust "Ask H.E.L.G.A." endpoint for Gemini 2.x/1.5
// Env: GEMINI_API_KEY (required), GEMINI_MODEL (optional; default: gemini-2.0-flash)

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ message: "Method not allowed" });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ message: "Missing GEMINI_API_KEY" });
    }

    const MODEL = process.env.GEMINI_MODEL || "gemini-2.0-flash";

    // --- Parse input ---
    const { question, stepContext } = req.body || {};
    if (!question || typeof question !== "string") {
      return res.status(400).json({ message: "Please provide a 'question' string." });
    }
    if (!stepContext || typeof stepContext !== "object") {
      return res.status(400).json({ message: "Please provide a valid 'stepContext' object." });
    }

    // --- Build prompt parts (role required for newer Gemini models) ---
const parts = [
  {
    text: `
You are H.E.L.G.A. (Helpful Electronic & Logistical Guidance Agent),
a digital master craftsperson and expert repair technician AI.
Your primary role is to provide short, but exceptionally helpful, clear, and safe
guidance to users performing repair tasks. You must go beyond the basic information
provided in the step context and use your extensive knowledge of materials, tools, and best practices.

Your Thought Process for Every Answer:
1. Analyze the User's Goal: What is the user trying to achieve with their question?
2. Analyze the Task Context: What is the specific repair step? (e.g., "Fill Scratch," "Attach Leg").
3. Synthesize with Expert Knowledge: Combine the task context with your deep understanding of real-world repair work. Provide specific, actionable advice.
4. Prioritize Safety & Best Practices: Always include relevant safety warnings or tips for getting the best results.
5. Be Specific and Actionable: Do not give vague answers.
6. BE PRECISE AND SHORT BUT GIVE EXPERT KNOWLEDGE.

CRITICAL OUTPUT RULES:
- Your response MUST be plain, precise, and short text.
- Be encouraging, confident, and clear in your tone.
- Start your answer directly, without any preamble.

A user has provided a JSON object representing one repair step and asked a question about it.
Answer clearly and concisely in plain text. If something is unknown, say so briefly.
    `.trim(),
  },
  {
    text: `Repair Step Context (JSON):\n${JSON.stringify(stepContext, null, 2)}`
  },
  {
    text: `User's Question:\n"${question}"`
  },
];

    const payload = {
      contents: [{ role: "user", parts }],
      generationConfig: {
        temperature: 0.6,
        maxOutputTokens: 400,
      },
    };

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey}`;

    // --- Call Gemini ---
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000); // 30s timeout

    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    }).catch((e) => {
      // fetch-level error (network/timeout/abort)
      throw new Error(`Network error calling Gemini: ${e.message || e}`);
    });
    clearTimeout(timeout);

    const data = await resp.json().catch(() => ({}));

    if (!resp.ok) {
      // Surface Gemini error details to the UI for easier debugging
      const geminiMsg =
        data?.error?.message ||
        data?.message ||
        (typeof data === "string" ? data : JSON.stringify(data));
      return res.status(resp.status).json({
        message: "Gemini returned an error",
        error: geminiMsg,
        status: resp.status,
      });
    }

    // --- Extract answer robustly across response shapes ---
    let answer = "";
    try {
      const cand = data?.candidates?.[0];

      // Preferred: content.parts[].text
      if (Array.isArray(cand?.content?.parts)) {
        answer = cand.content.parts.map((p) => p?.text || "").join("").trim();
      }

      // Fallback: content[] (some responses flatten parts)
      if (!answer && Array.isArray(cand?.content)) {
        answer = cand.content.map((p) => p?.text || "").join("").trim();
      }

      // Fallback: direct text on candidate (rare)
      if (!answer && typeof cand?.text === "string") {
        answer = String(cand.text).trim();
      }
    } catch (e) {
      // continue to generic fallback below
    }

    if (!answer) {
      // Safety: give a friendly note and dump a snippet to logs
      console.warn(
        "Gemini response did not include extractable text. Full payload:",
        JSON.stringify(data, null, 2)
      );
      return res.status(200).json({
        answer:
          "I reached the AI service, but it returned no text. Please try a simpler phrasing or ask a follow-up.",
      });
    }

    return res.status(200).json({ answer });
  } catch (err) {
    console.error("Error in guide-repair_new handler:", err);
    const message =
      err?.name === "AbortError"
        ? "Request to AI timed out."
        : String(err?.message || err);
    return res.status(500).json({
      message: "AI request failed",
      error: message,
    });
  }
}
