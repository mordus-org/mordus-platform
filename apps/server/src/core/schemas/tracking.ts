import * as z from "zod";

const automaticTypes = [
  "element.click",
  "field.change",
  "field.selection",
  "form.submit",
  "form.reset",
  "page.view",
  "error.javascript",
  "error.unhandledrejection",
] as const;

const contextIdentifier = z.string().regex(/^[a-zA-Z0-9_-]{1,128}$/);
const elementIdentifier = z.string().regex(/^[a-z][a-z0-9._:-]{0,127}$/i);
const categorySchema = z.enum(["element", "field", "form", "page", "custom", "error"]);

const pageSchema = z
  .object({
    path: z.string().min(1).max(1024).startsWith("/"),
    route: z.string().min(1).max(1024).startsWith("/").optional(),
    previousPath: z.string().min(1).max(1024).startsWith("/").optional(),
    navigationType: z
      .enum(["initial", "pushState", "replaceState", "popstate", "hashchange", "router"])
      .optional(),
  })
  .strict();

const elementSchema = z
  .object({
    identifier: elementIdentifier,
    path: z.array(elementIdentifier).max(16).optional(),
    tagName: z
      .string()
      .regex(/^[a-z][a-z0-9-]{0,63}$/)
      .optional(),
  })
  .strict();

export const trackingEventSchema = z
  .object({
    schemaVersion: z.literal(1),
    eventId: contextIdentifier,
    projectId: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/),
    sessionId: contextIdentifier,
    userId: contextIdentifier.optional(),
    timestamp: z.string().refine((value) => {
      try {
        return new Date(value).toISOString() === value;
      } catch {
        return false;
      }
    }),
    source: z.enum(["manual", "auto"]),
    category: categorySchema,
    type: z
      .string()
      .max(128)
      .regex(/^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/i),
    page: pageSchema,
    element: elementSchema.optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
  .strict()
  .superRefine((event, context) => {
    const isManual = event.source === "manual" && event.category === "custom";
    const isAutomatic =
      event.source === "auto" &&
      automaticTypes.includes(event.type as (typeof automaticTypes)[number]) &&
      event.category === event.type.split(".")[0];

    if (!isManual && !isAutomatic) {
      context.addIssue({
        code: "custom",
        message: "Invalid source and category",
      });
    }
    if (["element", "field", "form"].includes(event.category) && event.element === undefined) {
      context.addIssue({
        code: "custom",
        message: "This category requires element",
      });
    }
  });

export const trackingBatchSchema = z.object({ events: z.array(z.unknown()).min(1) }).strict();

export const userLookupSchema = z.object({ userId: z.string().min(1) }).strict();

export const periodQuerySchema = z
  .object({ from: z.string().optional(), to: z.string().optional() })
  .passthrough();

export const paginationQuerySchema = z
  .object({ limit: z.string().optional(), cursor: z.string().optional() })
  .passthrough();

export const cursorSchema = z.object({
  offset: z.number().int().nonnegative(),
});

export const contextIdentifierSchema = contextIdentifier;
