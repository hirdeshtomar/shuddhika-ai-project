// Vercel serverless entry point — wraps the whole Express backend.
// Every /api/* request (and /health) is routed here via vercel.json.
import app from '../backend/src/app.js';

export default app;
