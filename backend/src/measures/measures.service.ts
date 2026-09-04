import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type {
  AuthoredMeasureInput,
  AuthoredMeasureView,
  AuthUser,
  MeasureAuthoringMetadataResponse,
  MeasureValidationResponse,
} from "@3f/contract";
import { and, desc, eq } from "drizzle-orm";
import { DRIZZLE_DB } from "../config";
import type { AppDb } from "../db/pool";
import { authoredMeasures, rolePerms } from "../db/schema";
import { AuditService } from "../core/audit.service";
import { SelectionExecutor } from "../chat/selectionExecutor";
import { SemanticLayer } from "../semantic/semanticLayer";
import { AuthoredMeasureRegistry } from "./authored-measure.registry";
import { AGGREGATION_OPTIONS, AUTHORING_DOMAINS } from "./measure-authoring.catalog";
import { authoredMeasureDefinitionHash, compileAuthoredMeasure } from "./measure-compiler";

type MeasureRow = typeof authoredMeasures.$inferSelect;

@Injectable()
export class MeasuresService {
  constructor(
    @Inject(DRIZZLE_DB) private readonly db: AppDb,
    private readonly semantic: SemanticLayer,
    private readonly executor: SelectionExecutor,
    private readonly registry: AuthoredMeasureRegistry,
    private readonly audit: AuditService,
  ) {}

  metadata(): MeasureAuthoringMetadataResponse {
    return {
      domains: AUTHORING_DOMAINS.map((domain) => ({
        id: domain.id,
        label: domain.label,
        fields: domain.fields.map(({ column: _column, ...field }) => field),
        timeDimensions: domain.timeDimensions,
      })),
      aggregations: AGGREGATION_OPTIONS,
      formats: [
        { id: "number", label: "Number" },
        { id: "percent", label: "Percent" },
      ],
    };
  }

  async list(): Promise<AuthoredMeasureView[]> {
    const rows = await this.db.select().from(authoredMeasures).orderBy(desc(authoredMeasures.version));
    const latest = new Map<string, MeasureRow>();
    for (const row of rows) if (!latest.has(row.measureKey)) latest.set(row.measureKey, row);
    return [...latest.values()].map(measureView);
  }

  async create(input: AuthoredMeasureInput, actor: AuthUser): Promise<AuthoredMeasureView> {
    const domain = this.requireDomain(input.domain);
    compileAuthoredMeasure(input, domain);
    const measureKey = `${input.domain}.${input.key}`;
    const existing = await this.db
      .select()
      .from(authoredMeasures)
      .where(eq(authoredMeasures.measureKey, measureKey))
      .orderBy(desc(authoredMeasures.version));
    if (!existing.length && this.semantic.measure(input.domain, measureKey)) {
      throw new ConflictException("A code-defined measure already uses this ID");
    }
    if (existing[0] && existing[0].status !== "published") {
      throw new ConflictException("An unpublished version already exists for this measure");
    }
    const version = (existing[0]?.version ?? 0) + 1;
    const definitionHash = authoredMeasureDefinitionHash(input);
    const row = await this.db.transaction(async (tx) => {
      const inserted = await tx.insert(authoredMeasures).values({
        ...inputToColumns(input),
        measureKey,
        version,
        definitionHash,
        createdBy: actor.id,
        updatedBy: actor.id,
      }).returning();
      await this.audit.writeAdminEvent({
        actorId: actor.id,
        action: "measure.create",
        target: { type: "measure", id: inserted[0].id, measureId: measureKey, version },
        detail: { domain: input.domain, aggregation: input.aggregation },
      }, tx);
      return inserted[0];
    });
    return measureView(row);
  }

  async update(id: string, input: AuthoredMeasureInput, actor: AuthUser): Promise<AuthoredMeasureView> {
    const existing = await this.requireRow(id);
    if (existing.status === "published") throw new ConflictException("Published versions are immutable");
    if (existing.domain !== input.domain || existing.measureKey !== `${input.domain}.${input.key}`) {
      throw new BadRequestException("Dataset and measure ID cannot change after draft creation");
    }
    const domain = this.requireDomain(input.domain);
    compileAuthoredMeasure(input, domain);
    const definitionHash = authoredMeasureDefinitionHash(input);
    const row = await this.db.transaction(async (tx) => {
      const updated = await tx.update(authoredMeasures).set({
        ...inputToColumns(input),
        status: "draft",
        definitionHash,
        validatedHash: null,
        validationSql: null,
        validationValue: null,
        validatedAt: null,
        compiledSpec: null,
        updatedBy: actor.id,
        updatedAt: new Date(),
      }).where(eq(authoredMeasures.id, id)).returning();
      await this.audit.writeAdminEvent({
        actorId: actor.id,
        action: "measure.update",
        target: { type: "measure", id, measureId: existing.measureKey, version: existing.version },
        detail: { definitionHash },
      }, tx);
      return updated[0];
    });
    return measureView(row);
  }

