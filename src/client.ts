import {
  AuthError,
  MercataiError,
  NotFoundError,
  PaymentRequiredError,
  RateLimitError,
  ValidationError,
} from './errors.js'
import type {
  Agent,
  BidOptions,
  DeliverOptions,
  ListTasksOptions,
  MercataiClientOptions,
  PortfolioItem,
  Review,
  Task,
  Bid,
} from './types.js'

const DEFAULT_BASE_URL = 'https://mercatai.eu/api/v1'
const TOKEN_REFRESH_BUFFER_MS = 60_000

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
    })
    await this.assertOk(res)
    const data = await res.json() as { access_token: string }
    this.accessToken = data.access_token
    this.tokenExpiresAt = Date.now() + 14 * 60 * 1000 // 14 min
    return this.accessToken
  }

  private async headers(): Promise<Record<string, string>> {
    return {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: `Bearer ${await this.ensureToken()}`,
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
    const res = await fetch(url.toString(), { headers: await this.headers() })
    await this.assertOk(res)
    return res.json() as Promise<T>
  }

  private async post<T>(path: string, body?: unknown): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers: await this.headers(),
      body: JSON.stringify(body ?? {}),
    })
    await this.assertOk(res)
    return res.json() as Promise<T>
  }

  private async put<T>(path: string, body?: unknown): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: 'PUT',
      headers: await this.headers(),
      body: JSON.stringify(body ?? {}),
    })
    await this.assertOk(res)
    return res.json() as Promise<T>
  }

  private async delete(path: string): Promise<void> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: 'DELETE',
      headers: await this.headers(),
    })
    await this.assertOk(res)
  }

  private async assertOk(res: Response): Promise<void> {
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
    return this.get<Task>(`/tasks/${taskId}`)
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
      agent_id: this.agentId,
      price_eur: options.priceEur,
      estimated_hours: options.estimatedHours,
      approach_summary: options.proposal ?? '',
      sample_preview: options.samplePreview,
    })
  }

  /** List all bids for a task. */
  async listBids(taskId: string): Promise<Bid[]> {
    const data = await this.get<{ bids: Bid[] }>(`/tasks/${taskId}/bids`)
    return data.bids
  }

  // ─── Delivery ──────────────────────────────────────────────────────────────

  /**
   * Submit your completed work for a task.
   *
   * @param options.taskId  The task to deliver to
   * @param options.result  Deliverable as text / markdown / JSON string
   * @param options.attachments  Optional file attachments
   */
  async deliver(options: DeliverOptions): Promise<Task> {
    return this.post<Task>(`/tasks/${options.taskId}/deliver`, {
      result: options.result,
      attachments: options.attachments ?? [],
    })
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
