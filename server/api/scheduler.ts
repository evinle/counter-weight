import {
  SchedulerClient,
  CreateScheduleCommand,
  UpdateScheduleCommand,
  DeleteScheduleCommand,
  ResourceNotFoundException,
  FlexibleTimeWindowMode,
} from '@aws-sdk/client-scheduler'

export type SchedulePayload = {
  serverId: string
  userId: string
  targetDatetime: string
}

export type Scheduler = {
  createSchedule(name: string, targetDatetime: Date, payload: SchedulePayload): Promise<void>
  updateSchedule(name: string, targetDatetime: Date, payload: SchedulePayload): Promise<void>
  deleteSchedule(name: string): Promise<void>
}

function toExpression(targetDatetime: Date): string {
  const fireAt = new Date(targetDatetime.getTime() - 60_000)
  return `at(${fireAt.toISOString().slice(0, 19)})`
}

export class AwsScheduler implements Scheduler {
  constructor(
    private readonly client: SchedulerClient,
    private readonly targetArn: string,
    private readonly roleArn: string,
  ) {}

  async createSchedule(name: string, targetDatetime: Date, payload: SchedulePayload): Promise<void> {
    await this.client.send(
      new CreateScheduleCommand({
        Name: name,
        ScheduleExpression: toExpression(targetDatetime),
        FlexibleTimeWindow: { Mode: FlexibleTimeWindowMode.OFF },
        Target: {
          Arn: this.targetArn,
          RoleArn: this.roleArn,
          Input: JSON.stringify(payload),
        },
      }),
    )
  }

  async updateSchedule(name: string, targetDatetime: Date, payload: SchedulePayload): Promise<void> {
    await this.client.send(
      new UpdateScheduleCommand({
        Name: name,
        ScheduleExpression: toExpression(targetDatetime),
        FlexibleTimeWindow: { Mode: FlexibleTimeWindowMode.OFF },
        Target: {
          Arn: this.targetArn,
          RoleArn: this.roleArn,
          Input: JSON.stringify(payload),
        },
      }),
    )
  }

  async deleteSchedule(name: string): Promise<void> {
    try {
      await this.client.send(new DeleteScheduleCommand({ Name: name }))
    } catch (err) {
      if (err instanceof ResourceNotFoundException) return
      throw err
    }
  }
}
