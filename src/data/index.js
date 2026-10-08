// GENERATED from manifest.js by scripts/gen-data-index.js — do not edit by hand.
import { profile as p0 } from "./profiles/CA-ON/profile.js";
import { content as c0_0 } from "./profiles/CA-ON/content.en-CA.js";
import { content as c0_1 } from "./profiles/CA-ON/content.fr-CA.js";
import { record as r0_0 } from "./records/CA-ON/maya-bennett.js";
import { profile as p1 } from "./profiles/CA-QC/profile.js";
import { content as c1_0 } from "./profiles/CA-QC/content.en-CA.js";
import { content as c1_1 } from "./profiles/CA-QC/content.fr-CA.js";
import { record as r1_0 } from "./records/CA-QC/etienne-roy.js";
import { profile as p2 } from "./profiles/ZA/profile.js";
import { content as c2_0 } from "./profiles/ZA/content.en-ZA.js";
import { content as c2_1 } from "./profiles/ZA/content.af-ZA.js";
import { content as c2_2 } from "./profiles/ZA/content.zu-ZA.js";
import { content as c2_3 } from "./profiles/ZA/content.xh-ZA.js";
import { record as r2_0 } from "./records/ZA/nomsa-dlamini.js";
import { record as r2_1 } from "./records/ZA/sipho-khumalo.js";
import { profile as p3 } from "./profiles/EU-FR/profile.js";
import { content as c3_0 } from "./profiles/EU-FR/content.en-GB.js";
import { content as c3_1 } from "./profiles/EU-FR/content.fr-FR.js";
import { content as c3_2 } from "./profiles/EU-FR/content.de-DE.js";
import { content as c3_3 } from "./profiles/EU-FR/content.it-IT.js";
import { record as r3_0 } from "./records/EU-FR/camille-laurent.js";
import { profile as p4 } from "./profiles/EU-DE/profile.js";
import { content as c4_0 } from "./profiles/EU-DE/content.en-GB.js";
import { content as c4_1 } from "./profiles/EU-DE/content.fr-FR.js";
import { content as c4_2 } from "./profiles/EU-DE/content.de-DE.js";
import { content as c4_3 } from "./profiles/EU-DE/content.it-IT.js";
import { record as r4_0 } from "./records/EU-DE/lina-hoffmann.js";
import { profile as p5 } from "./profiles/EU-IT/profile.js";
import { content as c5_0 } from "./profiles/EU-IT/content.en-GB.js";
import { content as c5_1 } from "./profiles/EU-IT/content.fr-FR.js";
import { content as c5_2 } from "./profiles/EU-IT/content.de-DE.js";
import { content as c5_3 } from "./profiles/EU-IT/content.it-IT.js";
import { record as r5_0 } from "./records/EU-IT/sofia-ricci.js";
import { pack as l0 } from "./lang/en-CA.js";
import { pack as l1 } from "./lang/fr-CA.js";
import { pack as l2 } from "./lang/en-ZA.js";
import { pack as l3 } from "./lang/af-ZA.js";
import { pack as l4 } from "./lang/zu-ZA.js";
import { pack as l5 } from "./lang/xh-ZA.js";
import { pack as l6 } from "./lang/en-GB.js";
import { pack as l7 } from "./lang/fr-FR.js";
import { pack as l8 } from "./lang/de-DE.js";
import { pack as l9 } from "./lang/it-IT.js";

export const defaultProfileId = "CA-ON";
export const packageKind = "presenter";
export const profiles = { "CA-ON": p0, "CA-QC": p1, "ZA": p2, "EU-FR": p3, "EU-DE": p4, "EU-IT": p5 };
export const contents = { "CA-ON": { "en-CA": c0_0, "fr-CA": c0_1 }, "CA-QC": { "en-CA": c1_0, "fr-CA": c1_1 }, "ZA": { "en-ZA": c2_0, "af-ZA": c2_1, "zu-ZA": c2_2, "xh-ZA": c2_3 }, "EU-FR": { "en-GB": c3_0, "fr-FR": c3_1, "de-DE": c3_2, "it-IT": c3_3 }, "EU-DE": { "en-GB": c4_0, "fr-FR": c4_1, "de-DE": c4_2, "it-IT": c4_3 }, "EU-IT": { "en-GB": c5_0, "fr-FR": c5_1, "de-DE": c5_2, "it-IT": c5_3 } };
export const records = { "CA-ON": [r0_0], "CA-QC": [r1_0], "ZA": [r2_0, r2_1], "EU-FR": [r3_0], "EU-DE": [r4_0], "EU-IT": [r5_0] };
export const languages = { "en-CA": l0, "fr-CA": l1, "en-ZA": l2, "af-ZA": l3, "zu-ZA": l4, "xh-ZA": l5, "en-GB": l6, "fr-FR": l7, "de-DE": l8, "it-IT": l9 };

export function scenariosFor(profileId) {
  return (records[profileId] || []).map((r) => ({ id: r.scenario.id, personaName: r.employee.displayName, summary: r.scenario.summary, tags: r.scenario.tags || [] }));
}
export function findRecord(profileId, scenarioId) {
  const list = records[profileId] || [];
  if (!scenarioId) return list[0] || null;
  return list.find((r) => r.scenario.id === scenarioId) || null;
}
