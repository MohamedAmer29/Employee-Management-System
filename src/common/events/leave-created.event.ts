export class LeaveCreatedEvent {
  constructor(
    public readonly userId: string,
    public readonly employeeId: string,
    public readonly employeeName: string,
  ) {}
}
