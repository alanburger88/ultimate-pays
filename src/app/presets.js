/** Presenter presets. A preset chooses optional modules, starting section and emphasis — never record content. */
export const PRESETS = [
  {
    id: 'core',
    nameKey: 'studio.preset.core',
    descriptionKey: 'studio.preset.core_desc',
    modules: { story: false, lumi: true, whatChanged: true, timeLeave: false, totalReward: false, wallet: false, calendar: false, queries: true, personalise: true },
    startSection: 'my-pay',
    emphasis: 'table',
    sectionOrder: ['my-pay', 'pay-details', 'what-changed', 'record-actions'],
  },
  {
    id: 'complete',
    nameKey: 'studio.preset.complete',
    descriptionKey: 'studio.preset.complete_desc',
    modules: { story: true, lumi: true, whatChanged: true, timeLeave: true, totalReward: true, wallet: true, calendar: true, queries: true, personalise: true },
    startSection: 'my-pay',
    emphasis: 'balanced',
    sectionOrder: ['my-pay', 'pay-details', 'what-changed', 'time-leave', 'total-reward', 'record-actions'],
  },
  {
    id: 'hourly',
    nameKey: 'studio.preset.hourly',
    descriptionKey: 'studio.preset.hourly_desc',
    modules: { story: true, lumi: true, whatChanged: true, timeLeave: true, totalReward: false, wallet: true, calendar: true, queries: true, personalise: true },
    startSection: 'my-pay',
    emphasis: 'table',
    sectionOrder: ['my-pay', 'time-leave', 'pay-details', 'what-changed', 'record-actions'],
  },
  {
    id: 'total-reward',
    nameKey: 'studio.preset.total_reward',
    descriptionKey: 'studio.preset.total_reward_desc',
    modules: { story: true, lumi: true, whatChanged: true, timeLeave: false, totalReward: true, wallet: true, calendar: false, queries: true, personalise: true },
    startSection: 'total-reward',
    emphasis: 'chart',
    sectionOrder: ['my-pay', 'total-reward', 'pay-details', 'what-changed', 'record-actions'],
  },
];
