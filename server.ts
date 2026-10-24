import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { GoogleGenAI, Type } from '@google/genai';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '20mb' }));

// Shared Gemini instance
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    },
  },
});

export interface TacticalAnalysisResult {
  missionTitle: string;
  briefing: string;
  playerSpawn: { x: number; y: number; angle: number; label: string };
  objective: { x: number; y: number; type: 'hostage' | 'bomb' | 'intel' | 'clear_all'; label: string };
  rooms: Array<{
    name: string;
    x: number;
    y: number;
    threatLevel: 'low' | 'medium' | 'high';
  }>;
  enemies: Array<{
    x: number;
    y: number;
    type: 'scout' | 'guard' | 'heavy';
    weapon: 'pistol' | 'shotgun' | 'rifle';
    facingAngle: number;
    behavior: 'patrol' | 'ambush' | 'hold';
  }>;
  covers: Array<{
    x: number;
    y: number;
    w: number;
    h: number;
    type: 'desk' | 'sofa' | 'crate' | 'island';
  }>;
}

// Endpoint: AI-powered Floor Plan Tactical Analysis
app.post('/api/analyze-blueprint', async (req, res) => {
  try {
    const { imageBase64, mimeType = 'image/png' } = req.body;

    if (!imageBase64) {
      return res.status(400).json({ error: 'Missing imageBase64' });
    }

    if (!process.env.GEMINI_API_KEY) {
      return res.json({
        fallback: true,
        message: 'No GEMINI_API_KEY found, using tactical CV generator.',
        data: null,
      });
    }

    // Strip data URL header if present
    const cleanBase64 = imageBase64.replace(/^data:image\/[a-z]+;base64,/, '');

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: [
        {
          inlineData: {
            mimeType: mimeType,
            data: cleanBase64,
          },
        },
        {
          text: `You are an elite SWAT / CQB tactical intelligence specialist.
Analyze this architectural floor plan image (which may be a house plan, apartment blueprint, office layout, or building sketch).
Identify the tactical geography and deployment coordinates on a normalized 0 to 100 percentage grid (where (0,0) is top-left, and (100,100) is bottom-right).

Requirements:
1. Identify the natural entry/breach point (e.g. front door, exterior terrace, foyer) as playerSpawn.
2. Identify 1 high-value objective (e.g. VIP hostage, contraband safe, bomb site, classified server) in a deep inner room.
3. Identify 3 to 6 major rooms/zones (e.g., '客廳 (Living Room)', '主臥室 (Master Bedroom)', '廚房 (Kitchen)', '書房/指揮所 (Office)', '走廊 (Corridor)', '儲藏室 (Storage)') with their approximate center coordinates (x,y in 0-100).
4. Station 3 to 7 hostile combatants logically across the rooms:
   - Guards holding key doorways/chokepoints
   - Scouts patrolling corridors
   - Heavy defenders guarding the inner objective
5. Identify 2 to 6 interior cover furniture items (desks, sofas, dining tables, kitchen islands) that provide waist-high cover.
6. Provide a concise, cinematic SWAT mission briefing in Traditional Chinese (繁體中文).

Respond strictly using the JSON schema provided.`,
        },
      ],
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            missionTitle: { type: Type.STRING, description: 'Tactical operation codename' },
            briefing: { type: Type.STRING, description: '1-2 sentence mission briefing in Traditional Chinese' },
            playerSpawn: {
              type: Type.OBJECT,
              properties: {
                x: { type: Type.NUMBER, description: '0 to 100' },
                y: { type: Type.NUMBER, description: '0 to 100' },
                angle: { type: Type.NUMBER, description: 'Facing angle in degrees 0-360' },
                label: { type: Type.STRING },
              },
              required: ['x', 'y', 'angle', 'label'],
            },
            objective: {
              type: Type.OBJECT,
              properties: {
                x: { type: Type.NUMBER, description: '0 to 100' },
                y: { type: Type.NUMBER, description: '0 to 100' },
                type: { type: Type.STRING, enum: ['hostage', 'bomb', 'intel', 'clear_all'] },
                label: { type: Type.STRING },
              },
              required: ['x', 'y', 'type', 'label'],
            },
            rooms: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  name: { type: Type.STRING },
                  x: { type: Type.NUMBER },
                  y: { type: Type.NUMBER },
                  threatLevel: { type: Type.STRING, enum: ['low', 'medium', 'high'] },
                },
                required: ['name', 'x', 'y', 'threatLevel'],
              },
            },
            enemies: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  x: { type: Type.NUMBER },
                  y: { type: Type.NUMBER },
                  type: { type: Type.STRING, enum: ['scout', 'guard', 'heavy'] },
                  weapon: { type: Type.STRING, enum: ['pistol', 'shotgun', 'rifle'] },
                  facingAngle: { type: Type.NUMBER },
                  behavior: { type: Type.STRING, enum: ['patrol', 'ambush', 'hold'] },
                },
                required: ['x', 'y', 'type', 'weapon', 'facingAngle', 'behavior'],
              },
            },
            covers: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  x: { type: Type.NUMBER },
                  y: { type: Type.NUMBER },
                  w: { type: Type.NUMBER },
                  h: { type: Type.NUMBER },
                  type: { type: Type.STRING, enum: ['desk', 'sofa', 'crate', 'island'] },
                },
                required: ['x', 'y', 'w', 'h', 'type'],
              },
            },
          },
          required: ['missionTitle', 'briefing', 'playerSpawn', 'objective', 'rooms', 'enemies'],
        },
      },
    });

    const parsed = JSON.parse(response.text || '{}');
    return res.json({ success: true, data: parsed });
  } catch (error: any) {
    console.error('Gemini Blueprint Analysis error:', error);
    return res.status(500).json({
      error: error.message || 'Analysis failed',
      fallback: true,
    });
  }
});

async function main() {
  if (process.env.NODE_ENV === 'production') {
    app.use(express.static(path.join(__dirname, 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(__dirname, 'dist', 'index.html'));
    });
  } else {
    const vite = await createViteServer({
      server: { middlewareMode: true, host: '0.0.0.0', port: Number(PORT) },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(Number(PORT), '0.0.0.0', () => {
    console.log(`PlanStrike CQB Server running at http://0.0.0.0:${PORT}`);
  });
}

main();
