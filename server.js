import express from 'express';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import cors from 'cors';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;
const DATA_FILE = path.join(__dirname, 'cube-positions.json');
const GRAPH_FILE = path.join(__dirname, 'graph-adjacency.json');
const ROOMS_FILE = path.join(__dirname, 'node-room-mapping.json');

app.use(cors());
app.use(express.json());

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

app.listen(PORT, () => {
  console.log(`API server running on http://localhost:${PORT}`);
});
