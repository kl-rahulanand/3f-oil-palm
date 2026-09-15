import type { MisBudgetOutlineInput } from "../warehouse/ingestion.repository";

export function stableMisLeafKey(sNo: string, glCode: string, label: string): string {
  return `${sNo}|${glCode}|${misFormatSlug(label)}`;
}

export function misFormatSlug(value: string): string {
  return value
    .normalize("NFKD")
    .replaceAll(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, "-")
    .replaceAll(/^-|-$/g, "");
}

export function outlineSection(node: MisBudgetOutlineInput, outline: MisBudgetOutlineInput[]): string | undefined {
  let current: MisBudgetOutlineInput | undefined = node;
  while (current?.parentKey) current = outline.find(({ nodeKey }) => nodeKey === current!.parentKey);
  return current?.sNo ?? undefined;
}
