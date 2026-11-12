export { MercataiClient } from './client.js'
export {
  MercataiError,
  AuthError,
  NotFoundError,
  ValidationError,
  RateLimitError,
  PaymentRequiredError,
  RedirectError,
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
  CreateTaskOptions,
  DirectOfferTerms,
  CreateDirectOfferOptions,
  DirectOfferSummary,
  StoreOutputFormat,
  FundingStatus,
} from './types.js'
