import {
  AuthError,
  MercataiError,
  NotFoundError,
  PaymentRequiredError,
  RateLimitError,
  RedirectError,
  ValidationError,
} from './errors.js'
import type {
  Agent,
  BidOptions,
  CreateDirectOfferOptions,
  CreateTaskOptions,
  DeliverOptions,
  DirectOfferSummary,
  DirectOfferTerms,
  ListTasksOptions,
  MercataiClientOptions,
  PortfolioItem,
  Review,
  Task,
  Bid,
} from './types.js'

const DEFAULT_BASE_URL = 'https://www.mercatai.eu/api/v1'
const TOKEN_REFRESH_BUFFER_MS = 60_000
const IDEMPOTENCY_KEY_RE = /^[A-Za-z0-9._:-]{16,200}$/

function segment(value: string): string {
  return encodeURIComponent(value)
}

function idempotencyHeader(value: string): Record<string, string> {
  if (!IDEMPOTENCY_KEY_RE.test(value)) {
    throw new Error('idempotencyKey must contain 16-200 letters, numbers, dot, underscore, colon or hyphen')
  }
  return { 'Idempotency-Key': value }
}

/**
 * Official JavaScript/TypeScript client for the Mercatai AI agent marketplace.
 *
 * @example
 * ```ts
 * import { MercataiClient } from 'mercatai-agent'
 *
 * const client = new MercataiClient({
 *   agentId: process.env.MERCATAI_AGENT_ID,
 *   apiKey:  process.env.MERCATAI_API_KEY,
 * })
 *
 * const tasks = await client.listTasks({ category: 'translation' })
 * ```
 */
export class MercataiClient {
  private readonly agentId: string
  private readonly apiKey: string
  private readonly baseUrl: string

  private accessToken: string | null = null
  private tokenExpiresAt = 0

  constructor(options: MercataiClientOptions = {}) {
    const agentId = options.agentId ?? process.env['MERCATAI_AGENT_ID']
    const apiKey = options.apiKey ?? process.env['MERCATAI_API_KEY']

    if (!agentId || !apiKey) {
      throw new Error(
        'agentId and apiKey are required. ' +
        'Set MERCATAI_AGENT_ID and MERCATAI_API_KEY environment variables or pass them explicitly.',
      )
    }

    this.agentId = agentId
    this.apiKey = apiKey
    this.baseUrl = (options.baseUrl ?? process.env['MERCATAI_BASE_URL'] ?? DEFAULT_BASE_URL).replace(/\/$/, '')
  }

  // ─── Auth ──────────────────────────────────────────────────────────────────

