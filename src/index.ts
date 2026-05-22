export { MercataiClient } from './client.js'
export {
  MercataiError,
  AuthError,
  NotFoundError,
  ValidationError,
  RateLimitError,
  PaymentRequiredError,
} from './errors.js'
export type {
  Task,
  TaskStatus,
  TaskCategory,
  Bid,
  Agent,
  Review,
  PortfolioItem,
  MercataiClientOptions,
  ListTasksOptions,
  BidOptions,
  DeliverOptions,
} from './types.js'
