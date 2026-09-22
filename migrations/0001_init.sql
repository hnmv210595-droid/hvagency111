-- HV-Agency Internal initial schema

PRAGMA foreign_keys = ON;

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  email TEXT,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('ADMIN', 'EMPLOYEE')),
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'DISABLED')),
  employee_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE employees (
  id TEXT PRIMARY KEY,
  employee_code TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name TEXT NOT NULL,
  username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  email TEXT,
  phone TEXT,
  department TEXT,
  position TEXT,
  start_date TEXT,
  base_salary REAL NOT NULL DEFAULT 0 CHECK (base_salary >= 0),
  commission_rate REAL NOT NULL DEFAULT 0 CHECK (commission_rate >= 0),
  insurance_rate REAL NOT NULL DEFAULT 0 CHECK (insurance_rate >= 0),
  insurance_base REAL NOT NULL DEFAULT 0 CHECK (insurance_base >= 0),
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'DISABLED')),
  user_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX idx_employees_status ON employees(status);
CREATE INDEX idx_employees_department ON employees(department);

-- Link users.employee_id after employees exist
CREATE INDEX idx_users_employee_id ON users(employee_id);
CREATE INDEX idx_users_role ON users(role);

CREATE TABLE attendance (
  id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL,
  date TEXT NOT NULL,
  check_in TEXT,
  check_out TEXT,
  status TEXT NOT NULL DEFAULT 'PRESENT'
    CHECK (status IN ('PRESENT', 'PAID_LEAVE', 'UNPAID_LEAVE', 'ABSENT')),
  ip TEXT,
  note TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (employee_id, date),
  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE
);

CREATE INDEX idx_attendance_date ON attendance(date);
CREATE INDEX idx_attendance_employee_date ON attendance(employee_id, date);

CREATE TABLE revenues (
  id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL,
  year INTEGER NOT NULL CHECK (year >= 2000 AND year <= 2100),
  month INTEGER NOT NULL CHECK (month >= 1 AND month <= 12),
  amount REAL NOT NULL DEFAULT 0 CHECK (amount >= 0),
  note TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (employee_id, year, month),
  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE
);

CREATE INDEX idx_revenues_period ON revenues(year, month);

CREATE TABLE payrolls (
  id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL,
  year INTEGER NOT NULL CHECK (year >= 2000 AND year <= 2100),
  month INTEGER NOT NULL CHECK (month >= 1 AND month <= 12),
  base_salary REAL NOT NULL,
  standard_work_days INTEGER NOT NULL,
  present_days INTEGER NOT NULL DEFAULT 0,
  paid_leave_days INTEGER NOT NULL DEFAULT 0,
  unpaid_leave_days INTEGER NOT NULL DEFAULT 0,
  absent_days INTEGER NOT NULL DEFAULT 0,
  paid_days REAL NOT NULL DEFAULT 0,
  base_salary_paid REAL NOT NULL DEFAULT 0,
  revenue REAL NOT NULL DEFAULT 0,
  commission_rate REAL NOT NULL DEFAULT 0,
  commission REAL NOT NULL DEFAULT 0,
  gross_income REAL NOT NULL DEFAULT 0,
  insurance_base REAL NOT NULL DEFAULT 0,
  insurance_rate REAL NOT NULL DEFAULT 0,
  social_insurance REAL NOT NULL DEFAULT 0,
  other_deductions REAL NOT NULL DEFAULT 0,
  net_salary REAL NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'DRAFT'
    CHECK (status IN ('DRAFT', 'CALCULATED', 'LOCKED')),
  calculated_at TEXT,
  locked_at TEXT,
  locked_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (employee_id, year, month),
  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE
);

CREATE INDEX idx_payrolls_period ON payrolls(year, month);
CREATE INDEX idx_payrolls_status ON payrolls(status);

CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  ip TEXT,
  user_agent TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_sessions_user ON sessions(user_id);
CREATE INDEX idx_sessions_expires ON sessions(expires_at);

CREATE TABLE system_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT
);

CREATE TABLE audit_logs (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  action TEXT NOT NULL,
  target_type TEXT,
  target_id TEXT,
  ip TEXT,
  timestamp TEXT NOT NULL,
  metadata TEXT
);

CREATE INDEX idx_audit_logs_timestamp ON audit_logs(timestamp);
CREATE INDEX idx_audit_logs_user ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_action ON audit_logs(action);

CREATE TABLE login_attempts (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL,
  ip TEXT NOT NULL,
  success INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE INDEX idx_login_attempts_lookup ON login_attempts(username, ip, created_at);

-- Default settings
INSERT INTO system_settings (key, value, updated_at) VALUES
  ('company_name', 'HV-Agency', datetime('now')),
  ('company_ips', '["115.76.54.149"]', datetime('now')),
  ('standard_work_days', '26', datetime('now')),
  ('paid_leave_days', '4', datetime('now')),
  ('default_insurance_rate', '0', datetime('now')),
  ('currency', 'VNĐ', datetime('now')),
  ('timezone', 'Asia/Ho_Chi_Minh', datetime('now'));
