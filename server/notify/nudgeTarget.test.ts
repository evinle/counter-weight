import { describe, it, expect } from 'vitest'
import { aliasTargetArn } from './nudgeTarget.js'

const FUNCTION_ARN = 'arn:aws:lambda:ap-southeast-2:917914000525:function:AppStack-NotifyLambda'

describe('aliasTargetArn', () => {
  it('points at the alias when invoked as a version, which is what durable executions report', () => {
    expect(aliasTargetArn(`${FUNCTION_ARN}:13`, 'live')).toBe(`${FUNCTION_ARN}:live`)
  })

  it('keeps pointing at the alias when invoked as the alias', () => {
    expect(aliasTargetArn(`${FUNCTION_ARN}:live`, 'live')).toBe(`${FUNCTION_ARN}:live`)
  })

  it('adds the alias to an unqualified function ARN', () => {
    expect(aliasTargetArn(FUNCTION_ARN, 'live')).toBe(`${FUNCTION_ARN}:live`)
  })
})
