export const REDIS_CLIENT = Symbol('REDIS_CLIENT');
export const REDIS_OPTIONS = Symbol('REDIS_OPTIONS');

export const CACHE_TTL = {
  EMPLOYEE: 300,
  EMPLOYEES_LIST: 300,
  DEPARTMENT: 300,
  DEPARTMENTS_LIST: 300,
  DASHBOARD: 60,
  DASHBOARD_TREND: 60,
  NOTIFICATIONS_UNREAD: 300,
  RATE_LIMIT: 900,
  LOGIN_ATTEMPTS: 900,
  LOCK: 10,
} as const;

export const RATE_LIMIT_DEFAULTS = {
  LOGIN_MAX_ATTEMPTS: 5,
  LOGIN_WINDOW_SECONDS: 900,
  REGISTER_MAX_ATTEMPTS: 5,
  REGISTER_WINDOW_SECONDS: 900,
  REFRESH_MAX_ATTEMPTS: 20,
  REFRESH_WINDOW_SECONDS: 900,
} as const;

export const RedisKeys = {
  employee: (id: string): string => `employee:${id}`,
  employeesList: (): string => 'employees:list',
  employeePattern: (): string => 'employee:*',

  department: (id: string): string => `department:${id}`,
  departmentsList: (): string => 'departments:list',
  departmentPattern: (): string => 'department:*',

  dashboardAdmin: (): string => 'dashboard:admin',
  dashboardAdminTrend: (period: string): string => `dashboard:admin:${period}`,
  dashboardManager: (userId: string): string => `dashboard:manager:${userId}`,
  dashboardEmployee: (userId: string): string => `dashboard:employee:${userId}`,
  dashboardManagerPattern: (): string => 'dashboard:manager:*',
  dashboardEmployeePattern: (): string => 'dashboard:employee:*',
  dashboardLock: (scope: string): string => `dashboard:lock:${scope}`,

  notificationsUnread: (userId: string): string =>
    `notifications:unread:${userId}`,

  refreshToken: (userId: string, sessionId: string): string =>
    `refresh-token:${userId}:${sessionId}`,
  userSession: (userId: string, sessionId: string): string =>
    `user-session:${userId}:${sessionId}`,
  userSessions: (userId: string): string => `user:sessions:${userId}`,

  loginAttemptsByIp: (ip: string): string => `login-attempts:${ip}`,
  loginAttemptsByEmail: (username: string): string =>
    `login-attempts:email:${username.toLowerCase()}`,

  rateLimit: (scope: string, identifier: string): string =>
    `rate-limit:${scope}:${identifier}`,
} as const;
