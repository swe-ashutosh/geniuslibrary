-- =======================================================
-- Cloudflare D1 Database Schema & Seed for Genius Library
-- =======================================================

-- 0. Students Table
CREATE TABLE IF NOT EXISTS students (
  id TEXT PRIMARY KEY,
  student_code TEXT NOT NULL UNIQUE,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  phone TEXT NOT NULL,
  parent_name TEXT,
  parent_phone TEXT,
  address TEXT,
  course TEXT NOT NULL DEFAULT 'General',
  shift TEXT NOT NULL DEFAULT 'Morning Shift',
  membership_plan TEXT NOT NULL DEFAULT 'General',
  seat_number TEXT,
  role TEXT NOT NULL DEFAULT 'student',
  status TEXT NOT NULL DEFAULT 'pending',
  fee_status TEXT NOT NULL DEFAULT 'Due',
  due_amount REAL NOT NULL DEFAULT 0,
  avatar_url TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);


-- 1. Shifts Table
CREATE TABLE IF NOT EXISTS shifts (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  fee REAL NOT NULL,
  total_seats INTEGER NOT NULL DEFAULT 48,
  available_seats INTEGER NOT NULL DEFAULT 28,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- 2. Seats Table
CREATE TABLE IF NOT EXISTS seats (
  id TEXT PRIMARY KEY,
  seat_number TEXT NOT NULL UNIQUE,
  zone TEXT NOT NULL DEFAULT 'General',
  shift_id TEXT,
  is_available INTEGER NOT NULL DEFAULT 1,
  current_student_id TEXT,
  current_student_name TEXT,
  occupied_at TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- 3. Attendance Table
CREATE TABLE IF NOT EXISTS attendance (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL,
  student_name TEXT NOT NULL,
  seat_number TEXT,
  shift_id TEXT,
  shift_name TEXT,
  check_in TEXT NOT NULL,
  check_out TEXT,
  status TEXT NOT NULL DEFAULT 'present',
  photo_url TEXT,
  date TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- 4. Books Table
CREATE TABLE IF NOT EXISTS books (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  author TEXT NOT NULL,
  isbn TEXT,
  category TEXT NOT NULL DEFAULT 'General',
  publisher TEXT,
  total_copies INTEGER NOT NULL DEFAULT 1,
  available_copies INTEGER NOT NULL DEFAULT 1,
  cover_url TEXT,
  description TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- 5. Book Issues Table
CREATE TABLE IF NOT EXISTS book_issues (
  id TEXT PRIMARY KEY,
  book_id TEXT NOT NULL,
  book_title TEXT NOT NULL,
  student_id TEXT NOT NULL,
  student_name TEXT NOT NULL,
  issued_at TEXT NOT NULL,
  due_date TEXT NOT NULL,
  returned_at TEXT,
  status TEXT NOT NULL DEFAULT 'issued',
  fine_amount REAL NOT NULL DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- 6. Fees Table
CREATE TABLE IF NOT EXISTS fees (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL,
  student_name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'monthly',
  amount REAL NOT NULL,
  paid INTEGER NOT NULL DEFAULT 0,
  paid_at TEXT,
  due_date TEXT,
  description TEXT,
  receipt_no TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- 7. Announcements Table
CREATE TABLE IF NOT EXISTS announcements (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  priority TEXT NOT NULL DEFAULT 'normal',
  target_audience TEXT NOT NULL DEFAULT 'all',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- =======================================================
-- Initial Seed Data
-- =======================================================

-- Seed Shifts
INSERT OR IGNORE INTO shifts (id, name, start_time, end_time, fee, total_seats, available_seats, is_active) VALUES
('shift-morning', 'Morning Shift', '06:00 AM', '12:00 PM', 600, 100, 100, 1),
('shift-afternoon', 'Afternoon Shift', '12:00 PM', '06:00 PM', 600, 100, 100, 1),
('shift-evening', 'Evening Shift', '06:00 PM', '10:00 PM', 500, 100, 100, 1),
('shift-fullday', 'Full Day Access', '06:00 AM', '10:00 PM', 1100, 100, 100, 1);

-- Seed Seats (100 Library Desks: Rows A-J, 10 desks each)
INSERT OR IGNORE INTO seats (id, seat_number, zone, is_available) VALUES
('seat-001', 'A-01', 'Zone A', 1),
('seat-002', 'A-02', 'Zone A', 1),
('seat-003', 'A-03', 'Zone A', 1),
('seat-004', 'A-04', 'Zone A', 1),
('seat-005', 'A-05', 'Zone A', 1),
('seat-006', 'A-06', 'Zone A', 1),
('seat-007', 'A-07', 'Zone A', 1),
('seat-008', 'A-08', 'Zone A', 1),
('seat-009', 'A-09', 'Zone A', 1),
('seat-010', 'A-10', 'Zone A', 1),
('seat-011', 'B-01', 'Zone A', 1),
('seat-012', 'B-02', 'Zone A', 1),
('seat-013', 'B-03', 'Zone A', 1),
('seat-014', 'B-04', 'Zone A', 1),
('seat-015', 'B-05', 'Zone A', 1),
('seat-016', 'B-06', 'Zone A', 1),
('seat-017', 'B-07', 'Zone A', 1),
('seat-018', 'B-08', 'Zone A', 1),
('seat-019', 'B-09', 'Zone A', 1),
('seat-020', 'B-10', 'Zone A', 1),
('seat-021', 'C-01', 'Zone B', 1),
('seat-022', 'C-02', 'Zone B', 1),
('seat-023', 'C-03', 'Zone B', 1),
('seat-024', 'C-04', 'Zone B', 1),
('seat-025', 'C-05', 'Zone B', 1),
('seat-026', 'C-06', 'Zone B', 1),
('seat-027', 'C-07', 'Zone B', 1),
('seat-028', 'C-08', 'Zone B', 1),
('seat-029', 'C-09', 'Zone B', 1),
('seat-030', 'C-10', 'Zone B', 1),
('seat-031', 'D-01', 'Zone B', 1),
('seat-032', 'D-02', 'Zone B', 1),
('seat-033', 'D-03', 'Zone B', 1),
('seat-034', 'D-04', 'Zone B', 1),
('seat-035', 'D-05', 'Zone B', 1),
('seat-036', 'D-06', 'Zone B', 1),
('seat-037', 'D-07', 'Zone B', 1),
('seat-038', 'D-08', 'Zone B', 1),
('seat-039', 'D-09', 'Zone B', 1),
('seat-040', 'D-10', 'Zone B', 1),
('seat-041', 'E-01', 'Zone C', 1),
('seat-042', 'E-02', 'Zone C', 1),
('seat-043', 'E-03', 'Zone C', 1),
('seat-044', 'E-04', 'Zone C', 1),
('seat-045', 'E-05', 'Zone C', 1),
('seat-046', 'E-06', 'Zone C', 1),
('seat-047', 'E-07', 'Zone C', 1),
('seat-048', 'E-08', 'Zone C', 1),
('seat-049', 'E-09', 'Zone C', 1),
('seat-050', 'E-10', 'Zone C', 1),
('seat-051', 'F-01', 'Zone C', 1),
('seat-052', 'F-02', 'Zone C', 1),
('seat-053', 'F-03', 'Zone C', 1),
('seat-054', 'F-04', 'Zone C', 1),
('seat-055', 'F-05', 'Zone C', 1),
('seat-056', 'F-06', 'Zone C', 1),
('seat-057', 'F-07', 'Zone C', 1),
('seat-058', 'F-08', 'Zone C', 1),
('seat-059', 'F-09', 'Zone C', 1),
('seat-060', 'F-10', 'Zone C', 1),
('seat-061', 'G-01', 'Zone D', 1),
('seat-062', 'G-02', 'Zone D', 1),
('seat-063', 'G-03', 'Zone D', 1),
('seat-064', 'G-04', 'Zone D', 1),
('seat-065', 'G-05', 'Zone D', 1),
('seat-066', 'G-06', 'Zone D', 1),
('seat-067', 'G-07', 'Zone D', 1),
('seat-068', 'G-08', 'Zone D', 1),
('seat-069', 'G-09', 'Zone D', 1),
('seat-070', 'G-10', 'Zone D', 1),
('seat-071', 'H-01', 'Zone D', 1),
('seat-072', 'H-02', 'Zone D', 1),
('seat-073', 'H-03', 'Zone D', 1),
('seat-074', 'H-04', 'Zone D', 1),
('seat-075', 'H-05', 'Zone D', 1),
('seat-076', 'H-06', 'Zone D', 1),
('seat-077', 'H-07', 'Zone D', 1),
('seat-078', 'H-08', 'Zone D', 1),
('seat-079', 'H-09', 'Zone D', 1),
('seat-080', 'H-10', 'Zone D', 1),
('seat-081', 'I-01', 'Zone E', 1),
('seat-082', 'I-02', 'Zone E', 1),
('seat-083', 'I-03', 'Zone E', 1),
('seat-084', 'I-04', 'Zone E', 1),
('seat-085', 'I-05', 'Zone E', 1),
('seat-086', 'I-06', 'Zone E', 1),
('seat-087', 'I-07', 'Zone E', 1),
('seat-088', 'I-08', 'Zone E', 1),
('seat-089', 'I-09', 'Zone E', 1),
('seat-090', 'I-10', 'Zone E', 1),
('seat-091', 'J-01', 'Zone E', 1),
('seat-092', 'J-02', 'Zone E', 1),
('seat-093', 'J-03', 'Zone E', 1),
('seat-094', 'J-04', 'Zone E', 1),
('seat-095', 'J-05', 'Zone E', 1),
('seat-096', 'J-06', 'Zone E', 1),
('seat-097', 'J-07', 'Zone E', 1),
('seat-098', 'J-08', 'Zone E', 1),
('seat-099', 'J-09', 'Zone E', 1),
('seat-100', 'J-10', 'Zone E', 1);

-- Seed Books
INSERT OR IGNORE INTO books (id, title, author, isbn, category, total_copies, available_copies, description) VALUES
('book-1', 'Indian Polity (6th Edition)', 'M. Laxmikanth', '978-9352604883', 'UPSC / Civil Services', 4, 3, 'Comprehensive guide on Indian Constitution & Polity.'),
('book-2', 'A Modern Approach to Verbal & Non-Verbal Reasoning', 'R.S. Aggarwal', '978-9352832163', 'Competitive Exams', 5, 4, 'Standard reference for reasoning and aptitude exams.'),
('book-3', 'Concepts of Physics (Vol 1 & 2)', 'H.C. Verma', '978-8177091878', 'JEE / Engineering', 6, 5, 'Foundational physics textbook for JEE aspirants.'),
('book-4', 'Certificate Physical and Human Geography', 'G.C. Leong', '978-0195628166', 'Geography', 3, 2, 'Essential geography manual for UPSC and state civil services.');

-- Seed Announcements
INSERT OR IGNORE INTO announcements (id, title, message, priority, target_audience) VALUES
('ann-1', 'High-Speed 5G Wi-Fi Upgrade', 'New dedicated Wi-Fi router installed in Silent Zone A.', 'normal', 'all'),
('ann-2', 'Library Timing Update', 'Full Day pass holders can now access the 24-hr study lounge on Sundays.', 'high', 'all');

-- 8. Messages Table
CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL,
  student_name TEXT NOT NULL,
  student_email TEXT,
  sender_role TEXT NOT NULL DEFAULT 'student',
  sender_name TEXT NOT NULL,
  message TEXT NOT NULL,
  is_read INTEGER NOT NULL DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- 9. Staff Directory Table
CREATE TABLE IF NOT EXISTS staff (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  phone TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'prime_staff',
  category TEXT NOT NULL DEFAULT 'Prime Staff',
  shift_assigned TEXT NOT NULL DEFAULT 'Morning Shift',
  status TEXT NOT NULL DEFAULT 'active',
  password TEXT,
  last_login TEXT DEFAULT 'Never',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Seed Initial Staff Members
INSERT OR IGNORE INTO staff (id, name, email, phone, role, category, shift_assigned, status, password, last_login) VALUES
('staff-prime-01', 'Rajesh Sharma (Senior Librarian)', 'rajesh.librarian@thegenius.com', '+91 98765 12340', 'prime_staff', 'Prime Staff', 'Morning Shift', 'active', 'prime123', 'Today 09:00 AM'),
('staff-sub-01', 'Vikas Patel (Library Assistant)', 'vikas.assistant@thegenius.com', '+91 98765 54321', 'sub_staff', 'Sub Staff', 'Evening Shift', 'active', 'sub123', 'Yesterday');

-- 11. Notifications Table
CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  recipient_role TEXT NOT NULL DEFAULT 'all',
  recipient_id TEXT,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'general',
  action_url TEXT,
  is_read INTEGER NOT NULL DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);


