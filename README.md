# Bill-to-Savings

> **“Your electricity bill tells you what you paid. Bill-to-Savings helps you discover what you could save.”**
>
> *Turn electricity bills into actionable savings.*

---

## 1. Project Overview

**Bill-to-Savings** is an electricity cost optimization platform designed for small businesses in India (retail shops, restaurants/cafés, salons, small offices, and workshops). It translates an electricity bill and a 6-question business profile into a transparent, ranked, and customizable electricity-saving action plan — complete with **Simple Mode**, **Advanced Mode**, a **What-If Simulator**, **Time-of-Day (ToD) load-shifting analysis**, **Multi-Meter portfolio support**, and **safe CSV / PDF audit reporting**.

### Architectural Rationale & Trade-offs
To ensure zero-dependency portability across sandboxed browser environments, offline hackathon demos, and local Node.js deployments:
- **Frontend (`index.html` / `bill_to_savings.html`)**: Built as a self-contained Single-Page Application (SPA) with Tailwind CSS and Chart.js that runs immediately in any browser without requiring `npm install` or an external internet API key.
- **Core Calculation Engine (`src/engine/calculator.js`)**: Separated into a pure, deterministic UMD JavaScript module shared between the browser UI, the Node.js backend, and the unit test suite (`tests/calculator.test.js`).
- **Optional Backend Server (`server/server.js`)**: Zero-dependency Node.js HTTP server (`node:http`) providing `/api/extract-bill` with server-side file type/size validation, IP rate limiting, explicit user consent enforcement, and graceful fallback when no external AI key is configured.

---

## 2. Project Folder Structure

```text
bill-to-savings/
├── index.html                        # Complete self-contained SPA (Simple + Advanced Mode)
├── package.json                      # Project metadata & npm scripts (start, test)
├── .env.example                      # Environment variable template for optional AI keys
├── README.md                         # Full documentation, pitch, Q&A, and test checklist
├── src/
│   ├── engine/
│   │   └── calculator.js             # Pure, testable calculation & recommendation engine
│   └── data/
│       └── demoData.js               # Mathematically consistent fictional demo bills & presets
├── server/
│   └── server.js                     # Optional Node.js API server with rate limiting & validation
├── sample-bills/
│   └── fictional-demo-bill.json      # Fictional sample electricity bill data (Chennai Café)
└── tests/
    └── calculator.test.js            # 15 unit test suites covering all formulas & edge cases
```

---

## 3. Installation, Run & Test Instructions

### Option A: Instant Browser Launch (Zero Setup)
Open `index.html` (or `bill_to_savings.html`) directly in any modern desktop or mobile browser. Every feature—including **Try Demo**, **Bill Upload & Local/Simulated Extraction**, **Manual Entry**, **Simple & Advanced Mode switching**, **What-If Simulator**, **Multi-Meter Manager**, **CSV Export**, and **Print/Save as PDF**—works immediately out of the box.

### Option B: Run with Local Node.js Server (Node >= 18)
```bash
# 1. Run the automated unit test suite (zero external npm packages needed)
node --test tests/calculator.test.js

# 2. Start the local server (defaults to http://localhost:3000)
node server/server.js
```

### Environment Variables (`.env`)
Copy `.env.example` to `.env` if you wish to connect a live Vision LLM endpoint to `/api/extract-bill`:
- `PORT=3000` — HTTP port for `server/server.js`
- `GEMINI_API_KEY=` — Optional server-side API key for bill OCR extraction
- `OPENAI_API_KEY=` — Optional server-side API key for bill OCR extraction
*(Keys are read strictly on the server via `process.env` and are never exposed in frontend code. If omitted, the app runs seamlessly in Demo Mode and Local Extraction/Manual Review Mode.)*

---

## 4. Calculation Methodology & Safeguards

1. **Equipment Energy Formula**:
   $$\text{Monthly kWh} = \text{Power (kW)} \times \text{Quantity} \times \text{Operating Hours/Day} \times \text{Operating Days/Month} \times \text{Duty Cycle}$$
2. **Applicable Rate vs. Approximate Effective Rate**:
   - Where the marginal slab energy rate is known or entered, monetary savings use:
     $$\text{Monthly Savings (₹)} = \text{Avoided kWh} \times \text{Applicable Marginal Rate (₹/kWh)}$$
   - When only Total Bill and Total Billed kWh are provided, the engine computes and explicitly labels the **Approximate Effective Rate**:
     $$\text{Effective Rate (₹/kWh)} = \frac{\text{Total Bill (₹)}}{\text{Total Billed kWh}}$$
     with a clear warning that fixed charges, taxes, and slabs make the effective rate different from the true marginal rate.
3. **Anti-Double-Counting & Plausibility Caps**:
   - Multiple actions targeting the same equipment category (e.g., AC setpoint adjustment + AC filter cleaning) draw sequentially from the *remaining* category kWh pool and are capped at 55% per category.
   - A configurable **Overall Energy-Saving Cap** (default 45% of total billed kWh) prevents combined energy-saving actions from exceeding plausible consumption reductions.
