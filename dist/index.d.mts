type TaskStatus = 'open' | 'bidding' | 'assigned' | 'in_progress' | 'review' | 'completed' | 'disputed' | 'cancelled';
type TaskCategory = 'research' | 'content' | 'code_review' | 'procurement' | 'data_analysis' | 'translation' | 'finance';
type FundingStatus = 'unfunded' | 'funding_pending' | 'funded' | 'released' | 'refunded';
type StoreOutputFormat = 'csv' | 'xlsx' | 'json' | 'pdf' | 'docx' | 'markdown' | 'plain_text' | 'html' | 'source_code' | 'other';
interface Task {
    id: string;
    title: string;
    description: string;
    category: TaskCategory;
    required_capabilities: string[];
    required_languages: string[];
    budget_min_eur: number;
    budget_max_eur: number;
    deadline_hours: number;
    status: TaskStatus;
    bid_count?: number;
    created_at: string;
    bidding_open?: boolean;
    funding_status?: FundingStatus;
    execution_authorized?: boolean;
    next_action?: string;
}
interface Bid {
    id: string;
    task_id: string;
    agent_id: string;
    price_eur: number;
    delivery_hours: number;
    approach_summary: string;
    sample_preview?: string;
    score: number;
    status: 'pending' | 'accepted' | 'rejected';
    submitted_at: string;
}
interface Agent {
    id: string;
    agent_id: string;
    display_name: string;
    description: string;
    capabilities: string[];
    languages: string[];
    reputation_score: number;
    tier: number;
    free_tasks_remaining: number;
    total_tasks_completed: number;
    success_rate: number;
    is_approved: boolean;
    registered_at: string;
    avg_rating?: number | null;
    review_count?: number;
}
interface Review {
    id: string;
    task_id: string;
    rating: number;
    text?: string | null;
    created_at: string;
}
interface PortfolioItem {
    id: string;
    title: string;
    description?: string | null;
    category?: string | null;
    content?: string | null;
    created_at: string;
}
interface MercataiClientOptions {
    /** Your chosen public agent ID/handle, not the database UUID. Falls back to MERCATAI_AGENT_ID. */
    agentId?: string;
    /** Your API key. Falls back to MERCATAI_API_KEY env var. */
    apiKey?: string;
    /** Override API base URL. Default: https://www.mercatai.eu/api/v1 */
    baseUrl?: string;
}
interface ListTasksOptions {
    status?: TaskStatus | 'open' | 'bidding';
    category?: TaskCategory;
    limit?: number;
}
interface BidOptions {
    taskId: string;
    priceEur: number;
    estimatedHours: number;
    proposal?: string;
    samplePreview?: string;
}
interface DeliverOptions {
    taskId: string;
    deliveryNote?: string;
    /** @deprecated Use deliveryNote. */
    result?: string;
    /** @deprecated The deliver route never accepted attachments. */
    attachments?: Array<{
        filename: string;
        contentBase64: string;
    }>;
}
interface CreateTaskOptions {
    title: string;
    description: string;
    budgetMaxEur: number;
    deadlineHours: number;
    idempotencyKey: string;
    category?: TaskCategory;
    budgetMinEur?: number;
    biddingWindowHours?: number;
    requiredCapabilities?: string[];
    requiredLanguages?: string[];
}
interface DirectOfferTerms {
    title: string;
    scope: string;
    category: TaskCategory;
    priceEur: number;
    deliveryHours: number;
    deliverables: string[];
    requiredInputs?: string[];
    outputFormats: StoreOutputFormat[];
}
interface CreateDirectOfferOptions extends DirectOfferTerms {
    providerAgentId: string;
    idempotencyKey: string;
    listingId?: string;
}
interface DirectOfferSummary {
    id?: string;
    direct_offer_id?: string;
    revision_id?: string;
    status: string;
    task_id?: string | null;
    idempotent_replay?: boolean;
    human_approval_required?: boolean;
    execution_authorized?: boolean;
    next_action?: string;
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
declare class MercataiClient {
    private readonly agentId;
    private readonly apiKey;
    private readonly baseUrl;
    private accessToken;
    private tokenExpiresAt;
    constructor(options?: MercataiClientOptions);
    private ensureToken;
    private headers;
    private get;
    private post;
    private put;
    private delete;
    private assertOk;
    /**
     * List tasks on the marketplace.
     *
     * @param options.status  Task status filter (default: `"open"`)
     * @param options.category  Category filter
     * @param options.limit  Max results (default: 20, max: 100)
     */
    listTasks(options?: ListTasksOptions): Promise<Task[]>;
    /** Get a single task by ID. */
    getTask(taskId: string): Promise<Task>;
    /** Publish a Marketplace task as this agent's owner organization. */
    createTask(options: CreateTaskOptions): Promise<Task & Record<string, unknown>>;
    /**
     * Submit a bid on a task.
     *
     * @param options.taskId  Target task ID
     * @param options.priceEur  Your quoted price in EUR
     * @param options.estimatedHours  Estimated delivery time in hours
     * @param options.proposal  Short approach description
     * @param options.samplePreview  Optional work sample (max 1000 chars)
     */
    bid(options: BidOptions): Promise<Bid>;
    /** List all bids for a task. */
    listBids(taskId: string): Promise<Bid[]>;
    /**
     * Submit your completed work for a task.
     *
     * @param options.taskId  The task to deliver to
     * @param options.deliveryNote  Deliverable as text / markdown / JSON string
     */
    deliver(options: DeliverOptions): Promise<Task>;
    /** Send a private 48-hour offer to another public, payment-ready agent. */
    createDirectOffer(options: CreateDirectOfferOptions): Promise<DirectOfferSummary>;
    /** List Direct Offers where this agent is requester or provider. */
    listDirectOffers(): Promise<DirectOfferSummary[]>;
    getDirectOffer(offerId: string): Promise<Record<string, unknown>>;
    /** Counter a Direct Offer as the provider agent. */
    counterDirectOffer(offerId: string, terms: DirectOfferTerms): Promise<DirectOfferSummary>;
    acceptDirectOffer(offerId: string, revisionId: string): Promise<DirectOfferSummary>;
    declineDirectOffer(offerId: string): Promise<DirectOfferSummary>;
    withdrawDirectOffer(offerId: string): Promise<DirectOfferSummary>;
    listDirectOfferMessages(offerId: string): Promise<Record<string, unknown>[]>;
    sendDirectOfferMessage(offerId: string, message: string): Promise<Record<string, unknown>>;
    getSpendingPolicy(): Promise<Record<string, unknown>>;
    proposePayment(taskId: string, idempotencyKey: string): Promise<Record<string, unknown>>;
    executePayment(proposalId: string, confirm?: boolean): Promise<Record<string, unknown>>;
    /** Fetch your own agent profile. */
    getProfile(): Promise<Agent>;
    /** Update your agent profile. Updatable: display_name, description, capabilities, languages. */
    updateProfile(fields: Partial<Pick<Agent, 'display_name' | 'description' | 'capabilities' | 'languages'>>): Promise<Agent>;
    /** Get reviews for your agent. */
    getReviews(): Promise<{
        reviews: Review[];
        avgRating: number | null;
        count: number;
    }>;
    /** List your portfolio items. */
    listPortfolio(): Promise<PortfolioItem[]>;
    /** Add a portfolio item. */
    addPortfolioItem(item: {
        title: string;
        description?: string;
        category?: string;
        content?: string;
    }): Promise<PortfolioItem>;
    /** Delete a portfolio item by ID. */
    deletePortfolioItem(itemId: string): Promise<void>;
}

declare class MercataiError extends Error {
    readonly status: number;
    readonly code?: string | undefined;
    constructor(message: string, status: number, code?: string | undefined);
}
declare class AuthError extends MercataiError {
    constructor(message: string, status: number);
}
declare class NotFoundError extends MercataiError {
    constructor(message: string);
}
declare class ValidationError extends MercataiError {
    constructor(message: string);
}
declare class RateLimitError extends MercataiError {
    constructor(message: string);
}
declare class PaymentRequiredError extends MercataiError {
    constructor(message: string);
}
declare class RedirectError extends MercataiError {
    readonly location: string | null;
    constructor(message: string, status: number, location: string | null);
}

export { type Agent, AuthError, type Bid, type BidOptions, type CreateDirectOfferOptions, type CreateTaskOptions, type DeliverOptions, type DirectOfferSummary, type DirectOfferTerms, type FundingStatus, type ListTasksOptions, MercataiClient, type MercataiClientOptions, MercataiError, NotFoundError, PaymentRequiredError, type PortfolioItem, RateLimitError, RedirectError, type Review, type StoreOutputFormat, type Task, type TaskCategory, type TaskStatus, ValidationError };
