import type { ZodType, output } from 'zod'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '/api'

export class ApiError extends Error {
  public readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

export async function getJson<TSchema extends ZodType>(
  path: string,
  schema: TSchema,
): Promise<output<TSchema>> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      Accept: 'application/json',
    },
  })

  if (!response.ok) {
    throw new ApiError(
      response.status,
      `Request failed with status ${response.status}`,
    )
  }

  const data: unknown = await response.json()
  return schema.parse(data)
}

export async function postJson<TSchema extends ZodType>(
  path: string,
  body: unknown,
  schema: TSchema,
): Promise<output<TSchema>> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    throw new ApiError(
      response.status,
      `Request failed with status ${response.status}`,
    )
  }

  const data: unknown = await response.json()
  return schema.parse(data)
}
