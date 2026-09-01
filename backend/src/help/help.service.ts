import { Injectable } from "@nestjs/common";
import type { AuthUser, DomainSpec, HelpResponse } from "@pulse/contract";
import { loadConfig } from "../config";
import { DimensionValuesService } from "../core/dimension-values.service";
import { SemanticLayer } from "../semantic/semanticLayer";
import { buildTermIndex, type TermIndex, type TermIndexDimension, type TermIndexMeasure } from "./glossary";

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
  ) {}

  async build(user: AuthUser): Promise<HelpResponse> {
    const allowed = this.semantic.allowedFor(user.permissions);
    const index = await this.buildIndex(user);

    return {
      gettingStarted: [
        "Ask a question about your configured data in plain English.",
        "Add a time frame like 'last 30 days' when you want a trend or recent numbers.",
        "Not sure where to start? Try one of the examples below.",
      ],
      whatYouCanAsk: {
        measures: index.measures,
        dimensions: index.dimensions.map(({ id, label }) => ({ id, label })),
        filterExamples: buildFilterExamples(index),
        timeframes: ["last 7 days", "last 30 days", "this month", "Jan-Mar 2026"],
        sampleQuestions: buildSampleQuestions(index),
      },
      whatPulseWont: [
        "Pulse gives you governed totals and summaries, not unrestricted source records.",
        "It only answers questions about configured data domains, not general knowledge.",
        "It won't guess. If something isn't one of your approved metrics, Pulse tells you instead of making a number up.",
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
    return buildTermIndex(allowed, values);
  }

  private async dimensionValuesForAllowedDomains(
    allowedDomains: DomainSpec[],
  ): Promise<Record<string, string[]>> {
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

function buildFilterExamples(index: TermIndex): HelpResponse["whatYouCanAsk"]["filterExamples"] {
  return index.values.reduce<HelpResponse["whatYouCanAsk"]["filterExamples"]>((examples, value) => {
    const existing = examples.find((example) => example.dimensionLabel === value.dimensionLabel);
    if (existing) {
      if (existing.values.length < 5) existing.values.push(value.value);
      return examples;
    }
    examples.push({ dimensionLabel: value.dimensionLabel, values: [value.value] });
    return examples;
  }, []);
}

function buildSampleQuestions(index: TermIndex): HelpResponse["whatYouCanAsk"]["sampleQuestions"] {
  const dimensionsById = new Map(index.dimensions.map((dimension) => [dimension.id, dimension]));
  const preferredDimensions = [
    "state",
    "agent",
    "channel",
    "campaign",
    "bank",
    "record_type",
    "status",
  ].map((id) => dimensionsById.get(id)).filter((dimension): dimension is TermIndexDimension => Boolean(dimension));

  const fallbackDimensions = index.dimensions.filter(
    (dimension) => !preferredDimensions.some((preferred) => preferred.id === dimension.id),
  );
  const dimensions = [...preferredDimensions, ...fallbackDimensions];

  const measurePreferences = [
    /conversion/i,
    /appointment/i,
    /success/i,
    /unassigned/i,
    /rescheduled/i,
    /call back|callback/i,
    /to be called/i,
    /closed|declined/i,
  ];
  const preferredMeasures = measurePreferences
    .map((pattern) => index.measures.find((measure) => pattern.test(measure.label)))
    .filter((measure): measure is TermIndexMeasure => Boolean(measure));
  const measures = [
    ...preferredMeasures,
    ...index.measures.filter((measure) => !preferredMeasures.some((preferred) => preferred.id === measure.id)),
  ];

  const samples: HelpResponse["whatYouCanAsk"]["sampleQuestions"] = [];
  for (const measure of measures) {
    const dimension = dimensions[samples.length % Math.max(dimensions.length, 1)];
    if (dimension) {
      samples.push({
        question: `${measure.label} by ${dimension.label}`,
        behaviour: `Shows ${measure.label.toLocaleLowerCase()} broken down by ${dimension.label.toLocaleLowerCase()} as a chart and a sortable table.`,
      });
    } else {
      samples.push({
        question: `${measure.label} last 30 days`,
        behaviour: `Totals ${measure.label.toLocaleLowerCase()} over the last 30 days.`,
      });
    }
    if (samples.length >= 8) break;
  }

  const timeMeasure = measures.find((measure) => !samples.some((sample) => sample.question.startsWith(measure.label)));
  if (timeMeasure && samples.length < 8) {
    samples.push({
      question: `${timeMeasure.label} last 30 days`,
      behaviour: `Totals ${timeMeasure.label.toLocaleLowerCase()} over the last 30 days.`,
    });
  }

  return dedupeSampleQuestions(samples).slice(0, 8);
}

function dedupeSampleQuestions(
  samples: HelpResponse["whatYouCanAsk"]["sampleQuestions"],
): HelpResponse["whatYouCanAsk"]["sampleQuestions"] {
  const seen = new Set<string>();
  return samples.filter((sample) => {
    const key = sample.question.toLocaleLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
