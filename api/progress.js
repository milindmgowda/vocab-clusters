// api/progress.js
// Vercel Serverless Function to Save/Load progress in Vercel Blob Storage

const { put, list } = require('@vercel/blob');

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

  const token = process.env.BLOB_READ_WRITE_TOKEN;

  // If Vercel Blob is not configured
  if (!token) {
    res.status(200).json({
      status: 'no_kv_configured', // We keep 'no_kv_configured' so the frontend client logic doesn't need to change
      message: 'Vercel Blob storage is missing. Falling back to local storage.'
    });
    return;
  }

  try {
    if (req.method === 'GET') {
      // List files to find progress.json
      const { blobs } = await list({ token });
      const progressBlob = blobs.find(b => b.pathname === 'progress.json');

      if (!progressBlob) {
        // First run, file doesn't exist yet
        res.status(200).json({
          status: 'success',
          source: 'cloud',
          data: {}
        });
        return;
      }

      // Fetch file content from public URL
      const fetchResponse = await fetch(progressBlob.url);
      if (!fetchResponse.ok) {
        throw new Error(`Failed to fetch blob file content: ${fetchResponse.status}`);
      }
      
      const progress = await fetchResponse.json();

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

      // Save/Overwrite progress.json in Vercel Blob
      await put('progress.json', JSON.stringify(progressData), {
        access: 'public',
        addRandomSuffix: false,
        token
      });

      res.status(200).json({
        status: 'success',
        message: 'Progress saved to Vercel Blob successfully.'
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
