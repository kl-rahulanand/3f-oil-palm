import type { MisBudgetOutlineInput } from "../warehouse/ingestion.repository";

interface MisOutlineIdentity {
  nodeKey: string;
  parentKey?: string | null;
  sNo?: string | null;
}

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

export function inheritedMisSNo(
  sNo: string | null | undefined,
  parentSNo: string | null | undefined,
): string | undefined {
  return sNo ?? parentSNo ?? undefined;
}

export function misOutlineIdentitySNo(node: MisOutlineIdentity, outline: MisOutlineIdentity[]): string | undefined {
  let current: MisOutlineIdentity | undefined = node;
  while (current) {
    const parentKey = current.parentKey;
    const parent = parentKey ? outline.find(({ nodeKey }) => nodeKey === parentKey) : undefined;
    const identitySNo = inheritedMisSNo(current.sNo, parent?.sNo);
    if (identitySNo) return identitySNo;
    current = parent;
  }
  return undefined;
}

export function outlineSection(node: MisBudgetOutlineInput, outline: MisBudgetOutlineInput[]): string | undefined {
  let current: MisBudgetOutlineInput | undefined = node;
  while (current?.parentKey) current = outline.find(({ nodeKey }) => nodeKey === current!.parentKey);
  return current?.sNo ?? undefined;
}
