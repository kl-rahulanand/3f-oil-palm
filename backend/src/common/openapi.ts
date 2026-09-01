import { generateSchema } from "@anatine/zod-openapi";

type SchemaObject = Record<string, unknown>;

type SchemaRecord = Record<string, unknown>;

export function toOpenApi30(schema: unknown): SchemaRecord {
  const normalized = normalizeSchema(schema, true);
  return isRecord(normalized) ? normalized : {};
}

export function zodApiBody(
  zodSchema: Parameters<typeof generateSchema>[0],
): { schema: SchemaObject } {
  return { schema: toOpenApi30(generateSchema(zodSchema)) as SchemaObject };
}

function normalizeSchema(value: unknown, isRoot = false): unknown {
  if (Array.isArray(value)) return value.map((item) => cloneValue(item));
  if (!isRecord(value)) return value;

  const normalized: SchemaRecord = {};
  for (const [key, childValue] of Object.entries(value)) {
    if (isRoot && key === "$schema") continue;
    normalized[key] = cloneValue(childValue);
  }

  normalizeType(normalized);

  if (isRecord(normalized.properties)) {
    normalized.properties = Object.fromEntries(
      Object.entries(normalized.properties).map(([key, propertySchema]) => [
        key,
        normalizeSchema(propertySchema),
      ]),
    );
  }

  if ("items" in normalized) normalized.items = normalizeSchema(normalized.items);

  if (isRecord(normalized.additionalProperties)) {
    normalized.additionalProperties = normalizeSchema(normalized.additionalProperties);
  }

  for (const key of ["allOf", "anyOf", "oneOf"] as const) {
    if (Array.isArray(normalized[key])) {
      normalized[key] = normalized[key].map((schemaItem) => normalizeSchema(schemaItem));
    }
  }

  return normalized;
}

function normalizeType(schema: SchemaRecord): void {
  const type = schema.type;
  if (!Array.isArray(type)) return;

  const stringTypes = type.filter((item): item is string => typeof item === "string");
  const nonNullTypes = stringTypes.filter((item) => item !== "null");

  if (stringTypes.includes("null")) {
    schema.nullable = true;
    if (nonNullTypes.length > 0) schema.type = nonNullTypes[0];
    else delete schema.type;
    return;
  }

  if (stringTypes.length > 0) schema.type = stringTypes[0];
}

function cloneValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => cloneValue(item));
  if (!isRecord(value)) return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, childValue]) => [key, cloneValue(childValue)]),
  );
}

function isRecord(value: unknown): value is SchemaRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
