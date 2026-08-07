export class PerformanceReviewCreatedEvent {
  constructor(
    public readonly userId: string,
    public readonly employeeName: string,
  ) {}
}
