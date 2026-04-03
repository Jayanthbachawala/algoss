# AI-Ready Options Trading Engine

A full-stack, developer-focused options trading system for building and running an AI-ready (non-ML adaptive) trading workflow.

This project combines:
- **Advanced Quant Signals**
- **Market Regime Detection**
- **Multi-Stock Scanner**
- **Confidence Scoring**
- **Risk Management**
- **Paper Trading**
- **Self-Learning (non-ML adaptive system)**
- **Telegram Alerts**
- **Dhan API Integration**

---

## Architecture

```text
Market Data → Signal Engine → Regime Engine → Risk Engine → Scanner → UI → Alerts → Execution → Learning Engine
```

### Architecture Notes
- **Market Data**: Ingests option-chain and market context data.
- **Signal Engine**: Generates directional signals and confidence outputs.
- **Regime Engine**: Classifies trend/market state before signal action.
- **Risk Engine**: Applies position sizing, stop/target logic.
- **Scanner**: Runs multi-symbol scans and ranks opportunities.
- **UI**: Displays live opportunities, confidence tags, and controls.
- **Alerts**: Sends Telegram notifications.
- **Execution**: Supports paper trade flow and optional Dhan order routing.
- **Learning Engine**: Stores outcomes, adaptive bucket stats, and strategy evolution metrics.

---

## Signal Logic Overview

This section summarizes how a trade signal is evaluated from raw market inputs.

### 1) OI + Price Classification
- The engine first classifies combined **Open Interest (OI)** and **price action** into directional states.
- Typical states include long buildup, short buildup, short covering, and long unwinding.
- This gives the initial directional context (bullish vs bearish pressure).

### 2) PCR Usage
- **Put-Call Ratio (PCR)** is used as a directional confirmation layer.
- A bullish/bearish PCR bias must align with the candidate signal to increase confidence.

### 3) Volume Confirmation
- The engine checks for a **volume spike** versus the moving average.
- Signals with participation confirmation are treated as stronger than low-participation moves.

### 4) VWAP Filter
- Price is validated against **VWAP**:
  - For bullish setups, price should be above VWAP.
  - For bearish setups, price should be below VWAP.
- This helps reject directionally weak setups.

### 5) Market Regime Filter
- A regime layer classifies market state (for example, trending up, trending down, sideways).
- Sideways/low-quality regimes are filtered out to reduce unnecessary trades.

### 6) Confidence Scoring
- A weighted score is built from aligned factors (OI+Price, PCR, Volume, VWAP, etc.).
- Confidence is then adjusted by historical learning stats where available.
- Final trade/no-trade decision is based on confidence thresholds and strategy gates.

---

## Scanner Engine

The scanner continuously evaluates multiple symbols and surfaces only high-quality trade candidates.

### What it does
- Scans multiple symbols in one run (or on interval).
- Builds signal inputs per symbol from market/option-chain data.
- Applies filtering and ranking before returning opportunities.

### Filters applied
- **Confidence filter**: keeps only signals above the configured confidence threshold.
- **Regime filter**: excludes low-quality/sideways regime setups.
- **Cooldown filter**: blocks symbols in active cooldown to avoid overtrading.

### Output
- Returns the **top opportunities** after filtering and ranking.
- Output includes core fields such as symbol, signal direction, strike, confidence, and regime context.

---

## Features

- Real-time signal generation
- Multi-symbol scanning
- Adaptive confidence scoring
- Trade cooldown system
- Strategy evolution
- Historical data tracking
- Feature extraction pipeline

Additional capabilities:
- Learning-based signal filtering
- Factor-level adaptive weighting
- Top-strategy gating via strategy evolution
- Paper trading analytics dashboards

---

## Folder Structure

Core trading logic lives in `src/engine`:

```text
src/
  engine/
    signalEngine.ts          # Signal orchestration entry points
    strategies.ts            # Signal scoring + confidence + gating
    indicators.ts            # Indicator/condition helpers
    regimeEngine.ts          # Market regime classification
    riskEngine.ts            # Position sizing and risk plans
    scannerEngine.ts         # Multi-symbol scan + ranking
    learningEngine.ts        # Bucketed learning performance
    adaptiveWeightEngine.ts  # Adaptive factor weighting
    strategyEvolution.ts     # Strategy-level performance lifecycle
    paperTradeService.ts     # Paper trade open/close + persistence
    paperTradeAnalytics.ts   # Paper trade analytics helpers
    aiDataStore.ts           # Local historical signal/trade store
    alertService.ts          # Telegram alert pipeline
    autoTradeService.ts      # Optional order execution flow
    tradeCooldown.ts         # Cooldown protection
    featureExtraction.ts     # Signal feature extraction
    tradingWindow.ts         # Time-window trading guard
```

UI and hooks:

```text
src/components/              # Signal badge, analytics widgets, etc.
src/pages/                   # Live opportunities and other pages
src/hooks/                   # Signal + analytics hooks
```

---

## Setup

### 1) Install dependencies

```bash
npm install
```

### 2) Configure environment

Create a `.env` file in project root and set:

```env
TELEGRAM_BOT_TOKEN=your_bot_token
TELEGRAM_CHAT_ID=your_chat_id
```

(Optional) Add Dhan credentials if using order routing via proxy endpoints.

### 3) Run development app

```bash
npm run dev
```

---

## Usage

### Run scanner
- Open the Live Opportunities UI page.
- The scanner auto-refreshes and evaluates configured symbols.
- Use confidence threshold controls to filter results.

### Enable alerts
- In the trading signal UI, enable alerts toggle.
- Ensure `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` are set.

### Use paper trading
- Enable paper-trade flow in the signal components.
- Trades are recorded locally and fed into learning/evolution engines.
- Review performance using paper-trading analytics dashboard.

---

## Disclaimer

- **Not financial advice.**
- This software is provided for **educational and research purposes** only.
- Trading in options involves substantial risk. Use proper risk controls and validate strategies before any live deployment.

## Limitations

- Depends on market data quality.
- No guarantee of profit.
- Not a replacement for professional advice.

## Roadmap

- AI-based signal prediction
- Advanced backtesting engine
- Portfolio optimization
- Multi-broker support
