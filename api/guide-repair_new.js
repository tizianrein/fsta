// /api/guide-repair_new.js
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ message: "Use POST" });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ message: "Missing GEMINI_API_KEY" });
  }

  // robust body parsing
  const bodyIn =
    typeof req.body === "object" && req.body !== null
      ? req.body
      : safeParse(req.body);

  const question = typeof bodyIn?.question === "string" ? bodyIn.question.trim() : "";
  const stepContext = bodyIn?.stepContext ?? null;

  if (!question) {
    return res.status(400).json({ message: "Missing question" });
  }

  // request for Gemini
  const googleBody = {
    systemInstruction: {
      parts: [
        {
          text:
            "You are H E L G A. You are a helpful repair assistant. Use the provided repair step JSON as context. Answer plainly in English. Keep it concrete and practical."
        }
      ]
    },
    contents: [
      {
        role: "user",
        parts: [
          {
            text:
              "Repair plan step:\n" +
              JSON.stringify(stepContext || {}, null, 2) +
              "\n\nUser question:\n" +
              question
          }
        ]
      }
    ],
    generationConfig: {
      temperature: 0.6,
      maxOutputTokens: 400,
      responseMimeType: "text/plain"
    },
    // relax safety so normal repair questions are not blocked
    safetySettings: [
      { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_ONLY_HIGH" },
      { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_ONLY_HIGH" },
      { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_ONLY_HIGH" },
      { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_ONLY_HIGH" }
    ]
  };

  try {
    const r = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent?key=" +
        encodeURIComponent(apiKey),
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(googleBody)
      }
    );

    // if upstream is not OK, pass through the payload so the UI can show the real reason
    if (!r.ok) {
      let payload;
      try {
        payload = await r.json();
      } catch {
        payload = { error: await r.text() };
      }
      return res.status(r.status).json({
        message: "Upstream error from Gemini",
        details: payload
      });
    }

    const data = await r.json();

    // if no candidates, check for safety block and surface reason
    if (!Array.isArray(data.candidates) || data.candidates.length === 0) {
      const pf = data?.promptFeedback;
      if (pf?.blockReason) {
        return res.status(400).json({
          message:
            "AI blocked the request for policy reasons. Reason: " + pf.blockReason,
          details: pf
        });
      }
      return res.status(502).json({
        message: "AI returned no candidates",
        details: data
      });
    }

    // extract text across shapes
    const first = data.candidates[0];
    let answer = "";

    if (first?.content?.parts && Array.isArray(first.content.parts)) {
      answer = first.content.parts
        .map(p => (typeof p?.text === "string" ? p.text : ""))
        .filter(Boolean)
        .join("\n")
        .trim();
    }
    if (!answer && typeof first?.text === "string") {
      answer = first.text.trim();
    }
    if (!answer && typeof data?.output_text === "string") {
      answer = data.output_text.trim();
    }

    if (!answer) {
      return res.status(502).json({
        message: "Failed to extract a valid answer from the AI",
        details: data
      });
    }

    return res.status(200).json({ answer });
  } catch (err) {
    return res
      .status(500)
      .json({ message: "Server error in guide repair", error: String(err) });
  }
}

function safeParse(x) {
  try {
    return JSON.parse(x || "{}");
  } catch {
    return {};
  }
}
