export type ModelCategory =
  | "programming"
  | "roleplay"
  | "marketing"
  | "marketing/seo"
  | "technology"
  | "science"
  | "translation"
  | "legal"
  | "finance"
  | "health"
  | "trivia"
  | "academia";

export type ModelSort =
  | "most-popular"
  | "newest"
  | "top-weekly"
  | "pricing-low-to-high"
  | "pricing-high-to-low"
  | "context-high-to-low"
  | "throughput-high-to-low"
  | "latency-low-to-high";

export interface GetModelsQuery {
  /** Filter models by use case category */
  category?: ModelCategory;

  /** Filter models by supported parameter (comma-separated) */
  supported_parameters?: string;

  /**
   * Output modalities:
   * text,image,audio,embeddings
   * or "all"
   */
  output_modalities?: string;

  /** Server-side sorting */
  sort?: ModelSort;

  /** Free-text search by model name or slug */
  q?: string;

  /**
   * Input modalities:
   * text,image,audio,file
   */
  input_modalities?: string;

  /** Minimum context length (tokens) */
  context?: number;

  /** Minimum prompt price in $/M tokens */
  min_price?: number | null;

  /** Maximum prompt price in $/M tokens */
  max_price?: number | null;

  /** Model family/architecture */
  arch?: string;

  /** Comma-separated author slugs */
  model_authors?: string;

  /** Comma-separated provider names */
  providers?: string;

  /** Filter by distillation capability */
  distillable?: "true" | "false";

  /** Zero data retention */
  zdr?: "true";

  /** Data region */
  region?: "eu";
}

export interface ModelsListResponse {
  data: Model[];
}

export interface Model {
  architecture: Architecture;
  canonical_slug: string;
  context_length: number;
  created: number;
  default_parameters: Record<string, unknown> | null;
  description: string;
  expiration_date: string | null;
  id: string;
  knowledge_cutoff: string | null;
  links: ModelLinks;
  name: string;
  per_request_limits: Record<string, unknown> | null;
  pricing: Pricing;
  supported_parameters: string[];
  supported_voices: string[] | null;
  top_provider: TopProvider;
}

export type InputModality = "text" | "image" | "audio" | "file";
export type OutputModality = "text" | "image" | "audio" | "embeddings";

export interface Architecture {
  input_modalities: InputModality[];
  instruct_type: string;
  modality: string;
  output_modalities: OutputModality[];
  tokenizer: string;
}

export interface ModelLinks {
  details: string;
}

export interface Pricing {
  completion: string;
  image: string;
  prompt: string;
  request: string;
}

export interface TopProvider {
  context_length: number;
  is_moderated: boolean;
  max_completion_tokens: number;
}
