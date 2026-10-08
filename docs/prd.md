# Product Requirements Document (PRD)
## Genius Library — White-Label Automated Library Management Platform
**Version:** 2.0 (Production — reflects actual built system)
**Last Updated:** September 2026

---

## 1. Executive Summary

Genius Library is a **production-ready, white-label automated library management platform** designed for physical study spaces, coaching centers, and public/private libraries. The system manages **student memberships, seat reservations, book lending, fee collection, staff attendance, and real-time notifications** through three dedicated role-based portals (Admin, Staff, Student), a public-facing website, and a dedicated Kiosk Mode for self-service check-in.

The platform is built as a **Progressive Web App (PWA)** deployable on **Cloudflare Pages** with zero infrastructure costs, making it ideal for budget-conscious library operators. It is fully **white-label ready** — a single configuration file (`white-label.config.ts`) controls all branding, colors, location, fees, and payment details.

---

## 2. Target Audience & Personas

### Persona 1: Library Owner / Admin
- **Profile:** Library owners, branch managers, coaching center operators
- **Goals:** Complete visibility into operations — student enrollment, revenue, seat occupancy, book inventory, staff shifts
- **Key Needs:** One-click reports, automated invoice emails, real-time dashboard, fee management with payment verification

### Persona 2: Library Staff
- **Profile:** Front-desk operators, floor assistants, librarians
- **Goals:** Fast student check-in/check-out via QR scanning, walk-in fee collection, book issue/return, student lookup
- **Key Needs:** Kiosk Mode for standalone tablet operation, QR scanner interface, simplified student management

### Persona 3: Student / Member
- **Profile:** College students, competitive exam aspirants (UPSC/SSC/Banking), professionals seeking a study space
- **Goals:** Reserve study desks, view fee status, request books, access digital entry pass, receive fee reminders
- **Key Needs:** Mobile-first experience, instant QR pass, fee payment tracking, book request status

---

## 3. Core Portals & Implemented Features

### 3.1 Public Website (Landing Page + Auth)

| Feature | Description | Status |
|---|---|---|
| **Hero Banner** | Animated typewriter text, scroll-reveal sections, count-up stats, CTA buttons | ✅ Live |
| **Facility Showcase** | Amenities grid (WiFi, AC, Power Outlets, Parking, etc.) with icons | ✅ Live |
| **Pricing Section** | Membership tiers (General ₹500/mo, Reserved ₹800/mo) with feature comparison | ✅ Live |
| **Public Book Catalog** | Searchable catalog for browsing available books without login | ✅ Live |
| **Login Page** | Email/Password login + Google OAuth with Cloudflare Turnstile CAPTCHA | ✅ Live |
| **Legal Pages** | Privacy Policy, Terms & Conditions, Refund Policy, Library Rules | ✅ Live |
| **PWA Install Banner** | Styled "Install as App" banner with deferred prompt handling | ✅ Live |
| **Notification Permission** | Styled modal to request browser notification permission + welcome popup | ✅ Live |

---

### 3.2 Admin Portal

| Feature | Description | Status |
|---|---|---|
| **Analytics Dashboard** | KPI cards (Total Students, Revenue, Occupancy Rate, Active Borrows), line charts, period comparisons | ✅ Live |
| **Student Management** | Full CRUD — add/edit/delete students, assign membership type, view fee status, block/unblock, auto-generate Student ID | ✅ Live |
| **Attendance Management** | Daily attendance log, GPS-verified check-in, QR code scanning, manual check-in/out, attendance history with date filters | ✅ Live |
| **Books Management** | Full CRUD for book inventory, issue/return books, student borrow requests with Approve/Reject inline, overdue tracking, search & filter | ✅ Live |
| **Seat Management** | Add/edit/delete seats, zone assignment (General/Premium/Silent), floor levels, power outlet toggle, occupant tracking, bulk seat seeding (100 seats) | ✅ Live |
| **Fee & Fine Management** | Record payments (Cash/UPI/NEFT), auto-generate invoice numbers, send email receipts via Resend, payment claim review (approve/reject student-submitted claims) | ✅ Live |
| **Messaging** | Send direct messages and fee reminders to individual students or broadcast to all, message history | ✅ Live |
| **Notifications Hub** | Activity-based notifications — book requests, fee payments, staff check in/out. Filter by type, bulk mark-as-read, inline Approve/Reject for book requests | ✅ Live |
| **Staff Management** | Add/edit/delete staff, assign roles, manage credentials | ✅ Live |
| **Kiosk Mode** | Full-screen tablet mode with QR scanner for autonomous student check-in/check-out at library entrance | ✅ Live |
| **Reports** | Operational reports and data views | ✅ Live |
| **Analytics / Audit** | System activity tracking and analytics views | ✅ Live |
| **Profile Settings** | Update admin name, phone, designation, avatar (uploaded to Supabase Storage) | ✅ Live |

