/** Section registry. Order and availability are decided by configuration; required sections cannot be removed. */
import { render as renderMyPay } from './my-pay.js';
import { render as renderPayDetails } from './pay-details.js';
import { render as renderWhatChanged } from './what-changed.js';
import { render as renderTimeLeave } from './time-leave.js';
import { render as renderTotalReward } from './total-reward.js';
import { render as renderRecordActions } from './record-actions.js';

export const SECTIONS = [
  { id: 'my-pay', titleKey: 'nav.my_pay', icon: 'zap', required: true, render: renderMyPay },
  { id: 'pay-details', titleKey: 'nav.pay_details', icon: 'list', required: true, render: renderPayDetails },
  { id: 'what-changed', titleKey: 'nav.what_changed', icon: 'trend', required: false, module: 'whatChanged', render: renderWhatChanged },
  { id: 'time-leave', titleKey: 'nav.time_leave', icon: 'calendar', required: false, module: 'timeLeave', render: renderTimeLeave },
  { id: 'total-reward', titleKey: 'nav.total_reward', icon: 'gift', required: false, module: 'totalReward', render: renderTotalReward },
  { id: 'record-actions', titleKey: 'nav.record_actions', icon: 'file', required: true, render: renderRecordActions },
];
