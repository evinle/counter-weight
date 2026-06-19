import {
  SchedulerClient,
  CreateScheduleCommand,
  UpdateScheduleCommand,
  DeleteScheduleCommand,
  ResourceNotFoundException,
  FlexibleTimeWindowMode,
} from "@aws-sdk/client-scheduler";

// `declare const` emits no JS — _scheduleKey exists only as a type-level identity.
// `unique symbol` means TypeScript guarantees this symbol is distinct from every other symbol
// in the program, making it an unforgeable brand key.
// The intersection `string & { readonly [_scheduleKey]: true }` means ScheduleKey is assignable
// to string (so it can be passed anywhere a string is expected), but a plain string is not
// assignable to ScheduleKey — the only path in is through isScheduleKey's type guard.
declare const _scheduleKey: unique symbol;
export type ScheduleKey = string & { readonly [_scheduleKey]: true };

export function timerScheduleKeys(serverId: string): { deadline: ScheduleKey; lead: ScheduleKey } {
  return {
    deadline: scheduleKey(`timer-${serverId}`),
    lead: scheduleKey(`timer-lead-${serverId}`),
  };
}

// After isScheduleKey returns true, TypeScript narrows s to ScheduleKey — no `as` cast needed.
function scheduleKey(s: string): ScheduleKey {
  if (!isScheduleKey(s)) throw new Error(`Invalid ScheduleKey: "${s}"`);
  return s;
}

export function isScheduleKey(s: string): s is ScheduleKey {
  return /^timer(-lead)?-/.test(s);
}

export type SchedulePayload = {
  serverId: string;
  userId: string;
  targetDatetime: string;
};

export type Scheduler = {
  createSchedule(
    name: string,
    targetDatetime: Date,
    payload: SchedulePayload,
  ): Promise<void>;
  updateSchedule(
    name: string,
    targetDatetime: Date,
    payload: SchedulePayload,
  ): Promise<void>;
  deleteSchedule(name: string): Promise<void>;
};

function toExpression(targetDatetime: Date): string {
  const fireAt = new Date(targetDatetime.getTime() - 60_000);
  return `at(${fireAt.toISOString().slice(0, 19)})`;
}

export class AwsScheduler implements Scheduler {
  private readonly client: SchedulerClient;
  private readonly targetArn: string;
  private readonly roleArn: string;
  constructor(client: SchedulerClient, targetArn: string, roleArn: string) {
    this.client = client;
    this.targetArn = targetArn;
    this.roleArn = roleArn;
  }

  async createSchedule(
    name: string,
    targetDatetime: Date,
    payload: SchedulePayload,
  ): Promise<void> {
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
    );
  }

  async updateSchedule(
    name: string,
    targetDatetime: Date,
    payload: SchedulePayload,
  ): Promise<void> {
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
    );
  }

  async deleteSchedule(name: string): Promise<void> {
    try {
      await this.client.send(new DeleteScheduleCommand({ Name: name }));
    } catch (err) {
      if (err instanceof ResourceNotFoundException) return;
      throw err;
    }
  }
}
