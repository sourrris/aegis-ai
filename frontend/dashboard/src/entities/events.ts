import { z } from 'zod';

export const eventListItemSchema = z.object({
  event_id: z.string(),
  tenant_id: z.string(),
  source: z.string(),
  event_type: z.string(),
  status: z.string(),
  occurred_at: z.string(),
  ingested_at: z.string(),
  risk_score: z.number().nullable().optional(),
  risk_level: z.string().nullable().optional(),
  severity: z.string().nullable().optional(),
  domain_id: z.string().nullable().optional(),
  domain_hostname: z.string().nullable().optional()
});

export const eventHistoryItemSchema = z.object({
  id: z.union([z.number(), z.string()]),
  model_name: z.string(),
  model_version: z.string(),
  anomaly_score: z.number(),
  threshold: z.number(),
  is_anomaly: z.boolean(),
  processed_at: z.string()
});

export const eventDetailSchema = eventListItemSchema.extend({
  payload: z.record(z.unknown()),
  features: z.array(z.number()),
  submitted_by: z.string(),
  processing_history: z.array(eventHistoryItemSchema),
  risk_score: z.number().optional(),
  risk_level: z.string().optional(),
  reasons: z.array(z.string()).optional(),
  rule_hits: z.array(z.string()).optional(),
  decision_latency_ms: z.number().nullable().optional()
});

export const eventsListResponseSchema = z.object({
  items: z.array(eventListItemSchema),
  next_cursor: z.string().nullable(),
  total_estimate: z.number(),
  page: z.number(),
  page_size: z.number(),
  total_pages: z.number()
});

export type EventsQuery = {
  tenant_id?: string;
  domain_id?: string;
  status?: string;
  severity?: string;
  source?: string;
  event_type?: string;
  start_date?: string;
  end_date?: string;
  from?: string;
  to?: string;
  page?: number;
  cursor?: string;
  limit?: number;
};

export type EventListItem = z.infer<typeof eventListItemSchema>;
export type EventDetail = z.infer<typeof eventDetailSchema>;