---

### 3.3 Staff Portal

| Feature | Description | Status |
|---|---|---|
| **Staff Dashboard** | Overview stats and quick action links | ✅ Live |
| **Student Management** | Lookup and manage students (scoped to staff permissions) | ✅ Live |
| **Attendance** | Mark attendance, view history | ✅ Live |
| **Books** | Issue/return books at the counter | ✅ Live |
| **Seats** | Allocate/release seats for walk-in students | ✅ Live |
| **Fees** | Record walk-in payments | ✅ Live |
| **Messages** | View admin-sent messages | ✅ Live |
| **QR Scanner** | Scan student QR codes for quick lookup | ✅ Live |

---

### 3.4 Student Portal

| Feature | Description | Status |
|---|---|---|
| **Student Dashboard** | Active seat status, due fees, borrowed books, recent notifications | ✅ Live |
| **Books** | Browse catalog, request books (sends admin notification), view borrow history with status | ✅ Live |
| **Attendance** | View personal attendance records and history | ✅ Live |
| **Fees** | View fee breakdown, submit UPI payment claims with UTR number for admin review | ✅ Live |
| **Digital Entry Pass** | QR code-based gate pass displayed on mobile for contactless library entry | ✅ Live |
| **Messages** | Receive admin messages and fee reminders | ✅ Live |
| **Notifications** | Activity-based alerts — book approvals, fee confirmations, admin messages | ✅ Live |
| **Profile** | View/edit name, phone, course, upload avatar photo | ✅ Live |
| **Tasks** | Student task management | ✅ Live |

---

### 3.5 Kiosk Mode (Self-Service Terminal)

| Feature | Description | Status |
|---|---|---|
| **Lockdown Mode** | Full-screen, exit-protected kiosk that only shows QR scanner | ✅ Live |
| **QR Scan Check-in** | Camera-based QR code scanning for student entry with auto-seat allocation | ✅ Live |
| **QR Scan Check-out** | Same scanner for exit, auto-releases seat | ✅ Live |
| **Admin Unlock** | PIN-protected exit from kiosk mode | ✅ Live |

---

## 4. User Flows

### 4.1 Student Registration & First Login
```
Visit Landing Page → Click "Login" → Choose Google OAuth or Email/Password →
First login auto-creates profile in D1 database → Redirected to Student Dashboard
```

### 4.2 Student Book Request Flow
```
Student Login → Books Page → Search Catalog → Click "Request Book" →
Admin receives instant browser notification → Admin Approves/Rejects from Notification Hub →
Student receives notification of decision → If approved, book is auto-issued
```

### 4.3 Student Fee Payment Flow
```
Student Login → Fees Page → View Outstanding Balance → Scan UPI QR Code →
Pay via GPay/PhonePe/Paytm → Enter UTR Number → Submit Payment Claim →
Admin reviews claim → Approves → Student gets email receipt → Balance updated
```

### 4.4 Kiosk Check-in Flow
```
Staff enables Kiosk Mode → Tablet shows QR Scanner →
Student shows Digital Pass QR → Scanner reads code →
Auto check-in + seat allocation → Welcome greeting displayed
```

