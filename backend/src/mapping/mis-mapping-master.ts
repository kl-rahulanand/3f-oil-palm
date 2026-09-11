import type { MappingMasterDefinition } from "./mapping-master";

const SEEDED_REASON = "Seeded from Sheet1 pending reconciliation with the authoritative Mapping Master";
const ABSENT_GL_REASON = "GL absent from Sheet1";
const CONFLICT_REASON = "Sheet1 says Tertiary while SAP books Primary";

export const MIS_MAPPING_MASTER = {
  version: 2,
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
        entry("Admin", "54023002", "Computer Maintenance", "9.07|54023002|computer-maintenance"),
        entry("Admin", "55010302", "Repair and Maintenance", "9.14|55010302|repair-and-maintenance"),
        entry("Admin", "55010305", "Miscellaneous Expenses", "9.14|55010305|miscellaneous-expenses"),
        entry("Admin", "55010401", "Printing & Stationery", "9.11|55010401|printing-stationery"),
        entry("Admin", "55010603", "Land Lease Rent", "9.09|55010603|land-lease-rent"),
        entry("Admin", "55010701", "Security Charges", "9.13|55010701|security-charges"),
        entry("Admin", "55010901", "Petrol and Diesel Charges", "9.01|55010901|petrol-and-diesel-charges"),
        entry("Admin", "55010902", "Repairs & Maintenance - Vehicles", "9.01|55010902|repairs-maintenance-vehicles"),
        entry("Admin", "55011101", "Office Electricity Expenses", "9.1|55011101|office-electricity-expenses"),
        entry("Imported Sprouts", "50001201", "Sprout Cost", "1.1|50001201|sprout-cost"),
        entry("Imported Sprouts", "50001202", "Clearing & Forwarding", "1.2|50001202|clearing-forwarding"),
        entry("Manpower", "55021000", "Salaries", "8.1|55021000|salaries"),
        entry("Manpower", "55023001", "Staff Welfare", "8.3|55023001|staff-welfare"),
        entry("Primary", "50001603", "Protrays", "4.3|50001603|protrays"),
        entry("Primary", "50001605", "Fertilizers & Manures", "4.5|50001605|fertilizers-manures"),
        entry("Primary", "50001606", "Pesticides / Fungicides", "4.5|50001606|pesticides-fungicides"),
        entry("Primary", "50001901", "Nursery labour", "7.1|50001901|nursery-labour-primary"),
        entry("Transportation Charges", "50001981", "Transportation Charges", "14|50001981|transportation-charges"),
        entry("secondary", "50001502", "Land Levelling", "3.2|50001502|land-levelling"),
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

function entry(cost_center: string, gl_code: string, mis_line: string, leaf_key: string) {
  return {
    cost_center,
    gl_code,
    mis_line,
    target: { kind: "leaf", leaf_key },
    provisional: true,
    reason: SEEDED_REASON,
  } as const;
}

function bucket(cost_center: string, gl_code: string, reason: string) {
  return {
    cost_center,
    gl_code,
    mis_line: "unmapped-GL",
    target: { kind: "bucket" },
    provisional: true,
    reason,
  } as const;
}
