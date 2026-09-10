import type { MappingMasterDefinition } from "./mapping-master";

const SEEDED_REASON = "Seeded from Sheet1 pending reconciliation with the authoritative Mapping Master";
const ABSENT_GL_REASON = "GL absent from Sheet1";
const CONFLICT_REASON = "Sheet1 says Tertiary while SAP books Primary";

export const MIS_MAPPING_MASTER = {
  version: 1,
  source: "SAP Entries Mapping.xlsx#Sheet1",
  selections: [
    {
      department: "Agriculture",
      function: "Nursery",
      plant_canonical: "DUB",
      plant_aliases: {
        sap: ["DUB-NUR"],
        display: ["Agri - Nursery - DUB"],
      },
      mis_format: "nursery-mis-financial-v1",
      budget_gl_codes: [
        "50001201",
        "50001202",
        "50001502",
        "50001603",
        "50001605",
        "50001606",
        "50001901",
        "50001981",
        "54023002",
        "55010302",
        "55010305",
        "55010401",
        "55010603",
        "55010701",
        "55010901",
        "55010902",
        "55011101",
        "55021000",
        "55023001",
      ],
      entries: [
        entry("Admin", "54023002", "Computer Maintenance"),
        entry("Admin", "55010302", "Repair and Maintenance"),
        entry("Admin", "55010305", "Miscellaneous Expenses"),
        entry("Admin", "55010401", "Printing & Stationery"),
        entry("Admin", "55010603", "Land Lease Rent"),
        entry("Admin", "55010701", "Security Charges"),
        entry("Admin", "55010901", "Petrol and Diesel Charges"),
        entry("Admin", "55010902", "Repairs & Maintenance - Vehicles"),
        entry("Admin", "55011101", "Office Electricity Expenses"),
        entry("Imported Sprouts", "50001201", "Sprout Cost"),
        entry("Imported Sprouts", "50001202", "Clearing & Forwarding"),
        entry("Manpower", "55021000", "Salaries"),
        entry("Manpower", "55023001", "Staff Welfare"),
        entry("Primary", "50001603", "Protrays"),
        entry("Primary", "50001605", "Fertilizers & Manures"),
        entry("Primary", "50001606", "Pesticides / Fungicides"),
        entry("Primary", "50001901", "Nursery labour"),
        entry("Transportation Charges", "50001981", "Transportation Charges"),
        entry("secondary", "50001502", "Land Levelling"),
        bucket("Primary", "50001701", ABSENT_GL_REASON),
        bucket("Primary", "50001702", ABSENT_GL_REASON),
        bucket("Primary", "50001703", ABSENT_GL_REASON),
        bucket("Primary", "50001704", ABSENT_GL_REASON),
        bucket("Primary", "50001705", ABSENT_GL_REASON),
        bucket("Primary", "50001706", ABSENT_GL_REASON),
        bucket("Tertiary", "50001905", ABSENT_GL_REASON),
        bucket("Primary", "50001902", CONFLICT_REASON),
        bucket("Primary", "50001903", CONFLICT_REASON),
      ],
    },
  ],
} as const satisfies MappingMasterDefinition;

function entry(cost_center: string, gl_code: string, mis_line: string) {
  return { cost_center, gl_code, mis_line, provisional: true, reason: SEEDED_REASON } as const;
}

function bucket(cost_center: string, gl_code: string, reason: string) {
  return { cost_center, gl_code, mis_line: "unmapped-GL", provisional: true, reason } as const;
}
