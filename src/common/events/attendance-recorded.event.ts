export class AttendanceRecordedEvent {
  constructor(
    public readonly userId: string,
    public readonly employeeId: string,
    public readonly attendanceId: string,
  ) {}
}
