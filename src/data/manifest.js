/**
 * Data manifest. Lists every bundled profile, its governed content packs per
 * language, its constructed records (scenarios) and the interface language
 * packs. src/data/index.js is GENERATED from this file:
 *   node scripts/gen-data-index.js
 * Employee packages are generated from a filtered view of the same manifest.
 */
export const manifest = {
  defaultProfileId: 'CA-ON',
  languages: {
    'en-CA': './lang/en-CA.js',
    'fr-CA': './lang/fr-CA.js',
    'en-ZA': './lang/en-ZA.js',
    'af-ZA': './lang/af-ZA.js',
    'zu-ZA': './lang/zu-ZA.js',
    'xh-ZA': './lang/xh-ZA.js',
    'en-GB': './lang/en-GB.js',
    'fr-FR': './lang/fr-FR.js',
    'de-DE': './lang/de-DE.js',
    'it-IT': './lang/it-IT.js',
  },
  profiles: [
    {
      id: 'CA-ON',
      file: './profiles/CA-ON/profile.js',
      contents: { 'en-CA': './profiles/CA-ON/content.en-CA.js', 'fr-CA': './profiles/CA-ON/content.fr-CA.js' },
      records: [{ id: 'maya-bennett', file: './records/CA-ON/maya-bennett.js' }],
    },
    {
      id: 'CA-QC',
      file: './profiles/CA-QC/profile.js',
      contents: { 'en-CA': './profiles/CA-QC/content.en-CA.js', 'fr-CA': './profiles/CA-QC/content.fr-CA.js' },
      records: [{ id: 'etienne-roy', file: './records/CA-QC/etienne-roy.js' }],
    },
    {
      id: 'ZA',
      file: './profiles/ZA/profile.js',
      contents: { 'en-ZA': './profiles/ZA/content.en-ZA.js', 'af-ZA': './profiles/ZA/content.af-ZA.js', 'zu-ZA': './profiles/ZA/content.zu-ZA.js', 'xh-ZA': './profiles/ZA/content.xh-ZA.js' },
      records: [{ id: 'nomsa-dlamini', file: './records/ZA/nomsa-dlamini.js' }, { id: 'sipho-khumalo', file: './records/ZA/sipho-khumalo.js' }],
    },
    {
      id: 'EU-FR',
      file: './profiles/EU-FR/profile.js',
      contents: { 'en-GB': './profiles/EU-FR/content.en-GB.js', 'fr-FR': './profiles/EU-FR/content.fr-FR.js', 'de-DE': './profiles/EU-FR/content.de-DE.js', 'it-IT': './profiles/EU-FR/content.it-IT.js' },
      records: [{ id: 'camille-laurent', file: './records/EU-FR/camille-laurent.js' }],
    },
    {
      id: 'EU-DE',
      file: './profiles/EU-DE/profile.js',
      contents: { 'en-GB': './profiles/EU-DE/content.en-GB.js', 'fr-FR': './profiles/EU-DE/content.fr-FR.js', 'de-DE': './profiles/EU-DE/content.de-DE.js', 'it-IT': './profiles/EU-DE/content.it-IT.js' },
      records: [{ id: 'lina-hoffmann', file: './records/EU-DE/lina-hoffmann.js' }],
    },
    {
      id: 'EU-IT',
      file: './profiles/EU-IT/profile.js',
      contents: { 'en-GB': './profiles/EU-IT/content.en-GB.js', 'fr-FR': './profiles/EU-IT/content.fr-FR.js', 'de-DE': './profiles/EU-IT/content.de-DE.js', 'it-IT': './profiles/EU-IT/content.it-IT.js' },
      records: [{ id: 'sofia-ricci', file: './records/EU-IT/sofia-ricci.js' }],
    },
  ],
};
