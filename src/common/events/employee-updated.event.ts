export class EmployeeUpdatedEvent {
  constructor(
    public readonly userId: string,
    public readonly employeeName: string,
  ) {}
}
