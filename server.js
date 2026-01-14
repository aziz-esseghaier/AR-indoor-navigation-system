import express from 'express';
import https from 'https';
import fs from 'fs/promises';
import { readFileSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import cors from 'cors';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const HTTPS_PORT = 3443;
const DATA_FILE = path.join(__dirname, 'cube-positions.json');
const GRAPH_FILE = path.join(__dirname, 'graph-adjacency.json');
const ROOMS_FILE = path.join(__dirname, 'node-room-mapping.json');

// Check if SSL certificates exist (for local development)
const certPath = path.join(__dirname, 'localhost+3.pem');
const keyPath = path.join(__dirname, 'localhost+3-key.pem');
const hasLocalCerts = existsSync(certPath) && existsSync(keyPath);

let sslOptions = null;
if (hasLocalCerts) {
  sslOptions = {
    key: readFileSync(keyPath),
    cert: readFileSync(certPath)
  };
}

app.use(cors());
app.use(express.json());

// Serve static files from the dist directory
app.use(express.static(path.join(__dirname, 'dist')));

// Get cube positions
app.get('/api/positions', async (req, res) => {
  try {
    const data = await fs.readFile(DATA_FILE, 'utf-8');
    res.json(JSON.parse(data));
  } catch (error) {
    if (error.code === 'ENOENT') {
      // File doesn't exist, return empty data
      res.json({ cubes: [] });
    } else {
      res.status(500).json({ error: 'Failed to read positions' });
    }
  }
});

// Save cube positions
app.post('/api/positions', async (req, res) => {
  try {
    const data = req.body;
    await fs.writeFile(DATA_FILE, JSON.stringify(data, null, 2), 'utf-8');
    res.json({ success: true, message: 'Positions saved successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to save positions' });
  }
});

// Get graph adjacency list
app.get('/api/graph', async (req, res) => {
  try {
    const data = await fs.readFile(GRAPH_FILE, 'utf-8');
    res.json(JSON.parse(data));
  } catch (error) {
    if (error.code === 'ENOENT') {
      // File doesn't exist, return empty adjacency list
      res.json({ adjacencyList: {} });
    } else {
      res.status(500).json({ error: 'Failed to read graph' });
    }
  }
});

// Save graph adjacency list
app.post('/api/graph', async (req, res) => {
  try {
    const data = req.body;
    await fs.writeFile(GRAPH_FILE, JSON.stringify(data, null, 2), 'utf-8');
    res.json({ success: true, message: 'Graph saved successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to save graph' });
  }
});

// Get node-room mappings
app.get('/api/rooms', async (req, res) => {
  try {
    const data = await fs.readFile(ROOMS_FILE, 'utf-8');
    res.json(JSON.parse(data));
  } catch (error) {
    if (error.code === 'ENOENT') {
      // File doesn't exist, return empty mapping
      res.json({ roomMapping: {} });
    } else {
      res.status(500).json({ error: 'Failed to read room mappings' });
    }
  }
});

// Save node-room mappings
app.post('/api/rooms', async (req, res) => {
  try {
    const data = req.body;
    await fs.writeFile(ROOMS_FILE, JSON.stringify(data, null, 2), 'utf-8');
    res.json({ success: true, message: 'Room mappings saved successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to save room mappings' });
  }
});

// Start servers
if (hasLocalCerts) {
  // Local development with HTTPS
  app.listen(PORT, () => {
    console.log(`HTTP server running on http://localhost:${PORT}`);
  });
  
  https.createServer(sslOptions, app).listen(HTTPS_PORT, () => {
    console.log(`✅ HTTPS server running on https://localhost:${HTTPS_PORT}`);
    console.log(`🔒 SSL certificates loaded successfully`);
  });
} else {
  // Production - platform provides HTTPS
  app.listen(PORT, () => {
    console.log(`✅ Server running on port ${PORT}`);
    console.log(`Platform will handle HTTPS automatically`);
  });
}