4. **Time-of-Day (ToD) Load Shifting Safeguard**:
   - Shifting electricity usage to off-peak hours changes *when* electricity is used, **not** total kWh consumed ($\text{Saved kWh} = 0$).
   - Time-shifting actions are exempt from the kWh cap and only claim financial savings ($\text{Shifted kWh} \times (\text{Peak Rate} - \text{Off-Peak Rate})$) when a positive tariff differential exists.
5. **Simple Payback & CO₂ Estimates**:
   - $\text{Payback (months)} = \text{Implementation Cost} \div \text{Estimated Monthly Savings}$ (displays `"No positive payback estimated."` if monthly savings $\le 0$).
   - $\text{CO}_2 \text{ Reduction (kg)} = \text{Avoided kWh} \times \text{Emissions Factor (kg CO}_2\text{/kWh)}$, clearly labelled as a demo reference assumption ($0.716\text{ kg CO}_2\text{/kWh}$) unless verified by the user.

---

## 5. Manual Browser-Testing Checklist

- [ ] **Landing Hero & Quick Launch**: Verify the headline *"Your electricity bill tells you what you paid. Bill-to-Savings helps you discover what you could save."* and click **Try Demo** to load the populated fictional Chennai café scenario without uploading a file.
- [ ] **Mode Switching without Data Loss**: Enter or edit bill values in **Simple Mode**, switch to **Advanced Mode** in the top navigation bar, and verify all entered bill fields and questionnaire answers remain intact.
- [ ] **Bill Upload Validation**: Try uploading an invalid file type (e.g., `.txt` or `.exe`) or a file $>5\text{ MB}$ and verify a clear error message appears. Upload a valid `.png`, `.jpg`, or `.pdf` and verify the consent checkbox and extraction review table.
- [ ] **Extracted Field Review Badges**: Confirm fields display `Verified`, `Uncertain — Review`, or `Not available` badges, and edit any field inline to see calculations update immediately.
- [ ] **Six-Question Business Questionnaire**: Change business type (e.g., from *Restaurant or café* to *Workshop*), operating hours, equipment checkboxes, and main priority, then verify recommendation rankings and explanations adapt dynamically.
- [ ] **What-If Simulator**: Drag the operating hours reduction slider, toggle LED / Cooling optimization, test *"Top 3 lowest-cost actions only"*, set a budget limit (e.g., `₹2,000`), and click **Reset to Original Scenario**.
- [ ] **Time-of-Day Optimization**: In Advanced Mode (or ToD panel), set Peak Rate equal to Off-Peak Rate and verify the app explains that shifting usage will not reduce the bill under a flat tariff.
- [ ] **Multi-Meter Manager (Advanced Mode)**: Add a second meter, switch between individual meters and **Combined Portfolio View**, and test adding a duplicate consumer ID/period to confirm the anti-double-counting safeguard.
- [ ] **Audit Report, Privacy Redaction & Safe CSV/PDF Export**: Toggle *"Redact Consumer Account ID in Exports"*, click **Export CSV** (verify spreadsheet formula characters like `=SUM` are safely prefixed with `'`), and click **Print / Save as PDF**.

---

## 6. Implemented Features vs. Features Needing Setup/Verification

### Implemented & Verified Ready
- Dual-mode interface (**Simple Mode** & **Advanced Mode**) with shared reactive state.
- Full bill upload validator (JPG/PNG/PDF, size check), consent gate, simulated OCR parser, sample fictional bill viewer, and editable review table.
- Complete 6-question business questionnaire + presets for Café, Retail Shop, and Workshop.
- Deterministic calculation engine (`src/engine/calculator.js`) with 15 passing unit test suites.
- Anti-double-counting category pools, configurable overall energy cap, and distinct Time-of-Day shifting logic.
- Interactive Dashboard with Chart.js visualizations, data provenance badges (*Entered / Inferred / Assumed*), and inline assumption editors.
- Real-time What-If Simulator with budget constraint, Top-3 low-cost filter, and one-click reset.
- Session-based Multi-Meter Manager with duplicate consumer/period protection.
- Professional Audit Report with privacy redaction toggle, CSV injection protection, and print stylesheet.

### Features Needing External Setup or Official Verification Before Production Deployment
- **Live Cloud Vision OCR API**: Requires setting `GEMINI_API_KEY` or `OPENAI_API_KEY` in `.env` on the backend server (`server/server.js`) and obtaining user consent before uploading real customer bills.
- **Official Utility Tariff Schedules (TANGEDCO / TNPDCL)**: Demo tariff values are fictional assumptions for safe demonstration; production use requires verifying the consumer's exact LT/HT tariff order, sanctioned load slabs, and official effective dates.
- **Persistent Database Storage**: Multi-meter records currently persist in browser memory / `localStorage` for privacy; multi-device persistence requires adding an authenticated database.

