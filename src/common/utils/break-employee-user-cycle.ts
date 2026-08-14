/**
 * Removes the circular `Employee.user` back-reference that TypeORM populates
 * whenever a User is loaded together with its Employee (OneToOne inverse side).
 * Without this, serializing the object to JSON - whether for the HTTP response
 * or for the Redis cache write - throws "Converting circular structure to JSON".
 */
export function breakEmployeeUserCycle(
  employee?: { user?: unknown } | null,
): void {
  if (employee && employee.user) {
    delete employee.user;
  }
}
