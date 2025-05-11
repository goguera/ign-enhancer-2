import { ToolbarButtonSpecs, ToolbarButtonSpecsResolver } from '@lib/types';
import {
  hideAllPostedByMe,
  loadMoreThreadsUntilLimit,
  showAllThreads,
} from '@lib/services/thread-list.service';
import { getConfig } from '@lib/utils/options';

let isEgoFilterEnabled = false;

function toggleEgoFilter() {
  isEgoFilterEnabled = !isEgoFilterEnabled;
}

const disabledText = 'Modo flood: OFF';
const enabledText = 'Modo flood: ON';

export const egofilterButton: ToolbarButtonSpecsResolver = async () => {
  const limit = 1 
  return {
    initialText: disabledText,
    onClick: (anchor, inner, ripple) => {
      toggleEgoFilter();
      inner.textContent = isEgoFilterEnabled ? enabledText : disabledText;
      if (isEgoFilterEnabled) {
        hideAllPostedByMe();
        loadMoreThreadsUntilLimit(limit);
      } else {
        showAllThreads();
      }
    },
  };
};
