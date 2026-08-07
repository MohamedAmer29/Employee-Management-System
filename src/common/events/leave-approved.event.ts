export class LeaveApprovedEvent {
  constructor(
    public readonly userId: string,
    public readonly employeeName: string,
  ) {}
}
