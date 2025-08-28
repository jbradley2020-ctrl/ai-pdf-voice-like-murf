export default async (request) => {
  try {
    if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405 });
    }
    const { input, voice = 'alloy', model = 'tts-1-hd' } = await request.json();
    if (!input || typeof input !== 'string') {
      return new Response('Missing "input"', { status: 400 });
    }
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return new Response('OPENAI_API_KEY not configured', { status: 500 });
    }
    const resp = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ model, voice, input })
    });
    if (!resp.ok) {
      const text = await resp.text();
      return new Response(text, { status: resp.status });
    }
    const bytes = await resp.arrayBuffer();
    return new Response(bytes, {
      status: 200,
      headers: { 'Content-Type': 'audio/mpeg', 'Cache-Control': 'no-store' }
    });
  } catch (e) {
    return new Response(e.message || 'Unexpected error', { status: 500 });
  }
};