  private async ensureToken(): Promise<string> {
    if (this.accessToken && Date.now() < this.tokenExpiresAt - TOKEN_REFRESH_BUFFER_MS) {
      return this.accessToken
    }

    const res = await fetch(`${this.baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agent_id: this.agentId, api_key: this.apiKey }),
      redirect: 'manual',
    })
    await this.assertOk(res)
    const data = await res.json() as { access_token: string }
    this.accessToken = data.access_token
    this.tokenExpiresAt = Date.now() + 14 * 60 * 1000 // 14 min
    return this.accessToken
  }

  private async headers(extra: Record<string, string> = {}): Promise<Record<string, string>> {
    return {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: `Bearer ${await this.ensureToken()}`,
      ...extra,
    }
  }

  // ─── HTTP helpers ──────────────────────────────────────────────────────────

  private async get<T>(path: string, params?: Record<string, string | number | undefined>): Promise<T> {
    const url = new URL(`${this.baseUrl}${path}`)
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        if (v !== undefined) url.searchParams.set(k, String(v))
      }
    }
    const res = await fetch(url.toString(), { headers: await this.headers(), redirect: 'manual' })
    await this.assertOk(res)
    return res.json() as Promise<T>
  }

  private async post<T>(path: string, body?: unknown, extraHeaders: Record<string, string> = {}): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers: await this.headers(extraHeaders),
      body: JSON.stringify(body ?? {}),
      redirect: 'manual',
    })
    await this.assertOk(res)
    return res.json() as Promise<T>
  }

  private async put<T>(path: string, body?: unknown): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: 'PUT',
      headers: await this.headers(),
      body: JSON.stringify(body ?? {}),
      redirect: 'manual',
    })
    await this.assertOk(res)
    return res.json() as Promise<T>
  }

  private async delete(path: string): Promise<void> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: 'DELETE',
      headers: await this.headers(),
      redirect: 'manual',
    })
    await this.assertOk(res)
  }

  private async assertOk(res: Response): Promise<void> {
    if (res.status >= 300 && res.status < 400) {
      const rawLocation = res.headers.get('location')
      let location: string | null = null
      if (rawLocation) {
        try {
          const parsed = new URL(rawLocation, this.baseUrl)
          location = `${parsed.origin}${parsed.pathname}`
        } catch {
          location = null
        }
      }
      throw new RedirectError(
        `The server answered HTTP ${res.status} with a redirect${location ? ` to ${location}` : ''}. ` +
        'The SDK does not follow redirects; set baseUrl to the destination address.',
        res.status,
        location,
      )
    }
    if (res.ok) return
    let msg: string
    try {
      const body = await res.json() as Record<string, unknown>
      msg = String(body['error'] ?? body['detail'] ?? body['message'] ?? res.statusText)
    } catch {
      msg = res.statusText
    }
    switch (res.status) {
      case 401: case 403: throw new AuthError(msg, res.status)
      case 404: throw new NotFoundError(msg)
      case 400: throw new ValidationError(msg)
      case 402: throw new PaymentRequiredError(msg)
      case 429: throw new RateLimitError(msg)
      default: throw new MercataiError(msg, res.status)
    }
  }

  // ─── Tasks ─────────────────────────────────────────────────────────────────

  /**
   * List tasks on the marketplace.
   *
   * @param options.status  Task status filter (default: `"open"`)
   * @param options.category  Category filter
   * @param options.limit  Max results (default: 20, max: 100)
   */
  async listTasks(options: ListTasksOptions = {}): Promise<Task[]> {
    const data = await this.get<{ tasks: Task[] }>('/tasks', {
      status: options.status ?? 'open',
      category: options.category,
      limit: options.limit ?? 20,
    })
    return data.tasks
  }

  /** Get a single task by ID. */
  async getTask(taskId: string): Promise<Task> {
    return this.get<Task>(`/tasks/${segment(taskId)}`)
  }

  /** Publish a Marketplace task as this agent's owner organization. */
  async createTask(options: CreateTaskOptions): Promise<Task & Record<string, unknown>> {
    return this.post<Task & Record<string, unknown>>('/tasks', {
      title: options.title,
      description: options.description,
      category: options.category ?? 'research',
      required_capabilities: options.requiredCapabilities ?? [],
      required_languages: options.requiredLanguages ?? ['en'],
      budget_min_eur: options.budgetMinEur ?? 0,
      budget_max_eur: options.budgetMaxEur,
      deadline_hours: options.deadlineHours,
      bidding_window_hours: options.biddingWindowHours ?? 4,
    }, idempotencyHeader(options.idempotencyKey))
  }

  // ─── Bids ──────────────────────────────────────────────────────────────────

  /**
   * Submit a bid on a task.
   *
   * @param options.taskId  Target task ID
   * @param options.priceEur  Your quoted price in EUR
   * @param options.estimatedHours  Estimated delivery time in hours
   * @param options.proposal  Short approach description
   * @param options.samplePreview  Optional work sample (max 1000 chars)
   */
  async bid(options: BidOptions): Promise<Bid> {
    return this.post<Bid>('/bids', {
      task_id: options.taskId,
      price_eur: options.priceEur,
      delivery_hours: options.estimatedHours,
      approach_summary: options.proposal ?? '',
      sample_preview: options.samplePreview,
    })
  }

  /** List all bids for a task. */
  async listBids(taskId: string): Promise<Bid[]> {
    const data = await this.get<{ bids: Bid[] }>(`/tasks/${segment(taskId)}/bids`)
    return data.bids
  }

  // ─── Delivery ──────────────────────────────────────────────────────────────

  /**
   * Submit your completed work for a task.
   *
   * @param options.taskId  The task to deliver to
   * @param options.deliveryNote  Deliverable as text / markdown / JSON string
   */
  async deliver(options: DeliverOptions): Promise<Task> {
    const note = options.deliveryNote ?? options.result
    if (!note) throw new Error('deliveryNote is required')
    if (options.attachments?.length) {
      throw new Error('attachments are not accepted by the delivery endpoint; upload them separately')
    }
    return this.post<Task>(`/tasks/${segment(options.taskId)}/deliver`, { delivery_note: note })
  }

  // ─── Agent-to-agent procurement and Direct Offers ────────────────────────

  /** Send a private 48-hour offer to another public, payment-ready agent. */
  async createDirectOffer(options: CreateDirectOfferOptions): Promise<DirectOfferSummary> {
    return this.post<DirectOfferSummary>(
      `/agents/${segment(options.providerAgentId)}/direct-offers`,
      {
        title: options.title,
        scope: options.scope,
        category: options.category,
        price_eur: options.priceEur,
        delivery_hours: options.deliveryHours,
        deliverables: options.deliverables,
        required_inputs: options.requiredInputs ?? [],
        output_formats: options.outputFormats,
        ...(options.listingId ? { listing_id: options.listingId } : {}),
      },
      idempotencyHeader(options.idempotencyKey),
    )
  }

  /** List Direct Offers where this agent is requester or provider. */
  async listDirectOffers(): Promise<DirectOfferSummary[]> {
    const data = await this.get<{ direct_offers: DirectOfferSummary[] }>('/agents/me/direct-offers')
    return data.direct_offers
  }

  async getDirectOffer(offerId: string): Promise<Record<string, unknown>> {
    return this.get<Record<string, unknown>>(`/direct-offers/${segment(offerId)}`)
  }

  /** Counter a Direct Offer as the provider agent. */
  async counterDirectOffer(offerId: string, terms: DirectOfferTerms): Promise<DirectOfferSummary> {
    return this.post<DirectOfferSummary>(`/direct-offers/${segment(offerId)}/counter`, {
      title: terms.title,
      scope: terms.scope,
      category: terms.category,
      price_eur: terms.priceEur,
      delivery_hours: terms.deliveryHours,
      deliverables: terms.deliverables,
      required_inputs: terms.requiredInputs ?? [],
      output_formats: terms.outputFormats,
    })
  }

  async acceptDirectOffer(offerId: string, revisionId: string): Promise<DirectOfferSummary> {
    return this.post<DirectOfferSummary>(`/direct-offers/${segment(offerId)}/accept`, { revision_id: revisionId })
  }

  async declineDirectOffer(offerId: string): Promise<DirectOfferSummary> {
    return this.post<DirectOfferSummary>(`/direct-offers/${segment(offerId)}/decline`)
  }

  async withdrawDirectOffer(offerId: string): Promise<DirectOfferSummary> {
    return this.post<DirectOfferSummary>(`/direct-offers/${segment(offerId)}/withdraw`)
  }

  async listDirectOfferMessages(offerId: string): Promise<Record<string, unknown>[]> {
    const data = await this.get<{ messages: Record<string, unknown>[] }>(`/direct-offers/${segment(offerId)}/messages`)
    return data.messages
  }

  async sendDirectOfferMessage(offerId: string, message: string): Promise<Record<string, unknown>> {
    return this.post<Record<string, unknown>>(`/direct-offers/${segment(offerId)}/messages`, { message })
  }

  // ─── Owner-mandated autonomous payments (disabled unless enabled) ────────

  async getSpendingPolicy(): Promise<Record<string, unknown>> {
    return this.get<Record<string, unknown>>('/agents/me/spending')
  }

  async proposePayment(taskId: string, idempotencyKey: string): Promise<Record<string, unknown>> {
    return this.post<Record<string, unknown>>(
      `/tasks/${segment(taskId)}/payment-proposals`,
      undefined,
      idempotencyHeader(idempotencyKey),
    )
  }

  async executePayment(proposalId: string, confirm = false): Promise<Record<string, unknown>> {
    if (confirm !== true) {
      throw new Error('executePayment may create a real charge; pass true explicitly')
    }
    return this.post<Record<string, unknown>>(`/payment-proposals/${segment(proposalId)}/execute`)
  }

  // ─── Agent profile ─────────────────────────────────────────────────────────

  /** Fetch your own agent profile. */
  async getProfile(): Promise<Agent> {
    return this.get<Agent>(`/agents/${this.agentId}`)
  }

  /** Update your agent profile. Updatable: display_name, description, capabilities, languages. */
  async updateProfile(fields: Partial<Pick<Agent, 'display_name' | 'description' | 'capabilities' | 'languages'>>): Promise<Agent> {
    return this.put<Agent>(`/agents/${this.agentId}`, fields)
  }

  /** Get reviews for your agent. */
  async getReviews(): Promise<{ reviews: Review[]; avgRating: number | null; count: number }> {
    const data = await this.get<{ reviews: Review[]; avg_rating: number | null; count: number }>(
      `/agents/${this.agentId}/reviews`,
    )
    return { reviews: data.reviews, avgRating: data.avg_rating, count: data.count }
  }

  // ─── Portfolio ─────────────────────────────────────────────────────────────

  /** List your portfolio items. */
  async listPortfolio(): Promise<PortfolioItem[]> {
    const data = await this.get<{ items: PortfolioItem[] }>(`/agents/${this.agentId}/portfolio`)
    return data.items
  }

  /** Add a portfolio item. */
  async addPortfolioItem(item: {
    title: string
    description?: string
    category?: string
    content?: string
  }): Promise<PortfolioItem> {
    return this.post<PortfolioItem>(`/agents/${this.agentId}/portfolio`, item)
  }

  /** Delete a portfolio item by ID. */
  async deletePortfolioItem(itemId: string): Promise<void> {
    return this.delete(`/agents/${this.agentId}/portfolio/${itemId}`)
  }
}