  async validate(id: string, actor: AuthUser): Promise<MeasureValidationResponse> {
    const row = await this.requireRow(id);
    if (row.status === "published") throw new ConflictException("Published versions are already verified");
    const input = inputFromRow(row);
    const domain = this.requireDomain(row.domain);
    const spec = compileAuthoredMeasure(input, domain);
    const validationDomain = {
      ...domain,
      measures: [...domain.measures.filter((measure) => measure.id !== spec.id), spec],
    };
    const execution = await this.executor.run(actor, validationDomain, {
      domain: row.domain,
      measureIds: [spec.id],
      dimensionIds: [],
      filters: [],
      ...(spec.timeColumn ? { timeWindow: { grain: input.timeGrain ?? "day", last: 30 } } : {}),
      limit: 1,
    });
    const outputKey = spec.id.split(".").pop()!;
    const value = execution.result.rows[0]?.[outputKey] ?? null;
    const updated = await this.db.transaction(async (tx) => {
      const rows = await tx.update(authoredMeasures).set({
        status: "validated",
        validatedHash: row.definitionHash,
        validationSql: execution.sql,
        validationValue: value,
        validatedAt: new Date(),
        compiledSpec: spec,
        updatedBy: actor.id,
        updatedAt: new Date(),
      }).where(and(eq(authoredMeasures.id, id), eq(authoredMeasures.definitionHash, row.definitionHash))).returning();
      if (!rows[0]) throw new ConflictException("Draft changed during validation; validate it again");
      await this.audit.writeAdminEvent({
        actorId: actor.id,
        action: "measure.validate",
        target: { type: "measure", id, measureId: row.measureKey, version: row.version },
        detail: { definitionHash: row.definitionHash, value },
      }, tx);
      return rows[0];
    });
    return { measure: measureView(updated), value, sql: execution.sql };
  }

  async publish(id: string, actor: AuthUser): Promise<AuthoredMeasureView> {
    const existing = await this.requireRow(id);
    if (existing.status !== "validated" || existing.validatedHash !== existing.definitionHash || !existing.compiledSpec) {
      throw new ConflictException("Validate the current draft before publishing");
    }
    const row = await this.db.transaction(async (tx) => {
      const published = await tx.update(authoredMeasures).set({
        status: "published",
        publishedAt: new Date(),
        updatedBy: actor.id,
        updatedAt: new Date(),
      }).where(and(
        eq(authoredMeasures.id, id),
        eq(authoredMeasures.status, "validated"),
        eq(authoredMeasures.definitionHash, existing.definitionHash),
      )).returning();
      if (!published[0]) throw new ConflictException("Draft changed before publication");
      await tx.insert(rolePerms).values({
        role: "dba",
        grantType: "measure",
        grantId: existing.measureKey,
      }).onConflictDoNothing();
      await this.audit.writeAdminEvent({
        actorId: actor.id,
        action: "measure.publish",
        target: { type: "measure", id, measureId: existing.measureKey, version: existing.version },
        detail: { definitionHash: existing.definitionHash },
      }, tx);
      return published[0];
    });
    await this.registry.reload();
    return measureView(row);
  }

  private requireDomain(name: string) {
    const domain = this.semantic.domain(name);
    if (!domain || !AUTHORING_DOMAINS.some((candidate) => candidate.id === name)) {
      throw new BadRequestException("Dataset is not available for measure authoring");
    }
    return domain;
  }

  private async requireRow(id: string): Promise<MeasureRow> {
    const rows = await this.db.select().from(authoredMeasures).where(eq(authoredMeasures.id, id)).limit(1);
    if (!rows[0]) throw new NotFoundException("Measure draft not found");
    return rows[0];
  }
}

function inputToColumns(input: AuthoredMeasureInput) {
  return {
    domain: input.domain,
    label: input.label,
    synonyms: [...new Set(input.synonyms)],
    baseField: input.baseField,
    aggregation: input.aggregation,
    timeDimension: input.timeDimension ?? null,
    timeGrain: input.timeGrain ?? null,
    filters: input.filters,
    format: input.format,
  };
}

function inputFromRow(row: MeasureRow): AuthoredMeasureInput {
  return {
    domain: row.domain,
    key: row.measureKey.slice(row.domain.length + 1),
    label: row.label,
    synonyms: row.synonyms,
    baseField: row.baseField,
    aggregation: row.aggregation as AuthoredMeasureInput["aggregation"],
    ...(row.timeDimension ? { timeDimension: row.timeDimension } : {}),
    ...(row.timeGrain ? { timeGrain: row.timeGrain as NonNullable<AuthoredMeasureInput["timeGrain"]> } : {}),
    filters: row.filters,
    format: row.format as AuthoredMeasureInput["format"],
  };
}

function measureView(row: MeasureRow): AuthoredMeasureView {
  const input = inputFromRow(row);
  return {
    ...input,
    id: row.id,
    measureId: row.measureKey,
    version: row.version,
    status: row.status as AuthoredMeasureView["status"],
    definitionHash: row.definitionHash,
    ...(row.validatedAt && row.validationSql ? {
      validation: {
        value: row.validationValue ?? null,
        sql: row.validationSql,
        validatedAt: row.validatedAt.toISOString(),
      },
    } : {}),
    createdBy: row.createdBy,
    updatedBy: row.updatedBy,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    ...(row.publishedAt ? { publishedAt: row.publishedAt.toISOString() } : {}),
  };
}
