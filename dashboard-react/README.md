# Curl Coach - React Dashboard

Polished React + TypeScript dashboard for the Particle bicep-curl IMU firmware.
Ships with a realistic mock data stream so you can run it stand-alone, and can
also read the firmware's JSON-per-line Serial output **directly from the
browser** via the Web Serial API (Chromium-based browsers only).

## Run it

```bash
cd dashboard-react
npm install
npm run dev   # opens http://127.0.0.1:5173
```

By default the page boots on the **Mock** data source so the chart, rep
counter, score panel and tuning sliders all light up immediately.

To read the real device:

1. Plug in the Particle board running the firmware in [`../src/`](../src/).
2. Open the dashboard in **Chrome or Edge**.
3. In the top bar, switch the source dropdown to **Web Serial**.
4. Click **Connect**, choose the `usbmodem` / `usbserial` port, click connect.
5. Click **Reset reps** any time to send `RESET_REPS\n` to the device (the
   firmware's command handler in [`../src/muscle_activation.cpp`](../src/muscle_activation.cpp)
   already understands it).

Firefox / Safari hide the Web Serial option and stay on Mock.

## How the tuning controls connect to the dashboard

Every slider, toggle and dropdown in `TuningControlsPanel` writes through
`useDashboardStore.setTuning(...)`. The Mock data source subscribes to that
store, so changing a threshold immediately changes:

- which `ReferenceLine`s render on the live chart,
- which thresholds the synthetic detector uses for the next rep,
- which weights the local scorer applies to each completed rep.

For the Web Serial source, those same values control the visual thresholds and
re-scoring. Sending the values back to the firmware is left as a clearly
marked TODO inside [`src/data/WebSerialDataSource.ts`](src/data/WebSerialDataSource.ts);
once the firmware grows a `SET <key> <value>` command, only that one method
needs to change.

## File layout

```
dashboard-react/
  index.html, vite.config.ts, tsconfig*.json, tailwind.config.js, postcss.config.js
  src/
    main.tsx, App.tsx, index.css
    types/firmware.ts          # TS shapes mirroring the firmware JSON packets
    data/
      DataSource.ts            # interface every source implements
      MockDataSource.ts        # synthetic curl waveform + scoring
      WebSerialDataSource.ts   # Web Serial API reader/writer
    state/
      useDashboardStore.ts     # Zustand store: live buffer, reps, session, tuning
      tuningDefaults.ts        # mirrors src/config.h
    lib/format.ts              # number / score / duration formatters
    components/
      DashboardLayout.tsx
      ConnectionBar.tsx
      LiveSignalChart.tsx
      CurlPhaseIndicator.tsx
      RepMetricsCards.tsx
      SessionSummary.tsx
      RepHistoryList.tsx
      TuningControlsPanel.tsx
      ui/{Card,MetricTile,Badge,Slider,Toggle,Section}.tsx
```

## Swapping data sources

The dashboard never speaks to a transport directly: it only consumes
`FirmwarePacket` values via the `DataSource` interface in
[`src/data/DataSource.ts`](src/data/DataSource.ts). To add a WebSocket or HTTP
backend, write a new class that implements that interface and register it in
[`src/state/useDashboardStore.ts`](src/state/useDashboardStore.ts) (`setSource`).
No component needs to change.
