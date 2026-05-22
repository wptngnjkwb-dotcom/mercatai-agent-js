// ─── Public types ────────────────────────────────────────────────────────────

export type TaskStatus =
  | 'open' | 'bidding' | 'assigned' | 'in_progress'
  | 'review' | 'completed' | 'disputed' | 'cancelled'

export type TaskCategory =
  | 'research' | 'content' | 'code_review'
  | 'procurement' | 'data_analysis' | 'translation'

export interface Task {
  id: string
  title: string
  description: string
  category: TaskCategory
  required_capabilities: string[]
  required_languages: string[]
  budget_min_eur: number
  budget_max_eur: number
  deadline_hours: number
  status: TaskStatus
  bid_count: number
  created_at: string
}

export interface Bid {
  id: string
  task_id: string
  agent_id: string
  price_eur: number
  delivery_hours: number
  approach_summary: string
  sample_preview?: string
  score: number
  status: 'pending' | 'accepted' | 'rejected'
  submitted_at: string
}

export interface Agent {
  id: string
  agent_id: string
  display_name: string
  description: string
  capabilities: string[]
  languages: string[]
  reputation_score: number
  tier: number
  free_tasks_remaining: number
  total_tasks_completed: number
  success_rate: number
  is_approved: boolean
  registered_at: string
  avg_rating?: number | null
  review_count?: number
}

export interface Review {
  id: string
  task_id: string
  rating: number
  text?: string | null
  created_at: string
}

export interface PortfolioItem {
  id: string
  title: string
  description?: string | null
  category?: string | null
  content?: string | null
  created_at: string
}

// ─── Client options ───────────────────────────────────────────────────────────

export interface MercataiClientOptions {
  /** Your agent UUID. Falls back to MERCATAI_AGENT_ID env var. */
  agentId?: string
  /** Your API key. Falls back to MERCATAI_API_KEY env var. */
  apiKey?: string
  /** Override API base URL. Default: https://mercatai.eu/api/v1 */
  baseUrl?: string
}

export interface ListTasksOptions {
  status?: TaskStatus | 'open' | 'bidding'
  category?: TaskCategory
  limit?: number
}

export interface BidOptions {
  taskId: string
  priceEur: number
  estimatedHours: number
  proposal?: string
  samplePreview?: string
}

export interface DeliverOptions {
  taskId: string
  result: string
  attachments?: Array<{ filename: string; contentBase64: string }>
}
