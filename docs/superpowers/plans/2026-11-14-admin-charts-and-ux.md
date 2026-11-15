# Implementation Plan: Admin Panel Visual Charts & UX Enhancement

Upgrade the Mistura Feminina Admin Panel into a modern, high-performance, and visually intuitive operational cockpit with native Solid SVG interactive charts, period filtering, live indicators, and streamlined workflows across core navigation pages.

## Proposed Changes

### Backend (`backend/app/Http/Controllers/Api/V1/Admin/`)
- `DashboardController.php`:
  - Enhance `summary()` to compute and return:
    - `daily_sales_30d`: list of `{ date, label, sales_cents, orders_count }` for the last 30 days.
    - `payment_methods`: breakdown of orders by payment method (credit_card, pix, boleto).
    - `top_categories`: top revenue generating categories.
    - `period_comparison`: 7d vs previous 7d, 30d vs previous 30d revenue delta percent.

### Frontend Components (`frontend/src/features/admin/components/charts/`)
- `AdminAreaChart.tsx`:
  - Responsive SVG area & line chart with gradient fill, hover vertical crosshair line, interactive tooltip with formatted date, currency and order count.
- `AdminDonutChart.tsx`:
  - SVG donut chart with segment arcs, centered total or hover detail, and color-coded interactive legend.
- `AdminFunnelChart.tsx`:
  - Step-by-step conversion funnel visualizer with step drop-off percentages.
- `AdminSparkline.tsx`:
  - Lightweight inline SVG trendline with gradient stroke for KPI cards.

### Frontend Pages
- `frontend/src/routes/_authenticated/admin/index.tsx`:
  - Redesign Dashboard with period toggle (7 dias, 14 dias, 30 dias).
  - Visual KPI cards with sparklines, delta badges, and direct operational shortcuts.
  - Interactive Sales Evolution chart.
  - Order status distribution and conversion funnel visualizers.
- `frontend/src/routes/_authenticated/admin/pedidos.tsx`:
  - Status tabs with live counter badges (Todos, Aguardando Pagamento, Para Separar, Enviados, Entregues).
  - Real-time search filter and 1-click status progression buttons.
- `frontend/src/routes/_authenticated/admin/produtos.tsx`:
  - Filter pills (Todos, Baixo Estoque, Esgotados, Ativos).
  - Direct quick stock adjuster (+ / -).
- `frontend/src/features/admin/AdminLayout.tsx`:
  - Dynamic notification badge on `Pedidos` and `Produtos` nav links.

## Verification Plan
1. Backend unit tests / Tinker validation for new dashboard metrics.
2. Frontend unit tests (`npm test`), linter (`npm run lint`), prettier (`npm run format:check`), and production build (`npm run build`).
3. End-to-end visual verification using Playwright: capture screenshots of the new Dashboard, Orders, and Products views.
4. Auto-commit per project rules.