### 4.5 Admin Student Onboarding Flow
```
Admin Login → Students Page → "Add Student" → Enter Name, Email, Phone, Course →
Set Membership Type (General/Reserved) → Set Total Fees → Auto-generate Student ID →
Create Supabase Auth account → Student receives credentials → Can login immediately
```

---

## 5. Notification System

### 5.1 Notification Types (Activity-Based)

| Event | Recipient | Notification |
|---|---|---|
| Student requests a book | Admin | "New Book Borrow Request" with Approve/Reject actions |
| Student pays fees | Admin | "Fee Payment Received" with amount & mode |
| Staff checks in/out | Admin | "Staff Attendance Alert" with time |
| Admin sends message | Student | Direct message notification |
| Admin sends fee reminder | Student | Fee reminder notification |
| Book approved/rejected | Student | Book status update notification |

### 5.2 Delivery Mechanisms
- **In-App Badge**: Real-time unread count on bell icon (header) synced via BroadcastChannel + CustomEvent
- **Native Browser Popup**: Web Notifications API pushes OS-level notification when tab is active
- **Cross-Tab Sync**: BroadcastChannel API ensures all open tabs update instantly
- **Service Worker Click**: Clicking notification opens relevant portal page

---

## 6. White-Label Configuration

The entire app is rebrandable for new clients by editing **one file**: `src/lib/white-label.config.ts`

| Config Area | What You Change |
|---|---|
| **Brand Identity** | Name, subtitle, full name, description, location, copyright |
| **Color Palette** | Primary, secondary, tertiary, success, error, surface colors |
| **Logo Gradients** | SVG gradient colors for the logo component |
| **GPS Location** | Latitude, longitude, range for GPS check-in |
| **Membership Fees** | General and Reserved monthly rates |
| **Currency & Locale** | Currency symbol, country code |
| **Payment Config** | UPI ID, payee name, bank details, billing helpline |
| **Seat Config** | Default seat count, zones |
| **Email Config** | From address, OTP subject, OTP TTL |
| **Security Config** | Max login attempts, lockout duration |
| **Cloudflare Config** | Worker names, D1 database name |

---

## 7. Non-Functional Requirements

| Requirement | Target | Actual |
|---|---|---|
| **Page Load Time** | < 2s LCP | ✅ Edge-served via Cloudflare |
| **Uptime SLA** | 99.9% | ✅ Cloudflare Pages (enterprise SLA) |
| **Concurrent Users** | 500+ simultaneous | ✅ Serverless auto-scaling |
| **Mobile Responsive** | Full functionality on all devices | ✅ Mobile-first design + Bottom nav |
| **PWA Support** | Installable on all devices | ✅ Service worker + manifest |
| **Security** | OWASP Top 10 | ✅ CSP, HSTS, rate limiting, Turnstile |
| **Accessibility** | WCAG 2.1 AA | 🔄 Partial |

---

## 8. Success Metrics (KPIs)

| Metric | Target |
|---|---|
| **Daily Active Users** | 200+ within 3 months |
| **Seat Booking Conversion** | > 70% of visitors who view seats complete booking |
| **Average Check-in Time** | < 5 seconds via QR kiosk |
| **Fee Collection Rate** | > 85% of fees paid within 7 days of due date |
| **Student NPS** | > 60 |

---

## 9. New Client Deployment Checklist

To replicate this system for a new client:

1. [ ] Clone the repository
2. [ ] Update `white-label.config.ts` with new client's branding, location, fees, payment details
3. [ ] Create new Supabase project → Get URL + Keys
4. [ ] Create new Cloudflare D1 database → Run `schema-init.sql`
5. [ ] Update `wrangler.jsonc` with new D1 database ID and worker name
6. [ ] Update `.env.local` with new Supabase URL, Anon Key, Service Role Key
7. [ ] Configure Resend email domain for new client
8. [ ] Update PWA `manifest.json` with new app name, colors, icons
9. [ ] Generate new app icons (192x192 and 512x512)
10. [ ] Deploy to Cloudflare Pages
11. [ ] Create admin user in Supabase Auth + D1 users table
12. [ ] Test all flows end-to-end
