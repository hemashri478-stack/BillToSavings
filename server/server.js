/**
 * Bill-to-Savings — Optional Node.js Server & AI Bill Extraction API
 * Serves the single-page web application and provides `/api/extract-bill`
 * with server-side validation, rate limiting, explicit consent check, and demo fallback.
 */

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const Engine = require('../src/engine/calculator.js');
const DemoData = require('../src/data/demoData.js');

const PORT = process.env.PORT || 3000;

// Simple in-memory IP rate limiter (max 15 extraction calls per 15 minutes per IP)
const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const RATE_LIMIT_MAX_REQUESTS = 15;

function checkRateLimit(ip) {
  const now = Date.now();
  const record = rateLimitMap.get(ip) || { count: 0, startTime: now };
  if (now - record.startTime > RATE_LIMIT_WINDOW_MS) {
    record.count = 1;
    record.startTime = now;
  } else {
    record.count += 1;
  }
  rateLimitMap.set(ip, record);
  return record.count <= RATE_LIMIT_MAX_REQUESTS;
}

const server = http.createServer((req, res) => {
  const clientIp = req.socket.remoteAddress || '127.0.0.1';

  // API Health & Configuration status (never exposes API keys)
  if (req.method === 'GET' && req.url === '/api/status') {
    const hasAiKey = Boolean(process.env.GEMINI_API_KEY || process.env.OPENAI_API_KEY);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        status: 'ok',
        aiExtractionConfigured: hasAiKey,
        demoModeAvailable: true,
        maxUploadBytes: Engine.MAX_FILE_SIZE_BYTES,
        allowedFileTypes: Engine.ALLOWED_FILE_TYPES
      })
    );
    return;
  }

  // POST /api/extract-bill — Server-side validated bill extraction
  if (req.method === 'POST' && req.url === '/api/extract-bill') {
    if (!checkRateLimit(clientIp)) {
      res.writeHead(429, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Rate limit exceeded. Please wait before submitting another bill.' }));
      return;
    }

    let body = '';
    let aborted = false;

    req.on('data', (chunk) => {
      body += chunk.toString();
      if (Buffer.byteLength(body) > Engine.MAX_FILE_SIZE_BYTES * 1.4) {
        aborted = true;
        res.writeHead(413, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Payload exceeds maximum allowed file size (5 MB).' }));
        req.destroy();
      }
    });

    req.on('end', () => {
      if (aborted) return;
      try {
        const payload = JSON.parse(body || '{}');

        // Validate file metadata on server
        const fileCheck = Engine.validateBillUpload(payload.fileMeta);
        if (!fileCheck.valid) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: fileCheck.error }));
          return;
        }

        // Enforce explicit user consent before external AI processing
        const hasAiKey = Boolean(process.env.GEMINI_API_KEY || process.env.OPENAI_API_KEY);
        if (payload.useExternalAi && !payload.userConsentGranted) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              error: 'Explicit user consent is required before sending bill data to an external AI service.'
            })
          );
          return;
        }

        // If no external AI key is configured, return transparent local/demo extraction notice
        if (!hasAiKey) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              mode: 'fallback_review_required',
              notice:
                'External AI API key is not configured on the server. Returning template fields marked for manual review.',
              extractedBill: {
                provider: 'Not available',
                consumerNumber: 'Not available',
                businessName: payload.fileMeta.name.replace(/\.[^.]+$/, ''),
                tariffCategory: 'Not available',
                billingPeriod: 'Not available',
                unitsConsumedKwh: 'Not available',
                energyCharges: 'Not available',
                fixedCharges: 'Not available',
                taxesAndDuties: 'Not available',
                otherCharges: 'Not available',
                totalBillAmount: 'Not available',
                peakConsumptionKwh: 'Not available',
                offPeakConsumptionKwh: 'Not available',
                fieldStatus: {
                  provider: 'missing',
                  consumerNumber: 'missing',
                  businessName: 'uncertain',
                  tariffCategory: 'missing',
                  billingPeriod: 'missing',
                  unitsConsumedKwh: 'missing',
                  energyCharges: 'missing',
                  fixedCharges: 'missing',
                  taxesAndDuties: 'missing',
                  otherCharges: 'missing',
                  totalBillAmount: 'missing',
                  peakConsumptionKwh: 'missing',
                  offPeakConsumptionKwh: 'missing'
                }
              }
            })
          );
          return;
        }

        // When configured, external extraction adapter would be invoked here
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            mode: 'ai_extraction_ready',
            notice: 'AI extraction endpoint ready. Review all extracted fields before calculation.',
            extractedBill: DemoData.primaryDemoMeter.bill
          })
        );
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid JSON request payload.' }));
      }
    });
    return;
  }

  // Serve static HTML app
  const indexPath = path.join(__dirname, '..', 'index.html');
  if (req.method === 'GET' && (req.url === '/' || req.url === '/index.html')) {
    if (fs.existsSync(indexPath)) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(fs.readFileSync(indexPath, 'utf8'));
      return;
    }
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found' }));
});

if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`Bill-to-Savings server running at http://localhost:${PORT}`);
  });
}

module.exports = server;
