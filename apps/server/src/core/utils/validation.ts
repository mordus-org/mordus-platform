import type { MonitorEvent } from "../types";
import { trackingEventSchema } from "../schemas/tracking";

export const MAX_EVENT_BYTES = 16_384;
const encoder = new TextEncoder();

function validateJson(value: unknown): boolean {
  const ancestors = new Set<object>();
  let bytes = 0;
  let entries = 0;
  const account = (text: string) => {
    bytes += encoder.encode(text).length;
    if (bytes > MAX_EVENT_BYTES) throw new RangeError();
  };
  const visit = (input: unknown, depth: number): void => {
    if (
      input === null ||
      typeof input === "boolean" ||
      typeof input === "string" ||
      (typeof input === "number" && Number.isFinite(input))
    ) {
      account(JSON.stringify(input));
      return;
    }
    if (typeof input !== "object" || depth > 8 || ancestors.has(input)) throw new TypeError();
    const array = Array.isArray(input);
    const prototype = Object.getPrototypeOf(input);
    if (!array && prototype !== Object.prototype && prototype !== null) throw new TypeError();
    ancestors.add(input);
    account("{}");
    const keys = Reflect.ownKeys(input);
    if (keys.length > 256) throw new RangeError();
    let arrayIndex = 0;
    for (const key of keys) {
      if (array && key === "length") continue;
      if (
        ++entries > 256 ||
        typeof key !== "string" ||
        ["__proto__", "constructor", "prototype"].includes(key)
      )
        throw new TypeError();
      const descriptor = Object.getOwnPropertyDescriptor(input, key);
      if (!descriptor || !("value" in descriptor)) throw new TypeError();
      account(`${JSON.stringify(key)}:,`);
      if (array && key !== String(arrayIndex++)) throw new TypeError();
      visit(descriptor.value, depth + 1);
    }
    ancestors.delete(input);
  };
  try {
    visit(value, 0);
    return true;
  } catch {
    return false;
  }
}

export function isValidEvent(value: unknown): value is MonitorEvent {
  return validateJson(value) && trackingEventSchema.safeParse(value).success;
}
