export function getSubmitButton(url: string): HTMLButtonElement | null {
    const location = url.split('/')[1].split('/')[0];
    let button: HTMLButtonElement | undefined;
    const allButtons = document.querySelectorAll<HTMLButtonElement>('button[type=submit]');
    if (location === 'conversations' || location === 'threads') {
      button = allButtons[4];
      if (location === 'threads' && button.classList.contains('button--icon--vote')) {
        button = allButtons[5];
      }
    } else {
      return null;
    }
    return button ?? null;
  }

/**
 * Get the entire reply container, which is useful for adding buttons or manipulating related DOM elements
 * @returns The reply container element or null if not found
 */
export function getReplyContainer(): HTMLElement | null {
  // First try the standard formSubmitRow-controls
  const standardContainer = document.querySelector('.formSubmitRow-controls');
  if (standardContainer) {
    return standardContainer as HTMLElement;
  }
  
  // If not found, look for the formButtonGroup which is used in both threads and conversations
  const formButtonGroup = document.querySelector('.formButtonGroup');
  if (formButtonGroup) {
    // Find the primary button group (where the submit button is)
    const primaryGroup = formButtonGroup.querySelector('.formButtonGroup-primary');
    if (primaryGroup) {
      return primaryGroup as HTMLElement;
    }
    return formButtonGroup as HTMLElement;
  }
  
  // Check the Reply button context to find its container
  const replyButton = document.querySelector('button.button--icon--reply');
  if (replyButton && replyButton.parentElement) {
    return replyButton.parentElement as HTMLElement;
  }
  
  // Last resort - try to find any submit button's container
  const submitButtons = document.querySelectorAll('button[type="submit"]');
  if (submitButtons.length > 0) {
    // First check for a reply button
    for (let i = 0; i < submitButtons.length; i++) {
      const button = submitButtons[i];
      if (
        button.textContent?.includes('Post reply') || 
        button.textContent?.includes('Reply') || 
        button.classList.contains('button--icon--reply')
      ) {
        return button.parentElement as HTMLElement;
      }
    }
    
    // If no specific reply button found, use the last submit button's parent
    const lastButton = submitButtons[submitButtons.length - 1];
    if (lastButton.parentElement) {
      return lastButton.parentElement as HTMLElement;
    }
  }
  
  return null;
}