---

## 7. Hackathon Pitch, Judge Q&A & Presentation Outline

### 60-Second Hackathon Pitch
- **The Problem**: Millions of small shops, cafés, workshops, and offices across India pay high monthly electricity bills but only see a final rupee total and total kWh. They don't know which equipment drives their costs, which low-cost changes work first, or whether Time-of-Day shifting actually saves money.
- **The Solution**: **Bill-to-Savings** turns a single electricity bill plus 6 plain-language questions into a personalized, ranked action plan in under 90 seconds.
- **The Innovation**: Unlike black-box dashboards that fabricate guaranteed savings or double-count reductions, Bill-to-Savings separates **Simple Mode** (for shopkeepers) from **Advanced Mode** (for energy auditors), enforces anti-double-counting kWh caps, distinguishes true kWh reductions from Time-of-Day tariff shifting, and lets users stress-test every assumption in a live **What-If Simulator**.
- **Impact & Realism**: Prioritizes ₹0 and low-cost operational fixes (thermostat setpoints, filter cleaning, standby switch-off checklists) before expensive hardware retrofits, helping MSMEs realistically target 10%–25% variable energy savings with full transparency on limitations.

### Likely Judge Questions & Concise Answers
1. **Q: How can you estimate equipment-level savings from a single utility bill without IoT sub-meters?**
   - **A:** In Simple Mode, we combine total billed kWh with a 6-question operational profile to create an explicitly labelled *inferred baseline*, and we assign a conservative confidence level. In Advanced Mode, auditors or owners can enter exact equipment wattages, quantities, and run-hours (`kW × hours × days`), which the engine reconciles against billed kWh.
2. **Q: What stops your engine from adding up ten recommendations and claiming 110% bill savings?**
   - **A:** Three mathematical safeguards: (1) sequential deduction from remaining category kWh pools so competing cooling or lighting actions never double-count, (2) a configurable global energy-savings cap (default 45% of billed kWh), and (3) capping rupee savings against variable energy charges rather than fixed demand charges.
3. **Q: Why don't you count Time-of-Day load shifting toward kWh saved or CO₂ reduced?**
   - **A:** Moving a water pump or dough kneader from 7 PM (Peak) to 11 PM (Off-Peak) uses the exact same kWh of electricity—it only changes the billing slot rate. We count it as 0 kWh saved and only calculate rupee bill savings when a verified Peak vs. Off-Peak rate differential exists.
4. **Q: Why do you distinguish between the "Effective Rate" and the "Marginal Rate"?**
   - **A:** Dividing Total Bill by Total kWh includes fixed demand charges and taxes that do not drop when you save 1 kWh. Using the effective rate without disclosure overstates savings; our engine uses the marginal energy rate when available and warns the user whenever falling back to the approximate effective rate.
5. **Q: How do you handle privacy and security when users upload bills or export reports?**
   - **A:** No bill is ever sent to an external AI service without an explicit consent opt-in, consumer account numbers can be redacted with one click before exporting, all OCR text is HTML-escaped against XSS, and CSV exports sanitize leading `=`, `+`, `-`, and `@` characters against spreadsheet formula injection.

### 8-Slide Presentation Outline
1. **Slide 1 — The Blind Spot in MSME Electricity Bills**: Why small businesses treat electricity bills as fixed sunk costs rather than optimizable operating expenses.
2. **Slide 2 — Target Users & Dual-Persona Design**: Why a kirana store owner needs **Simple Mode** (6 questions, plain language) while an energy consultant needs **Advanced Mode** (equipment schedules, ToD slots, multi-meter portfolio).
3. **Slide 3 — End-to-End User Workflow**: Bill Upload / Demo Load → Human-in-the-Loop Extraction Review → 6-Question Profile → Ranked Action Plan → What-If Simulation → Audit Export.
4. **Slide 4 — Transparent Calculation Architecture**: Pure calculation engine (`calculator.js`), effective vs. marginal rate handling, category pool deduction, and global plausibility caps.
5. **Slide 5 — Energy Reduction vs. Time-of-Day Shifting**: How the engine models Tamil Nadu / Indian commercial ToD slots honestly without inflating kWh or CO₂ reductions.
6. **Slide 6 — Live Product Demo ("Sri Murugan Café & Bakery")**: Walkthrough of the ₹23,400 / 2,400 kWh fictional demo bill, interactive What-If budget filter, and instant recalculation.
7. **Slide 7 — Honest Limitations & Safeguards**: Inferred vs. sub-metered data provenance badges, non-guaranteed annualized estimates, and privacy-first CSV/PDF reporting.
8. **Slide 8 — Roadmap & Future Scope**: Monthly bill history tracking, weather-normalized anomaly alerts, official state tariff database integration, Tamil/Hindi voice guidance, and optional IoT clamp-meter onboarding.
