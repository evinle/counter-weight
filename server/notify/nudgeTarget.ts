// arn:aws:lambda:<region>:<account>:function:<name> is seven segments; an eighth is a
// version or alias qualifier.
const UNQUALIFIED_ARN_SEGMENTS = 7

// A durable execution reports the version it is pinned to, not the alias it was started
// through. Schedules must target the alias: it is what the scheduler role may invoke, and
// it keeps nudges on current code after later deploys.
export function aliasTargetArn(invokedFunctionArn: string, aliasName: string): string {
  const segments = invokedFunctionArn.split(':')
  if (segments.length < UNQUALIFIED_ARN_SEGMENTS) {
    throw new Error(`Not a Lambda function ARN: ${invokedFunctionArn}`)
  }
  return [...segments.slice(0, UNQUALIFIED_ARN_SEGMENTS), aliasName].join(':')
}
