import { Injectable, Optional } from "@nestjs/common";
import type { DomainSpec, MeasureSpec, DimensionSpec, Permissions } from "@pulse/contract";
import { AuthoredMeasureRegistry } from "../measures/authored-measure.registry";

/**
 * The semantic layer: verified measures/dimensions, code-in-repo and CI-gated (A2).
 * V1 registers verified domains as they are modeled.
 */
@Injectable()
export class SemanticLayer {
  private readonly baseDomains: DomainSpec[] = [];

  constructor(@Optional() private readonly authored?: AuthoredMeasureRegistry) {}

  all(): DomainSpec[] {
    return this.baseDomains.map((domain) => this.withAuthoredMeasures(domain));
  }

  /** Domains restricted to what the user is permitted to use (semantic authorization). */
  allowedFor(perms: Permissions): DomainSpec[] {
    return this.all()
      .filter((d) => perms.domains.includes(d.name))
      .map((d) => ({
        ...d,
        measures: d.measures.filter((m) => perms.measureIds.includes(m.id)),
        dimensions: d.dimensions.filter((dim) => perms.dimensionIds.includes(dim.id)),
      }));
  }

  domain(name: string): DomainSpec | undefined {
    const domain = this.baseDomains.find((candidate) => candidate.name === name);
    return domain ? this.withAuthoredMeasures(domain) : undefined;
  }

  measure(domain: string, measureId: string): MeasureSpec | undefined {
    return this.domain(domain)?.measures.find((m) => m.id === measureId);
  }

  dimension(domain: string, dimId: string): DimensionSpec | undefined {
    return this.domain(domain)?.dimensions.find((d) => d.id === dimId);
  }

  private withAuthoredMeasures(domain: DomainSpec): DomainSpec {
    const authored = this.authored?.published(domain.name) ?? [];
    return authored.length ? { ...domain, measures: [...domain.measures, ...authored] } : domain;
  }
}
