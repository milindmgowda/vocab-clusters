// api/progress.js
// Vercel Serverless Function to Save/Load progress in Vercel KV (Upstash Redis)

module.exports = async (req, res) => {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  const kvUrl = process.env.KV_REST_API_URL;
  const kvToken = process.env.KV_REST_API_TOKEN;

  // If Vercel KV database is not configured
  if (!kvUrl || !kvToken) {
    res.status(200).json({
      status: 'no_kv_configured',
      message: 'Vercel KV environment variables are missing. Falling back to local storage.'
    });
    return;
  }

  try {
    if (req.method === 'GET') {
      // Fetch progress from KV store
      const response = await fetch(kvUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${kvToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(['GET', 'vocab_study_progress'])
      });

      if (!response.ok) {
        throw new Error(`KV REST GET failed with status ${response.status}`);
      }

      const data = await response.json();
      // data.result will contain our stringified user progress JSON or null if not set
      const progress = data.result ? JSON.parse(data.result) : {};

      res.status(200).json({
        status: 'success',
        source: 'cloud',
        data: progress
      });
    } 
    else if (req.method === 'POST') {
      const body = req.body;
      const progressData = typeof body === 'string' ? JSON.parse(body) : body;

      if (!progressData || typeof progressData !== 'object') {
        res.status(400).json({ status: 'error', message: 'Invalid payload.' });
        return;
      }

      // Save progress to KV store
      const progressString = JSON.stringify(progressData);
      const response = await fetch(kvUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${kvToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(['SET', 'vocab_study_progress', progressString])
      });

      if (!response.ok) {
        throw new Error(`KV REST SET failed with status ${response.status}`);
      }

      res.status(200).json({
        status: 'success',
        message: 'Progress saved to Vercel KV successfully.'
      });
    } 
    else {
      res.status(405).json({ status: 'error', message: 'Method not allowed.' });
    }
  } catch (error) {
    console.error('Serverless function error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Internal Server Error',
      error: error.message
    });
  }
};
