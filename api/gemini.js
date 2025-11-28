// DEPRECATED
// Please use /api/generate instead.
// This file is kept as a redirect stub or can be deleted.

export default async function handler(req, res) {
  res.status(410).json({ 
    error: 'This endpoint is deprecated. Please use /api/generate.' 
  });
}
