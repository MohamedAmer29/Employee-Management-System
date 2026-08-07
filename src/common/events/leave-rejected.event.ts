export class LeaveRejectedEvent {
  constructor(
    public readonly userId: string,
    public readonly employeeName: string,
    public readonly rejectionReason?: string,
  ) {}
}
