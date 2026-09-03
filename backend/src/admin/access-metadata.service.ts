import { Inject, Injectable } from "@nestjs/common";
import type {
  AccessMetadataGrantOption,
  AccessMetadataResponse,
  AccessMetadataScopeAttribute,
} from "@3f/contract";
import { DRIZZLE_DB, loadConfig } from "../config";
import { DimensionValuesService } from "../core/dimension-values.service";
import type { AppDb } from "../db/pool";
import { roles } from "../db/schema";
import { GRANT_ACTIONS } from "../grants/grants.constants";
import { SemanticLayer } from "../semantic/semanticLayer";

type ScopeAttributeSource = {
  id: string;
  label: string;
  goldObject: string;
  column: string;
};

@Injectable()
export class AccessMetadataService {
  constructor(
    @Inject(DRIZZLE_DB) private readonly db: AppDb,
    private readonly semantic: SemanticLayer,
    private readonly dimensionValues: DimensionValuesService,
  ) {}

  async get(): Promise<AccessMetadataResponse> {
    const roleRows = await this.db
      .select({ id: roles.name, label: roles.label })
      .from(roles)
      .orderBy(roles.name);
    const domains = this.semantic.all();
    const valueLimit = loadConfig().dimensionEnumMax;

    const scopeAttributes = await Promise.all(
      this.scopeAttributeSources().map(async (attribute): Promise<AccessMetadataScopeAttribute> => ({
        id: attribute.id,
        label: attribute.label,
        values: (await this.dimensionValues.values(attribute.goldObject, attribute.column)).slice(
          0,
          valueLimit,
        ),
      })),
    );

    return {
      roles: roleRows,
      scopeAttributes,
      grantOptions: {
        domains: domains.map((domain) => ({ id: domain.name, label: domain.label })),
        measures: uniqueOptions(
          domains.flatMap((domain) =>
            domain.measures.map((measure) => ({ id: measure.id, label: measure.label })),
          ),
        ),
        dimensions: uniqueOptions(
          domains.flatMap((domain) =>
            domain.dimensions.map((dimension) => ({
              id: dimension.id,
              label: dimension.label,
            })),
          ),
        ),
        actions: [...GRANT_ACTIONS],
      },
    };
  }

  /**
   * Gold objects and columns are resolved exclusively from the trusted semantic
   * layer. First occurrence wins, matching RbacService's save-time resolution.
   */
  private scopeAttributeSources(): ScopeAttributeSource[] {
    const attributes = new Map<string, ScopeAttributeSource>();

    for (const domain of this.semantic.all()) {
      if (domain.scopeColumn && !attributes.has(domain.scopeColumn)) {
        const dimension = domain.dimensions.find(
          (candidate) =>
            candidate.id === domain.scopeColumn || candidate.column === domain.scopeColumn,
        );
        attributes.set(domain.scopeColumn, {
          id: domain.scopeColumn,
          label: dimension?.label ?? domain.scopeColumn,
          goldObject: domain.goldObject,
          column: dimension?.column ?? domain.scopeColumn,
        });
      }

      for (const dimension of domain.dimensions) {
        if (attributes.has(dimension.id)) continue;
        attributes.set(dimension.id, {
          id: dimension.id,
          label: dimension.label,
          goldObject: domain.goldObject,
          column: dimension.column,
        });
      }
    }

    return [...attributes.values()];
  }
}

function uniqueOptions(options: AccessMetadataGrantOption[]): AccessMetadataGrantOption[] {
  return [...new Map(options.map((option) => [option.id, option])).values()];
}
