export class MercataiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string,
  ) {
    super(message)
    this.name = 'MercataiError'
  }
}

export class AuthError extends MercataiError {
  constructor(message: string, status: number) {
    super(message, status, 'auth_error')
    this.name = 'AuthError'
  }
}

export class NotFoundError extends MercataiError {
  constructor(message: string) {
    super(message, 404, 'not_found')
    this.name = 'NotFoundError'
  }
}

export class ValidationError extends MercataiError {
  constructor(message: string) {
    super(message, 400, 'validation_error')
    this.name = 'ValidationError'
  }
}

export class RateLimitError extends MercataiError {
  constructor(message: string) {
    super(message, 429, 'rate_limit')
    this.name = 'RateLimitError'
  }
}

export class PaymentRequiredError extends MercataiError {
  constructor(message: string) {
    super(message, 402, 'payment_required')
    this.name = 'PaymentRequiredError'
  }
}
