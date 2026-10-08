/**
 * [API • LIB] D1 Cold-Backup Schema (Drizzle)
 *
 * SQLite tables on Cloudflare D1 that MIRROR Supabase as an offline
 * backup (students, attendance, fees, messages, ...).
 */

import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

// 0. Students Table (Registrations & Directory)
export const students = sqliteTable('students', {
  id: text('id').primaryKey(),
  studentCode: text('student_code').notNull().unique(),
  fullName: text('full_name').notNull(),
  email: text('email').notNull().unique(),
  phone: text('phone').notNull(),
  parentName: text('parent_name'),
  parentPhone: text('parent_phone'),
  address: text('address'),
  course: text('course').notNull().default('General'),
  shift: text('shift').notNull().default('Morning Shift'),
  membershipPlan: text('membership_plan').notNull().default('General'),
  seatNumber: text('seat_number'),
  role: text('role').notNull().default('student'),
  status: text('status').notNull().default('pending'), // 'pending' | 'active' | 'suspended'
  feeStatus: text('fee_status').notNull().default('Due'),
  dueAmount: real('due_amount').notNull().default(0),
  avatarUrl: text('avatar_url'),
  fcmToken: text('fcm_token'),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`),
});

// 1. Shifts Table
export const shifts = sqliteTable('shifts', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  startTime: text('start_time').notNull(),
  endTime: text('end_time').notNull(),
  fee: real('fee').notNull(),
  totalSeats: integer('total_seats').notNull().default(100),
  availableSeats: integer('available_seats').notNull().default(100),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
});

// 2. Seats Table
export const seats = sqliteTable('seats', {
  id: text('id').primaryKey(),
  seatNumber: text('seat_number').notNull().unique(),
  zone: text('zone').notNull().default('General'), // Silent, General, AC Premium
  shiftId: text('shift_id'),
  isAvailable: integer('is_available', { mode: 'boolean' }).notNull().default(true),
  currentStudentId: text('current_student_id'),
  currentStudentName: text('current_student_name'),
  occupiedAt: text('occupied_at'),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
});

// 3. Attendance Table
export const attendance = sqliteTable('attendance', {
  id: text('id').primaryKey(),
  studentId: text('student_id').notNull(),
  studentName: text('student_name').notNull(),
  seatNumber: text('seat_number'),
  shiftId: text('shift_id'),
  shiftName: text('shift_name'),
  checkIn: text('check_in').notNull(),
  checkOut: text('check_out'),
  status: text('status').notNull().default('present'), // present, late, absent
  photoUrl: text('photo_url'),
  date: text('date').notNull(), // YYYY-MM-DD
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
});

// 4. Books Table
export const books = sqliteTable('books', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  author: text('author').notNull(),
  isbn: text('isbn'),
  category: text('category').notNull().default('General'),
  publisher: text('publisher'),
  totalCopies: integer('total_copies').notNull().default(1),
  availableCopies: integer('available_copies').notNull().default(1),
  coverUrl: text('cover_url'),
  description: text('description'),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
});

// 5. Book Issues Table
export const bookIssues = sqliteTable('book_issues', {
  id: text('id').primaryKey(),
  bookId: text('book_id').notNull(),
  bookTitle: text('book_title').notNull(),
  studentId: text('student_id').notNull(),
  studentName: text('student_name').notNull(),
  issuedAt: text('issued_at').notNull(),
  dueDate: text('due_date').notNull(),
  returnedAt: text('returned_at'),
  status: text('status').notNull().default('issued'), // issued, returned, overdue
  fineAmount: real('fine_amount').notNull().default(0),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
});

// 6. Fees Table
export const fees = sqliteTable('fees', {
  id: text('id').primaryKey(),
  studentId: text('student_id').notNull(),
  studentName: text('student_name').notNull(),
  type: text('type').notNull().default('monthly'), // monthly, registration, fine, other
  amount: real('amount').notNull(),
  paid: integer('paid', { mode: 'boolean' }).notNull().default(false),
  paidAt: text('paid_at'),
  dueDate: text('due_date'),
  description: text('description'),
  receiptNo: text('receipt_no'),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
});

// 7. Announcements Table
export const announcements = sqliteTable('announcements', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  message: text('message').notNull(),
  priority: text('priority').notNull().default('normal'), // low, normal, high, urgent
  targetAudience: text('target_audience').notNull().default('all'),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
});

// 8. Desk Disputes / Empty Seat Reports Table
export const deskDisputes = sqliteTable('desk_disputes', {
  id: text('id').primaryKey(),
  seatNumber: text('seat_number').notNull(),
  reporterStudentId: text('reporter_student_id').notNull(),
  reporterStudentName: text('reporter_student_name').notNull(),
  occupantStudentId: text('occupant_student_id'),
  occupantStudentName: text('occupant_student_name'),
  status: text('status').notNull().default('pending'), // pending, resolved_checkout, resolved_proxy, dismissed
  reportedAt: text('reported_at').notNull(),
  resolvedAt: text('resolved_at'),
  actionTaken: text('action_taken'),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
});

// 9. Messages Table (Live 2-Way Student <-> Admin / Staff Communication)
export const messages = sqliteTable('messages', {
  id: text('id').primaryKey(),
  studentId: text('student_id').notNull(),
  studentName: text('student_name').notNull(),
  studentEmail: text('student_email'),
  senderRole: text('sender_role').notNull().default('student'), // 'student' | 'admin' | 'staff'
  senderName: text('sender_name').notNull(),
  message: text('message').notNull(),
  recipientRole: text('recipient_role').default('all'), // 'admin' | 'staff' | 'all'
  recipientName: text('recipient_name'),
  recipientId: text('recipient_id'),
  isRead: integer('is_read', { mode: 'boolean' }).notNull().default(false),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
});

// 10. Staff Directory Table (Prime Staff & Sub Staff)
export const staff = sqliteTable('staff', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  phone: text('phone').notNull(),
  address: text('address').default(''),
  aadharNumber: text('aadhar_number').default(''),
  avatarUrl: text('avatar_url'),
  role: text('role').notNull().default('prime_staff'), // 'prime_staff' | 'sub_staff'
  category: text('category').notNull().default('Prime Staff'), // 'Prime Staff' | 'Sub Staff'
  shiftAssigned: text('shift_assigned').notNull().default('Morning Shift'),
  status: text('status').notNull().default('active'), // 'active' | 'on_leave' | 'inactive'
  fcmToken: text('fcm_token'),
  lastLogin: text('last_login').default('Never'),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`),
});

