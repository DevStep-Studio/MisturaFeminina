# Enterprise E-Commerce Full Upgrade: CRUDs, Secure Routing, Invasion Hardening & Mobile-First UX

Comprehensive implementation plan covering:
1. Complete CRUDs & database lifecycle across all admin entities
2. Secure API routing with granular RBAC permissions and strict FormRequests
3. Invasion hardening: Rate limiting, SQLi/XSS prevention, CSP, brute force shields, security headers, audit logs
4. Professional e-commerce responsive UX: Mobile bottom navigation bar, Sticky mobile PDP buy bar, Touch-enabled filter drawer, 44px touch targets, zero overflow

## Tasks Breakdown

### Task 1: Complete CRUDs & Schema Verification
- Verify all tables support full CRUD lifecycle (nullable optional fields, cascade deletes, soft deletes where appropriate).
- Verify and enhance admin controllers for Catalog (Products, Variants, Categories, Brands), Appearance (Banners, Home Sections, Content Pages), Marketing (Coupons, Promotions, Shipping Rules), and System/Users.
- Ensure any admin can create everything from scratch without needing hardcoded seeders.

### Task 2: Secure Routing & Middleware Hardening
- Audit and harden `backend/routes/api.php` and `backend/routes/web.php`.
- Apply specific throttle rate limiters:
  - `throttle:login` (5 per min)
  - `throttle:checkout` (10 per min)
  - `throttle:api` (120 per min)
- Ensure all admin routes enforce `auth:sanctum` and permission check middleware.
- Ensure FormRequests strictly validate and sanitize inputs.

### Task 3: Invasion Hardening & Security Headers
- Middleware for HTTP Security Headers (HSTS, CSP, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy).
- Strict HTML sanitization on CMS content, descriptions, and banner titles to prevent XSS.
- Protection against mass assignment via strict `$fillable` models.
- Brute-force lockout and audit log recording on repeated failed attempts.

### Task 4: Professional Mobile & Responsive Architecture
- Mobile Bottom Navigation Bar (`frontend/src/features/storefront/components/MobileBottomNav.tsx`):
  - Fixed bottom bar on mobile (< 768px): Home, Categorias, Busca, Carrinho (with dynamic item count badge), Minha Conta.
  - Safe area inset padding (`pb-[safe-area-inset-bottom]`).
- Sticky Mobile Buy Bar on PDP (`frontend/src/routes/produto/$slug.tsx`):
  - Fixed bottom bar on mobile when scrolled past primary action: Thumbnail, Title, Price, "Comprar Agora".
- Mobile Touch-Enabled Filters Drawer (`frontend/src/features/storefront/components/CatalogListingView.tsx`):
  - Bottom sheet / slide-over drawer with backdrop, touch scroll, and sticky "Aplicar Filtros" button.
- Responsive grids and touch targets:
  - 2-column mobile catalog with appropriate aspect ratio and padding.
  - All interactive buttons have minimum 44px touch targets.
  - No horizontal overflow on any viewport width (320px to 2560px).

### Task 5: Testing, Validation & Auto-Commit
- Run backend tests and tinker validations.
- Run frontend test suite (`npm test`), linter (`npm run lint`), prettier (`npm run format:check`), and production build (`npm run build`).
- Capture screenshots across desktop, tablet, and mobile viewports.
- Commit all changes per the auto-commit rule.
