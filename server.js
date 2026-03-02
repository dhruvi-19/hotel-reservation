const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');

const tableCount = 12;
const reservations = new Map();

const sendJson = (res, statusCode, payload) => {
  const data = JSON.stringify(payload);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(data),
  });
  res.end(data);
};

const formatReservation = (tableId) => {
  const reservation = reservations.get(tableId);
  if (!reservation) {
    return {
      id: tableId,
      isReserved: false,
      customerName: null,
      reservedAt: null,
      reservedUntil: null,
    };
  }

  const now = Date.now();
  if (reservation.reservedUntil <= now) {
    reservations.delete(tableId);
    return {
      id: tableId,
      isReserved: false,
      customerName: null,
      reservedAt: null,
      reservedUntil: null,
    };
  }

  return {
    id: tableId,
    isReserved: true,
    customerName: reservation.customerName,
    reservedAt: new Date(reservation.reservedAt).toISOString(),
    reservedUntil: new Date(reservation.reservedUntil).toISOString(),
  };
};

const getMimeType = (filePath) => {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.html') return 'text/html; charset=utf-8';
  if (ext === '.css') return 'text/css; charset=utf-8';
  if (ext === '.js') return 'application/javascript; charset=utf-8';
  if (ext === '.json') return 'application/json; charset=utf-8';
  return 'text/plain; charset=utf-8';
};

const serveStatic = (req, res, pathname) => {
  const safePath = path.normalize(pathname).replace(/^\.+/, '');
  const resolved = safePath === '/' ? '/index.html' : safePath;
  const filePath = path.join(PUBLIC_DIR, resolved);

  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  fs.readFile(filePath, (err, content) => {
    if (err) {
      if (err.code === 'ENOENT') {
        res.writeHead(404);
        res.end('Not Found');
        return;
      }
      res.writeHead(500);
      res.end('Internal Server Error');
      return;
    }

    res.writeHead(200, { 'Content-Type': getMimeType(filePath) });
    res.end(content);
  });
};

const parseBody = (req) =>
  new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 1e6) {
        reject(new Error('Payload too large'));
      }
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (_error) {
        reject(new Error('Invalid JSON'));
      }
    });
    req.on('error', reject);
  });

const server = http.createServer(async (req, res) => {
  const requestUrl = new URL(req.url, `http://${req.headers.host}`);

  if (req.method === 'GET' && requestUrl.pathname === '/api/tables') {
    const tables = Array.from({ length: tableCount }, (_, index) => formatReservation(index + 1));
    sendJson(res, 200, { tables });
    return;
  }

  if (req.method === 'POST' && requestUrl.pathname === '/api/reservations') {
    try {
      const body = await parseBody(req);
      const { tableId, customerName, durationMinutes, startTime } = body;

      if (!Number.isInteger(tableId) || tableId < 1 || tableId > tableCount) {
        sendJson(res, 400, { error: `tableId must be between 1 and ${tableCount}.` });
        return;
      }

      if (typeof customerName !== 'string' || customerName.trim().length < 2) {
        sendJson(res, 400, { error: 'customerName must be at least 2 characters.' });
        return;
      }

      if (!Number.isInteger(durationMinutes) || durationMinutes < 15 || durationMinutes > 360) {
        sendJson(res, 400, { error: 'durationMinutes must be an integer between 15 and 360.' });
        return;
      }

      if (typeof startTime !== 'string' || startTime.trim().length === 0) {
        sendJson(res, 400, { error: 'startTime is required and must be a valid date-time string.' });
        return;
      }

      const startTimestamp = Date.parse(startTime);
      if (Number.isNaN(startTimestamp)) {
        sendJson(res, 400, { error: 'startTime must be a valid date-time string.' });
        return;
      }

      const now = Date.now();
      if (startTimestamp < now) {
        sendJson(res, 400, { error: 'startTime must be in the future.' });
        return;
      }

      const current = formatReservation(tableId);
      if (current.isReserved) {
        sendJson(res, 409, { error: `Table ${tableId} is already reserved.`, table: current });
        return;
      }
      const reservedUntil = startTimestamp + durationMinutes * 60 * 1000;
      reservations.set(tableId, {
        customerName: customerName.trim(),
        reservedAt: startTimestamp,
        reservedUntil,
      });

      sendJson(res, 201, {
        message: `Table ${tableId} reserved successfully.`,
        table: formatReservation(tableId),
      });
      return;
    } catch (error) {
      const statusCode = error.message === 'Payload too large' ? 413 : 400;
      sendJson(res, statusCode, { error: error.message });
      return;
    }
  }

  if (req.method === 'GET') {
    serveStatic(req, res, requestUrl.pathname);
    return;
  }

  res.writeHead(405);
  res.end('Method Not Allowed');
});

server.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Server running on http://localhost:${PORT}`);
});
