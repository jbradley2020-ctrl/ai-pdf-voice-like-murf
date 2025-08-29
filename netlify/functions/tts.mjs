exports.handler = async (event) => {
  try {
    const { text, voice = "Rachel" } = JSON.parse(event.body || "{}");

    if (!process.env.ELEVENLABS_API_KEY) {
      return { statusCode: 500, body: "Missing ELEVENLABS_API_KEY" };
    }

    const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice}`, {
      method: "POST",
      headers: {
        "xi-api-key": process.env.ELEVENLABS_API_KEY,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        text: text,
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.5
        }
      })
    });

    if (!response.ok) {
      const err = await response.text();
      return { statusCode: 500, body: err };
    }

    const arrayBuffer = await response.arrayBuffer();
    return {
      statusCode: 200,
      headers: { "Content-Type": "audio/mpeg" },
      body: Buffer.from(arrayBuffer).toString("base64"),
      isBase64Encoded: true
    };

  } catch (error) {
    return { statusCode: 500, body: error.toString() };
  }
};
