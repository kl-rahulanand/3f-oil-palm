import { Injectable, Optional } from "@nestjs/common";
import type { AuthUser, DomainSpec, HelpResponse } from "@3f/contract";
import { loadConfig } from "../config";
import { DimensionValuesService } from "../core/dimension-values.service";
import { SelectionResolverService, statementPeriodOptions } from "../mapping/selection-resolver.service";
import { SemanticLayer } from "../semantic/semanticLayer";
import { buildTermIndex, type TermIndex } from "./glossary";

const ROLE_REFERENCE = [
  { role: "admin", summary: "User and access management." },
  { role: "analyst", summary: "Query, save, and pin permitted metrics." },
  { role: "manager", summary: "Curated metrics." },
  { role: "dba", summary: "Measure authoring and query access." },
];

@Injectable()
export class HelpService {
  constructor(
    private readonly semantic: SemanticLayer,
    private readonly dimensionValues: DimensionValuesService,
    @Optional() private readonly selectionResolver?: SelectionResolverService,
  ) {}

  async build(user: AuthUser): Promise<HelpResponse> {
    const allowed = this.semantic.allowedFor(user.permissions);
    const index = await this.buildIndex(user);

    return {
      gettingStarted: [
        "Ask a question about your configured data in plain English.",
        index.latestPeriodLabel
          ? `Name a loaded month, such as ${index.latestPeriodLabel}, when you want a specific period.`
          : "Name a loaded month when you want a specific period.",
        "Not sure where to start? Try one of the examples below.",
      ],
      whatYouCanAsk: {
        measures: index.measures,
        dimensions: index.dimensions.map(({ id, label }) => ({ id, label })),
        filterExamples: buildFilterExamples(index, allowed),
        timeframes: index.latestPeriodLabel ? [index.latestPeriodLabel] : [],
        sampleQuestions: buildSampleQuestions(index),
      },
      whatItWont: [
        "3F gives you governed totals and summaries, not unrestricted source records.",
        "It only answers questions about configured data domains, not general knowledge.",
        "It won't guess. If something isn't one of your approved metrics, 3F tells you instead of making a number up.",
        "You only ever see the data your access allows.",
      ],
      access: {
        roles: user.roles,
        domains: allowed.map((domain) => domain.label),
        measures: index.measures.map((measure) => measure.label),
        dimensions: index.dimensions.map((dimension) => dimension.label),
        scope: user.scope,
        rolesReference: ROLE_REFERENCE,
      },
    };
  }

  async buildIndex(user: AuthUser): Promise<TermIndex> {
    const allowed = this.semantic.allowedFor(user.permissions);
    const values = await this.dimensionValuesForAllowedDomains(allowed);
    const allowedPlants = user.scope.filter(({ attribute }) => attribute === "plant").map(({ value }) => value);
    const periods = this.selectionResolver
      ? statementPeriodOptions(
          (await this.selectionResolver.options(allowedPlants.length ? allowedPlants : undefined)).periods,
        )
      : [];
    return buildTermIndex(allowed, values, periods.at(-1));
  }

  private async dimensionValuesForAllowedDomains(allowedDomains: DomainSpec[]): Promise<Record<string, string[]>> {
    const maxValues = loadConfig().dimensionEnumMax;
    const valuesByDimension: Record<string, string[]> = {};
    for (const domain of allowedDomains) {
      for (const dimension of domain.dimensions) {
        const values = await this.dimensionValues.values(domain.goldObject, dimension.column);
        if (values.length > 0 && values.length <= maxValues) {
          valuesByDimension[dimension.id] = values;
        }
      }
    }
    return valuesByDimension;
  }
}

function buildFilterExamples(index: TermIndex, domains: DomainSpec[]): HelpResponse["whatYouCanAsk"]["filterExamples"] {
  const examples = index.values.reduce<HelpResponse["whatYouCanAsk"]["filterExamples"]>((items, value) => {
    const existing = items.find((example) => example.dimensionLabel === value.dimensionLabel);
    if (existing) {
      if (existing.values.length < 5) existing.values.push(value.value);
      return items;
    }
    items.push({ dimensionLabel: value.dimensionLabel, values: [value.value] });
    return items;
  }, []);

  const comparableByDomain = domains.map((domain) => domain.measures.filter((measure) => measure.format === "money"));
  const amountMeasures = comparableByDomain.find((measures) => measures.length > 0);
  if (!amountMeasures) return examples;

  const pairMeasures = comparableByDomain.find((measures) => measures.length > 1);
  const values = pairMeasures ? [`${pairMeasures[0].label} > ${pairMeasures[1].label}`] : [];
  values.push(`${amountMeasures[0].label} > ₹5,00,000`);
  examples.push({ dimensionLabel: "Measure comparisons", values });
  return examples;
}

function buildSampleQuestions(index: TermIndex): HelpResponse["whatYouCanAsk"]["sampleQuestions"] {
  return index.exampleQuestions.map((question) => ({
    question,
    behaviour: "Uses the governed measures, dimensions and loaded period available to your role.",
  }));
}