// 11. Notifications Table (System & Real-time Alerts for Admin & Students)
export const notifications = sqliteTable('notifications', {
  id: text('id').primaryKey(),
  recipientRole: text('recipient_role').notNull().default('all'), // 'admin' | 'student' | 'all'
  recipientId: text('recipient_id'), // specific studentId or email, or null for all admin
  title: text('title').notNull(),
  message: text('message').notNull(),
  type: text('type').notNull().default('general'), // 'fee_reminder' | 'signup' | 'payment' | 'message' | 'general'
  actionUrl: text('action_url'),
  isRead: integer('is_read', { mode: 'boolean' }).notNull().default(false),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
});

// ═══════════════════════════════════════════════════════════════════════
// HISTORICAL / ARCHIVAL TABLES (D1 Storage Tier)
// ═══════════════════════════════════════════════════════════════════════

// 12. Attendance History Table
export const attendanceHistory = sqliteTable('attendance_history', {
  id: text('id').primaryKey(),
  studentId: text('student_id').notNull(),
  studentName: text('student_name').notNull(),
  seatNumber: text('seat_number'),
  shiftId: text('shift_id'),
  shiftName: text('shift_name'),
  checkIn: text('check_in').notNull(),
  checkOut: text('check_out'),
  status: text('status').notNull().default('present'),
  photoUrl: text('photo_url'),
  date: text('date').notNull(),
  archivedAt: text('archived_at').default(sql`CURRENT_TIMESTAMP`),
});

// 13. Fees / Receipts History Table
export const feesHistory = sqliteTable('fees_history', {
  id: text('id').primaryKey(),
  studentId: text('student_id').notNull(),
  studentName: text('student_name').notNull(),
  type: text('type').notNull().default('monthly'),
  amount: real('amount').notNull(),
  paid: integer('paid', { mode: 'boolean' }).notNull().default(true),
  paidAt: text('paid_at'),
  dueDate: text('due_date'),
  description: text('description'),
  receiptNo: text('receipt_no'),
  archivedAt: text('archived_at').default(sql`CURRENT_TIMESTAMP`),
});

// 14. Messages History Table (Archived Messages older than 30-60 days)
export const messagesHistory = sqliteTable('messages_history', {
  id: text('id').primaryKey(),
  studentId: text('student_id').notNull(),
  studentName: text('student_name').notNull(),
  studentEmail: text('student_email'),
  senderRole: text('sender_role').notNull(),
  senderName: text('sender_name').notNull(),
  message: text('message').notNull(),
  recipientRole: text('recipient_role'),
  recipientName: text('recipient_name'),
  recipientId: text('recipient_id'),
  isRead: integer('is_read', { mode: 'boolean' }).default(true),
  originalCreatedAt: text('original_created_at'),
  archivedAt: text('archived_at').default(sql`CURRENT_TIMESTAMP`),
});

// 15. Reports & Daily Snapshot History Table (Guarantees offline backups if site crashes)
export const reportsHistory = sqliteTable('reports_history', {
  id: text('id').primaryKey(),
  reportDate: text('report_date').notNull(), // YYYY-MM-DD
  reportType: text('report_type').notNull().default('daily_summary'), // 'daily_summary' | 'monthly_snapshot'
  totalStudents: integer('total_students').notNull().default(0),
  totalPresent: integer('total_present').notNull().default(0),
  totalAbsent: integer('total_absent').notNull().default(0),
  totalFeeCollected: real('total_fee_collected').notNull().default(0),
  totalPendingDues: real('total_pending_dues').notNull().default(0),
  occupiedSeats: integer('occupied_seats').notNull().default(0),
  reservedSeats: integer('reserved_seats').notNull().default(0),
  availableSeats: integer('available_seats').notNull().default(0),
  summaryPayload: text('summary_payload'), // JSON string snapshot of full daily record
  emailDispatched: integer('email_dispatched', { mode: 'boolean' }).default(false),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
});

// 16. FCM Device Registration Tokens Table (Native Push Popups for Admin & Students)
export const fcmTokens = sqliteTable('fcm_tokens', {
  id: text('id').primaryKey(),
  token: text('token').notNull().unique(),
  role: text('role').notNull().default('student'), // 'admin' | 'staff' | 'student'
  userId: text('user_id'),
  email: text('email'),
  name: text('name'),
  deviceInfo: text('device_info'),
  updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`),
});



