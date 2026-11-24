import { ApiError } from "../../../core/errors/error-handler";
import type { MonitorEvent } from "../../../core/types";
import type { SettingsRepository } from "../../admin/settings.repository";
import { trackingBatchSchema } from "../../../core/schemas/tracking";
import { isValidEvent } from "../../../core/utils/validation";
import { IngestionRepository } from "../repositories/ingestion.repository";

export class IngestionService {
  constructor(
    private readonly repository: IngestionRepository,
    private readonly settings: SettingsRepository,
  ) {}

  async findCollection(collectionId: string) {
    const collection = await this.settings.collection(collectionId);
    if (!collection) throw new ApiError(404, "COLLECTION_NOT_FOUND", "Collection was not found");
    return collection;
  }

  async collect(body: unknown): Promise<number> {
    const batch = trackingBatchSchema.safeParse(body);
    if (!batch.success)
      throw new ApiError(400, "INVALID_BATCH", "Body must contain an events array");
    const { events } = batch.data;
    if (!Array.isArray(events) || events.length < 1)
      throw new ApiError(400, "INVALID_BATCH", "Events must be a non-empty array");
    if (Buffer.byteLength(JSON.stringify(body), "utf8") > 60 * 1024)
      throw new ApiError(413, "PAYLOAD_TOO_LARGE", "The tracking batch exceeds 60 KiB");
    if (!events.every(isValidEvent))
      throw new ApiError(400, "INVALID_EVENT", "One or more events do not match schema version 1");
    const project = await this.settings.project();
    if (!project) throw new ApiError(503, "NOT_CONFIGURED", "Project is not configured");
    if (events.some((event) => event.projectId !== project.id))
      throw new ApiError(
        400,
        "PROJECT_MISMATCH",
        "All events must belong to the collection project",
      );
    await this.repository.persistBatch(project, events as MonitorEvent[]);
    return events.length;
  }
}
