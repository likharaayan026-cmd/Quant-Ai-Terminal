const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

const GEMINI_KEY = process.env.GEMINI_API_KEY || "AQ.Ab8RN6JlscpiNZxFYALMW4sZrMkvr7i5wmUoQ5X8KRkByWb-2A";

// ============================================================
// STRATEGY PARSER — Gemini → structured JSON
// ============================================================
app.post('/api/parse-strategy', async (req, res) => {
  const { description } = req.body;
  if (!description || description.trim().length < 15) {
    return res.status(400).json({
      valid: false,
      reason: 'Strategy description too short. Please describe entry/exit rules clearly.'
    });
  }

  const systemPrompt = `You are a strict trading strategy parser. Convert the user's natural language strategy into STRICT JSON.

ALLOWED INDICATORS: EMA, SMA, RSI, MACD, Bollinger Bands, ATR, VWAP, ADX, Stochastic, Volume.
ALLOWED PRICE ACTION: crossover, breakout, support/resistance, engulfing, rejection, doji, hammer, shooting_star.

REJECT gibberish/random words/non-trading text like "sand", "hello", "asdf" with: {"valid": false, "reason": "Not a valid trading strategy"}.

Otherwise output ONLY this JSON (no markdown, no explanation):
{
  "valid": true,
  "strategyName": "short name",
  "indicators": [{"name": "EMA", "period": 9}, {"name": "EMA", "period": 20}],
  "entryLong": {"logic": "AND", "conditions": [{"left": "EMA(9)", "op": "crosses_above", "right": "EMA(20)"}]},
  "entryShort": {"logic": "AND", "conditions": []},
  "exitLong": {"logic": "OR", "conditions": [{"left": "EMA(9)", "op": "crosses_below", "right": "EMA(20)"}]},
  "stopLoss": {"type": "percent", "value": 1.0},
  "takeProfit": {"type": "rr", "value": 2.0}
}

OPERATORS: crosses_above, crosses_below, greater_than, less_than, greater_equal, less_equal, equals
OPERANDS: "close", "open", "high", "low", "volume", "EMA(n)", "SMA(n)", "RSI(n)", "MACD", "MACD_signal", "BB_upper(n)", "BB_lower(n)", "BB_middle(n)", "ATR(n)", "VWAP", "ADX(n)", or a number.

STRICT:
- If NO indicators AND NO clear price action rules → valid: false.
- Default stopLoss 1%, takeProfit rr 2.0 if not specified.`;

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_KEY}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: systemPrompt + "\n\nUSER STRATEGY:\n" + description }] }],
        generationConfig: { temperature: 0, responseMimeType: 'application/json' }
      })
    });
    const data = await response.json();
    if (!response.ok) {
      return res.status(500).json({ valid: false, reason: 'AI parser failed: ' + (data.error?.message || 'unknown') });
    }
    let text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    text = text.replace(/```json/g, '').replace(/```/g, '').trim();
    const parsed = JSON.parse(text);
    res.json(parsed);
  } catch (err) {
    res.status(500).json({ valid: false, reason: err.message });
  }
});

// ============================================================
// BINANCE CANDLES PROXY
// ============================================================
app.get('/api/candles', async (req, res) => {
  const { symbol, interval, limit } = req.query;
  try {
    const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit || 1000}`;
    const r = await fetch(url);
    const data = await r.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/', (req, res) => res.json({ ok: true, service: 'Pulse Alpha Backend' }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Pulse Alpha backend on http://localhost:${PORT}`));