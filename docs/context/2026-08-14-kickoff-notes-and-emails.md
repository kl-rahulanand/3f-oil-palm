# 3F Oil Palm — Kickoff notes and emails (raw dump)

Source: Rahul Anand (KnackLabs), pasted into the bootstrap session 2026-08-14.
Client website: https://www.3foilpalm.com/

## Company / domain notes (as relayed)

- **3F Oil Palm** integrates with farmers across the country to grow the fruit
  required for extracting palm oil. The fruit is transported to their factory
  in trucks.
- Two separations in their operation:
  1. **Before the fruit is transported to factory** — farmer onboarding, field
     sizing, crop sizing, nutrients, and other data points.
  2. **Inside factory** — temperature, thrasher size, yield, etc.
- Data stored mainly in **2 areas**:
  1. **Smart Palm application** — farmer and plot details, farmer lifecycle
     (editable), plots.
  2. **SAP**.
- **Plots today: ~60,000.** Future prediction: **6–7k additional plots per year.**
- They track **monthly targets** (live tracking).

## Stakeholders (client side)

- **Devanshi** — wife of the CEO; primary coordination contact.
- **Srihari** — data person who generates the Excel reports.

## Email 1 — Rahul Anand (KnackLabs) → Devanshi (recap + next steps)

Hi Devanshi,

Thank you for your time and the detailed walkthrough. Sharing a quick recap of
what we covered along with the next steps on our side.

**What we discussed**

- Demo: Devanshi, with support from Srihari, walked us through the current MIS
  report and the Smart Palm application.
- Key pain points: The two most critical metrics — **Yield per hectare** and
  **OER (Oil Extraction Rate)** — currently suffer from manual manipulation of
  some values, which leads to inaccurate data.
- Reporting challenges: The present Excel-based reports have three core
  limitations:
  1. Data is not live
  2. Reports take significant time to prepare
  3. There is no clickable drill-down, so it is difficult to verify how and why
     a number arrives at a given value.
- Data sources: The Excel report is compiled from two sources — **SAP** and the
  **Smart Palm SQL Server**.
- Future interest: The team liked the idea of **budget tracking and alerting**
  as a future enhancement.

**Next steps — KnackLabs**

1. Build a more advanced version of the report with drill-downs and clickable
   options (in coordination with Srihari).
2. Make the Excel/report data live.
3. Develop a chatbot layer on top of the centralized data.

**Next step — 3F Oil Palm**

Proceed with initiating the NDA so we can move forward on the above.

Best regards,
Rahul Anand
Knacklabs

## Email 2 — Puneet (KnackLabs) → Devanshi (post-NDA data asks)

Hi Devanshi,

Now that the NDA is in place, we can move ahead with the next step and start
working with the actual data and reporting logic. To help us scope the PoC and
build the first version of the automated MIS, could you please share the
following:

- The latest MIS/Excel reports currently being used
- The underlying SAP data/export used for the reports
- The relevant Smart Palm SQL Server data/tables or a sample data extract
- Any existing calculation logic or business rules used for key metrics such as
  Yield per hectare and OER
- Any other reports or dashboards that should be considered as part of the first
  version

Once we have these inputs, we will review the data structure and reporting
process, identify the right starting scope, and come back with the proposed
approach and next steps for the PoC.

Regards,
Puneet
